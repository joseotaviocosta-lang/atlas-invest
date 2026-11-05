import type {
  LocalNotification,
  NotificationPreferences,
} from './types';
import type {
  ComplianceObligationItem,
  CostAssessmentDto,
  CostEvidenceDto,
  MonthlyTaxLiabilityViewModel,
  TaxInputReadinessViewModel,
} from '../fiscal/types';
import type { ReviewItem } from '../imports/types';
import {
  buildNotificationKey,
  stringToNumericId,
  sanitizeNotificationText,
  isInQuietHours,
  isDeduplicated,
  isWithinDailyBudget,
  recordNotificationSent,
} from './engine';
import { notificationCenter } from './notification-center';
import { getNotificationService } from './service';

export interface NotificationEvaluationContext {
  userId: string;
  portfolioId?: string | null;
  complianceTimeline?: ComplianceObligationItem[];
  costAssessments?: CostAssessmentDto[];
  costEvidences?: CostEvidenceDto[];
  taxLiability?: MonthlyTaxLiabilityViewModel | null;
  taxInputReadiness?: TaxInputReadinessViewModel | null;
  reviewItems?: ReviewItem[];
  preferences: NotificationPreferences;
  now?: number;
}

/**
 * PURE DETERMINISTIC RULE ENGINE
 * Evaluates current authoritative domain models and derives notification candidates.
 * ZERO SIDE EFFECTS.
 */
export function deriveNotificationCandidates(
  context: NotificationEvaluationContext
): LocalNotification[] {
  const {
    userId,
    portfolioId,
    complianceTimeline = [],
    costAssessments = [],
    costEvidences = [],
    taxLiability,
    taxInputReadiness,
    reviewItems = [],
    preferences,
    now = Date.now(),
  } = context;

  if (!preferences.enabled) {
    return [];
  }

  const candidates: LocalNotification[] = [];

  // RULE 1: Blocked Fiscal Calculation (High Priority)
  // When calculation is blocked, do not notify DARF payment values; notify blockage
  const isFiscalBlocked = Boolean(
    taxInputReadiness?.liabilityStatus === 'BLOCKED' ||
    taxLiability?.isBlocked
  );

  if (isFiscalBlocked && preferences.fiscalReminders) {
    const key = buildNotificationKey({
      type: 'fiscal_blocked',
      userId,
      portfolioId,
      entityId: taxLiability?.competence || 'current',
    });

    candidates.push({
      id: key,
      numericId: stringToNumericId(key),
      title: 'Apuração Fiscal Bloqueada',
      body: 'Inconsistências fiscais impedem o cálculo definitivo. Revise na aba Fiscal.',
      category: 'FISCAL_BLOCKED',
      severity: 'HIGH',
      deepLink: '/tax',
      createdAt: now,
    });
  }

  // RULE 2: DARF Reminders (High Priority)
  // Only if calculation is NOT blocked and DARF preferences are enabled
  if (!isFiscalBlocked && preferences.darfReminders) {
    const pendingDarfs = complianceTimeline.filter(
      (item) =>
        (item.type === 'MONTHLY_TAX_PAYMENT' || item.type.includes('DARF')) &&
        (item.status === 'PENDING' || item.status === 'OVERDUE')
    );

    for (const darf of pendingDarfs) {
      const key = buildNotificationKey({
        type: 'darf_due',
        userId,
        portfolioId,
        entityId: darf.id || darf.competence,
        version: darf.dueDate,
      });

      const isOverdue = darf.status === 'OVERDUE';
      const title = isOverdue
        ? 'Lembrete Fiscal: DARF em Atraso'
        : 'Lembrete Fiscal: DARF Pendente';

      const body = darf.dueDate
        ? `Há um DARF com vencimento em ${darf.dueDate}. Revise na aba Fiscal.`
        : 'Há um DARF pendente para apuração. Revise na aba Fiscal.';

      candidates.push({
        id: key,
        numericId: stringToNumericId(key),
        title,
        body,
        category: 'FISCAL_DARF',
        severity: 'HIGH',
        deepLink: '/tax',
        createdAt: now,
        data: {
          competence: darf.competence,
          dueDate: darf.dueDate,
        },
      });
    }
  }

  // RULE 3: Cost Basis / Acquisition Evidence Needed (Normal Priority)
  if (preferences.costEvidenceAlerts) {
    const hasIncompleteCost =
      costAssessments.some(
        (a) => a.status === 'MISSING' || a.status === 'PARTIAL' || !a.isComplete
      ) ||
      costEvidences.some((e) => e.status === 'PENDING');

    if (hasIncompleteCost) {
      const key = buildNotificationKey({
        type: 'cost_evidence',
        userId,
        portfolioId,
        entityId: 'incomplete_evidence',
      });

      candidates.push({
        id: key,
        numericId: stringToNumericId(key),
        title: 'Base de Custo Incompleta',
        body: 'Revise as evidências de aquisição para manter seu histórico fiscal em dia.',
        category: 'FISCAL_EVIDENCE',
        severity: 'NORMAL',
        deepLink: '/tax',
        createdAt: now,
      });
    }
  }

  // RULE 4: Review Inbox & Reconciliation Divergences (Normal Priority)
  // Group aggregation: If multiple review items exist, emit a single aggregated alert
  if (preferences.reconciliationAlerts && reviewItems.length > 0) {
    const unresolvedItems = reviewItems.filter((item) => item.status !== 'RESOLVED');

    if (unresolvedItems.length > 1) {
      // Aggregation rule
      const key = buildNotificationKey({
        type: 'reconciliation_group',
        userId,
        portfolioId,
        entityId: `group_${unresolvedItems.length}`,
        version: unresolvedItems[0]?.runId,
      });

      candidates.push({
        id: key,
        numericId: stringToNumericId(key),
        title: 'Pendências de Conciliação',
        body: `${unresolvedItems.length} itens requerem revisão de importação e conciliação.`,
        category: 'RECONCILIATION_REVIEW',
        severity: 'NORMAL',
        deepLink: '/import',
        createdAt: now,
        data: {
          pendingCount: unresolvedItems.length,
        },
      });
    } else if (unresolvedItems.length === 1 && unresolvedItems[0]) {
      const item = unresolvedItems[0];
      const key = buildNotificationKey({
        type: 'reconciliation_single',
        userId,
        portfolioId,
        entityId: item.runId || item.id,
      });

      candidates.push({
        id: key,
        numericId: stringToNumericId(key),
        title: 'Revisão de Conciliação Necessária',
        body: 'Identificada divergência na importação. Revise na área de Importações.',
        category: 'RECONCILIATION_REVIEW',
        severity: 'NORMAL',
        deepLink: '/import',
        createdAt: now,
      });
    }
  }

  return candidates;
}

