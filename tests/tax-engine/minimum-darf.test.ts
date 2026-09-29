import { describe, expect, it } from 'vitest';
import {
  buildCarryForwardEntry,
  buildDarfPaymentEligibility,
  buildTaxPaymentAggregation,
  computeAggregationFingerprint,
  isBelowMinimumDarf,
  nextFiscalCompetence,
  resolveMinimumDarfRule,
  type CarryForwardCandidate,
  type MinimumDarfRuleSet,
  type MinimumDarfRuleResolution,
} from '@atlas/tax-engine';
import { BR_FEDERAL_MINIMUM_DARF_RULE } from '../../apps/api/src/application/fiscal/minimum-darf-registry';

const RULE = BR_FEDERAL_MINIMUM_DARF_RULE;

function resolved(rule: MinimumDarfRuleSet = RULE): MinimumDarfRuleResolution {
  return { outcome: 'RESOLVED', rule, reasonCode: null };
}

function carry(
  id: string,
  competence: string,
  amount: string,
  revenueCode = '6015',
  currency = 'BRL',
): CarryForwardCandidate {
  return {
    id,
    sourceObligationId: `obl-${id}`,
    sourceCompetence: competence,
    revenueCode,
    currency,
    amount,
  };
}

describe('Phase 4E — minimum DARF rule resolution (fail closed)', () => {
  it('resolves the verified production rule for 6015', () => {
    const r = resolveMinimumDarfRule({
      rules: [RULE],
      revenueCode: '6015',
      asOf: '2026-09-30',
    });
    expect(r.outcome).toBe('RESOLVED');
    expect(r.rule?.minimumAmount).toBe('10');
    expect(r.rule?.currency).toBe('BRL');
    expect(r.rule?.sameRevenueCodeRequired).toBe(true);
    expect(r.rule?.carryForwardAllowed).toBe(true);
  });

  it('fails closed without an effective rule (unknown revenue code / date)', () => {
    expect(
      resolveMinimumDarfRule({ rules: [RULE], revenueCode: '9999', asOf: '2026-09-30' }).outcome,
    ).toBe('MISSING_MINIMUM_RULE');
    expect(
      resolveMinimumDarfRule({ rules: [RULE], revenueCode: '6015', asOf: '1996-12-31' }).outcome,
    ).toBe('MISSING_MINIMUM_RULE');
    expect(
      resolveMinimumDarfRule({ rules: [RULE], revenueCode: '6015', asOf: 'not-a-date' }).reasonCode,
    ).toBe('INVALID_AS_OF_DATE');
  });

  it('rejects ambiguous duplicate VERIFIED rules', () => {
    expect(
      resolveMinimumDarfRule({
        rules: [RULE, { ...RULE, ruleId: 'OTHER' }],
        revenueCode: '6015',
        asOf: '2026-09-30',
      }).outcome,
    ).toBe('AMBIGUOUS_MINIMUM_RULE');
  });
});

describe('Phase 4E — threshold semantics (exact decimals)', () => {
  it('strictly-less-than is below; equality is payable', () => {
    expect(isBelowMinimumDarf('9.99', RULE)).toBe(true);
    expect(isBelowMinimumDarf('9.999999999999999999', RULE)).toBe(true);
    expect(isBelowMinimumDarf('10', RULE)).toBe(false);
    expect(isBelowMinimumDarf('10.00', RULE)).toBe(false);
    expect(isBelowMinimumDarf('10.000000000000000001', RULE)).toBe(false);
    expect(isBelowMinimumDarf('0.01', RULE)).toBe(true);
  });

  it('below / equal / above on eligibility', () => {
    const below = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-08',
      currency: 'BRL',
      currentAmount: '9.99',
      currentObligationId: 'o1',
      currentBlocked: false,
      carryForward: [],
      ruleResolution: resolved(),
      dueDate: '2026-09-30',
    });
    expect(below.status).toBe('CARRIED_FORWARD');

    const equal = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-08',
      currency: 'BRL',
      currentAmount: '10',
      currentObligationId: 'o1',
      currentBlocked: false,
      carryForward: [],
      ruleResolution: resolved(),
      dueDate: '2026-09-30',
    });
    expect(equal.status).toBe('PAYABLE');
    expect(equal.totalPayable).toBe('10');

    const above = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-08',
      currency: 'BRL',
      currentAmount: '199.9',
      currentObligationId: 'o1',
      currentBlocked: false,
      carryForward: [],
      ruleResolution: resolved(),
      dueDate: '2026-09-30',
    });
    expect(above.status).toBe('PAYABLE');
    expect(above.totalPayable).toBe('199.9');
  });

  it('no rule → BLOCKED (never a fabricated payable amount)', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-08',
      currency: 'BRL',
      currentAmount: '199.9',
      currentObligationId: 'o1',
      currentBlocked: false,
      carryForward: [],
      ruleResolution: {
        outcome: 'MISSING_MINIMUM_RULE',
        rule: null,
        reasonCode: 'MISSING_MINIMUM_RULE',
      },
      dueDate: '2026-09-30',
    });
    expect(e.status).toBe('BLOCKED');
    expect(e.reasonCode).toBe('MISSING_MINIMUM_RULE');
    expect(e.totalPayable).toBeNull();
  });
});

