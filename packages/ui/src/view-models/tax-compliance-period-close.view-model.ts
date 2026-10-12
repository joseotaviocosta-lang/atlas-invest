import { formatDate } from '../formatters';
import { colors } from '../tokens/colors';

export type TaxComplianceCloseScope = 'MONTHLY' | 'ANNUAL';

export type TaxComplianceCloseReadinessStatus =
  'READY_TO_CLOSE' | 'REQUIRES_REVIEW' | 'PARTIAL' | 'BLOCKED' | 'NO_ACTIVITY' | 'STALE';

export type TaxComplianceCloseChecklistState =
  'COMPLETE' | 'INCOMPLETE' | 'NOT_APPLICABLE' | 'BLOCKED' | 'REQUIRES_REVIEW';

export interface RawTaxComplianceCloseChecklistEntry {
  readonly category: string;
  readonly state: TaxComplianceCloseChecklistState;
  readonly detail: string;
  readonly itemCount: number;
}

export interface RawTaxComplianceUnresolvedItem {
  readonly ref: string;
  readonly kind: string;
  readonly title: string;
  readonly reason: string;
  readonly severity: string;
}

export interface RawTaxCompliancePreviousClose {
  readonly revision: number;
  readonly recordStatus: string;
  readonly sourceFingerprint: string;
  readonly binderFingerprint: string;
  readonly closedAt: string | null;
}

export interface RawTaxCompliancePeriodCloseReadiness {
  readonly taxSubjectId: string;
  readonly scope: TaxComplianceCloseScope;
  readonly period: string;
  readonly calendarYear: number;
  readonly month: string | null;
  readonly exercise: number | null;
  readonly readiness: TaxComplianceCloseReadinessStatus;
  readonly checklist: readonly RawTaxComplianceCloseChecklistEntry[];
  readonly unresolvedItems: readonly RawTaxComplianceUnresolvedItem[];
  readonly sourceFingerprint: string;
  readonly previousClose: RawTaxCompliancePreviousClose | null;
  readonly isStaleVsPreviousClose: boolean;
  readonly cleanCloseAllowed: boolean;
  readonly sourceVersion: string;
}

export interface RawTaxCompliancePeriodCloseRecord {
  readonly id: string;
  readonly scope: string;
  readonly period: string;
  readonly calendarYear: number;
  readonly month: string | null;
  readonly exercise: number | null;
  readonly revision: number;
  readonly recordStatus: string;
  readonly statusAtClose: string | null;
  readonly closeMode: string | null;
  readonly sourceFingerprint: string;
  readonly binderFingerprint: string;
  readonly reason: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
}

export interface RawTaxComplianceEvidenceBinderSection {
  readonly code: string;
  readonly title: string;
  readonly lines: readonly string[];
}

export interface RawTaxComplianceEvidenceBinder {
  readonly taxSubjectId: string;
  readonly scope: string;
  readonly period: string;
  readonly calendarYear: number;
  readonly month: string | null;
  readonly exercise: number | null;
  readonly readiness: string;
  readonly sections: readonly RawTaxComplianceEvidenceBinderSection[];
  readonly binderFingerprint: string;
  readonly generatedAt: string;
  readonly sourceVersion: string;
}

export interface TaxCompliancePeriodCloseReadinessViewModel {
  readonly scope: TaxComplianceCloseScope;
  readonly scopeLabel: string;
  readonly period: string;
  readonly periodLabel: string;
  readonly exerciseLabel: string | null;
  readonly readiness: TaxComplianceCloseReadinessStatus;
  readonly readinessLabel: string;
  readonly statusColor: string;
  readonly statusVariant: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  readonly cleanCloseAllowed: boolean;
  readonly checklist: Array<{
    category: string;
    categoryLabel: string;
    state: TaxComplianceCloseChecklistState;
    stateLabel: string;
    detail: string;
    itemCount: number;
  }>;
  readonly unresolvedItems: Array<{
    ref: string;
    kind: string;
    kindLabel: string;
    title: string;
    reason: string;
    severity: string;
  }>;
  readonly sourceFingerprintShort: string;
  readonly previousClose: {
    revision: number;
    recordStatus: string;
    recordStatusLabel: string;
    closedAtFormatted: string;
  } | null;
  readonly isStaleVsPreviousClose: boolean;
}

