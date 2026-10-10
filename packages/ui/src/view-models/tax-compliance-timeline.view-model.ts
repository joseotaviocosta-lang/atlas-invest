import { formatCurrency, formatDate } from '../formatters';
import { colors } from '../tokens/colors';

export type TaxComplianceObligationKind =
  | 'MONTHLY_TAX_PAYMENT'
  | 'ANNUAL_TAX_DECLARATION'
  | 'HIGH_INCOME_MINIMUM_TAX_REVIEW'
  | 'ANNUAL_UNIFIED_REPORTING';

export type TaxComplianceObligationStatus =
  'PENDING' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED' | 'DISMISSED' | 'SUPERSEDED';

export type TaxComplianceActionType =
  'USER_REPORTED_COMPLETION' | 'USER_DISMISSED' | 'USER_ACKNOWLEDGED' | 'USER_REOPENED';

export interface RawTaxComplianceActionRecord {
  readonly id: string;
  readonly actionType: TaxComplianceActionType;
  readonly sourceFingerprint?: string | null;
  readonly note?: string | null;
  readonly recordedAt: string;
  readonly revision: number;
}

export interface RawTaxComplianceObligation {
  readonly obligationKey: string;
  readonly kind: TaxComplianceObligationKind;
  readonly period: string;
  readonly title: string;
  readonly description: string;
  readonly dueDate: string;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly revenueCode: string | null;
  readonly status: TaxComplianceObligationStatus;
  readonly sourceFingerprint: string;
  readonly isLegalDeadline: boolean;
  readonly authority: string;
  readonly officialLink: string | null;
  readonly lastAction: RawTaxComplianceActionRecord | null;
  readonly actionHistory: readonly RawTaxComplianceActionRecord[];
}

export interface RawTaxComplianceTimelineSummary {
  readonly totalObligations: number;
  readonly pendingCount: number;
  readonly dueSoonCount: number;
  readonly overdueCount: number;
  readonly completedCount: number;
  readonly dismissedCount: number;
  readonly supersededCount: number;
}

export interface RawTaxComplianceTimeline {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly generatedAt: string;
  readonly obligations: readonly RawTaxComplianceObligation[];
  readonly summary: RawTaxComplianceTimelineSummary;
  readonly disclaimer: string;
}

export interface TaxComplianceObligationViewModel {
  readonly obligationKey: string;
  readonly kind: TaxComplianceObligationKind;
  readonly kindLabel: string;
  readonly period: string;
  readonly periodLabel: string;
  readonly title: string;
  readonly description: string;
  readonly dueDate: string;
  readonly dueDateFormatted: string;
  readonly amount: string | null;
  readonly amountFormatted: string;
  readonly currency: string | null;
  readonly revenueCode: string | null;
  readonly status: TaxComplianceObligationStatus;
  readonly statusLabel: string;
  readonly statusColor: string;
  readonly statusVariant: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  readonly sourceFingerprint: string;
  readonly isLegalDeadline: boolean;
  readonly authority: string;
  readonly officialLink: string | null;
  readonly lastAction: RawTaxComplianceActionRecord | null;
  readonly actionHistory: readonly RawTaxComplianceActionRecord[];
  readonly isCompleted: boolean;
  readonly isDismissed: boolean;
  readonly isSuperseded: boolean;
  readonly isOverdue: boolean;
  readonly isDueSoon: boolean;
}

export interface TaxComplianceTimelineViewModel {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly calendarYearLabel: string;
  readonly generatedAtFormatted: string;
  readonly obligations: readonly TaxComplianceObligationViewModel[];
  readonly summary: {
    readonly totalObligations: number;
    readonly pendingCount: number;
    readonly dueSoonCount: number;
    readonly overdueCount: number;
    readonly completedCount: number;
    readonly dismissedCount: number;
    readonly supersededCount: number;
    readonly activeCount: number;
  };
  readonly disclaimer: string;
  readonly hasObligations: boolean;
  readonly hasOverdue: boolean;
}

export function taxComplianceTimelineQueryKey(calendarYear: number | string) {
  return ['fiscal', 'compliance', 'timeline', String(calendarYear)] as const;
}