describe('Phase 4E — carry-forward accumulation (same revenue code only)', () => {
  it('single carry + current tax reaches the threshold → PAYABLE', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: '6',
      currentObligationId: 'o-sep',
      currentBlocked: false,
      carryForward: [carry('c1', '2026-08', '4')],
      ruleResolution: resolved(),
      dueDate: '2026-10-30',
    });
    expect(e.status).toBe('PAYABLE');
    expect(e.currentAmount).toBe('6');
    expect(e.carryForwardAmount).toBe('4');
    expect(e.totalPayable).toBe('10');
    expect(e.dueDate).toBe('2026-10-30');
    expect(e.carryForwardEntryIds).toEqual(['c1']);
    expect(e.sourceBreakdown.map((s) => s.amount)).toEqual(['6', '4']);
  });

  it('multi-period accumulation A+B+C is exactly-once and preserves breakdown', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-10',
      currency: 'BRL',
      currentAmount: '5',
      currentObligationId: 'o-oct',
      currentBlocked: false,
      carryForward: [carry('a', '2026-08', '3'), carry('b', '2026-09', '4')],
      ruleResolution: resolved(),
      dueDate: '2026-11-30',
    });
    expect(e.status).toBe('PAYABLE');
    expect(e.totalPayable).toBe('12');
    expect(e.carryForwardEntryIds.sort()).toEqual(['a', 'b']);
    expect(e.sourceBreakdown.map((s) => `${s.sourceCompetence}:${s.amount}`)).toEqual([
      '2026-10:5',
      '2026-08:3',
      '2026-09:4',
    ]);
  });

  it('carry + zero current tax can still be payable', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: null,
      currentObligationId: null,
      currentBlocked: false,
      carryForward: [carry('c1', '2026-08', '12.34')],
      ruleResolution: resolved(),
      dueDate: '2026-10-30',
    });
    expect(e.status).toBe('PAYABLE');
    expect(e.currentAmount).toBeNull();
    expect(e.totalPayable).toBe('12.34');
  });

  it('below-minimum total keeps accumulating; nothing consumed', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: '2',
      currentObligationId: 'o-sep',
      currentBlocked: false,
      carryForward: [carry('c1', '2026-08', '3')],
      ruleResolution: resolved(),
      dueDate: '2026-10-30',
    });
    expect(e.status).toBe('CARRIED_FORWARD');
    expect(e.totalPayable).toBe('5');
  });

  it('cross revenue code carry-forward is blocked (6015 + other)', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: '6',
      currentObligationId: 'o-sep',
      currentBlocked: false,
      carryForward: [carry('other', '2026-08', '4', '5993')],
      ruleResolution: resolved(),
      dueDate: '2026-10-30',
    });
    expect(e.status).toBe('BLOCKED');
    expect(e.reasonCode).toBe('CROSS_REVENUE_CODE_NOT_ALLOWED');
    expect(e.totalPayable).toBeNull();
  });

  it('currency mismatch fails closed', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: '6',
      currentObligationId: 'o-sep',
      currentBlocked: false,
      carryForward: [carry('usd', '2026-08', '4', '6015', 'USD')],
      ruleResolution: resolved(),
      dueDate: '2026-10-30',
    });
    expect(e.status).toBe('BLOCKED');
    expect(e.reasonCode).toBe('CURRENCY_MISMATCH');
  });

  it('nothing due → NOT_REQUIRED', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: null,
      currentObligationId: null,
      currentBlocked: false,
      carryForward: [],
      ruleResolution: resolved(),
      dueDate: null,
    });
    expect(e.status).toBe('NOT_REQUIRED');
  });

  it('blocked current obligation fails closed', () => {
    const e = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: null,
      currentObligationId: null,
      currentBlocked: true,
      carryForward: [],
      ruleResolution: resolved(),
      dueDate: null,
    });
    expect(e.status).toBe('BLOCKED');
    expect(e.reasonCode).toBe('CURRENT_OBLIGATION_BLOCKED');
  });
});

