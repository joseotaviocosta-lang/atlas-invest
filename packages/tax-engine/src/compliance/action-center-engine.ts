/**
 * Phase 4K.4 — deterministic Tax Compliance Action Center assembly.
 *
 * Pure orchestration: (4K.1 obligations + 4K.2 payment hints + 4K.3 reminders
 * + injected civil today) -> frozen action items, summary counters, calendar
 * events and an order-invariant center fingerprint.
 *
 * Hard boundaries (never done here):
 * - tax amounts, legal due dates, minimum-DARF, penalties, interest, SELIC;
 * - government verification (USER_REPORTED_MATCH stays user-reported);
 * - reminder trigger policy (consumed, never recomputed);
 * - annual/high-income calculations (consumed 4J/4H/4I states only);
 * - no clock access: `todayCivilDate` is injected (FISCAL_CLOCK);
 * - no float math: amounts are verbatim strings; calendar shifts are integer.
 */
import type { TaxComplianceObligation } from './compliance-types';
import { computeComplianceFingerprint } from './compliance-fingerprint';
import {
  TAX_COMPLIANCE_ACTION_CENTER_SOURCE_VERSION,
  type TaxComplianceActionItem,
  type TaxComplianceActionCenterSummary,
  type TaxComplianceActionItemKind,
  type TaxComplianceCalendarEvent,
  type TaxComplianceNextAction,
  type TaxComplianceOperationalStatus,
  type TaxCompliancePriority,
} from './action-center-types';
import { compareCivilDates, isValidCivilDate } from './reminder-engine';
import type { TaxComplianceReminder, TaxComplianceReminderPaymentHint } from './reminder-types';

export interface AssembleActionCenterInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  /** Injected current civil date (YYYY-MM-DD). Never derived inside. */
  readonly todayCivilDate: string;
  readonly obligations: readonly TaxComplianceObligation[];
  readonly paymentHints?: readonly TaxComplianceReminderPaymentHint[];
  readonly reminders?: readonly TaxComplianceReminder[];
}

export interface TaxComplianceActionCenter {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly todayCivilDate: string;
  readonly items: readonly TaxComplianceActionItem[];
  readonly summary: TaxComplianceActionCenterSummary;
  readonly centerFingerprint: string;
  readonly generatedAt: string;
  readonly sourceVersion: typeof TAX_COMPLIANCE_ACTION_CENTER_SOURCE_VERSION;
}

export interface ProjectActionCenterCalendarInput {
  readonly taxSubjectId: string;
  readonly items: readonly TaxComplianceActionItem[];
  readonly reminders: readonly TaxComplianceReminder[];
  readonly todayCivilDate: string;
  readonly from: string;
  readonly to: string;
}

function priorityWeight(priority: TaxCompliancePriority): number {
  switch (priority) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
    default:
      return 1;
  }
}