/**
 * Evaluates candidates, applies Quiet Hours, deduplication, cooldown,
 * noise budget, sanitization, and dispatches to the notification service.
 */
export async function evaluateAndScheduleNotifications(
  context: NotificationEvaluationContext
): Promise<{ dispatched: LocalNotification[]; suppressed: string[] }> {
  const candidates = deriveNotificationCandidates(context);
  const { userId, preferences, now = Date.now() } = context;

  const dispatched: LocalNotification[] = [];
  const suppressed: string[] = [];
  const service = getNotificationService();

  const isQuiet = isInQuietHours(preferences, new Date(now));

  for (const candidate of candidates) {
    // Check 1: Quiet Hours (suppress unless HIGH priority or re-scheduled)
    if (isQuiet && candidate.severity !== 'HIGH') {
      suppressed.push(`quiet_hours:${candidate.id}`);
      continue;
    }

    // Check 2: Deduplication and Cooldown
    if (isDeduplicated(userId, candidate.id, preferences.cooldownHours, now)) {
      suppressed.push(`cooldown:${candidate.id}`);
      continue;
    }

    // Check 3: Daily Noise Budget
    if (!isWithinDailyBudget(userId, preferences.maxDailyNotifications, now)) {
      suppressed.push(`budget_exceeded:${candidate.id}`);
      continue;
    }

    // Check 4: Privacy sanitization (lock-screen protection)
    const sanitized = sanitizeNotificationText(candidate.title, candidate.body);
    const safeNotification: LocalNotification = {
      ...candidate,
      title: sanitized.title,
      body: sanitized.body,
    };

    // Send through notification adapter
    const success = await service.send(safeNotification);
    if (success) {
      dispatched.push(safeNotification);
      recordNotificationSent(userId, safeNotification, now);
      notificationCenter.addNotification(userId, safeNotification);
    }
  }

  return { dispatched, suppressed };
}
