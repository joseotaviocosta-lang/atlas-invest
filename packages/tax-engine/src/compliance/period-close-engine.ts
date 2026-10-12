/**
 * Phase 4K.5 — deterministic Tax Compliance Period Close & Evidence Binder.
 *
 * Pure closeout/packaging/auditability: (4K.1 obligations + 4K.2 payment
 * hints + verbatim evidence metadata + 4K.3 reminders + 4K.4 action items +
 * close history + injected civil today) -> frozen readiness, checklist,
 * unresolved items, evidence binder and order-invariant fingerprints.
 *
 * Hard boundaries (never done here):
 * - tax amounts, legal due dates, minimum-DARF, penalties, interest, SELIC;
 * - revenue-code derivation, IRRF, loss compensation, annual/high-income math;
 * - government verification (USER_REPORTED stays user-reported);
 * - no clock access: `todayCivilDate` is injected (FISCAL_CLOCK);
 * - no float math: amounts are verbatim strings; only small-int counts.
 */
import type { TaxComplianceObligation } from './compliance-types';
import { computeComplianceFingerprint } from './compliance-fingerprint';
import {
  TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION,
  type TaxComplianceCloseChecklistCategory,
  type TaxComplianceCloseChecklistEntry,
  type TaxComplianceCloseChecklistState,
  type TaxCompliancePeriodCloseReadiness,
  type TaxComplianceCloseReadinessStatus,
  type TaxComplianceCloseScope,
  type TaxComplianceEvidenceBinder,
  type TaxComplianceUnresolvedItem,
} from './period-close-types';
import type { TaxComplianceActionItem } from './action-center-types';
import type { TaxComplianceReminder, TaxComplianceReminderPaymentHint } from './reminder-types';
import { escapeCsvCell } from '../annual-irpf/csv-escape';

export interface PeriodCloseEvidenceRef {
  readonly obligationKey: string;
  /** Verbatim decimal string. Never parsed, never aggregated. */
  readonly amountReported: string;
  readonly revenueCodeReported: string | null;
  readonly referencePeriod: string;
  readonly paymentDate: string;
  readonly externalReference: string | null;
  readonly revision: number;
  readonly verificationStatus: string;
}

export interface PeriodCloseHistoryRef {
  readonly revision: number;
  readonly recordStatus: 'CLOSED' | 'REOPENED';
  readonly sourceFingerprint: string;
  readonly binderFingerprint: string;
  readonly closedAt: string | null;
}

export interface AssessPeriodCloseReadinessInput {
  readonly taxSubjectId: string;
  readonly scope: TaxComplianceCloseScope;
  /** Canonical period: "YYYY-MM" (monthly) or "YYYY" (annual). */
  readonly period: string;
  readonly calendarYear: number;
  readonly month: string | null;
  readonly exercise: number | null;
  /** Injected current civil date (YYYY-MM-DD). Never derived inside. */
  readonly todayCivilDate: string;
  readonly obligations: readonly TaxComplianceObligation[];
  readonly actionItems: readonly TaxComplianceActionItem[];
  readonly paymentHints: readonly TaxComplianceReminderPaymentHint[];
  readonly reminders: readonly TaxComplianceReminder[];
  readonly evidence: readonly PeriodCloseEvidenceRef[];
  readonly centerFingerprint: string | null;
  readonly latestClose: PeriodCloseHistoryRef | null;
}