export interface TaxCompliancePeriodCloseRecordViewModel {
  readonly id: string;
  readonly scope: string;
  readonly scopeLabel: string;
  readonly period: string;
  readonly revision: number;
  readonly revisionLabel: string;
  readonly recordStatus: string;
  readonly recordStatusLabel: string;
  readonly statusVariant: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  readonly closedAtFormatted: string;
  readonly sourceFingerprintShort: string;
  readonly binderFingerprintShort: string;
  readonly reason: string | null;
}

/**
 * Display-only support disclaimer. Every binder/export carries it verbatim.
 */
export const TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER =
  'Este pacote é material de apoio produzido pelo Atlas com base nos dados disponíveis e nas informações registradas pelo usuário. ' +
  'Não constitui declaração transmitida à Receita Federal, DARF oficial, comprovante de pagamento governamental ou certificação de regularidade fiscal.';

export const TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE =
  'Fechamento operacional interno do Atlas. Não equivale a quitação de tributo, homologação pela Receita Federal ou entrega de declaração.';

export const TAX_PERIOD_CLOSE_STALE_MESSAGE =
  'Este fechamento ficou desatualizado porque os dados de origem mudaram.';

export function taxCompliancePeriodCloseReadinessQueryKey(
  scope: string,
  calendarYear: number | string,
  period?: string,
) {
  return [
    'fiscal',
    'compliance',
    'period-close',
    'readiness',
    scope,
    String(calendarYear),
    period ?? '',
  ] as const;
}

export function taxCompliancePeriodCloseHistoryQueryKey() {
  return ['fiscal', 'compliance', 'period-close', 'history'] as const;
}

export function taxCompliancePeriodCloseBinderQueryKey(
  scope: string,
  calendarYear: number | string,
  period?: string,
) {
  return [
    'fiscal',
    'compliance',
    'period-close',
    'binder',
    scope,
    String(calendarYear),
    period ?? '',
  ] as const;
}

