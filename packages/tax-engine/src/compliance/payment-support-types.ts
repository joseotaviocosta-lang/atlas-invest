/**
 * @atlas/tax-engine — Phase 4K.2 DARF Payment Support & Settlement Evidence Foundation.
 *
 * Types for payment support projection and user-reported payment evidence records.
 * Pure, deterministic, zero-I/O domain types.
 */

export const TAX_PAYMENT_SUPPORT_STATUSES = [
  'NOT_APPLICABLE',
  'READY',
  'BLOCKED',
  'STALE',
  'REQUIRES_REVIEW',
] as const;
export type TaxPaymentSupportStatus = (typeof TAX_PAYMENT_SUPPORT_STATUSES)[number];

export const TAX_PAYMENT_VERIFICATION_STATUSES = ['USER_REPORTED'] as const;
export type TaxPaymentVerificationStatus = (typeof TAX_PAYMENT_VERIFICATION_STATUSES)[number];

export const TAX_PAYMENT_RECONCILIATION_STATUSES = [
  'NO_EVIDENCE',
  'USER_REPORTED_MATCH',
  'USER_REPORTED_MISMATCH',
  'STALE_SOURCE',
  'REQUIRES_REVIEW',
] as const;
export type TaxPaymentReconciliationStatus = (typeof TAX_PAYMENT_RECONCILIATION_STATUSES)[number];

export const TAX_PAYMENT_SUPPORT_DISCLAIMER =
  'Documento de apoio gerado pelo Atlas. Não é um DARF oficial emitido pela Receita Federal. O registro de pagamento pelo usuário destina-se apenas ao controle operacional interno e não constitui comprovação de quitação ou homologação perante a Receita Federal ou instituição bancária.';

export interface TaxPaymentEvidenceRecord {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly evidenceFingerprint?: string;
  readonly revision: number;
  /** Civil date "YYYY-MM-DD" */
  readonly paymentDate: string;
  /** Exact decimal string, never IEEE 754 float */
  readonly amountReported: string;
  readonly revenueCodeReported: string | null;
  /** "YYYY-MM" */
  readonly referencePeriod: string;
  readonly externalReference: string | null;
  readonly note: string | null;
  readonly verificationStatus: TaxPaymentVerificationStatus;
  readonly createdAt: string;
}

export interface TaxPaymentEvidenceSummary {
  readonly id: string;
  readonly revision: number;
  readonly sourceFingerprint?: string;
  readonly evidenceFingerprint?: string;
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

export interface TaxPaymentSupport {
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly period: string;
  readonly kind: string;
  readonly taxCategory: string;
  readonly revenueCode: string | null;
  /** Exact decimal string, never IEEE 754 float */
  readonly amount: string;
  readonly currency: string;
  /** Civil date "YYYY-MM-DD" */
  readonly dueDate: string;
  readonly supportStatus: TaxPaymentSupportStatus;
  readonly reconciliationStatus: TaxPaymentReconciliationStatus;
  readonly paymentInstructions: readonly string[];
  readonly sourceReferences: readonly { readonly label: string; readonly ref: string }[];
  readonly latestEvidence: TaxPaymentEvidenceSummary | null;
  readonly isOverdue: boolean;
  readonly disclaimer: string;
  readonly version: string;
}