export function mapToTaxComplianceObligationViewModel(
  raw: RawTaxComplianceObligation,
): TaxComplianceObligationViewModel {
  const kindLabels: Record<TaxComplianceObligationKind, string> = {
    MONTHLY_TAX_PAYMENT: 'DARF Mensal',
    ANNUAL_TAX_DECLARATION: 'Declaração Anual (DIRPF)',
    HIGH_INCOME_MINIMUM_TAX_REVIEW: 'Tributação Mínima de Alta Renda',
    ANNUAL_UNIFIED_REPORTING: 'Relatório Fiscal Consolidado',
  };

  const statusConfigs: Record<
    TaxComplianceObligationStatus,
    { label: string; color: string; variant: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
  > = {
    PENDING: { label: 'Pendente', color: colors.textSecondary, variant: 'neutral' },
    DUE_SOON: { label: 'Vence em breve', color: colors.warning, variant: 'warning' },
    OVERDUE: { label: 'Vencido', color: colors.negative, variant: 'danger' },
    COMPLETED: { label: 'Concluído pelo usuário', color: colors.positive, variant: 'success' },
    DISMISSED: { label: 'Dispensado / Não aplicável', color: colors.textMuted, variant: 'neutral' },
    SUPERSEDED: {
      label: 'Dados alterados (Revisão necessária)',
      color: colors.warning,
      variant: 'warning',
    },
  };

  const statusConfig = statusConfigs[raw.status] ?? statusConfigs.PENDING;

  return {
    obligationKey: raw.obligationKey,
    kind: raw.kind,
    kindLabel: kindLabels[raw.kind] ?? raw.kind,
    period: raw.period,
    periodLabel:
      raw.period.length === 7 ? `${raw.period.slice(5)}/${raw.period.slice(0, 4)}` : raw.period,
    title: raw.title,
    description: raw.description,
    dueDate: raw.dueDate,
    dueDateFormatted: formatDate(raw.dueDate),
    amount: raw.amount,
    amountFormatted:
      raw.amount && raw.currency
        ? formatCurrency(raw.amount, raw.currency)
        : raw.amount
          ? `R$ ${raw.amount}`
          : '—',
    currency: raw.currency,
    revenueCode: raw.revenueCode,
    status: raw.status,
    statusLabel: statusConfig.label,
    statusColor: statusConfig.color,
    statusVariant: statusConfig.variant,
    sourceFingerprint: raw.sourceFingerprint,
    isLegalDeadline: raw.isLegalDeadline,
    authority: raw.authority,
    officialLink: raw.officialLink,
    lastAction: raw.lastAction,
    actionHistory: raw.actionHistory ?? [],
    isCompleted: raw.status === 'COMPLETED',
    isDismissed: raw.status === 'DISMISSED',
    isSuperseded: raw.status === 'SUPERSEDED',
    isOverdue: raw.status === 'OVERDUE',
    isDueSoon: raw.status === 'DUE_SOON',
  };
}

export function mapToTaxComplianceTimelineViewModel(
  raw: RawTaxComplianceTimeline | null | undefined,
): TaxComplianceTimelineViewModel | null {
  if (!raw) return null;

  const obligations = (raw.obligations ?? []).map(mapToTaxComplianceObligationViewModel);
  const activeCount =
    raw.summary.pendingCount + raw.summary.dueSoonCount + raw.summary.overdueCount;

  return {
    taxSubjectId: raw.taxSubjectId,
    calendarYear: raw.calendarYear,
    calendarYearLabel: `Ano-calendário ${raw.calendarYear}`,
    generatedAtFormatted: formatDate(raw.generatedAt.slice(0, 10)),
    obligations,
    summary: {
      totalObligations: raw.summary.totalObligations,
      pendingCount: raw.summary.pendingCount,
      dueSoonCount: raw.summary.dueSoonCount,
      overdueCount: raw.summary.overdueCount,
      completedCount: raw.summary.completedCount,
      dismissedCount: raw.summary.dismissedCount,
      supersededCount: raw.summary.supersededCount,
      activeCount,
    },
    disclaimer: raw.disclaimer,
    hasObligations: obligations.length > 0,
    hasOverdue: raw.summary.overdueCount > 0,
  };
}
