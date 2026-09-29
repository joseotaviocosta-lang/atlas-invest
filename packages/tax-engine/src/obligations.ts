import { Money } from '@atlas/domain';
import type { MonthlyTaxLiability, TaxCategoryMonthlyResult } from './liability-types';
import type { FederalTaxDeadlineEntry } from './deadlines';
import { isCanonicalCivilDate, resolveFederalTaxDeadline } from './deadlines';
import {
  resolveObligationBucketForCategory,
  resolveRevenueCodeForBucket,
  type TaxObligationBucket,
} from './revenue-codes';

/**
 * Phase 4C.2 — Tax Obligation operational state.
 *
 * A TaxObligation is DERIVED from a canonical MonthlyTaxLiability (tax
 * calculation truth) plus a VERIFIED official deadline entry (due-date
 * authority). It never recalculates tax (ADR-264). Only a COMPLETE, positive
 * liability with a verified revenue code and deadline can become payable;
 * everything else fails closed.
 */
export const TAX_OBLIGATION_STATUSES = [
  'BLOCKED',
  'PROVISIONAL',
  'OPEN',
  'DUE',
  'OVERDUE',
  'PAID',
  'SUPERSEDED',
  'RECONCILIATION_REQUIRED',
  'NO_PAYMENT_DUE',
] as const;
export type TaxObligationStatus = (typeof TAX_OBLIGATION_STATUSES)[number];

/** Persisted base status (temporal OPEN/DUE/OVERDUE is derived at read time). */
export const TAX_OBLIGATION_BASE_STATUSES = [
  'BLOCKED',
  'PROVISIONAL',
  'OPEN',
  'PAID',
  'SUPERSEDED',
  'RECONCILIATION_REQUIRED',
  'NO_PAYMENT_DUE',
] as const;
export type TaxObligationBaseStatus = (typeof TAX_OBLIGATION_BASE_STATUSES)[number];

export const TAX_OBLIGATION_REASON_CODES = [
  'MISSING_OFFICIAL_DEADLINE',
  'AMBIGUOUS_OFFICIAL_DEADLINE',
  'UNSUPPORTED_BUCKET',
  'MISSING_REVENUE_CODE',
  'LIABILITY_PARTIAL',
  'LIABILITY_BLOCKED',
  'UNSUPPORTED_ACTIVITY_PRESENT',
  'IN_PROGRESS_COMPETENCE',
  'NO_TAX_DUE',
] as const;
export type TaxObligationReasonCode = (typeof TAX_OBLIGATION_REASON_CODES)[number];

export const DARF_READINESS_STATUSES = ['READY', 'PARTIAL', 'BLOCKED', 'NOT_REQUIRED'] as const;
export type DarfReadinessStatus = (typeof DARF_READINESS_STATUSES)[number];

export const TAX_PAYMENT_EVIDENCE_SOURCES = ['MANUAL_CONFIRMED'] as const;
export type TaxPaymentEvidenceSource = (typeof TAX_PAYMENT_EVIDENCE_SOURCES)[number];
export const TAX_PAYMENT_EVIDENCE_STATUSES = ['CONFIRMED'] as const;
export type TaxPaymentEvidenceStatus = (typeof TAX_PAYMENT_EVIDENCE_STATUSES)[number];

export interface TaxObligationPlan {
  readonly bucket: TaxObligationBucket | null;
  readonly revenueCode: string | null;
  readonly status: TaxObligationBaseStatus;
  readonly reasonCode: TaxObligationReasonCode | null;
  /** Exact decimal string; `null` when no payable principal exists (never "0"). */
  readonly principalAmount: string | null;
  readonly currency: string | null;
  readonly dueDate: string | null;
  readonly deadlineEntryId: string | null;
  readonly darfReadiness: DarfReadinessStatus;
  readonly darfReadinessReason: string | null;
  readonly dataQuality: 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'EMPTY';
}

export interface MaterializeTaxObligationInput {
  readonly competence: string;
  readonly liability: MonthlyTaxLiability;
  readonly deadlineEntries: readonly FederalTaxDeadlineEntry[];
  /** Injected civil clock (`YYYY-MM-DD`) — never `new Date()` inside the domain. */
  readonly now: string;
  /** True when the competence is still open (current/future). */
  readonly inProgress: boolean;
}

