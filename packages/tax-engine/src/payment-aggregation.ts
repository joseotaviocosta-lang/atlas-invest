import { Money } from '@atlas/domain';
import type { DarfPaymentEligibility, DarfPaymentEligibilityStatus } from './minimum-darf';

/**
 * Phase 4E — TaxPaymentAggregation (pure domain).
 *
 * The payment unit that combines the current competence liability with any
 * open carry-forward entries of the SAME revenue code. When the accumulated
 * total reaches the verified minimum, the aggregation is payable at the due
 * date of the last (target) competence; the carry-forward entries are consumed
 * exactly once (ADR-279, ADR-280).
 */
export interface TaxPaymentAggregation {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currency: string;
  /** Known current-competence amount (`"0"` when no positive tax is due). */
  readonly currentAmount: string;
  readonly carryForwardAmount: string;
  readonly totalPayable: string;
  readonly minimumThreshold: string;
  readonly sourceEntryIds: readonly string[];
  readonly currentObligationId: string | null;
  readonly dueDate: string | null;
  readonly status: DarfPaymentEligibilityStatus;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly fingerprint: string;
}

export interface AggregationFingerprintInput {
  readonly taxSubjectId: string;
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currency: string;
  readonly currentObligationId: string | null;
  readonly currentAmount: string;
  readonly sourceEntryIds: readonly string[];
  readonly dueDate: string | null;
  readonly ruleId: string;
  readonly ruleVersion: string;
}

/**
 * Deterministic aggregation fingerprint over the revenue code, target
 * competence, current obligation, carry-forward entries, rule version and
 * deadline authority (ADR-279).
 */
export function computeAggregationFingerprint(input: AggregationFingerprintInput): string {
  return [
    input.taxSubjectId,
    input.revenueCode,
    input.targetCompetence,
    input.currency,
    input.currentObligationId ?? '',
    input.currentAmount,
    [...input.sourceEntryIds].sort().join(','),
    input.dueDate ?? '',
    input.ruleId,
    input.ruleVersion,
  ].join('|');
}

/**
 * Builds the aggregation from an eligibility result. Returns `null` (fail
 * closed) unless the amount is actually collectible/deferrable: `PAYABLE` or
 * `CARRIED_FORWARD`. `BLOCKED`/`NOT_REQUIRED`/`BELOW_MINIMUM` never produce a
 * payment aggregation.
 */
export function buildTaxPaymentAggregation(input: {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly eligibility: DarfPaymentEligibility;
}): TaxPaymentAggregation | null {
  const e = input.eligibility;
  if (e.status !== 'PAYABLE' && e.status !== 'CARRIED_FORWARD') return null;
  if (e.currency === null || e.totalPayable === null || e.minimumThreshold === null) return null;
  if (e.ruleId === null || e.ruleVersion === null) return null;

  const zero = Money.zero(e.currency).amount;
  const currentAmount = e.currentAmount ?? zero;
  const carryForwardAmount = e.carryForwardAmount ?? zero;

  return Object.freeze({
    id: input.id,
    taxSubjectId: input.taxSubjectId,
    revenueCode: e.revenueCode,
    targetCompetence: e.targetCompetence,
    currency: e.currency,
    currentAmount,
    carryForwardAmount,
    totalPayable: e.totalPayable,
    minimumThreshold: e.minimumThreshold,
    sourceEntryIds: e.carryForwardEntryIds,
    currentObligationId: e.currentObligationId,
    dueDate: e.dueDate,
    status: e.status,
    ruleId: e.ruleId,
    ruleVersion: e.ruleVersion,
    fingerprint: computeAggregationFingerprint({
      taxSubjectId: input.taxSubjectId,
      revenueCode: e.revenueCode,
      targetCompetence: e.targetCompetence,
      currency: e.currency,
      currentObligationId: e.currentObligationId,
      currentAmount,
      sourceEntryIds: e.carryForwardEntryIds,
      dueDate: e.dueDate,
      ruleId: e.ruleId,
      ruleVersion: e.ruleVersion,
    }),
  });
}
