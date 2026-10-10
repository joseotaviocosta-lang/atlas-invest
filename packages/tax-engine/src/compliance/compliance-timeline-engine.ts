import type { UnifiedAnnualIrpfState } from '../annual-irpf/unified-annual-irpf';
import { computeComplianceFingerprint } from './compliance-fingerprint';
import type {
  MonthlyComplianceSource,
  TaxComplianceActionType,
  TaxComplianceObligation,
  TaxComplianceObligationKind,
  TaxComplianceObligationSeverity,
  TaxComplianceObligationStatus,
  TaxComplianceTimeline,
  TaxComplianceTimelineSummary,
  TaxComplianceUserActionRecord,
  TaxComplianceUserActionSummary,
} from './compliance-types';

export interface ProjectTaxComplianceTimelineInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  /** Injected civil date "YYYY-MM-DD" */
  readonly todayCivilDate: string;
  readonly monthlySources?: readonly MonthlyComplianceSource[];
  readonly annualState?: UnifiedAnnualIrpfState | null;
  readonly userActions?: readonly TaxComplianceUserActionRecord[];
  readonly generatedAt?: string;
}

export const COMPLIANCE_DISCLAIMER =
  'O Atlas fornece controle operacional e projeção informativa para apoio ao investidor. ' +
  'O registro de ações do usuário representa controle estritamente interno e não constitui ' +
  'confirmação de pagamento, validação bancária, transmissão da DIRPF ou quitação de tributos ' +
  'perante a Receita Federal do Brasil.';

const SEVERITY_WEIGHTS: Record<TaxComplianceObligationSeverity, number> = {
  BLOCKING: 4,
  WARNING: 3,
  ACTION: 2,
  INFO: 1,
};

function getAnnualFilingDueDate(calendarYear: number): string {
  // Standard annual filing deadline is last business day of April of the exercise year.
  // Civil baseline: `${calendarYear + 1}-04-30`
  return `${calendarYear + 1}-04-30`;
}

function resolveUserActionSummary(
  action: TaxComplianceUserActionRecord | undefined,
): TaxComplianceUserActionSummary | null {
  if (!action) return null;
  return {
    id: action.id,
    actionType: action.actionType,
    occurredAt: action.occurredAt,
    note: action.note,
    revision: action.revision,
    sourceFingerprint: action.sourceFingerprint,
  };
}

export function sortTaxComplianceObligations(
  obligations: readonly TaxComplianceObligation[],
  calendarYear: number,
): readonly TaxComplianceObligation[] {
  const fallbackDate = `${calendarYear}-12-31`;
  return [...obligations].sort((a, b) => {
    // 1. Due date ASC (items with due dates first, null due dates treated as fallbackDate after dated)
    const dateA = a.dueDate ?? fallbackDate;
    const dateB = b.dueDate ?? fallbackDate;
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    // 2. Severity weight DESC
    const weightA = SEVERITY_WEIGHTS[a.severity] ?? 0;
    const weightB = SEVERITY_WEIGHTS[b.severity] ?? 0;
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 3. Obligation key ASC
    return a.obligationKey.localeCompare(b.obligationKey);
  });
}

/**
 * Pure, deterministic projection that builds the Tax Compliance Timeline.
 * Zero tax math, zero float, completely reproducible.
 */