function categoryHasActivity(result: TaxCategoryMonthlyResult): boolean {
  return (
    result.taxDue !== null ||
    result.grossSales.isPositive() ||
    result.realizedResult.isPositive() ||
    result.realizedResult.isNegative()
  );
}

/**
 * Derives the operational obligation plan from a canonical liability. Pure and
 * deterministic; no tax arithmetic is performed here.
 */
export function materializeTaxObligation(input: MaterializeTaxObligationInput): TaxObligationPlan {
  const { liability } = input;
  const dataQuality = liability.dataQuality.status;

  const blockedPlan = (
    reasonCode: TaxObligationReasonCode,
    dataQualityOverride?: TaxObligationPlan['dataQuality'],
  ): TaxObligationPlan => ({
    bucket: null,
    revenueCode: null,
    status: 'BLOCKED',
    reasonCode,
    principalAmount: null,
    currency: null,
    dueDate: null,
    deadlineEntryId: null,
    darfReadiness: 'BLOCKED',
    darfReadinessReason: reasonCode,
    dataQuality: dataQualityOverride ?? (dataQuality === 'EMPTY' ? 'BLOCKED' : dataQuality),
  });

  if (liability.status === 'NO_ACTIVITY') {
    return {
      bucket: null,
      revenueCode: null,
      status: 'NO_PAYMENT_DUE',
      reasonCode: 'NO_TAX_DUE',
      principalAmount: null,
      currency: null,
      dueDate: null,
      deadlineEntryId: null,
      darfReadiness: 'NOT_REQUIRED',
      darfReadinessReason: 'NO_TAX_DUE',
      dataQuality: 'EMPTY',
    };
  }

  if (liability.status === 'BLOCKED') {
    return blockedPlan('LIABILITY_BLOCKED', 'BLOCKED');
  }
  if (liability.status === 'PARTIAL') {
    return blockedPlan('LIABILITY_PARTIAL', 'PARTIAL');
  }

  // COMPLETE
  const hasUnsupportedActivity = liability.categories.some(
    (result) =>
      resolveObligationBucketForCategory(result.category) === null && categoryHasActivity(result),
  );
  if (hasUnsupportedActivity) {
    return blockedPlan('UNSUPPORTED_ACTIVITY_PRESENT');
  }

  const taxDue = liability.taxDue;
  if (taxDue === null) {
    // COMPLETE without a numeric taxDue is inconsistent — fail closed.
    return blockedPlan('LIABILITY_PARTIAL', 'PARTIAL');
  }

  if (!taxDue.isPositive()) {
    return {
      bucket: null,
      revenueCode: null,
      status: 'NO_PAYMENT_DUE',
      reasonCode: 'NO_TAX_DUE',
      principalAmount: null,
      currency: null,
      dueDate: null,
      deadlineEntryId: null,
      darfReadiness: 'NOT_REQUIRED',
      darfReadinessReason: 'NO_TAX_DUE',
      dataQuality,
    };
  }

  // Resolve the production bucket among categories carrying the positive due.
  const buckets = new Set<TaxObligationBucket>();
  for (const result of liability.categories) {
    if (result.taxDue !== null && result.taxDue.isPositive()) {
      const bucket = resolveObligationBucketForCategory(result.category);
      if (bucket) buckets.add(bucket);
    }
  }
  if (buckets.size !== 1) {
    return blockedPlan(buckets.size === 0 ? 'UNSUPPORTED_BUCKET' : 'MISSING_REVENUE_CODE');
  }
  const bucket = [...buckets][0]!;
  const revenueCode = resolveRevenueCodeForBucket(bucket);
  if (!revenueCode) {
    return blockedPlan('MISSING_REVENUE_CODE');
  }

  if (input.inProgress) {
    return {
      bucket,
      revenueCode,
      status: 'PROVISIONAL',
      reasonCode: 'IN_PROGRESS_COMPETENCE',
      principalAmount: taxDue.amount,
      currency: taxDue.currency,
      dueDate: null,
      deadlineEntryId: null,
      darfReadiness: 'PARTIAL',
      darfReadinessReason: 'IN_PROGRESS_COMPETENCE',
      dataQuality,
    };
  }

  const resolution = resolveFederalTaxDeadline({
    entries: input.deadlineEntries,
    revenueCode,
    competence: input.competence,
  });
  if (resolution.outcome !== 'RESOLVED' || !resolution.entry) {
    return blockedPlan(
      resolution.outcome === 'AMBIGUOUS_OFFICIAL_DEADLINE'
        ? 'AMBIGUOUS_OFFICIAL_DEADLINE'
        : 'MISSING_OFFICIAL_DEADLINE',
    );
  }

  const dueDate = resolution.entry.dueDate;
  return {
    bucket,
    revenueCode,
    // Payable obligations persist as OPEN; the temporal OPEN/DUE/OVERDUE
    // distinction is derived at read time from the injected clock.
    status: 'OPEN',
    reasonCode: null,
    principalAmount: taxDue.amount,
    currency: taxDue.currency,
    dueDate,
    deadlineEntryId: resolution.entry.id,
    darfReadiness: 'READY',
    darfReadinessReason: null,
    dataQuality,
  };
}

