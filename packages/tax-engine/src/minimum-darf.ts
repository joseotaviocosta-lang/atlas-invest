import { Money } from '@atlas/domain';

/**
 * Phase 4E — Minimum DARF & same-revenue-code carry-forward (pure domain).
 *
 * Federal tax collected under a given revenue code that, in an apuração period,
 * results in an amount strictly below R$ 10,00 must NOT be paid/collected
 * through a DARF. It must be added to the tax of the SAME revenue code in the
 * subsequent period(s) until the total is equal to or greater than R$ 10,00,
 * at which point it is paid/collected by the deadline established in law for
 * that last period.
 *
 * Controlling authority (full text inspected 2026-09-29):
 *   - Lei nº 9.430/1996, art. 68, caput e § 1º.
 *   - IN SRF nº 82/1996, arts. 1º e 2º (DOU 31/12/1996).
 *   - Decreto nº 9.580/2018 (RIR/2018), art. 757, §§ 4º e 5º.
 *   - RFB — Manual de utilização do ReVar (Renda Variável).
 *
 * This module never mutates the tax liability. It only classifies payment
 * eligibility / aggregation. Exact decimals only — no IEEE-754 (ADR-278).
 */
export const MINIMUM_DARF_RULE_STATUSES = ['VERIFIED', 'SUPERSEDED', 'REVOKED'] as const;
export type MinimumDarfRuleStatus = (typeof MINIMUM_DARF_RULE_STATUSES)[number];

/**
 * Official comparison semantics, frozen from the controlling text:
 * an amount is BELOW the minimum when it is *strictly less than* the threshold
 * (`inferior a R$ 10,00`), and is PAYABLE when it is *equal to or greater*
 * (`igual ou superior a R$ 10,00`). Equality is therefore payable.
 */
export const MINIMUM_DARF_COMPARISON = 'STRICTLY_LESS_THAN_IS_BELOW' as const;
export type MinimumDarfComparison = typeof MINIMUM_DARF_COMPARISON;

/** Deferred amounts mature on the deadline of the *last* (target) competence. */
export const MINIMUM_DARF_DEFERRED_DUE_DATE_POLICY = 'TARGET_COMPETENCE_DEADLINE' as const;
export type MinimumDarfDeferredDueDatePolicy = typeof MINIMUM_DARF_DEFERRED_DUE_DATE_POLICY;

export interface MinimumDarfRuleSet {
  readonly ruleId: string;
  readonly version: string;
  /** Exact decimal minimum amount, e.g. `"10"`. Never a float. */
  readonly minimumAmount: string;
  readonly currency: string;
  /** Civil `YYYY-MM-DD` start of effect (inclusive). */
  readonly effectiveFrom: string;
  /** Civil `YYYY-MM-DD` end of effect (inclusive) or `null` when open. */
  readonly effectiveTo: string | null;
  readonly comparison: MinimumDarfComparison;
  readonly sameRevenueCodeRequired: boolean;
  readonly carryForwardAllowed: boolean;
  readonly deferredDueDatePolicy: MinimumDarfDeferredDueDatePolicy;
  /** Revenue codes this rule is verified to cover (fail-closed allow-list). */
  readonly revenueCodes: readonly string[];
  readonly sourceIds: readonly string[];
  readonly sourceDocument: string;
  readonly sourceReference: string;
  readonly verifiedAt: string;
  readonly status: MinimumDarfRuleStatus;
}

export const MINIMUM_DARF_RESOLUTION_OUTCOMES = [
  'RESOLVED',
  'MISSING_MINIMUM_RULE',
  'AMBIGUOUS_MINIMUM_RULE',
] as const;
export type MinimumDarfResolutionOutcome = (typeof MINIMUM_DARF_RESOLUTION_OUTCOMES)[number];

export interface MinimumDarfRuleResolution {
  readonly outcome: MinimumDarfResolutionOutcome;
  readonly rule: MinimumDarfRuleSet | null;
  readonly reasonCode: string | null;
}

const CIVIL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isEffectiveAt(rule: MinimumDarfRuleSet, revenueCode: string, asOf: string): boolean {
  if (rule.status !== 'VERIFIED') return false;
  if (!rule.revenueCodes.includes(revenueCode)) return false;
  if (rule.effectiveFrom > asOf) return false;
  if (rule.effectiveTo !== null && rule.effectiveTo < asOf) return false;
  return true;
}

/**
 * Deterministically resolves the effective VERIFIED minimum-DARF rule for a
 * revenue code at a civil date. Fails closed: zero matches →
 * `MISSING_MINIMUM_RULE`; more than one match → `AMBIGUOUS_MINIMUM_RULE`
 * (invalid configuration). No rule is ever guessed (ADR-278).
 */