function isPayableAmount(amount: string | null): boolean {
  return amount !== null && amount !== '0' && amount !== '0.00' && !amount.startsWith('-');
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Current semantic source fingerprint. Order-invariant (sorted entries),
 * timestamp-free. Covers obligation status/severity/amount, item
 * kind/status/priority and hint reconciliation — deliberately EXCLUDING
 * reminder surfacing state (ACK/SNOOZE/DISMISS never resolve compliance,
 * so they must never stale a close).
 */
export function computePeriodSourceFingerprint(input: {
  readonly scope: TaxComplianceCloseScope;
  readonly period: string;
  readonly obligations: readonly TaxComplianceObligation[];
  readonly actionItems: readonly TaxComplianceActionItem[];
  readonly paymentHints: readonly TaxComplianceReminderPaymentHint[];
}): string {
  const obligationEntries = input.obligations
    .map(
      (o) =>
        `${o.obligationKey}|${o.status}|${o.severity}|${o.sourceFingerprint}|${o.amount ?? ''}`,
    )
    .sort();
  const itemEntries = input.actionItems
    .map((item) => `${item.actionKey}|${item.operationalStatus}|${item.priority}|${item.kind}`)
    .sort();
  const hintEntries = input.paymentHints
    .map((hint) => `${hint.obligationKey}|${hint.reconciliationStatus}|${hint.supportStatus}`)
    .sort();
  return computeComplianceFingerprint({
    period: input.period,
    hints: hintEntries,
    items: itemEntries,
    obligations: obligationEntries,
    scope: input.scope,
    version: TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION,
  });
}

const ACTIONABLE_ITEM_KINDS = new Set([
  'PAY_TAX',
  'RESOLVE_BLOCKER',
  'PROVIDE_CONFIRMATION',
  'REVIEW_PAYMENT_EVIDENCE',
  'REVIEW_CHANGED_OBLIGATION',
  'REVIEW_ANNUAL_FILING',
]);

function isActionableItem(item: TaxComplianceActionItem): boolean {
  return (
    ACTIONABLE_ITEM_KINDS.has(item.kind) &&
    item.operationalStatus !== 'COMPLETED' &&
    item.operationalStatus !== 'SUPERSEDED' &&
    item.operationalStatus !== 'INFORMATIONAL'
  );
}

function entry(
  category: TaxComplianceCloseChecklistCategory,
  state: TaxComplianceCloseChecklistState,
  detail: string,
  itemCount: number,
): TaxComplianceCloseChecklistEntry {
  return Object.freeze({ category, state, detail, itemCount });
}

/**
 * Assess period close readiness. Complexity O(n log n) in scoped item
 * count (fingerprint sort dominates); no nested scans, no N+1, no O(n^2).
 */
export function assessPeriodCloseReadiness(
  input: AssessPeriodCloseReadinessInput,
): TaxCompliancePeriodCloseReadiness {
  const {
    taxSubjectId,
    scope,
    period,
    calendarYear,
    month,
    exercise,
    obligations,
    actionItems,
    paymentHints,
    latestClose,
  } = input;

  // Defensive scope filter: monthly covers "YYYY-MM" obligations and
  // non-annual items; annual covers the "YYYY" period plus annual-review
  // items (exercise !== null), so monthly and annual never mix.
  const scopedObligations = obligations.filter((o) => o.period === period);
  const scopedItems = actionItems.filter((item) =>
    scope === 'MONTHLY' ? item.period === period && item.exercise === null : item.exercise !== null,
  );
  const scopedHints = paymentHints.filter((hint) =>
    scopedObligations.some((o) => o.obligationKey === hint.obligationKey),
  );

  const sourceFingerprint = computePeriodSourceFingerprint({
    scope,
    period,
    obligations: scopedObligations,
    actionItems: scopedItems,
    paymentHints: scopedHints,
  });

  const isStaleVsPreviousClose =
    latestClose !== null &&
    latestClose.recordStatus === 'CLOSED' &&
    latestClose.sourceFingerprint !== sourceFingerprint;

  const hasActivity = scopedObligations.length > 0 || scopedItems.length > 0;

  const unresolved: TaxComplianceUnresolvedItem[] = [];
  const pushedKeys = new Set<string>();
  const pushUnresolved = (item: {
    ref: string;
    kind: string;
    title: string;
    reason: string;
    severity: string;
  }): void => {
    // One entry per (ref, kind): the same obligation may be both a blocker
    // and an evidence mismatch, and §36 requires every material category to
    // be enumerated. Exact duplicates (same ref and kind) collapse once.
    const key = `${item.ref}::${item.kind}`;
    if (pushedKeys.has(key)) {
      return;
    }
    pushedKeys.add(key);
    unresolved.push(Object.freeze({ ...item }));
  };

  // --- Blocker signals (authoritative upstream only) ---
  const blockingObligations = scopedObligations.filter(
    (o) =>
      (o.status === 'ACTION_REQUIRED' && o.severity === 'BLOCKING') ||
      stringField(asRecord(o.metadata), 'darfReadiness') === 'BLOCKED',
  );
  const criticalItems = scopedItems.filter(
    (item) => item.kind === 'RESOLVE_BLOCKER' && item.priority === 'CRITICAL',
  );
  const blockedHints = scopedHints.filter((hint) => hint.supportStatus === 'BLOCKED');
  for (const o of blockingObligations) {
    pushUnresolved({
      ref: o.obligationKey,
      kind: 'BLOCKER',
      title: o.title,
      reason: 'Upstream blocker: regularização exigida antes do fechamento.',
      severity: 'BLOCKING',
    });
  }
  for (const item of criticalItems) {
    pushUnresolved({
      ref: item.actionKey,
      kind: 'BLOCKER',
      title: item.title,
      reason: 'Item crítico da central de ações exige resolução.',
      severity: 'BLOCKING',
    });
  }

  // --- Partial signals (upstream-declared incompleteness only) ---
  const partialObligations = scopedObligations.filter(
    (o) => stringField(asRecord(o.metadata), 'darfReadiness') === 'PARTIAL',
  );
  for (const o of partialObligations) {
    pushUnresolved({
      ref: o.obligationKey,
      kind: 'PARTIAL_DATA',
      title: o.title,
      reason: 'Fonte autoritativa declara dados materialmente incompletos.',
      severity: 'WARNING',
    });
  }

  // --- Review signals: every actionable item (payable work, confirmations,
  // evidence review, annual review) keeps the period from closing clean. ---
  const reviewItems = scopedItems.filter(isActionableItem);
  const awaitingObligations = scopedObligations.filter(
    (o) => o.status === 'AWAITING_CONFIRMATION' || o.status === 'AWAITING_EVIDENCE',
  );
  for (const item of reviewItems) {
    pushUnresolved({
      ref: item.actionKey,
      kind: item.kind,
      title: item.title,
      reason:
        item.kind === 'PAY_TAX'
          ? 'Item pagável segue acionável; fechamento não quita tributo.'
          : 'Item requer revisão antes do fechamento operacional.',
      severity:
        item.kind === 'RESOLVE_BLOCKER' && item.priority === 'CRITICAL' ? 'BLOCKING' : 'WARNING',
    });
  }
  for (const o of awaitingObligations) {
    if (!reviewItems.some((item) => item.obligationKey === o.obligationKey)) {
      pushUnresolved({
        ref: o.obligationKey,
        kind: 'AWAITING',
        title: o.title,
        reason: 'Obrigação aguarda confirmação ou evidência do investidor.',
        severity: 'WARNING',
      });
    }
  }

  const staleItems = scopedItems.filter((item) => item.isStale);
  const staleHints = scopedHints.filter((hint) => hint.reconciliationStatus === 'STALE_SOURCE');
  for (const item of staleItems) {
    if (!reviewItems.includes(item)) {
      pushUnresolved({
        ref: item.actionKey,
        kind: 'STALE_ITEM',
        title: item.title,
        reason: 'Dados de origem mudaram após a última projeção; revisar novamente.',
        severity: 'WARNING',
      });
    }
  }

  const mismatchHints = scopedHints.filter(
    (hint) => hint.reconciliationStatus === 'USER_REPORTED_MISMATCH',
  );
  for (const hint of mismatchHints) {
    pushUnresolved({
      ref: hint.obligationKey,
      kind: 'EVIDENCE_MISMATCH',
      title: `Comprovante diverge — ${hint.obligationKey}`,
      reason: 'Comprovante informado diverge em valor, período ou código.',
      severity: 'WARNING',
    });
  }

  const payableObligations = scopedObligations.filter((o) => isPayableAmount(o.amount));

  // --- Checklist (derived; only applicable entries resolve to terminal states) ---
  const checklist: TaxComplianceCloseChecklistEntry[] = [];
  if (!hasActivity) {
    for (const category of [
      'OBLIGATIONS_REVIEWED',
      'ACTION_ITEMS_RESOLVED',
      'PAYMENT_SUPPORT_REVIEWED',
      'PAYMENT_EVIDENCE_RECONCILED',
      'STALE_ITEMS_REVIEWED',
      'ANNUAL_CONFIRMATIONS_RESOLVED',
      'BLOCKERS_CLEARED',
    ] as const) {
      checklist.push(entry(category, 'NOT_APPLICABLE', 'Sem atividade no período.', 0));
    }
  } else {
    const openObligations = scopedObligations.filter(
      (o) =>
        o.status === 'OPEN' ||
        o.status === 'ACTION_REQUIRED' ||
        o.status === 'AWAITING_CONFIRMATION' ||
        o.status === 'AWAITING_EVIDENCE',
    );
    // OPEN is the normal pre-due state; only action-required/awaiting states
    // keep the obligations entry from completing.
    const pendingObligations = scopedObligations.filter(
      (o) =>
        o.status === 'ACTION_REQUIRED' ||
        o.status === 'AWAITING_CONFIRMATION' ||
        o.status === 'AWAITING_EVIDENCE',
    );
    checklist.push(
      blockingObligations.length > 0
        ? entry(
            'OBLIGATIONS_REVIEWED',
            'BLOCKED',
            `${blockingObligations.length} obrigação(ões) com bloqueio autoritativo.`,
            blockingObligations.length,
          )
        : pendingObligations.length > 0
          ? entry(
              'OBLIGATIONS_REVIEWED',
              'INCOMPLETE',
              `${pendingObligations.length} obrigação(ões) aguardando regularização.`,
              pendingObligations.length,
            )
          : entry(
              'OBLIGATIONS_REVIEWED',
              'COMPLETE',
              `${openObligations.length} obrigação(ões) em acompanhamento normal; sem pendência de regularização.`,
              openObligations.length,
            ),
    );

    const actionableItems = scopedItems.filter(isActionableItem);
    checklist.push(
      criticalItems.length > 0
        ? entry(
            'ACTION_ITEMS_RESOLVED',
            'BLOCKED',
            `${criticalItems.length} item(ns) crítico(s) na central de ações.`,
            criticalItems.length,
          )
        : actionableItems.length > 0
          ? entry(
              'ACTION_ITEMS_RESOLVED',
              'INCOMPLETE',
              `${actionableItems.length} item(ns) acionável(is) na central de ações.`,
              actionableItems.length,
            )
          : entry(
              'ACTION_ITEMS_RESOLVED',
              scopedItems.length > 0 ? 'COMPLETE' : 'NOT_APPLICABLE',
              scopedItems.length > 0
                ? 'Nenhum item acionável remanescente.'
                : 'Sem itens na central de ações.',
              0,
            ),
    );

    if (payableObligations.length === 0) {
      checklist.push(
        entry('PAYMENT_SUPPORT_REVIEWED', 'NOT_APPLICABLE', 'Sem valor a pagar no período.', 0),
      );
    } else {
      const attentionHints = scopedHints.filter((hint) =>
        ['BLOCKED', 'STALE', 'REQUIRES_REVIEW'].includes(hint.supportStatus),
      );
      checklist.push(
        attentionHints.length > 0
          ? entry(
              'PAYMENT_SUPPORT_REVIEWED',
              'REQUIRES_REVIEW',
              `${attentionHints.length} suporte(s) exigindo revisão.`,
              attentionHints.length,
            )
          : entry(
              'PAYMENT_SUPPORT_REVIEWED',
              'COMPLETE',
              'Suporte a pagamento revisado para os itens pagáveis.',
              payableObligations.length,
            ),
      );
    }

    if (payableObligations.length === 0) {
      checklist.push(
        entry(
          'PAYMENT_EVIDENCE_RECONCILED',
          'NOT_APPLICABLE',
          'Sem valor a pagar; sem conciliação exigida.',
          0,
        ),
      );
    } else {
      const problemHints = scopedHints.filter((hint) =>
        ['USER_REPORTED_MISMATCH', 'STALE_SOURCE', 'REQUIRES_REVIEW'].includes(
          hint.reconciliationStatus,
        ),
      );
      checklist.push(
        problemHints.length > 0
          ? entry(
              'PAYMENT_EVIDENCE_RECONCILED',
              'REQUIRES_REVIEW',
              `${problemHints.length} evidência(s) com divergência ou desatualização.`,
              problemHints.length,
            )
          : entry(
              'PAYMENT_EVIDENCE_RECONCILED',
              'COMPLETE',
              'Sem divergência de evidência nos itens pagáveis.',
              0,
            ),
      );
    }

    checklist.push(
      staleItems.length + staleHints.length > 0
        ? entry(
            'STALE_ITEMS_REVIEWED',
            'REQUIRES_REVIEW',
            `${staleItems.length + staleHints.length} item(ns) com dados de origem alterados.`,
            staleItems.length + staleHints.length,
          )
        : entry(
            'STALE_ITEMS_REVIEWED',
            scopedItems.length > 0 ? 'COMPLETE' : 'NOT_APPLICABLE',
            'Sem itens desatualizados.',
            0,
          ),
    );

    if (scope === 'ANNUAL') {
      const annualPending = scopedItems.filter(
        (item) => item.kind === 'REVIEW_ANNUAL_FILING' && isActionableItem(item),
      );
      checklist.push(
        annualPending.length > 0
          ? entry(
              'ANNUAL_CONFIRMATIONS_RESOLVED',
              'INCOMPLETE',
              `${annualPending.length} pendência(s) de revisão anual.`,
              annualPending.length,
            )
          : entry(
              'ANNUAL_CONFIRMATIONS_RESOLVED',
              'COMPLETE',
              'Revisão anual sem pendências operacionais.',
              0,
            ),
      );
    } else {
      checklist.push(
        entry(
          'ANNUAL_CONFIRMATIONS_RESOLVED',
          'NOT_APPLICABLE',
          'Escopo mensal; confirmações anuais não se aplicam.',
          0,
        ),
      );
    }

    checklist.push(
      blockingObligations.length + criticalItems.length + blockedHints.length > 0
        ? entry(
            'BLOCKERS_CLEARED',
            'BLOCKED',
            'Bloqueadores autoritativos impedem fechamento limpo.',
            blockingObligations.length + criticalItems.length + blockedHints.length,
          )
        : entry('BLOCKERS_CLEARED', 'COMPLETE', 'Sem bloqueadores autoritativos.', 0),
    );
  }

  // --- Readiness (frozen precedence, worst wins) ---
  let readiness: TaxComplianceCloseReadinessStatus;
  if (!hasActivity) {
    readiness = 'NO_ACTIVITY';
  } else if (
    blockingObligations.length > 0 ||
    criticalItems.length > 0 ||
    blockedHints.length > 0
  ) {
    readiness = 'BLOCKED';
  } else if (isStaleVsPreviousClose) {
    readiness = 'STALE';
  } else if (reviewItems.length > 0 || awaitingObligations.length > 0 || mismatchHints.length > 0) {
    readiness = 'REQUIRES_REVIEW';
  } else if (partialObligations.length > 0) {
    readiness = 'PARTIAL';
  } else {
    readiness = 'READY_TO_CLOSE';
  }

  // Canonical deterministic order: severity weight desc, ref asc.
  unresolved.sort((a, b) => {
    const weight = (severity: string): number =>
      severity === 'BLOCKING' ? 2 : severity === 'WARNING' ? 1 : 0;
    const order = weight(b.severity) - weight(a.severity);
    if (order !== 0) {
      return order;
    }
    return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  });

  return Object.freeze({
    taxSubjectId,
    scope,
    period,
    calendarYear,
    month,
    exercise,
    readiness,
    checklist: Object.freeze(checklist),
    unresolvedItems: Object.freeze(unresolved),
    sourceFingerprint,
    previousClose: latestClose
      ? Object.freeze({
          revision: latestClose.revision,
          recordStatus: latestClose.recordStatus,
          sourceFingerprint: latestClose.sourceFingerprint,
          binderFingerprint: latestClose.binderFingerprint,
          closedAt: latestClose.closedAt,
        })
      : null,
    isStaleVsPreviousClose,
    cleanCloseAllowed: readiness === 'READY_TO_CLOSE' || readiness === 'NO_ACTIVITY',
    sourceVersion: TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION,
  });
}

export interface AssembleEvidenceBinderInput {
  readonly readiness: TaxCompliancePeriodCloseReadiness;
  readonly obligations: readonly TaxComplianceObligation[];
  readonly actionItems: readonly TaxComplianceActionItem[];
  readonly paymentHints: readonly TaxComplianceReminderPaymentHint[];
  readonly reminders: readonly TaxComplianceReminder[];
  readonly evidence: readonly PeriodCloseEvidenceRef[];
  readonly actionCenterSummary: Readonly<Record<string, number>> | null;
  readonly centerFingerprint: string | null;
  readonly todayCivilDate: string;
}

interface BinderLine {
  readonly code: string;
  readonly title: string;
  readonly lines: string[];
}

function countBy<T>(values: readonly T[], keyOf: (value: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Assemble the human-readable evidence binder. Consumes upstream values
 * verbatim; zero formulas, zero recomputation. Complexity O(n log n).
 */
export function assembleEvidenceBinder(
  input: AssembleEvidenceBinderInput,
): TaxComplianceEvidenceBinder {
  const {
    readiness,
    obligations,
    actionItems,
    paymentHints,
    reminders,
    evidence,
    actionCenterSummary,
    centerFingerprint,
    todayCivilDate,
  } = input;

  const scopedObligations = [...obligations].sort((a, b) =>
    a.obligationKey < b.obligationKey ? -1 : a.obligationKey > b.obligationKey ? 1 : 0,
  );
  const scopedItems = [...actionItems].sort((a, b) =>
    a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0,
  );
  const scopedHints = [...paymentHints].sort((a, b) =>
    a.obligationKey < b.obligationKey ? -1 : a.obligationKey > b.obligationKey ? 1 : 0,
  );
  const scopedEvidence = [...evidence].sort((a, b) =>
    a.obligationKey < b.obligationKey ? -1 : a.obligationKey > b.obligationKey ? 1 : 0,
  );

  const sections: BinderLine[] = [];

  sections.push({
    code: 'PERIOD_IDENTITY',
    title: 'Identidade do período',
    lines: [
      `Escopo: ${readiness.scope === 'MONTHLY' ? 'Mensal' : 'Anual'}`,
      `Período: ${readiness.period}`,
      `Ano-calendário: ${readiness.calendarYear}`,
      readiness.month !== null ? `Competência: ${readiness.month}` : 'Competência: não se aplica',
      readiness.exercise !== null
        ? `Exercício: ${readiness.exercise} (ano-calendário ${readiness.calendarYear})`
        : 'Exercício: não se aplica',
      `Data de emissão: ${todayCivilDate}`,
    ],
  });

  sections.push({
    code: 'CLOSE_READINESS',
    title: 'Prontidão de fechamento operacional',
    lines: [
      `Prontidão: ${readiness.readiness}`,
      `Fechamento limpo permitido: ${readiness.cleanCloseAllowed ? 'SIM' : 'NÃO'}`,
      ...readiness.checklist.map((item) => `${item.category}: ${item.state} — ${item.detail}`),
      'Fechamento operacional interno do Atlas. Não equivale a quitação de tributo, homologação pela Receita Federal ou entrega de declaração.',
    ],
  });

  sections.push({
    code: 'OBLIGATIONS',
    title: 'Resumo de obrigações',
    lines: [
      `Total de obrigações: ${scopedObligations.length}`,
      ...countBy(scopedObligations, (o) => o.status).map(
        ([status, count]) => `${status}: ${count}`,
      ),
      ...scopedObligations.map(
        (o) =>
          `${o.obligationKey} | ${o.title} | status=${o.status} | valor=${o.amount ?? '—'} | vencimento=${o.dueDate ?? '—'}`,
      ),
    ],
  });

  sections.push({
    code: 'ACTION_CENTER',
    title: 'Resumo da central de ações',
    lines: [
      centerFingerprint !== null
        ? `Fingerprint da central: ${centerFingerprint.substring(0, 16)}…`
        : 'Fingerprint da central: indisponível',
      ...(actionCenterSummary !== null
        ? Object.entries(actionCenterSummary)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, value]) => `${key}: ${value}`)
        : ['Resumo da central: indisponível']),
      ...scopedItems.map(
        (item) =>
          `${item.actionKey} | ${item.title} | status=${item.operationalStatus} | prioridade=${item.priority} | próxima ação=${item.nextAction}`,
      ),
    ],
  });

  sections.push({
    code: 'PAYMENT_SUPPORT',
    title: 'Suporte a pagamento',
    lines:
      scopedHints.length === 0
        ? ['Sem itens de suporte a pagamento no período.']
        : [
            ...countBy(scopedHints, (hint) => hint.supportStatus).map(
              ([status, count]) => `${status}: ${count}`,
            ),
            ...scopedHints.map(
              (hint) =>
                `${hint.obligationKey} | suporte=${hint.supportStatus} | conciliação=${hint.reconciliationStatus}`,
            ),
          ],
  });

  sections.push({
    code: 'PAYMENT_EVIDENCE',
    title: 'Evidências de pagamento informadas pelo investidor',
    lines:
      scopedEvidence.length === 0
        ? ['Sem evidências registradas no período.']
        : [
            'Evidências informadas pelo investidor; sem verificação governamental.',
            ...scopedEvidence.map(
              (item) =>
                // externalReference is raw user input: CSV-injection-safe display
                // is applied here (canonical value unchanged in storage/API).
                `${item.obligationKey} | data=${item.paymentDate} | valor=${item.amountReported} | código=${item.revenueCodeReported ?? '—'} | período=${item.referencePeriod} | ref=${item.externalReference !== null ? escapeCsvCell(item.externalReference) : '—'} | revisão=${item.revision} | verificação=${item.verificationStatus}`,
            ),
          ],
  });

  sections.push({
    code: 'REMINDERS_WORKFLOW',
    title: 'Lembretes e fluxo de trabalho',
    lines: [
      `Total de lembretes projetados: ${reminders.length}`,
      ...countBy(reminders, (reminder) => reminder.status).map(
        ([status, count]) => `${status}: ${count}`,
      ),
      'Reconhecer, adiar ou dispensar lembretes não resolve obrigações fiscais.',
    ],
  });

  sections.push({
    code: 'UNRESOLVED_ITEMS',
    title: 'Itens pendentes',
    lines:
      readiness.unresolvedItems.length === 0
        ? ['Nenhum item pendente conhecido nos dados atuais.']
        : readiness.unresolvedItems.map(
            (item) => `${item.ref} | ${item.kind} | ${item.title} | motivo=${item.reason}`,
          ),
  });

  sections.push({
    code: 'SOURCES_METADATA',
    title: 'Fontes e metadados',
    lines: [
      `Fingerprint de origem do período: ${readiness.sourceFingerprint}`,
      readiness.previousClose !== null
        ? `Fechamento anterior: revisão ${readiness.previousClose.revision} (${readiness.previousClose.recordStatus}), origem ${readiness.previousClose.sourceFingerprint.substring(0, 16)}…`
        : 'Fechamento anterior: nenhum',
      `Origem desatualizada em relação ao fechamento anterior: ${readiness.isStaleVsPreviousClose ? 'SIM' : 'NÃO'}`,
    ],
  });

  sections.push({
    code: 'DISCLAIMERS',
    title: 'Avisos legais',
    lines: [
      'Este pacote é material de apoio produzido pelo Atlas com base nos dados disponíveis e nas informações registradas pelo usuário. Não constitui declaração transmitida à Receita Federal, DARF oficial, comprovante de pagamento governamental ou certificação de regularidade fiscal.',
      'O Atlas não processa pagamentos, não confirma quitação junto à Receita Federal e não transmite dados a sistemas oficiais.',
    ],
  });

  const fingerprintPayload = {
    actionCenterSummary: actionCenterSummary !== null ? { ...actionCenterSummary } : null,
    centerFingerprint,
    checklist: readiness.checklist.map((item) => ({
      category: item.category,
      detail: item.detail,
      itemCount: item.itemCount,
      state: item.state,
    })),
    evidence: scopedEvidence.map((item) => ({ ...item })),
    exercise: readiness.exercise,
    hints: scopedHints.map((hint) => ({ ...hint })),
    items: scopedItems.map((item) => ({
      actionKey: item.actionKey,
      kind: item.kind,
      nextAction: item.nextAction,
      operationalStatus: item.operationalStatus,
      priority: item.priority,
      title: item.title,
    })),
    month: readiness.month,
    obligations: scopedObligations.map((o) => ({
      amount: o.amount,
      dueDate: o.dueDate,
      obligationKey: o.obligationKey,
      sourceFingerprint: o.sourceFingerprint,
      status: o.status,
      title: o.title,
    })),
    period: readiness.period,
    readiness: readiness.readiness,
    reminderCounts: countBy(reminders, (reminder) => `${reminder.kind}:${reminder.status}`),
    scope: readiness.scope,
    unresolved: readiness.unresolvedItems.map((item) => ({ ...item })),
    version: TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION,
  };
  const binderFingerprint = computeComplianceFingerprint(fingerprintPayload);

  const frozenSections = sections.map((section) =>
    Object.freeze({
      code: section.code,
      title: section.title,
      lines: Object.freeze([...section.lines]),
    }),
  );

  return Object.freeze({
    taxSubjectId: readiness.taxSubjectId,
    scope: readiness.scope,
    period: readiness.period,
    calendarYear: readiness.calendarYear,
    month: readiness.month,
    exercise: readiness.exercise,
    readiness: readiness.readiness,
    sections: Object.freeze(frozenSections),
    binderFingerprint,
    generatedAt: `${todayCivilDate}T00:00:00.000Z`,
    sourceVersion: TAX_COMPLIANCE_PERIOD_CLOSE_SOURCE_VERSION,
  });
}

