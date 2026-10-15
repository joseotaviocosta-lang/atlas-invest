import { formatCurrency, formatDate } from '../formatters';
import { colors } from '../tokens/colors';
import type { TaxComplianceObligationKind } from './tax-compliance-timeline.view-model';

export type TaxPaymentSupportStatus =
  'NOT_APPLICABLE' | 'READY' | 'BLOCKED' | 'STALE' | 'REQUIRES_REVIEW';

export type TaxPaymentVerificationStatus = 'USER_REPORTED';

export type TaxPaymentReconciliationStatus =
  | 'NO_EVIDENCE'
  | 'USER_REPORTED_MATCH'
  | 'USER_REPORTED_MISMATCH'
  | 'STALE_SOURCE'
  | 'REQUIRES_REVIEW';

export interface RawTaxPaymentEvidenceSummary {
  readonly id: string;
  readonly revision: number;
  readonly paymentDate: string;
  readonly amountReported: string;
  readonly revenueCodeReported: string | null;
  readonly referencePeriod: string;
  readonly externalReference: string | null;
  readonly verificationStatus: TaxPaymentVerificationStatus;
  readonly reconciliationStatus: TaxPaymentReconciliationStatus;
  readonly isStale: boolean;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface RawTaxPaymentEvidenceRecord {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly revision: number;
  readonly sourceFingerprint: string;
  readonly paymentDate: string;
  readonly amountReported: string;
  readonly revenueCodeReported: string | null;
  readonly referencePeriod: string;
  readonly externalReference: string | null;
  readonly verificationStatus: TaxPaymentVerificationStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface RawTaxPaymentSupport {
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly period: string;
  readonly kind: TaxComplianceObligationKind;
  readonly taxCategory: string;
  readonly revenueCode: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly dueDate: string;
  readonly supportStatus: TaxPaymentSupportStatus;
  readonly reconciliationStatus: TaxPaymentReconciliationStatus;
  readonly paymentInstructions: readonly string[];
  readonly sourceReferences: readonly { readonly label: string; readonly ref: string }[];
  readonly latestEvidence: RawTaxPaymentEvidenceSummary | null;
  readonly isOverdue: boolean;
  readonly disclaimer: string;
  readonly version: string;
}

export interface TaxPaymentEvidenceViewModel {
  readonly id: string;
  readonly revision: number;
  readonly paymentDateFormatted: string;
  readonly amountFormatted: string;
  readonly revenueCodeReported: string | null;
  readonly referencePeriodFormatted: string;
  readonly externalReference: string | null;
  readonly verificationStatusLabel: string;
  readonly isStale: boolean;
  readonly note: string | null;
  readonly createdAtFormatted: string;
}

export interface TaxPaymentSupportViewModel {
  readonly obligationKey: string;
  readonly periodFormatted: string;
  readonly kindLabel: string;
  readonly revenueCode: string;
  readonly amountFormatted: string;
  readonly rawAmount: string;
  readonly dueDateFormatted: string;
  readonly rawDueDate: string;
  readonly isOverdue: boolean;
  readonly supportStatus: TaxPaymentSupportStatus;
  readonly supportStatusLabel: string;
  readonly supportStatusColor: string;
  readonly supportStatusVariant: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  readonly reconciliationStatus: TaxPaymentReconciliationStatus;
  readonly reconciliationLabel: string;
  readonly reconciliationColor: string;
  readonly isReady: boolean;
  /**
   * True when tax was calculated (positive amount) but support is not
   * applicable yet (e.g. open competence without a projected due date).
   * Presentation-only derivation from server facts; enables the modal to show
   * a provisional framing instead of a "no tax due" reading, and to gate
   * evidence recording and guide exports.
   */
  readonly isProvisionalPending: boolean;
  readonly isStale: boolean;
  readonly isMismatch: boolean;
  readonly hasEvidence: boolean;
  readonly paymentInstructions: readonly string[];
  readonly sourceReferences: readonly { readonly label: string; readonly ref: string }[];
  readonly latestEvidence: TaxPaymentEvidenceViewModel | null;
  readonly disclaimer: string;
}

export function taxPaymentSupportQueryKey(obligationKey: string) {
  return ['fiscal', 'compliance', 'payment-support', obligationKey] as const;
}

export function taxPaymentEvidenceQueryKey(obligationKey: string) {
  return ['fiscal', 'compliance', 'payment-evidence', obligationKey] as const;
}

export function mapToTaxPaymentEvidenceViewModel(
  raw: RawTaxPaymentEvidenceRecord | RawTaxPaymentEvidenceSummary,
): TaxPaymentEvidenceViewModel {
  return {
    id: raw.id,
    revision: raw.revision,
    paymentDateFormatted: formatDate(raw.paymentDate),
    amountFormatted: formatCurrency(raw.amountReported, 'BRL'),
    revenueCodeReported: raw.revenueCodeReported,
    referencePeriodFormatted:
      raw.referencePeriod.length === 7
        ? `${raw.referencePeriod.slice(5)}/${raw.referencePeriod.slice(0, 4)}`
        : raw.referencePeriod,
    externalReference: raw.externalReference,
    verificationStatusLabel: 'Declarado pelo usuário (sem verificação governamental)',
    isStale: 'isStale' in raw ? raw.isStale : false,
    note: raw.note,
    createdAtFormatted: formatDate(raw.createdAt.slice(0, 10)),
  };
}

export function mapToTaxPaymentSupportViewModel(
  raw: RawTaxPaymentSupport,
): TaxPaymentSupportViewModel {
  const supportStatusConfigs: Record<
    TaxPaymentSupportStatus,
    { label: string; color: string; variant: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
  > = {
    NOT_APPLICABLE: { label: 'Não aplicável', color: colors.textMuted, variant: 'neutral' },
    READY: { label: 'Pronto para pagamento', color: colors.positive, variant: 'success' },
    BLOCKED: { label: 'Bloqueado', color: colors.negative, variant: 'danger' },
    STALE: {
      label: 'Dados de origem alterados (Necessário revisar)',
      color: colors.warning,
      variant: 'warning',
    },
    REQUIRES_REVIEW: { label: 'Requer revisão', color: colors.warning, variant: 'warning' },
  };

  const reconciliationLabels: Record<
    TaxPaymentReconciliationStatus,
    { label: string; color: string }
  > = {
    NO_EVIDENCE: { label: 'Sem comprovante registrado', color: colors.textSecondary },
    USER_REPORTED_MATCH: {
      label: 'Comprovante confere com a apuração',
      color: colors.positive,
    },
    USER_REPORTED_MISMATCH: {
      label: 'Divergência entre comprovante e apuração',
      color: colors.warning,
    },
    STALE_SOURCE: {
      label: 'Comprovante desatualizado (cálculo recalculado)',
      color: colors.warning,
    },
    REQUIRES_REVIEW: { label: 'Requer revisão do usuário', color: colors.warning },
  };

  const statusConfig = supportStatusConfigs[raw.supportStatus] ?? supportStatusConfigs.READY;
  const reconConfig =
    reconciliationLabels[raw.reconciliationStatus] ?? reconciliationLabels.NO_EVIDENCE;
  const hasPositiveAmount =
    typeof raw.amount === 'string' &&
    raw.amount !== '0' &&
    raw.amount !== '0.00' &&
    !raw.amount.startsWith('-');

  return {
    obligationKey: raw.obligationKey,
    periodFormatted:
      raw.period.length === 7 ? `${raw.period.slice(5)}/${raw.period.slice(0, 4)}` : raw.period,
    kindLabel: 'DARF Mensal',
    revenueCode: raw.revenueCode ?? '6015',
    amountFormatted: formatCurrency(raw.amount, raw.currency ?? 'BRL'),
    rawAmount: raw.amount,
    dueDateFormatted: formatDate(raw.dueDate),
    rawDueDate: raw.dueDate,
    isOverdue: raw.isOverdue,
    supportStatus: raw.supportStatus,
    supportStatusLabel: statusConfig.label,
    supportStatusColor: statusConfig.color,
    supportStatusVariant: statusConfig.variant,
    reconciliationStatus: raw.reconciliationStatus,
    reconciliationLabel: reconConfig.label,
    reconciliationColor: reconConfig.color,
    isReady: raw.supportStatus === 'READY',
    isProvisionalPending: raw.supportStatus === 'NOT_APPLICABLE' && hasPositiveAmount,
    isStale: raw.supportStatus === 'STALE' || raw.reconciliationStatus === 'STALE_SOURCE',
    isMismatch: raw.reconciliationStatus === 'USER_REPORTED_MISMATCH',
    hasEvidence: raw.latestEvidence !== null,
    paymentInstructions: raw.paymentInstructions,
    sourceReferences: raw.sourceReferences,
    latestEvidence: raw.latestEvidence
      ? mapToTaxPaymentEvidenceViewModel(raw.latestEvidence)
      : null,
    disclaimer: raw.disclaimer,
  };
}