export function projectTaxComplianceTimeline(
  input: ProjectTaxComplianceTimelineInput,
): TaxComplianceTimeline {
  const {
    taxSubjectId,
    calendarYear,
    todayCivilDate,
    monthlySources = [],
    annualState = null,
    userActions = [],
    generatedAt = `${todayCivilDate}T00:00:00.000Z`,
  } = input;

  // Build map of latest user actions by obligationKey
  const userActionsByKey = new Map<string, TaxComplianceUserActionRecord>();
  for (const action of userActions) {
    const existing = userActionsByKey.get(action.obligationKey);
    if (!existing || action.revision > existing.revision) {
      userActionsByKey.set(action.obligationKey, action);
    }
  }

  const rawObligations: TaxComplianceObligation[] = [];

  // 1. Project Monthly Obligations (4G)
  for (const monthly of monthlySources) {
    const competence = monthly.competence;
    const revCode = monthly.revenueCode ?? '6015';
    const sourceRef = `monthly-${revCode}`;
    const obligationKey = `${taxSubjectId}:${competence}:MONTHLY_TAX_PAYMENT:${sourceRef}`;

    const rawFingerprintPayload = {
      taxSubjectId,
      competence,
      revenueCode: revCode,
      principalAmount: monthly.principalAmount,
      dueDate: monthly.dueDate,
      status: monthly.status,
      reasonCode: monthly.reasonCode,
    };
    const sourceFingerprint =
      monthly.sourceFingerprint ?? computeComplianceFingerprint(rawFingerprintPayload);

    const kind: TaxComplianceObligationKind = 'MONTHLY_TAX_PAYMENT';
    let status: TaxComplianceObligationStatus = 'OPEN';
    let severity: TaxComplianceObligationSeverity = 'ACTION';
    let actionType: TaxComplianceActionType = 'PAY';
    let amount: string | null = monthly.principalAmount;
    let title = `Pagamento de DARF ${revCode} — Competência ${competence}`;
    let description = `DARF código ${revCode} referente às operações de ${competence}.`;

    if (monthly.status === 'BLOCKED' || monthly.status === 'PARTIAL') {
      status = 'ACTION_REQUIRED';
      severity = 'BLOCKING';
      actionType = 'REVIEW';
      title = `DARF ${revCode} — Competência ${competence} (Pendente de Regularização)`;
      description = `Existem inconsistências ou dados parciais impedindo o cálculo definitivo da competência ${competence}.`;
    } else if (monthly.status === 'NO_PAYMENT_DUE' || monthly.principalAmount === null) {
      status = 'READY';
      severity = 'INFO';
      actionType = 'NO_ACTION';
      amount = monthly.principalAmount;
      title = `Competência ${competence} — Sem Imposto a Pagar`;
      description = `Não há imposto apurado a pagar para a competência ${competence}.`;
    } else if (monthly.status === 'PROVISIONAL') {
      status = 'OPEN';
      severity = 'INFO';
      actionType = 'REVIEW';
      title = `DARF ${revCode} — Competência ${competence} (Em Andamento)`;
      description = `Competência em andamento. Valores provisórios até o fechamento do mês.`;
    }

    const links = [
      {
        label: 'Ver Detalhes do DARF',
        href: '/tax',
      },
    ];

    // Check user action
    const userActionRecord = userActionsByKey.get(obligationKey);
    const userAction = resolveUserActionSummary(userActionRecord);

    if (userActionRecord) {
      if (userActionRecord.actionType === 'USER_REPORTED_COMPLETION') {
        if (userActionRecord.sourceFingerprint === sourceFingerprint) {
          status = 'COMPLETED';
        } else {
          status = 'SUPERSEDED';
        }
      } else if (userActionRecord.actionType === 'USER_DISMISSED') {
        if (userActionRecord.sourceFingerprint === sourceFingerprint) {
          status = 'DISMISSED';
        } else {
          status = 'SUPERSEDED';
        }
      } else if (userActionRecord.actionType === 'USER_ACKNOWLEDGED') {
        if (userActionRecord.sourceFingerprint !== sourceFingerprint) {
          status = 'SUPERSEDED';
        }
      }
    }

    const isOverdue = Boolean(
      monthly.dueDate &&
      todayCivilDate > monthly.dueDate &&
      status !== 'COMPLETED' &&
      status !== 'DISMISSED',
    );

    rawObligations.push(
      Object.freeze({
        obligationKey,
        taxSubjectId,
        calendarYear,
        period: competence,
        kind,
        sourceModule: '4G',
        sourceRef,
        sourceFingerprint,
        status,
        severity,
        actionType,
        amount,
        currency: monthly.currency ?? 'BRL',
        dueDate: monthly.dueDate,
        title,
        description,
        links: Object.freeze(links),
        metadata: Object.freeze({
          competence,
          revenueCode: revCode,
          bucket: monthly.bucket,
          darfReadiness: monthly.darfReadiness,
        }),
        userAction,
        isOverdue,
      }),
    );
  }

  // 2. Project Unified Annual Obligations (4J / 4H / 4I)
  if (annualState) {
    const annualFilingDueDate = getAnnualFilingDueDate(calendarYear);
    const requirements = annualState.requirements ?? [];

    // Individual action requirements from the unified summary
    for (const req of requirements) {
      let kind: TaxComplianceObligationKind = 'ANNUAL_REVIEW';
      let sourceModule: '4H' | '4I' | '4J' = '4J';
      let actionType: TaxComplianceActionType = 'REVIEW';
      const isBlocking = req.blockingReason !== null;

      if (req.module === 'HIGH_INCOME_MINIMUM_TAX') {
        sourceModule = '4I';
        kind = isBlocking ? 'EVIDENCE_REQUIRED' : 'PROFESSIONAL_REVIEW_REQUIRED';
        actionType = isBlocking ? 'PROVIDE_EVIDENCE' : 'CONTACT_ACCOUNTANT';
      } else if (req.module === 'READINESS_EVIDENCE') {
        sourceModule = '4H';
        kind = 'CONFIRMATION_REQUIRED';
        actionType = 'CONFIRM';
      } else if (req.module === 'ANNUAL_POSITIONS') {
        sourceModule = '4H';
        kind = 'CONFIRMATION_REQUIRED';
        actionType = 'REVIEW';
      }

      const sourceRef = `annual-req-${req.key}`;
      const obligationKey = `${taxSubjectId}:${calendarYear}:${kind}:${sourceRef}`;

      const reqFingerprintPayload = {
        taxSubjectId,
        calendarYear,
        requirementKey: req.key,
        module: req.module,
        status: req.status,
        blockingReason: req.blockingReason,
      };
      const sourceFingerprint = computeComplianceFingerprint(reqFingerprintPayload);

      let status: TaxComplianceObligationStatus =
        req.status === 'SATISFIED' ? 'READY' : 'ACTION_REQUIRED';
      const severity: TaxComplianceObligationSeverity = isBlocking
        ? 'BLOCKING'
        : req.status !== 'SATISFIED'
          ? 'WARNING'
          : 'ACTION';

      const userActionRecord = userActionsByKey.get(obligationKey);
      const userAction = resolveUserActionSummary(userActionRecord);

      if (userActionRecord) {
        if (userActionRecord.actionType === 'USER_REPORTED_COMPLETION') {
          if (userActionRecord.sourceFingerprint === sourceFingerprint) {
            status = 'COMPLETED';
          } else {
            status = 'SUPERSEDED';
          }
        } else if (userActionRecord.actionType === 'USER_DISMISSED') {
          if (userActionRecord.sourceFingerprint === sourceFingerprint) {
            status = 'DISMISSED';
          } else {
            status = 'SUPERSEDED';
          }
        } else if (userActionRecord.actionType === 'USER_ACKNOWLEDGED') {
          if (userActionRecord.sourceFingerprint !== sourceFingerprint) {
            status = 'SUPERSEDED';
          }
        }
      }

      const isOverdue = Boolean(
        annualFilingDueDate &&
        todayCivilDate > annualFilingDueDate &&
        status !== 'COMPLETED' &&
        status !== 'DISMISSED',
      );

      rawObligations.push(
        Object.freeze({
          obligationKey,
          taxSubjectId,
          calendarYear,
          period: `${calendarYear}`,
          kind,
          sourceModule,
          sourceRef,
          sourceFingerprint,
          status,
          severity,
          actionType,
          amount: null,
          currency: null,
          dueDate: annualFilingDueDate,
          title: `Requisito Anual — ${req.nativeType}`,
          description:
            req.blockingReason ?? `Requisito ${req.nativeType} para ${req.subjectReference}.`,
          links: Object.freeze([
            {
              label: 'Revisar no Painel Anual',
              href: `/tax/annual/${calendarYear}`,
            },
          ]),
          metadata: Object.freeze({
            requirementKey: req.key,
            module: req.module,
            blockingReason: req.blockingReason,
          }),
          userAction,
          isOverdue,
        }),
      );
    }

    // Master Annual Filing Support Obligation (only if there is activity in the year)
    const masterSourceRef = 'annual-unified-filing';
    const masterKey = `${taxSubjectId}:${calendarYear}:ANNUAL_FILING_SUPPORT:${masterSourceRef}`;
    const masterFingerprint = annualState.identity.annualFingerprint;
    const overallStatus = annualState.identity.status;

    if (overallStatus !== 'NO_ACTIVITY') {
      let masterStatus: TaxComplianceObligationStatus = 'OPEN';
      let masterSeverity: TaxComplianceObligationSeverity = 'ACTION';

      if (overallStatus === 'READY_FOR_REVIEW') {
        masterStatus = 'READY';
        masterSeverity = 'ACTION';
      } else if (overallStatus === 'BLOCKED') {
        masterStatus = 'ACTION_REQUIRED';
        masterSeverity = 'BLOCKING';
      } else if (overallStatus === 'REQUIRES_ACTION') {
        masterStatus = 'ACTION_REQUIRED';
        masterSeverity = 'WARNING';
      }

      const masterUserActionRecord = userActionsByKey.get(masterKey);
      const masterUserAction = resolveUserActionSummary(masterUserActionRecord);

      if (masterUserActionRecord) {
        if (masterUserActionRecord.actionType === 'USER_REPORTED_COMPLETION') {
          if (masterUserActionRecord.sourceFingerprint === masterFingerprint) {
            masterStatus = 'COMPLETED';
          } else {
            masterStatus = 'SUPERSEDED';
          }
        } else if (masterUserActionRecord.actionType === 'USER_DISMISSED') {
          if (masterUserActionRecord.sourceFingerprint === masterFingerprint) {
            masterStatus = 'DISMISSED';
          } else {
            masterStatus = 'SUPERSEDED';
          }
        } else if (masterUserActionRecord.actionType === 'USER_ACKNOWLEDGED') {
          if (masterUserActionRecord.sourceFingerprint !== masterFingerprint) {
            masterStatus = 'SUPERSEDED';
          }
        }
      }

      const masterIsOverdue = Boolean(
        annualFilingDueDate &&
        todayCivilDate > annualFilingDueDate &&
        masterStatus !== 'COMPLETED' &&
        masterStatus !== 'DISMISSED',
      );

      rawObligations.push(
        Object.freeze({
          obligationKey: masterKey,
          taxSubjectId,
          calendarYear,
          period: `${calendarYear}`,
          kind: 'ANNUAL_FILING_SUPPORT',
          sourceModule: '4J',
          sourceRef: masterSourceRef,
          sourceFingerprint: masterFingerprint,
          status: masterStatus,
          severity: masterSeverity,
          actionType: 'REVIEW',
          amount: null,
          currency: null,
          dueDate: annualFilingDueDate,
          title: `Declaração de Ajuste Anual IRPF ${calendarYear + 1} (Ano-base ${calendarYear})`,
          description:
            'Revisão unificada dos demonstrativos patrimoniais e de rendimentos para suporte à DIRPF.',
          links: Object.freeze([
            {
              label: 'Abrir Painel Anual Unificado',
              href: `/tax/annual/${calendarYear}`,
            },
          ]),
          metadata: Object.freeze({
            exercise: calendarYear + 1,
            overallStatus,
          }),
          userAction: masterUserAction,
          isOverdue: masterIsOverdue,
        }),
      );
    }
  }

  // Deterministically sort obligations
  const sortedObligations = sortTaxComplianceObligations(rawObligations, calendarYear);

  // Calculate summary metrics
  let actionRequiredCount = 0;
  let overdueCount = 0;
  let upcomingCount = 0;
  let completedCount = 0;
  let supersededCount = 0;

  for (const item of sortedObligations) {
    if (
      item.status === 'ACTION_REQUIRED' ||
      item.status === 'AWAITING_CONFIRMATION' ||
      item.status === 'AWAITING_EVIDENCE'
    ) {
      actionRequiredCount += 1;
    }
    if (item.isOverdue) {
      overdueCount += 1;
    }
    if (
      item.dueDate &&
      item.dueDate >= todayCivilDate &&
      item.status !== 'COMPLETED' &&
      item.status !== 'DISMISSED'
    ) {
      upcomingCount += 1;
    }
    if (item.status === 'COMPLETED' || item.status === 'DISMISSED') {
      completedCount += 1;
    }
    if (item.status === 'SUPERSEDED') {
      supersededCount += 1;
    }
  }

  const summary: TaxComplianceTimelineSummary = Object.freeze({
    totalObligations: sortedObligations.length,
    actionRequiredCount,
    overdueCount,
    upcomingCount,
    completedCount,
    supersededCount,
  });

  return Object.freeze({
    taxSubjectId,
    calendarYear,
    generatedAt,
    summary,
    obligations: Object.freeze(sortedObligations),
    disclaimer: COMPLIANCE_DISCLAIMER,
  });
}
