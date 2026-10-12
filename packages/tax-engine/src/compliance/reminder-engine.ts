/**
 * Phase 4K.3 — deterministic tax-compliance reminder projection.
 *
 * Pure function: (4K.1 obligations + 4K.2 payment hints + preferences +
 * reminder actions + injected civil today) -> frozen reminder read models.
 *
 * Hard boundaries (fail-closed, never recomputed here):
 * - tax amounts, legal due dates, minimum-DARF, penalties, interest, SELIC;
 * - government verification of payments (MATCH is user-reported, never official);
 * - no clock access: `todayCivilDate` is injected by the caller (FISCAL_CLOCK);
 * - no float math: trigger arithmetic is integer civil-calendar day shifting.
 */
import type { TaxComplianceObligation, TaxComplianceObligationSeverity } from './compliance-types';
import {
  DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
  TAX_COMPLIANCE_REMINDER_SOURCE_VERSION,
  type TaxComplianceReminder,
  type TaxComplianceReminderActionRecord,
  type TaxComplianceReminderChannel,
  type TaxComplianceReminderKind,
  type TaxComplianceReminderPaymentHint,
  type TaxComplianceReminderPreferences,
  type TaxComplianceReminderStatus,
} from './reminder-types';

export interface ProjectTaxComplianceRemindersInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  /** Injected current civil date (YYYY-MM-DD). Never derived inside the engine. */
  readonly todayCivilDate: string;
  readonly obligations: readonly TaxComplianceObligation[];
  readonly paymentHints?: readonly TaxComplianceReminderPaymentHint[];
  readonly preferences?: TaxComplianceReminderPreferences;
  readonly actions?: readonly TaxComplianceReminderActionRecord[];
}

export interface TaxComplianceReminderProjection {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly todayCivilDate: string;
  readonly reminders: readonly TaxComplianceReminder[];
  readonly generatedAt: string;
  readonly sourceVersion: typeof TAX_COMPLIANCE_REMINDER_SOURCE_VERSION;
}

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const IN_APP_DELIVERY_CHANNELS: readonly TaxComplianceReminderChannel[] = Object.freeze([
  'IN_APP',
  'MOBILE_IN_APP',
]);

function parseCivilDate(value: string): number | null {
  const match = CIVIL_DATE_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const millis = Date.UTC(year, month - 1, day);
  const check = new Date(millis);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return millis;
}

export function isValidCivilDate(value: string): boolean {
  return parseCivilDate(value) !== null;
}