/**
 * Derives the temporal display status from a persisted base status, the official
 * due date and an injected civil clock. `OVERDUE` is a status only — no penalty,
 * interest or updated amount is ever computed (ADR-269).
 */
export function deriveObligationDisplayStatus(input: {
  readonly status: TaxObligationBaseStatus;
  readonly dueDate: string | null;
  readonly now: string;
}): TaxObligationStatus {
  if (input.status !== 'OPEN' || !input.dueDate) return input.status;
  if (input.now < input.dueDate) return 'OPEN';
  if (input.now === input.dueDate) return 'DUE';
  return 'OVERDUE';
}

export type PaymentValidationResult =
  { readonly valid: true } | { readonly valid: false; readonly code: string };

const DECIMAL_REGEX = /^\d{1,18}(\.\d{1,18})?$/;

/**
 * Validates manual payment evidence against an obligation. Exact decimals only;
 * partial/overpayment is rejected (no partial-payment tax semantics in 4C.2).
 * Payment state is operational and never mutates the tax liability (ADR-266).
 */
export function validateTaxPaymentEvidence(
  input: {
    readonly paidAt: string;
    readonly amount: string;
    readonly currency: string;
    readonly sourceType: string;
    readonly sourceReference?: string;
    readonly confirmedAt: string;
  },
  obligation: {
    readonly principalAmount: string | null;
    readonly currency: string | null;
    readonly dueDate: string | null;
  },
  now: string,
): PaymentValidationResult {
  if (!TAX_PAYMENT_EVIDENCE_SOURCES.includes(input.sourceType as TaxPaymentEvidenceSource)) {
    return { valid: false, code: 'PAYMENT.UNSUPPORTED_SOURCE' };
  }
  if (!isCanonicalCivilDate(input.paidAt)) {
    return { valid: false, code: 'PAYMENT.INVALID_DATE' };
  }
  if (input.paidAt > now) {
    return { valid: false, code: 'PAYMENT.FUTURE_DATE' };
  }
  if (!DECIMAL_REGEX.test(input.amount)) {
    return { valid: false, code: 'PAYMENT.INVALID_AMOUNT' };
  }
  if (!obligation.principalAmount || !obligation.currency) {
    return { valid: false, code: 'PAYMENT.OBLIGATION_NOT_PAYABLE' };
  }
  if (input.currency !== obligation.currency) {
    return { valid: false, code: 'PAYMENT.CURRENCY_MISMATCH' };
  }
  const amount = Money.from(input.amount, input.currency);
  if (!amount.isPositive()) {
    return { valid: false, code: 'PAYMENT.INVALID_AMOUNT' };
  }
  const principal = Money.from(obligation.principalAmount, obligation.currency);
  if (amount.compare(principal) !== 0) {
    return { valid: false, code: 'PAYMENT.AMOUNT_MISMATCH' };
  }
  return { valid: true };
}