export function resolveMinimumDarfRule(input: {
  readonly rules: readonly MinimumDarfRuleSet[];
  readonly revenueCode: string;
  readonly asOf: string;
}): MinimumDarfRuleResolution {
  if (!CIVIL_DATE_REGEX.test(input.asOf)) {
    return {
      outcome: 'MISSING_MINIMUM_RULE',
      rule: null,
      reasonCode: 'INVALID_AS_OF_DATE',
    };
  }
  const matches = input.rules.filter((rule) => isEffectiveAt(rule, input.revenueCode, input.asOf));
  if (matches.length === 0) {
    return { outcome: 'MISSING_MINIMUM_RULE', rule: null, reasonCode: 'MISSING_MINIMUM_RULE' };
  }
  if (matches.length > 1) {
    return {
      outcome: 'AMBIGUOUS_MINIMUM_RULE',
      rule: null,
      reasonCode: 'AMBIGUOUS_MINIMUM_RULE',
    };
  }
  return { outcome: 'RESOLVED', rule: matches[0]!, reasonCode: null };
}

/**
 * True when the amount is strictly below the verified minimum. Exact decimal
 * comparison via `Money`/Decimal; equality is NOT below (it is payable).
 */
export function isBelowMinimumDarf(amount: string, rule: MinimumDarfRuleSet): boolean {
  const value = Money.from(amount, rule.currency);
  const minimum = Money.from(rule.minimumAmount, rule.currency);
  return value.compare(minimum) === -1;
}

// ---------------------------------------------------------------------------
// Payment eligibility
// ---------------------------------------------------------------------------

export const DARF_PAYMENT_ELIGIBILITY_STATUSES = [
  'PAYABLE',
  'BELOW_MINIMUM',
  'CARRIED_FORWARD',
  'BLOCKED',
  'NOT_REQUIRED',
] as const;
export type DarfPaymentEligibilityStatus = (typeof DARF_PAYMENT_ELIGIBILITY_STATUSES)[number];

export const DARF_PAYMENT_ELIGIBILITY_REASON_CODES = [
  'NO_TAX_DUE',
  'MISSING_MINIMUM_RULE',
  'AMBIGUOUS_MINIMUM_RULE',
  'INVALID_AS_OF_DATE',
  'CROSS_REVENUE_CODE_NOT_ALLOWED',
  'CURRENCY_MISMATCH',
  'CURRENT_OBLIGATION_BLOCKED',
  'MISSING_CURRENCY',
  'BELOW_MINIMUM_NO_CARRY',
] as const;
export type DarfPaymentEligibilityReasonCode =
  (typeof DARF_PAYMENT_ELIGIBILITY_REASON_CODES)[number];

export interface DarfEligibilitySourceBreakdown {
  readonly kind: 'CURRENT' | 'CARRY_FORWARD';
  readonly sourceObligationId: string | null;
  readonly sourceCompetence: string;
  readonly amount: string;
  readonly entryId: string | null;
}

export interface DarfPaymentEligibility {
  readonly status: DarfPaymentEligibilityStatus;
  readonly reasonCode: DarfPaymentEligibilityReasonCode | null;
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currency: string | null;
  readonly currentAmount: string | null;
  readonly carryForwardAmount: string | null;
  readonly totalPayable: string | null;
  readonly minimumThreshold: string | null;
  readonly dueDate: string | null;
  readonly currentObligationId: string | null;
  readonly carryForwardEntryIds: readonly string[];
  readonly sourceBreakdown: readonly DarfEligibilitySourceBreakdown[];
  readonly ruleId: string | null;
  readonly ruleVersion: string | null;
  readonly fingerprint: string;
}

export interface CarryForwardCandidate {
  readonly id: string;
  readonly sourceObligationId: string;
  readonly sourceCompetence: string;
  readonly revenueCode: string;
  readonly currency: string;
  /** Exact decimal string. */
  readonly amount: string;
}

export interface BuildDarfPaymentEligibilityInput {
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currency: string | null;
  readonly currentAmount: string | null;
  readonly currentObligationId: string | null;
  readonly currentBlocked: boolean;
  readonly carryForward: readonly CarryForwardCandidate[];
  readonly ruleResolution: MinimumDarfRuleResolution;
  readonly dueDate: string | null;
}

/** Deterministic canonical fingerprint (pure — no crypto, no I/O). */
export function computeDarfEligibilityFingerprint(input: BuildDarfPaymentEligibilityInput): string {
  const carry = [...input.carryForward]
    .map((entry) => `${entry.id}:${entry.sourceCompetence}:${entry.amount}:${entry.currency}`)
    .sort()
    .join(',');
  return [
    input.revenueCode,
    input.targetCompetence,
    input.currentObligationId ?? '',
    input.currentAmount ?? '',
    input.currency ?? '',
    input.ruleResolution.rule
      ? `${input.ruleResolution.rule.ruleId}@${input.ruleResolution.rule.version}`
      : (input.ruleResolution.reasonCode ?? ''),
    input.dueDate ?? '',
    carry,
  ].join('|');
}