/** Stable filename segment: scope + period only (no PII, no traversal). */
export function binderFileStem(scope: TaxComplianceCloseScope, period: string): string {
  const safePeriod = period.replace(/[^0-9A-Za-z-]/g, '');
  return `atlas-fechamento-${scope === 'MONTHLY' ? 'mensal' : 'anual'}-${safePeriod}-apoio`;
}

/** Deterministic JSON export. Same semantic binder -> byte-identical body. */
export function serializeBinderJson(binder: TaxComplianceEvidenceBinder): string {
  return `${JSON.stringify(
    {
      binderFingerprint: binder.binderFingerprint,
      calendarYear: binder.calendarYear,
      exercise: binder.exercise,
      generatedAt: binder.generatedAt,
      month: binder.month,
      period: binder.period,
      readiness: binder.readiness,
      scope: binder.scope,
      sections: binder.sections.map((section) => ({
        code: section.code,
        lines: [...section.lines],
        title: section.title,
      })),
      sourceVersion: binder.sourceVersion,
      taxSubjectId: binder.taxSubjectId,
    },
    null,
    2,
  )}\n`;
}

/**
 * Deterministic single-file CSV export (`;` delimiter, CRLF, OWASP-escaped
 * cells). Same semantic binder -> byte-identical body.
 */
export function serializeBinderCsv(binder: TaxComplianceEvidenceBinder): string {
  const rows: string[] = [];
  rows.push(
    ['Atlas — Pacote de apoio ao fechamento (documento de apoio; sem valor oficial)', '']
      .map(escapeCsvCell)
      .join(';'),
  );
  rows.push(
    [`Período;${binder.period}`, `Escopo;${binder.scope}`, `Prontidão;${binder.readiness}`]
      .map(escapeCsvCell)
      .join(';'),
  );
  rows.push([`Fingerprint;${binder.binderFingerprint}`].map(escapeCsvCell).join(';'));
  for (const section of binder.sections) {
    rows.push([`# ${section.code}: ${section.title}`].map(escapeCsvCell).join(';'));
    for (const line of section.lines) {
      rows.push([line].map(escapeCsvCell).join(';'));
    }
  }
  return `${rows.join('\r\n')}\r\n`;
}
