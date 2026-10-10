/**
 * @atlas/tax-engine — Phase 4K.1 Tax Compliance Foundation.
 *
 * Types for the Unified Tax Compliance Timeline and operational state.
 * Pure, deterministic, zero-I/O domain types.
 */

export const TAX_COMPLIANCE_OBLIGATION_KINDS = [
  'MONTHLY_TAX_PAYMENT',
  'ANNUAL_REVIEW',
  'ANNUAL_FILING_SUPPORT',
  'EVIDENCE_REQUIRED',
  'CONFIRMATION_REQUIRED',
  'PROFESSIONAL_REVIEW_REQUIRED',
] as const;
export type TaxComplianceObligationKind = (typeof TAX_COMPLIANCE_OBLIGATION_KINDS)[number];

export const TAX_COMPLIANCE_OBLIGATION_STATUSES = [
  'OPEN',
  'ACTION_REQUIRED',
  'AWAITING_CONFIRMATION',
  'AWAITING_EVIDENCE',
  'READY',
  'COMPLETED',
  'DISMISSED',
  'SUPERSEDED',
] as const;
export type TaxComplianceObligationStatus = (typeof TAX_COMPLIANCE_OBLIGATION_STATUSES)[number];

export const TAX_COMPLIANCE_OBLIGATION_SEVERITIES = [
  'INFO',
  'ACTION',
  'WARNING',
  'BLOCKING',
] as const;
export type TaxComplianceObligationSeverity = (typeof TAX_COMPLIANCE_OBLIGATION_SEVERITIES)[number];

export const TAX_COMPLIANCE_ACTION_TYPES = [
  'PAY',
  'REVIEW',
  'CONFIRM',
  'PROVIDE_EVIDENCE',
  'CONTACT_ACCOUNTANT',
  'NO_ACTION',
] as const;
export type TaxComplianceActionType = (typeof TAX_COMPLIANCE_ACTION_TYPES)[number];

export const TAX_COMPLIANCE_USER_ACTION_TYPES = [
  'USER_REPORTED_COMPLETION',
  'USER_DISMISSED',
  'USER_ACKNOWLEDGED',
  'USER_REOPENED',
] as const;
export type TaxComplianceUserActionType = (typeof TAX_COMPLIANCE_USER_ACTION_TYPES)[number];

export interface TaxComplianceObligationLink {
  readonly label: string;
  readonly href: string;
}

export interface TaxComplianceUserActionSummary {
  readonly id: string;
  readonly actionType: TaxComplianceUserActionType;
  readonly occurredAt: string;
  readonly note: string | null;
  readonly revision: number;
  readonly sourceFingerprint: string | null;
}

export interface TaxComplianceObligation {
  readonly obligationKey: string;
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  /** Period string: "YYYY-MM" (monthly) or "YYYY" (annual) */
  readonly period: string;
  readonly kind: TaxComplianceObligationKind;
  readonly sourceModule: '4G' | '4H' | '4I' | '4J';
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly status: TaxComplianceObligationStatus;
  readonly severity: TaxComplianceObligationSeverity;
  readonly actionType: TaxComplianceActionType;
  /** Exact decimal string or null; never "0" when null. */
  readonly amount: string | null;
  readonly currency: string | null;
  /** Civil date "YYYY-MM-DD" or null */
  readonly dueDate: string | null;
  readonly title: string;
  readonly description: string;
  readonly links: readonly TaxComplianceObligationLink[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly userAction: TaxComplianceUserActionSummary | null;
  readonly isOverdue: boolean;
}

export interface TaxComplianceUserActionRecord {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly actionType: TaxComplianceUserActionType;
  readonly sourceFingerprint: string | null;
  readonly note: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly revision: number;
  readonly occurredAt: string;
  readonly createdAt?: string;
}

export interface MonthlyComplianceSource {
  readonly competence: string; // "YYYY-MM"
  readonly obligationKey?: string;
  readonly revenueCode: string | null;
  readonly bucket: string | null;
  readonly principalAmount: string | null;
  readonly currency: string | null;
  readonly dueDate: string | null;
  readonly status: string;
  readonly reasonCode: string | null;
  readonly darfReadiness: string;
  readonly sourceFingerprint?: string;
}

export interface TaxComplianceTimelineSummary {
  readonly totalObligations: number;
  readonly actionRequiredCount: number;
  readonly overdueCount: number;
  readonly upcomingCount: number;
  readonly completedCount: number;
  readonly supersededCount: number;
}

export interface TaxComplianceTimeline {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly generatedAt: string;
  readonly summary: TaxComplianceTimelineSummary;
  readonly obligations: readonly TaxComplianceObligation[];
  readonly disclaimer: string;
}