function blockedEligibility(
  input: BuildDarfPaymentEligibilityInput,
  reasonCode: DarfPaymentEligibilityReasonCode,
): DarfPaymentEligibility {
  return {
    status: 'BLOCKED',
    reasonCode,
    revenueCode: input.revenueCode,
    targetCompetence: input.targetCompetence,
    currency: input.currency,
    currentAmount: input.currentAmount,
    carryForwardAmount: null,
    totalPayable: null,
    minimumThreshold: input.ruleResolution.rule?.minimumAmount ?? null,
    dueDate: input.dueDate,
    currentObligationId: input.currentObligationId,
    carryForwardEntryIds: input.carryForward.map((entry) => entry.id),
    sourceBreakdown: [],
    ruleId: input.ruleResolution.rule?.ruleId ?? null,
    ruleVersion: input.ruleResolution.rule?.version ?? null,
    fingerprint: computeDarfEligibilityFingerprint(input),
  };
}

/**
 * Pure, deterministic payment-eligibility classification. Never mutates the tax
 * liability; only states whether (and how) the amount may be collected.
 */
export function buildDarfPaymentEligibility(
  input: BuildDarfPaymentEligibilityInput,
): DarfPaymentEligibility {
  const fingerprint = computeDarfEligibilityFingerprint(input);

  if (input.currentBlocked) {
    return blockedEligibility(input, 'CURRENT_OBLIGATION_BLOCKED');
  }
  if (input.ruleResolution.outcome !== 'RESOLVED' || !input.ruleResolution.rule) {
    const reason: DarfPaymentEligibilityReasonCode =
      input.ruleResolution.outcome === 'AMBIGUOUS_MINIMUM_RULE'
        ? 'AMBIGUOUS_MINIMUM_RULE'
        : input.ruleResolution.reasonCode === 'INVALID_AS_OF_DATE'
          ? 'INVALID_AS_OF_DATE'
          : 'MISSING_MINIMUM_RULE';
    return blockedEligibility(input, reason);
  }

  const rule = input.ruleResolution.rule;
  const currency = input.currency;

  const carryForward = input.carryForward;
  const crossCode = carryForward.some((entry) => entry.revenueCode !== input.revenueCode);
  if (rule.sameRevenueCodeRequired && crossCode) {
    return blockedEligibility(input, 'CROSS_REVENUE_CODE_NOT_ALLOWED');
  }

  if (currency === null) {
    return blockedEligibility(input, 'MISSING_CURRENCY');
  }
  const mixedCurrency = carryForward.some((entry) => entry.currency !== currency);
  if (mixedCurrency) {
    return blockedEligibility(input, 'CURRENCY_MISMATCH');
  }

  const currentAmount = input.currentAmount;
  const hasCurrent = currentAmount !== null && Money.from(currentAmount, currency).isPositive();
  if (!hasCurrent && carryForward.length === 0) {
    return {
      status: 'NOT_REQUIRED',
      reasonCode: 'NO_TAX_DUE',
      revenueCode: input.revenueCode,
      targetCompetence: input.targetCompetence,
      currency,
      currentAmount: null,
      carryForwardAmount: null,
      totalPayable: null,
      minimumThreshold: rule.minimumAmount,
      dueDate: null,
      currentObligationId: null,
      carryForwardEntryIds: [],
      sourceBreakdown: [],
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      fingerprint,
    };
  }

  let total = Money.zero(currency);
  const breakdown: DarfEligibilitySourceBreakdown[] = [];
  if (hasCurrent && currentAmount !== null) {
    total = total.add(Money.from(currentAmount, currency));
    breakdown.push({
      kind: 'CURRENT',
      sourceObligationId: input.currentObligationId,
      sourceCompetence: input.targetCompetence,
      amount: currentAmount,
      entryId: null,
    });
  }
  for (const entry of [...carryForward].sort((a, b) =>
    a.sourceCompetence < b.sourceCompetence
      ? -1
      : a.sourceCompetence > b.sourceCompetence
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
  )) {
    total = total.add(Money.from(entry.amount, currency));
    breakdown.push({
      kind: 'CARRY_FORWARD',
      sourceObligationId: entry.sourceObligationId,
      sourceCompetence: entry.sourceCompetence,
      amount: entry.amount,
      entryId: entry.id,
    });
  }

  const carryForwardAmount = carryForward.length
    ? carryForward.reduce(
        (acc, entry) => acc.add(Money.from(entry.amount, currency)),
        Money.zero(currency),
      ).amount
    : null;

  const below = total.compare(Money.from(rule.minimumAmount, currency)) === -1;
  const carryForwardEntryIds = breakdown
    .filter((item) => item.entryId !== null)
    .map((item) => item.entryId as string);

  return {
    status: below ? (rule.carryForwardAllowed ? 'CARRIED_FORWARD' : 'BELOW_MINIMUM') : 'PAYABLE',
    reasonCode: below && !rule.carryForwardAllowed ? 'BELOW_MINIMUM_NO_CARRY' : null,
    revenueCode: input.revenueCode,
    targetCompetence: input.targetCompetence,
    currency,
    currentAmount: hasCurrent ? currentAmount : null,
    carryForwardAmount,
    totalPayable: total.amount,
    minimumThreshold: rule.minimumAmount,
    dueDate: input.dueDate,
    currentObligationId: input.currentObligationId,
    carryForwardEntryIds,
    sourceBreakdown: breakdown,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    fingerprint,
  };
}