describe('Phase 4E — carry-forward entry materialization (immutable facts)', () => {
  const base = {
    id: 'entry-1',
    taxSubjectId: 'sub-1',
    sourceObligationId: 'obl-aug',
    sourceCompetence: '2026-08',
    revenueCode: '6015',
    currency: 'BRL',
    targetCompetence: '2026-09',
    rule: RULE,
    createdAt: '2026-09-29',
  };

  it('creates an OPEN entry for a below-minimum amount', () => {
    const entry = buildCarryForwardEntry({ ...base, amount: '9.99' });
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('OPEN');
    expect(entry!.amount).toBe('9.99');
    expect(entry!.targetCompetence).toBe('2026-09');
    expect(Object.isFrozen(entry)).toBe(true);
    expect(entry!.fingerprint).toContain('obl-aug');
  });

  it('refuses amounts at/above the minimum and foreign codes', () => {
    expect(buildCarryForwardEntry({ ...base, amount: '10' })).toBeNull();
    expect(buildCarryForwardEntry({ ...base, amount: '10.01' })).toBeNull();
    expect(buildCarryForwardEntry({ ...base, amount: '5', revenueCode: '5993' })).toBeNull();
  });

  it('is deterministic (same identity → same fingerprint)', () => {
    const a = buildCarryForwardEntry({ ...base, amount: '5' });
    const b = buildCarryForwardEntry({ ...base, amount: '5' });
    expect(a!.fingerprint).toBe(b!.fingerprint);
  });
});

describe('Phase 4E — aggregation unit', () => {
  const eligibilityInput = {
    revenueCode: '6015',
    targetCompetence: '2026-09',
    currency: 'BRL',
    currentAmount: '6',
    currentObligationId: 'o-sep',
    currentBlocked: false,
    carryForward: [carry('c1', '2026-08', '4')],
    ruleResolution: resolved(),
    dueDate: '2026-10-30',
  };

  it('builds a payable aggregation with source breakdown and rule provenance', () => {
    const e = buildDarfPaymentEligibility(eligibilityInput);
    const agg = buildTaxPaymentAggregation({ id: 'agg-1', taxSubjectId: 'sub-1', eligibility: e });
    expect(agg).not.toBeNull();
    expect(agg!.totalPayable).toBe('10');
    expect(agg!.minimumThreshold).toBe('10');
    expect(agg!.sourceEntryIds).toEqual(['c1']);
    expect(agg!.ruleId).toBe(RULE.ruleId);
    expect(agg!.fingerprint).toContain('6015');
    expect(Object.isFrozen(agg)).toBe(true);
  });

  it('aggregation fingerprint is stable across carry orderings', () => {
    const a = computeAggregationFingerprint({
      taxSubjectId: 's',
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentObligationId: 'o',
      currentAmount: '6',
      sourceEntryIds: ['c1', 'c2'],
      dueDate: '2026-10-30',
      ruleId: 'r',
      ruleVersion: '1',
    });
    const b = computeAggregationFingerprint({
      taxSubjectId: 's',
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentObligationId: 'o',
      currentAmount: '6',
      sourceEntryIds: ['c2', 'c1'],
      dueDate: '2026-10-30',
      ruleId: 'r',
      ruleVersion: '1',
    });
    expect(a).toBe(b);
  });

  it('below-minimum with carry-forward materializes a CARRIED_FORWARD aggregation (no consumption)', () => {
    const e = buildDarfPaymentEligibility({ ...eligibilityInput, currentAmount: null });
    // carry 4 alone < 10 → CARRIED_FORWARD
    expect(e.status).toBe('CARRIED_FORWARD');
    const agg = buildTaxPaymentAggregation({ id: 'x', taxSubjectId: 's', eligibility: e });
    expect(agg?.status).toBe('CARRIED_FORWARD');
    expect(agg?.totalPayable).toBe('4');
  });

  it('never aggregates when no carry-forward is allowed (BELOW_MINIMUM)', () => {
    const noCarry: MinimumDarfRuleSet = { ...RULE, carryForwardAllowed: false };
    const e = buildDarfPaymentEligibility({
      ...eligibilityInput,
      currentAmount: '4',
      carryForward: [],
      ruleResolution: resolved(noCarry),
    });
    expect(e.status).toBe('BELOW_MINIMUM');
    expect(buildTaxPaymentAggregation({ id: 'x', taxSubjectId: 's', eligibility: e })).toBeNull();
  });
});

describe('Phase 4E — competence arithmetic', () => {
  it('advances to the immediately subsequent competence', () => {
    expect(nextFiscalCompetence('2026-08')).toBe('2026-09');
    expect(nextFiscalCompetence('2026-12')).toBe('2027-01');
    expect(nextFiscalCompetence('2026-13')).toBeNull();
    expect(nextFiscalCompetence('bad')).toBeNull();
  });
});