/** Shift a civil date by whole days using UTC components (timezone-immune). */
export function addCivilDays(dateStr: string, deltaDays: number): string | null {
  const base = parseCivilDate(dateStr);
  if (base === null || !Number.isInteger(deltaDays)) {
    return null;
  }
  const shifted = new Date(base + deltaDays * DAY_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Compare two civil dates. Returns -1 | 0 | 1. Throws on invalid input
 * (fail-closed: callers validate before comparing).
 */
export function compareCivilDates(a: string, b: string): -1 | 0 | 1 {
  const pa = parseCivilDate(a);
  const pb = parseCivilDate(b);
  if (pa === null || pb === null) {
    throw new Error('compareCivilDates received an invalid civil date.');
  }
  if (pa < pb) {
    return -1;
  }
  if (pa > pb) {
    return 1;
  }
  return 0;
}

function sanitizeLeadTimes(leadTimes: readonly number[] | undefined): number[] {
  const seen = new Set<number>();
  const valid: number[] = [];
  for (const lead of leadTimes ?? []) {
    if (Number.isInteger(lead) && lead >= 1 && lead <= 30 && !seen.has(lead)) {
      seen.add(lead);
      valid.push(lead);
    }
    if (valid.length >= 5) {
      break;
    }
  }
  valid.sort((x, y) => x - y);
  return valid;
}

function severityWeight(severity: TaxComplianceObligationSeverity): number {
  switch (severity) {
    case 'BLOCKING':
      return 4;
    case 'WARNING':
      return 3;
    case 'ACTION':
      return 2;
    case 'INFO':
    default:
      return 1;
  }
}

function isPayableAmount(amount: string | null): boolean {
  return amount !== null && amount !== '0' && amount !== '0.00' && !amount.startsWith('-');
}

function describeAmount(obligation: TaxComplianceObligation): string {
  if (isPayableAmount(obligation.amount) && obligation.amount !== null) {
    return ` Valor principal informado: R$ ${obligation.amount} (apenas informativo).`;
  }
  return '';
}

interface ReminderDraft {
  readonly kind: TaxComplianceReminderKind;
  readonly triggerAt: string;
  readonly severity: TaxComplianceObligationSeverity;
  readonly title: string;
  readonly message: string;
}

/**
 * Project deterministic reminders. Complexity O(n log n) in obligation count
 * (single final sort); no nested scans, no N+1, no O(n^2).
 */
export function projectTaxComplianceReminders(
  input: ProjectTaxComplianceRemindersInput,
): TaxComplianceReminderProjection {
  const {
    taxSubjectId,
    calendarYear,
    todayCivilDate,
    obligations,
    paymentHints = [],
    preferences = DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
    actions = [],
  } = input;

  if (parseCivilDate(todayCivilDate) === null) {
    throw new Error('projectTaxComplianceReminders requires a valid todayCivilDate.');
  }

  const prefs: TaxComplianceReminderPreferences = {
    remindersEnabled: preferences.remindersEnabled === true,
    upcomingEnabled: preferences.remindersEnabled === true && preferences.upcomingEnabled === true,
    overdueEnabled: preferences.remindersEnabled === true && preferences.overdueEnabled === true,
    annualEnabled: preferences.remindersEnabled === true && preferences.annualEnabled === true,
    leadTimes: sanitizeLeadTimes(preferences.leadTimes),
  };
  const preferencesActive = preferences.remindersEnabled === true;

  const hintsByKey = new Map<string, TaxComplianceReminderPaymentHint>();
  for (const hint of paymentHints) {
    if (hint.obligationKey && !hintsByKey.has(hint.obligationKey)) {
      hintsByKey.set(hint.obligationKey, hint);
    }
  }

  const latestActionByKey = new Map<string, TaxComplianceReminderActionRecord>();
  for (const action of actions) {
    if (action.taxSubjectId !== taxSubjectId || !action.reminderKey) {
      continue;
    }
    const existing = latestActionByKey.get(action.reminderKey);
    if (
      !existing ||
      action.revision > existing.revision ||
      (action.revision === existing.revision && action.occurredAt > existing.occurredAt)
    ) {
      latestActionByKey.set(action.reminderKey, action);
    }
  }

  const obligationsByKey = new Map<string, TaxComplianceObligation>();
  for (const obligation of obligations) {
    if (obligation.taxSubjectId !== taxSubjectId || !obligation.obligationKey) {
      continue;
    }
    if (!obligationsByKey.has(obligation.obligationKey)) {
      obligationsByKey.set(obligation.obligationKey, obligation);
    }
  }

  const buildReminder = (
    obligation: TaxComplianceObligation,
    draft: ReminderDraft,
    categoryEnabled: boolean,
  ): TaxComplianceReminder => {
    const reminderKey = `${obligation.obligationKey}:${draft.kind}:${draft.triggerAt}`;
    const dedupKey = `${reminderKey}:${obligation.sourceFingerprint}`;
    const action = latestActionByKey.get(reminderKey);
    const actionMatches =
      action !== undefined && action.sourceFingerprint === obligation.sourceFingerprint;

    let status: TaxComplianceReminderStatus;
    const relation = compareCivilDates(draft.triggerAt, todayCivilDate);
    if (!preferencesActive || !categoryEnabled) {
      status = 'CANCELLED';
    } else if (relation > 0) {
      status = 'SCHEDULED';
    } else {
      status = 'DELIVERED';
    }

    let snoozedUntil: string | null = null;
    let actedAt: string | null = null;
    if (actionMatches && action !== undefined && status !== 'CANCELLED') {
      actedAt = action.occurredAt;
      if (action.actionType === 'ACKNOWLEDGE') {
        status = 'ACKNOWLEDGED';
      } else if (action.actionType === 'DISMISS') {
        status = 'DISMISSED';
      } else if (action.actionType === 'SNOOZE') {
        if (
          action.snoozedUntil !== null &&
          parseCivilDate(action.snoozedUntil) !== null &&
          compareCivilDates(action.snoozedUntil, todayCivilDate) > 0
        ) {
          status = 'SNOOZED';
          snoozedUntil = action.snoozedUntil;
        } else {
          status = 'DELIVERED';
        }
      }
    }

    const effectiveAt = snoozedUntil ?? draft.triggerAt;
    return Object.freeze({
      reminderKey,
      taxSubjectId,
      obligationKey: obligation.obligationKey,
      sourceFingerprint: obligation.sourceFingerprint,
      kind: draft.kind,
      triggerAt: draft.triggerAt,
      effectiveAt,
      status,
      severity: draft.severity,
      title: draft.title,
      message: draft.message,
      actionTarget: '/tax',
      deliveryChannels: IN_APP_DELIVERY_CHANNELS,
      dedupKey,
      sourceVersion: TAX_COMPLIANCE_REMINDER_SOURCE_VERSION,
      snoozedUntil,
      actedAt,
      isStale: false,
    });
  };

  const reminders: TaxComplianceReminder[] = [];

  for (const obligation of obligationsByKey.values()) {
    if (obligation.status === 'SUPERSEDED') {
      continue;
    }
    if (
      obligation.status === 'COMPLETED' ||
      obligation.status === 'DISMISSED' ||
      obligation.status === 'READY'
    ) {
      continue;
    }

    const hint = hintsByKey.get(obligation.obligationKey);

    if (obligation.kind === 'MONTHLY_TAX_PAYMENT') {
      const payable = isPayableAmount(obligation.amount);
      const dueDate = obligation.dueDate;
      const dueValid = dueDate !== null && parseCivilDate(dueDate) !== null;

      if (payable && dueValid && dueDate !== null) {
        for (const lead of prefs.leadTimes) {
          const triggerAt = addCivilDays(dueDate, -lead);
          if (triggerAt === null) {
            continue;
          }
          reminders.push(
            buildReminder(
              obligation,
              {
                kind: 'UPCOMING_DUE',
                triggerAt,
                severity: obligation.severity,
                title: 'DARF próximo do vencimento',
                message:
                  `Competência ${obligation.period} (código ${obligation.metadata?.['revenueCode'] ?? '6015'}) ` +
                  `vence em ${dueDate}.${describeAmount(obligation)} Revise os dados no Atlas antes de pagar pelos canais oficiais.`,
              },
              prefs.upcomingEnabled,
            ),
          );
        }

        if (compareCivilDates(todayCivilDate, dueDate) === 0) {
          reminders.push(
            buildReminder(
              obligation,
              {
                kind: 'DUE_TODAY',
                triggerAt: dueDate,
                severity: obligation.severity,
                title: 'DARF vence hoje',
                message:
                  `Competência ${obligation.period} vence hoje (${dueDate}).${describeAmount(obligation)} ` +
                  `Efetue o pagamento pelos canais oficiais e registre o comprovante no Atlas.`,
              },
              prefs.upcomingEnabled,
            ),
          );
        }

        if (compareCivilDates(todayCivilDate, dueDate) > 0) {
          const triggerAt = addCivilDays(dueDate, 1);
          if (triggerAt !== null) {
            reminders.push(
              buildReminder(
                obligation,
                {
                  kind: 'OVERDUE',
                  triggerAt,
                  severity: 'WARNING',
                  title: 'DARF em atraso',
                  message:
                    `Competência ${obligation.period} passou do vencimento (${dueDate}).${describeAmount(obligation)} ` +
                    `O Atlas não calcula multa, juros ou SELIC. Verifique o vencimento oficial antes de pagar.`,
                },
                prefs.overdueEnabled,
              ),
            );
          }
        }
      }

      if (
        obligation.status === 'ACTION_REQUIRED' ||
        obligation.status === 'AWAITING_CONFIRMATION'
      ) {
        reminders.push(
          buildReminder(
            obligation,
            {
              kind: 'ACTION_REQUIRED',
              triggerAt: todayCivilDate,
              severity: 'BLOCKING',
              title: 'Ação necessária na competência',
              message:
                `A competência ${obligation.period} precisa de regularização antes do pagamento. ` +
                `Resolver este item não quita o tributo; o pagamento ocorre fora do Atlas.`,
            },
            true,
          ),
        );
      }

      if (obligation.status === 'AWAITING_EVIDENCE') {
        reminders.push(
          buildReminder(
            obligation,
            {
              kind: 'EVIDENCE_REQUIRED',
              triggerAt: todayCivilDate,
              severity: 'WARNING',
              title: 'Comprovante pendente',
              message:
                `A competência ${obligation.period} aguarda evidência ou confirmação. ` +
                `Registrar o comprovante organiza seu histórico; não confirma pagamento junto à Receita.`,
            },
            true,
          ),
        );
      }

      if (hint?.reconciliationStatus === 'STALE_SOURCE') {
        reminders.push(
          buildReminder(
            obligation,
            {
              kind: 'STALE_SOURCE',
              triggerAt: todayCivilDate,
              severity: 'WARNING',
              title: 'Dados alterados — revise novamente',
              message:
                `Os dados desta obrigação foram alterados. Revise novamente antes de considerar o item resolvido. ` +
                `O comprovante anterior permanece no histórico, mas não reflete mais o estado atual.`,
            },
            true,
          ),
        );
      } else if (hint?.reconciliationStatus === 'USER_REPORTED_MISMATCH') {
        reminders.push(
          buildReminder(
            obligation,
            {
              kind: 'PAYMENT_EVIDENCE_REVIEW',
              triggerAt: todayCivilDate,
              severity: 'WARNING',
              title: 'Comprovante diverge da obrigação',
              message:
                `O comprovante registrado para a competência ${obligation.period} diverge em valor, período ou código. ` +
                `Confira os dados informados. Divergência aqui não é cobrança oficial.`,
            },
            true,
          ),
        );
      }
      continue;
    }

    if (
      obligation.kind === 'ANNUAL_REVIEW' ||
      obligation.kind === 'ANNUAL_FILING_SUPPORT' ||
      obligation.kind === 'EVIDENCE_REQUIRED' ||
      obligation.kind === 'CONFIRMATION_REQUIRED' ||
      obligation.kind === 'PROFESSIONAL_REVIEW_REQUIRED'
    ) {
      const kind: TaxComplianceReminderKind =
        obligation.kind === 'EVIDENCE_REQUIRED' ? 'EVIDENCE_REQUIRED' : 'ANNUAL_REVIEW_REQUIRED';
      reminders.push(
        buildReminder(
          obligation,
          {
            kind,
            triggerAt: todayCivilDate,
            severity: obligation.severity,
            title: 'Revisão anual pendente',
            message:
              `Há pendências na declaração anual de ${obligation.period}. ` +
              `Conclua a revisão no Atlas. Este lembrete não transmite nada à Receita Federal.`,
          },
          prefs.annualEnabled,
        ),
      );
    }
  }

  // Superseded shells: actions bound to an older fingerprint of an obligation
  // that still exists. History is preserved; suppression never carries over.
  for (const action of latestActionByKey.values()) {
    if (!action.reminderKey.startsWith(`${action.obligationKey}:`)) {
      continue;
    }
    const obligation = obligationsByKey.get(action.obligationKey);
    if (!obligation) {
      continue;
    }
    if (action.sourceFingerprint === obligation.sourceFingerprint) {
      continue;
    }
    if (obligation.status === 'SUPERSEDED') {
      continue;
    }
    const reminderKey = action.reminderKey;
    reminders.push(
      Object.freeze({
        reminderKey,
        taxSubjectId,
        obligationKey: obligation.obligationKey,
        sourceFingerprint: action.sourceFingerprint,
        kind: action.reminderKind,
        triggerAt: action.triggerAt,
        effectiveAt: action.triggerAt,
        status: 'SUPERSEDED' as TaxComplianceReminderStatus,
        severity: obligation.severity,
        title: 'Lembrete substituído',
        message:
          'Os dados desta obrigação foram alterados após sua interação. ' +
          'Este registro permanece no histórico; um novo lembrete reflete o estado atual.',
        actionTarget: '/tax',
        deliveryChannels: IN_APP_DELIVERY_CHANNELS,
        dedupKey: `${reminderKey}:${action.sourceFingerprint}`,
        sourceVersion: TAX_COMPLIANCE_REMINDER_SOURCE_VERSION,
        snoozedUntil: null,
        actedAt: action.occurredAt,
        isStale: true,
      }),
    );
  }

  reminders.sort((a, b) => {
    const dateOrder = compareCivilDates(a.effectiveAt, b.effectiveAt);
    if (dateOrder !== 0) {
      return dateOrder;
    }
    const severityOrder = severityWeight(b.severity) - severityWeight(a.severity);
    if (severityOrder !== 0) {
      return severityOrder;
    }
    return a.reminderKey < b.reminderKey ? -1 : a.reminderKey > b.reminderKey ? 1 : 0;
  });

  return Object.freeze({
    taxSubjectId,
    calendarYear,
    todayCivilDate,
    reminders: Object.freeze(reminders),
    generatedAt: `${todayCivilDate}T00:00:00.000Z`,
    sourceVersion: TAX_COMPLIANCE_REMINDER_SOURCE_VERSION,
  });
}