function severityWeight(severity: string): number {
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isAnnualKind(kind: string): boolean {
  return (
    kind === 'ANNUAL_REVIEW' ||
    kind === 'ANNUAL_FILING_SUPPORT' ||
    kind === 'EVIDENCE_REQUIRED' ||
    kind === 'CONFIRMATION_REQUIRED' ||
    kind === 'PROFESSIONAL_REVIEW_REQUIRED'
  );
}

interface DraftInput {
  readonly obligation: TaxComplianceObligation;
  readonly kind: TaxComplianceActionItemKind;
  readonly operationalStatus: TaxComplianceOperationalStatus;
  readonly priority: TaxCompliancePriority;
  readonly nextAction: TaxComplianceNextAction;
  readonly title: string;
  readonly summary: string;
  readonly isStale: boolean;
  readonly blockingReasons: readonly string[];
}

/**
 * Assemble the unified action center. Complexity O(n log n) in obligation
 * count (single final sort); no nested scans, no N+1, no O(n^2).
 */
export function assembleTaxComplianceActionCenter(
  input: AssembleActionCenterInput,
): TaxComplianceActionCenter {
  const {
    taxSubjectId,
    calendarYear,
    todayCivilDate,
    obligations,
    paymentHints = [],
    reminders = [],
  } = input;

  if (!isValidCivilDate(todayCivilDate)) {
    throw new Error('assembleTaxComplianceActionCenter requires a valid todayCivilDate.');
  }

  const hintsByKey = new Map<string, TaxComplianceReminderPaymentHint>();
  for (const hint of paymentHints) {
    if (hint.obligationKey && !hintsByKey.has(hint.obligationKey)) {
      hintsByKey.set(hint.obligationKey, hint);
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

  // Latest actionable reminder per (obligationKey, sourceFingerprint): smallest
  // effective date wins among surfaced states; history states never attach.
  const reminderByObligation = new Map<string, TaxComplianceReminder[]>();
  for (const reminder of reminders) {
    if (reminder.taxSubjectId !== taxSubjectId) {
      continue;
    }
    const list = reminderByObligation.get(reminder.obligationKey) ?? [];
    list.push(reminder);
    reminderByObligation.set(reminder.obligationKey, list);
  }

  const pickReminder = (obligationKey: string, sourceFingerprint: string) => {
    const candidates = (reminderByObligation.get(obligationKey) ?? []).filter(
      (r) =>
        r.sourceFingerprint === sourceFingerprint &&
        (r.status === 'DELIVERED' ||
          r.status === 'SCHEDULED' ||
          r.status === 'SNOOZED' ||
          r.status === 'ACKNOWLEDGED' ||
          r.status === 'DISMISSED'),
    );
    candidates.sort((a, b) => {
      const order = compareCivilDates(a.effectiveAt, b.effectiveAt);
      if (order !== 0) {
        return order;
      }
      return a.reminderKey < b.reminderKey ? -1 : a.reminderKey > b.reminderKey ? 1 : 0;
    });
    return candidates[0] ?? null;
  };

  const buildItem = (
    obligation: TaxComplianceObligation,
    draft: DraftInput,
    annualReviewStatus: string | null,
  ): TaxComplianceActionItem => {
    const metadata = asRecord(obligation.metadata);
    const reminder = pickReminder(obligation.obligationKey, obligation.sourceFingerprint);
    const actionKey = `${obligation.obligationKey}:${draft.kind}:${obligation.sourceFingerprint}`;
    const exercise =
      annualReviewStatus !== null && Number.isInteger(obligation.calendarYear)
        ? obligation.calendarYear + 1
        : null;
    return Object.freeze({
      actionKey,
      taxSubjectId,
      obligationKey: obligation.obligationKey,
      sourceFingerprint: obligation.sourceFingerprint,
      kind: draft.kind,
      period: obligation.period,
      calendarYear: obligation.calendarYear,
      exercise,
      dueDate: obligation.dueDate,
      priority: draft.priority,
      operationalStatus: draft.operationalStatus,
      title: draft.title,
      summary: draft.summary,
      nextAction: draft.nextAction,
      actionTarget: '/tax',
      amount: obligation.amount,
      currency: obligation.currency,
      revenueCode: stringField(metadata, 'revenueCode'),
      paymentSupportStatus: hintsByKey.get(obligation.obligationKey)?.supportStatus ?? null,
      paymentEvidenceStatus: hintsByKey.get(obligation.obligationKey)?.reconciliationStatus ?? null,
      reminderStatus: reminder?.status ?? null,
      annualReviewStatus,
      isStale: draft.isStale,
      isSuperseded: draft.operationalStatus === 'SUPERSEDED',
      blockingReasons: Object.freeze([...draft.blockingReasons]),
      sourceReferences: Object.freeze([
        { label: 'Obrigação Canônica', ref: obligation.obligationKey },
        { label: 'Módulo de Origem', ref: obligation.sourceModule },
        { label: 'Referência de Origem', ref: obligation.sourceRef },
        {
          label: 'Fingerprint de Origem',
          ref: obligation.sourceFingerprint.substring(0, 16),
        },
      ]),
      sourceVersion: TAX_COMPLIANCE_ACTION_CENTER_SOURCE_VERSION,
    });
  };

  const items: TaxComplianceActionItem[] = [];

  // Evidence-hint extras for monthly obligations. MISMATCH/STALE always surface
  // as review items (they describe recorded evidence, not payability). MATCH
  // appends to an already-informational base item instead of duplicating it.
  const pushEvidenceItems = (
    obligation: TaxComplianceObligation,
    hint: TaxComplianceReminderPaymentHint | undefined,
    skipMatchInfo: boolean,
  ): void => {
    if (hint?.reconciliationStatus === 'USER_REPORTED_MISMATCH') {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'REVIEW_PAYMENT_EVIDENCE',
            operationalStatus: 'REQUIRES_REVIEW',
            priority: 'HIGH',
            nextAction: 'ADD_PAYMENT_EVIDENCE',
            title: `Comprovante diverge — competência ${obligation.period}`,
            summary:
              `O comprovante registrado para a competência ${obligation.period} diverge em valor, período ou código. ` +
              'Confira os dados informados. Divergência aqui não é cobrança oficial.',
            isStale: false,
            blockingReasons: [],
          },
          null,
        ),
      );
    } else if (hint?.reconciliationStatus === 'STALE_SOURCE') {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'REVIEW_CHANGED_OBLIGATION',
            operationalStatus: 'REQUIRES_REVIEW',
            priority: 'HIGH',
            nextAction: 'REVIEW_STALE_EVIDENCE',
            title: 'Dados alterados — revise novamente',
            summary:
              'Os dados desta obrigação foram alterados. Revise novamente antes de considerar o item resolvido. ' +
              'O comprovante anterior permanece no histórico, mas não reflete mais o estado atual.',
            isStale: true,
            blockingReasons: [],
          },
          null,
        ),
      );
    } else if (!skipMatchInfo && hint?.reconciliationStatus === 'USER_REPORTED_MATCH') {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'INFORMATIONAL',
            operationalStatus: 'INFORMATIONAL',
            priority: 'LOW',
            nextAction: 'VIEW_DETAILS',
            title: `Comprovante registrado — competência ${obligation.period}`,
            summary:
              `O comprovante informado para a competência ${obligation.period} confere com os dados atuais do Atlas. ` +
              'Registro do investidor; sem verificação governamental.',
            isStale: false,
            blockingReasons: [],
          },
          null,
        ),
      );
    }
  };

  for (const obligation of obligationsByKey.values()) {
    const hint = hintsByKey.get(obligation.obligationKey);
    const staleHint = hint?.reconciliationStatus === 'STALE_SOURCE';
    const annual = isAnnualKind(obligation.kind);

    if (obligation.status === 'SUPERSEDED') {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'REVIEW_CHANGED_OBLIGATION',
            operationalStatus: 'SUPERSEDED',
            priority: 'LOW',
            nextAction: 'VIEW_DETAILS',
            title: 'Item substituído por alteração de dados',
            summary:
              'Os dados desta obrigação foram alterados após a projeção anterior. ' +
              'Este registro permanece no histórico; o item atual reflete a nova fonte.',
            isStale: true,
            blockingReasons: [],
          },
          annual ? obligation.status : null,
        ),
      );
      continue;
    }

    if (obligation.status === 'DISMISSED') {
      continue;
    }

    if (obligation.status === 'COMPLETED') {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'COMPLETE_COMPLIANCE_ACTION',
            operationalStatus: 'COMPLETED',
            priority: 'LOW',
            nextAction: 'VIEW_DETAILS',
            title: annual ? 'Revisão anual concluída' : 'Obrigação concluída',
            summary: annual
              ? `Revisão anual de ${obligation.period} marcada como concluída pelo investidor. Conclusão aqui não transmite nada à Receita Federal.`
              : `Competência ${obligation.period} marcada como concluída pelo investidor. Conclusão aqui não quita tributo nem confirma pagamento oficial.`,
            isStale: false,
            blockingReasons: [],
          },
          annual ? obligation.status : null,
        ),
      );
      continue;
    }

    if (annual) {
      if (obligation.status === 'READY') {
        items.push(
          buildItem(
            obligation,
            {
              obligation,
              kind: 'INFORMATIONAL',
              operationalStatus: 'INFORMATIONAL',
              priority: 'LOW',
              nextAction: 'VIEW_DETAILS',
              title: 'Requisito anual atendido',
              summary:
                `Requisito anual de ${obligation.period} atendido segundo os dados atuais.` +
                (hint?.reconciliationStatus === 'USER_REPORTED_MATCH'
                  ? ' Há comprovante informado que confere com os dados atuais do Atlas. Registro do investidor; sem verificação governamental.'
                  : ''),
              isStale: staleHint,
              blockingReasons: [],
            },
            obligation.status,
          ),
        );
        continue;
      }
      const blockingReason = stringField(asRecord(obligation.metadata), 'blockingReason');
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'REVIEW_ANNUAL_FILING',
            operationalStatus:
              obligation.status === 'ACTION_REQUIRED' ? 'ACTION_REQUIRED' : 'REQUIRES_REVIEW',
            priority: obligation.severity === 'BLOCKING' ? 'CRITICAL' : 'HIGH',
            nextAction: 'OPEN_ANNUAL_REVIEW',
            title: 'Revisão anual pendente',
            summary:
              `Há pendências na declaração anual de ${obligation.period} ` +
              `(exercício ${obligation.calendarYear + 1}). ` +
              'Conclua a revisão no Atlas. Este item não transmite nada à Receita Federal.',
            isStale: staleHint,
            blockingReasons: blockingReason ? [blockingReason] : [],
          },
          obligation.status,
        ),
      );
      continue;
    }

    if (obligation.status === 'ACTION_REQUIRED') {
      const readiness = stringField(asRecord(obligation.metadata), 'darfReadiness');
      const blockingReasons =
        readiness !== null && readiness !== 'READY'
          ? [`UPSTREAM:${obligation.sourceModule}:ACTION_REQUIRED`, `DARF_READINESS:${readiness}`]
          : [`UPSTREAM:${obligation.sourceModule}:ACTION_REQUIRED`];
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'RESOLVE_BLOCKER',
            operationalStatus: 'ACTION_REQUIRED',
            priority: obligation.severity === 'BLOCKING' ? 'CRITICAL' : 'HIGH',
            nextAction: 'REVIEW_OBLIGATION',
            title: `Ação necessária — competência ${obligation.period}`,
            summary:
              `A competência ${obligation.period} precisa de regularização antes do pagamento. ` +
              'Resolver este item não quita o tributo; o pagamento ocorre fora do Atlas.',
            isStale: staleHint,
            blockingReasons,
          },
          null,
        ),
      );
      continue;
    }

    if (obligation.status === 'AWAITING_CONFIRMATION') {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'PROVIDE_CONFIRMATION',
            operationalStatus: 'WAITING_USER',
            priority: 'HIGH',
            nextAction: 'CONFIRM_INFORMATION',
            title: `Confirmação pendente — competência ${obligation.period}`,
            summary:
              `A competência ${obligation.period} aguarda confirmação do investidor. ` +
              'Confirmar organiza o histórico; não confirma pagamento junto à Receita.',
            isStale: staleHint,
            blockingReasons: [],
          },
          null,
        ),
      );
      continue;
    }

    if (obligation.status === 'AWAITING_EVIDENCE') {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'REVIEW_PAYMENT_EVIDENCE',
            operationalStatus: 'WAITING_USER',
            priority: 'HIGH',
            nextAction: 'ADD_PAYMENT_EVIDENCE',
            title: `Comprovante pendente — competência ${obligation.period}`,
            summary:
              `A competência ${obligation.period} aguarda evidência ou confirmação. ` +
              'Registrar o comprovante organiza o histórico; não confirma pagamento oficial.',
            isStale: staleHint,
            blockingReasons: [],
          },
          null,
        ),
      );
      continue;
    }

    if (obligation.status === 'READY' || !isPayableAmount(obligation.amount)) {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'INFORMATIONAL',
            operationalStatus: 'INFORMATIONAL',
            priority: 'LOW',
            nextAction: 'VIEW_DETAILS',
            title: `Competência ${obligation.period} — sem imposto a pagar`,
            summary:
              `Não há imposto apurado a pagar para a competência ${obligation.period}.` +
              (hint?.reconciliationStatus === 'USER_REPORTED_MATCH'
                ? ' Há comprovante informado que confere com os dados atuais do Atlas. Registro do investidor; sem verificação governamental.'
                : ''),
            isStale: staleHint,
            blockingReasons: [],
          },
          null,
        ),
      );
      pushEvidenceItems(obligation, hint, true);
      continue;
    }

    // OPEN + payable.
    const dueDate = obligation.dueDate;
    const dueValid = dueDate !== null && isValidCivilDate(dueDate);
    if (dueValid && dueDate !== null) {
      const relation = compareCivilDates(todayCivilDate, dueDate);
      if (relation > 0) {
        items.push(
          buildItem(
            obligation,
            {
              obligation,
              kind: 'PAY_TAX',
              operationalStatus: 'OVERDUE',
              priority: 'CRITICAL',
              nextAction: 'PREPARE_PAYMENT',
              title: `DARF em atraso — competência ${obligation.period}`,
              summary:
                `Competência ${obligation.period} passou do vencimento (${dueDate}). ` +
                'O Atlas não calcula multa, juros ou SELIC. Verifique o vencimento oficial antes de pagar.',
              isStale: staleHint,
              blockingReasons: [],
            },
            null,
          ),
        );
      } else if (relation === 0) {
        items.push(
          buildItem(
            obligation,
            {
              obligation,
              kind: 'PAY_TAX',
              operationalStatus: 'DUE_TODAY',
              priority: 'HIGH',
              nextAction: 'PREPARE_PAYMENT',
              title: `DARF vence hoje — competência ${obligation.period}`,
              summary:
                `Competência ${obligation.period} vence hoje (${dueDate}). ` +
                'Efetue o pagamento pelos canais oficiais e registre o comprovante no Atlas.',
              isStale: staleHint,
              blockingReasons: [],
            },
            null,
          ),
        );
      } else {
        items.push(
          buildItem(
            obligation,
            {
              obligation,
              kind: 'PAY_TAX',
              operationalStatus: 'UPCOMING',
              priority: 'MEDIUM',
              nextAction: 'REVIEW_OBLIGATION',
              title: `DARF próximo do vencimento — competência ${obligation.period}`,
              summary:
                `Competência ${obligation.period} vence em ${dueDate}. ` +
                'Revise os dados no Atlas antes de pagar pelos canais oficiais.',
              isStale: staleHint,
              blockingReasons: [],
            },
            null,
          ),
        );
      }
    } else {
      items.push(
        buildItem(
          obligation,
          {
            obligation,
            kind: 'PAY_TAX',
            operationalStatus: 'ACTION_REQUIRED',
            priority: 'HIGH',
            nextAction: 'REVIEW_OBLIGATION',
            title: `DARF sem vencimento projetável — competência ${obligation.period}`,
            summary:
              `A competência ${obligation.period} possui valor a pagar sem data de vencimento projetável. ` +
              'Revise a obrigação antes de pagar.',
            isStale: staleHint,
            blockingReasons: ['MISSING_AUTHORITATIVE_DUE_DATE'],
          },
          null,
        ),
      );
    }

    pushEvidenceItems(obligation, hint, false);
  }

  // Canonical deterministic order: priority DESC, dueDate ASC (nulls last),
  // period ASC, actionKey ASC. Documented and frozen.
  items.sort((a, b) => {
    const priorityOrder = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (priorityOrder !== 0) {
      return priorityOrder;
    }
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) {
        return 1;
      }
      if (b.dueDate === null) {
        return -1;
      }
      const dateOrder = compareCivilDates(a.dueDate, b.dueDate);
      if (dateOrder !== 0) {
        return dateOrder;
      }
    }
    if (a.period !== b.period) {
      return a.period < b.period ? -1 : 1;
    }
    return a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0;
  });

  const current = items.filter((item) => item.operationalStatus !== 'SUPERSEDED');
  const isAttention = (item: TaxComplianceActionItem): boolean =>
    (item.priority === 'CRITICAL' || item.priority === 'HIGH') &&
    item.operationalStatus !== 'COMPLETED' &&
    item.operationalStatus !== 'INFORMATIONAL' &&
    item.operationalStatus !== 'SUPERSEDED';

  const summary: TaxComplianceActionCenterSummary = Object.freeze({
    needsAttention: current.filter(isAttention).length,
    overdue: current.filter((item) => item.operationalStatus === 'OVERDUE').length,
    dueToday: current.filter((item) => item.operationalStatus === 'DUE_TODAY').length,
    upcoming: current.filter((item) => item.operationalStatus === 'UPCOMING').length,
    requiresReview: current.filter((item) => item.operationalStatus === 'REQUIRES_REVIEW').length,
    completed: current.filter((item) => item.operationalStatus === 'COMPLETED').length,
    annualReview: current.filter((item) => item.exercise !== null).length,
    informational: current.filter((item) => item.operationalStatus === 'INFORMATIONAL').length,
    total: current.length,
  });

  // Order-invariant center fingerprint: sorted semantic entries + summary.
  // Excludes generatedAt, render order and non-semantic metadata.
  const fingerprintEntries = items
    .map(
      (item) =>
        `${item.actionKey}|${item.operationalStatus}|${item.priority}|${item.kind}|${item.sourceFingerprint}`,
    )
    .sort();
  const centerFingerprint = computeComplianceFingerprint({
    calendarYear,
    items: fingerprintEntries,
    summary: { ...summary },
    taxSubjectId,
    version: TAX_COMPLIANCE_ACTION_CENTER_SOURCE_VERSION,
  });

  return Object.freeze({
    taxSubjectId,
    calendarYear,
    todayCivilDate,
    items: Object.freeze(items),
    summary,
    centerFingerprint,
    generatedAt: `${todayCivilDate}T00:00:00.000Z`,
    sourceVersion: TAX_COMPLIANCE_ACTION_CENTER_SOURCE_VERSION,
  });
}

