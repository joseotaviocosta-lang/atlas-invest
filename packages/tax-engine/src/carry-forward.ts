import { Money } from '@atlas/domain';
import type { MinimumDarfRuleSet } from './minimum-darf';
import { isBelowMinimumDarf } from './minimum-darf';

/**
 * Phase 4E — TaxCarryForwardEntry (pure domain).
 *
 * A sub-minimum federal tax amount that the controlling rule requires to be
 * added to the same revenue code of the subsequent apuração period(s). It is an
 * immutable historical fact: it is never rewritten, only explicitly consumed
 * (exactly once) or superseded by a corrected source obligation (ADR-281).
 */
export const TAX_CARRY_FORWARD_STATUSES = ['OPEN', 'CONSUMED', 'SUPERSEDED', 'BLOCKED'] as const;
export type TaxCarryForwardStatus = (typeof TAX_CARRY_FORWARD_STATUSES)[number];

export interface TaxCarryForwardEntry {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly sourceObligationId: string;
  readonly sourceCompetence: string;
  readonly revenueCode: string;
  readonly currency: string;
  /** Exact decimal string — the deferred amount. Never a float. */
  readonly amount: string;
  readonly status: TaxCarryForwardStatus;
  /** The period the deferred amount is carried to (or `null` when unknown). */
  readonly targetCompetence: string | null;
  readonly consumedByAggregationId: string | null;
  readonly consumedAt: string | null;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly fingerprint: string;
  readonly createdAt: string;
}

/**
 * Deterministic canonical fingerprint of a carry-forward identity. The identity
 * is `(taxSubjectId, sourceObligationId, ruleId, ruleVersion)`, so
 * re-materialization is idempotent (ADR-281).
 */
export function computeCarryForwardFingerprint(input: {
  readonly taxSubjectId: string;
  readonly sourceObligationId: string;
  readonly sourceCompetence: string;
  readonly revenueCode: string;
  readonly currency: string;
  readonly amount: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
}): string {
  return [
    input.taxSubjectId,
    input.sourceObligationId,
    input.sourceCompetence,
    input.revenueCode,
    input.currency,
    input.amount,
    input.ruleId,
    input.ruleVersion,
  ].join('|');
}

/**
 * Builds a carry-forward entry for a below-minimum obligation. Returns `null`
 * (fail closed) when the rule does not allow carry-forward, does not cover the
 * revenue code, or the amount is not strictly below the minimum. Never coerces
 * a sub-minimum amount to zero and never invents a payable amount.
 */
export function buildCarryForwardEntry(input: {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly sourceObligationId: string;
  readonly sourceCompetence: string;
  readonly revenueCode: string;
  readonly currency: string;
  readonly amount: string;
  readonly targetCompetence: string | null;
  readonly rule: MinimumDarfRuleSet;
  readonly createdAt: string;
}): TaxCarryForwardEntry | null {
  const { rule } = input;
  if (!rule.carryForwardAllowed) return null;
  if (!rule.revenueCodes.includes(input.revenueCode)) return null;
  if (input.currency !== rule.currency) return null;
  if (!isBelowMinimumDarf(input.amount, rule)) return null;

  return Object.freeze({
    id: input.id,
    taxSubjectId: input.taxSubjectId,
    sourceObligationId: input.sourceObligationId,
    sourceCompetence: input.sourceCompetence,
    revenueCode: input.revenueCode,
    currency: input.currency,
    amount: Money.from(input.amount, input.currency).amount,
    status: 'OPEN',
    targetCompetence: input.targetCompetence,
    consumedByAggregationId: null,
    consumedAt: null,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    fingerprint: computeCarryForwardFingerprint({
      taxSubjectId: input.taxSubjectId,
      sourceObligationId: input.sourceObligationId,
      sourceCompetence: input.sourceCompetence,
      revenueCode: input.revenueCode,
      currency: input.currency,
      amount: input.amount,
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
    }),
    createdAt: input.createdAt,
  });
}

/**
 * Only `OPEN` entries may take part in an aggregation/payment. `CONSUMED`
 * entries are inert (exactly-once); `SUPERSEDED`/`BLOCKED` fail closed and are
 * excluded from any payable total.
 */
export function isConsumableCarryForwardEntry(entry: {
  readonly status: TaxCarryForwardStatus;
}): boolean {
  return entry.status === 'OPEN';
}