const READINESS_CONFIGS: Record<
  TaxComplianceCloseReadinessStatus,
  { label: string; color: string; variant: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
> = {
  READY_TO_CLOSE: { label: 'Pronto para fechar', color: colors.positive, variant: 'success' },
  REQUIRES_REVIEW: { label: 'Requer revisão', color: colors.warning, variant: 'warning' },
  PARTIAL: { label: 'Parcial — incompleto', color: colors.warning, variant: 'warning' },
  BLOCKED: { label: 'Bloqueado', color: colors.negative, variant: 'danger' },
  NO_ACTIVITY: { label: 'Sem movimento', color: colors.textSecondary, variant: 'neutral' },
  STALE: { label: 'Desatualizado — revisar', color: colors.warning, variant: 'warning' },
};

const CHECKLIST_CATEGORY_LABELS: Record<string, string> = {
  OBLIGATIONS_REVIEWED: 'Obrigações revisadas',
  ACTION_ITEMS_RESOLVED: 'Itens de ação resolvidos',
  PAYMENT_SUPPORT_REVIEWED: 'Suporte a pagamento revisado',
  PAYMENT_EVIDENCE_RECONCILED: 'Evidências conciliadas',
  STALE_ITEMS_REVIEWED: 'Itens desatualizados revisados',
  ANNUAL_CONFIRMATIONS_RESOLVED: 'Confirmações anuais resolvidas',
  BLOCKERS_CLEARED: 'Bloqueios removidos',
};

const CHECKLIST_STATE_LABELS: Record<TaxComplianceCloseChecklistState, string> = {
  COMPLETE: 'Concluído',
  INCOMPLETE: 'Pendente',
  NOT_APPLICABLE: 'Não se aplica',
  BLOCKED: 'Bloqueado',
  REQUIRES_REVIEW: 'Requer revisão',
};

const UNRESOLVED_KIND_LABELS: Record<string, string> = {
  BLOCKER: 'Bloqueador',
  PARTIAL_DATA: 'Dados parciais',
  PAY_TAX: 'Tributo a pagar',
  REVIEW_PAYMENT_EVIDENCE: 'Revisar comprovante',
  REVIEW_CHANGED_OBLIGATION: 'Dados alterados',
  PROVIDE_CONFIRMATION: 'Fornecer confirmação',
  REVIEW_ANNUAL_FILING: 'Revisão anual',
  RESOLVE_BLOCKER: 'Resolver pendência',
  EVIDENCE_MISMATCH: 'Comprovante diverge',
  STALE_ITEM: 'Item desatualizado',
  AWAITING: 'Aguardando confirmação',
};

/**
 * Format-only mapper: copies server strings verbatim, formats dates for
 * display. Zero financial math — no amounts are parsed or aggregated.
 */
export function mapToTaxCompliancePeriodCloseReadinessViewModel(
  raw: RawTaxCompliancePeriodCloseReadiness,
): TaxCompliancePeriodCloseReadinessViewModel {
  const config = READINESS_CONFIGS[raw.readiness] ?? READINESS_CONFIGS.NO_ACTIVITY;
  return {
    scope: raw.scope,
    scopeLabel: raw.scope === 'MONTHLY' ? 'Mensal' : 'Anual',
    period: raw.period,
    periodLabel:
      raw.scope === 'MONTHLY' ? `Competência ${raw.period}` : `Ano-calendário ${raw.period}`,
    exerciseLabel:
      raw.exercise !== null
        ? `Exercício ${raw.exercise} (ano-calendário ${raw.calendarYear})`
        : null,
    readiness: raw.readiness,
    readinessLabel: config.label,
    statusColor: config.color,
    statusVariant: config.variant,
    cleanCloseAllowed: raw.cleanCloseAllowed,
    checklist: (raw.checklist ?? []).map((entry) => ({
      category: entry.category,
      categoryLabel: CHECKLIST_CATEGORY_LABELS[entry.category] ?? entry.category,
      state: entry.state,
      stateLabel: CHECKLIST_STATE_LABELS[entry.state] ?? entry.state,
      detail: entry.detail,
      itemCount: entry.itemCount,
    })),
    unresolvedItems: (raw.unresolvedItems ?? []).map((item) => ({
      ref: item.ref,
      kind: item.kind,
      kindLabel: UNRESOLVED_KIND_LABELS[item.kind] ?? item.kind,
      title: item.title,
      reason: item.reason,
      severity: item.severity,
    })),
    sourceFingerprintShort: raw.sourceFingerprint.substring(0, 16),
    previousClose: raw.previousClose
      ? {
          revision: raw.previousClose.revision,
          recordStatus: raw.previousClose.recordStatus,
          recordStatusLabel: raw.previousClose.recordStatus === 'CLOSED' ? 'Fechado' : 'Reaberto',
          closedAtFormatted: raw.previousClose.closedAt
            ? formatDate(raw.previousClose.closedAt.slice(0, 10))
            : '—',
        }
      : null,
    isStaleVsPreviousClose: raw.isStaleVsPreviousClose,
  };
}

export function mapToTaxCompliancePeriodCloseRecordViewModel(
  raw: RawTaxCompliancePeriodCloseRecord,
): TaxCompliancePeriodCloseRecordViewModel {
  const isClosed = raw.recordStatus === 'CLOSED';
  return {
    id: raw.id,
    scope: raw.scope,
    scopeLabel: raw.scope === 'MONTHLY' ? 'Mensal' : 'Anual',
    period: raw.period,
    revision: raw.revision,
    revisionLabel: `Revisão ${raw.revision}`,
    recordStatus: raw.recordStatus,
    recordStatusLabel: isClosed ? 'Fechado' : 'Reaberto',
    statusVariant: isClosed ? 'success' : 'warning',
    closedAtFormatted: raw.closedAt ? formatDate(raw.closedAt.slice(0, 10)) : '—',
    sourceFingerprintShort: raw.sourceFingerprint.substring(0, 16),
    binderFingerprintShort: raw.binderFingerprint.substring(0, 16),
    reason: raw.reason,
  };
}

export function mapToTaxCompliancePeriodCloseRecordListViewModel(
  rawList: readonly RawTaxCompliancePeriodCloseRecord[] | null | undefined,
): TaxCompliancePeriodCloseRecordViewModel[] {
  if (!rawList) return [];
  return rawList.map(mapToTaxCompliancePeriodCloseRecordViewModel);
}