/**
 * Project calendar events over authoritative dates only: obligation due dates,
 * actionable reminder trigger/effective dates, snoozed-until dates and the
 * current civil date for review items. Range is bounded by the caller
 * (max 24 months enforced at the API layer); the engine fail-closes on
 * invalid or inverted ranges. Complexity O(n log n); no duplicates by
 * construction (eventKey includes type + date).
 */
export function projectTaxComplianceCalendar(
  input: ProjectActionCenterCalendarInput,
): Readonly<{ events: readonly TaxComplianceCalendarEvent[] }> {
  const { taxSubjectId, items, reminders, todayCivilDate, from, to } = input;

  if (!isValidCivilDate(todayCivilDate)) {
    throw new Error('projectTaxComplianceCalendar requires a valid todayCivilDate.');
  }
  if (!isValidCivilDate(from) || !isValidCivilDate(to)) {
    throw new Error('projectTaxComplianceCalendar requires a valid from/to range.');
  }
  if (compareCivilDates(from, to) > 0) {
    throw new Error('projectTaxComplianceCalendar requires from <= to.');
  }

  const inRange = (date: string): boolean =>
    compareCivilDates(date, from) >= 0 && compareCivilDates(date, to) <= 0;

  const events: TaxComplianceCalendarEvent[] = [];
  const seen = new Set<string>();
  const push = (event: TaxComplianceCalendarEvent): void => {
    if (!seen.has(event.eventKey)) {
      seen.add(event.eventKey);
      events.push(event);
    }
  };

  for (const item of items) {
    if (item.taxSubjectId !== taxSubjectId || item.operationalStatus === 'SUPERSEDED') {
      continue;
    }
    // Only obligation-state items project a due event. Evidence-review items
    // (REVIEW_PAYMENT_EVIDENCE, REVIEW_CHANGED_OBLIGATION) project a review
    // event below, and INFORMATIONAL siblings (e.g. USER_REPORTED_MATCH notes)
    // never project a second due for the same semantic obligation.
    const projectsDue =
      item.kind !== 'REVIEW_PAYMENT_EVIDENCE' &&
      item.kind !== 'REVIEW_CHANGED_OBLIGATION' &&
      item.kind !== 'INFORMATIONAL';
    if (projectsDue && item.dueDate !== null && inRange(item.dueDate)) {
      const annual = item.exercise !== null;
      push(
        Object.freeze({
          eventKey: `${item.actionKey}:${annual ? 'ANNUAL_REVIEW' : 'OBLIGATION_DUE'}:${item.dueDate}`,
          taxSubjectId,
          obligationKey: item.obligationKey,
          actionKey: item.actionKey,
          sourceFingerprint: item.sourceFingerprint,
          eventType: annual ? 'ANNUAL_REVIEW' : 'OBLIGATION_DUE',
          eventDate: item.dueDate,
          title: annual ? `Revisão anual ${item.period}` : `DARF a vencer — ${item.period}`,
          status: item.operationalStatus,
          severity:
            item.priority === 'CRITICAL'
              ? 'BLOCKING'
              : item.priority === 'HIGH'
                ? 'WARNING'
                : item.priority === 'MEDIUM'
                  ? 'ACTION'
                  : 'INFO',
          actionTarget: item.actionTarget,
        }),
      );
    }
    if (
      (item.kind === 'REVIEW_PAYMENT_EVIDENCE' || item.kind === 'REVIEW_CHANGED_OBLIGATION') &&
      inRange(todayCivilDate)
    ) {
      push(
        Object.freeze({
          eventKey: `${item.actionKey}:PAYMENT_EVIDENCE_REVIEW:${todayCivilDate}`,
          taxSubjectId,
          obligationKey: item.obligationKey,
          actionKey: item.actionKey,
          sourceFingerprint: item.sourceFingerprint,
          eventType: 'PAYMENT_EVIDENCE_REVIEW',
          eventDate: todayCivilDate,
          title: 'Revisar comprovante',
          status: item.operationalStatus,
          severity: 'WARNING',
          actionTarget: item.actionTarget,
        }),
      );
    }
  }

  for (const reminder of reminders) {
    if (reminder.taxSubjectId !== taxSubjectId) {
      continue;
    }
    if (reminder.status === 'SNOOZED' && reminder.snoozedUntil !== null) {
      if (inRange(reminder.snoozedUntil)) {
        push(
          Object.freeze({
            eventKey: `${reminder.reminderKey}:USER_SNOOZE:${reminder.snoozedUntil}`,
            taxSubjectId,
            obligationKey: reminder.obligationKey,
            actionKey: null,
            sourceFingerprint: reminder.sourceFingerprint,
            eventType: 'USER_SNOOZE',
            eventDate: reminder.snoozedUntil,
            title: reminder.title,
            status: reminder.status,
            severity: 'INFO',
            actionTarget: reminder.actionTarget,
          }),
        );
      }
      continue;
    }
    if (reminder.status === 'SCHEDULED' || reminder.status === 'DELIVERED') {
      if (inRange(reminder.effectiveAt)) {
        push(
          Object.freeze({
            eventKey: `${reminder.reminderKey}:REMINDER:${reminder.effectiveAt}`,
            taxSubjectId,
            obligationKey: reminder.obligationKey,
            actionKey: null,
            sourceFingerprint: reminder.sourceFingerprint,
            eventType: 'REMINDER',
            eventDate: reminder.effectiveAt,
            title: reminder.title,
            status: reminder.status,
            severity: 'INFO',
            actionTarget: reminder.actionTarget,
          }),
        );
      }
    }
  }

  events.sort((a, b) => {
    const dateOrder = compareCivilDates(a.eventDate, b.eventDate);
    if (dateOrder !== 0) {
      return dateOrder;
    }
    const severityOrder = severityWeight(b.severity) - severityWeight(a.severity);
    if (severityOrder !== 0) {
      return severityOrder;
    }
    return a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0;
  });

  return Object.freeze({ events: Object.freeze(events) });
}
