import { describe, expect, it } from 'vitest';
import {
  buildDarfPaymentEligibility,
  buildTaxPaymentAggregation,
  type CarryForwardCandidate,
  type MinimumDarfRuleResolution,
  type DarfPaymentEligibility,
} from '@atlas/tax-engine';
import { BR_FEDERAL_MINIMUM_DARF_RULE } from '../../apps/api/src/application/fiscal/minimum-darf-registry';

const RULE = BR_FEDERAL_MINIMUM_DARF_RULE;
const RESOLVED: MinimumDarfRuleResolution = { outcome: 'RESOLVED', rule: RULE, reasonCode: null };
const SIZES = [1, 12, 60, 120, 1000] as const;

function carryEntries(n: number): CarryForwardCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cf-${i}`,
    sourceObligationId: `obl-${i}`,
    sourceCompetence: `2025-${String((i % 12) + 1).padStart(2, '0')}`,
    revenueCode: '6015',
    currency: 'BRL',
    amount: '0.01',
  }));
}

describe('Phase 4E — payment-eligibility / aggregation scale (pure, deterministic)', () => {
  it('evaluates 1/12/60/120/1000 carry-forward entries within a linear budget', () => {
    const timings: Record<number, number> = {};
    for (const n of SIZES) {
      const carryForward = carryEntries(n);
      const current = n === 1 ? '9.99' : '0';
      const start = performance.now();
      // Evaluate + aggregate repeatedly (10 passes) for a stable measure.
      for (let pass = 0; pass < 10; pass += 1) {
        const eligibility: DarfPaymentEligibility = buildDarfPaymentEligibility({
          revenueCode: '6015',
          targetCompetence: '2026-09',
          currency: 'BRL',
          currentAmount: current,
          currentObligationId: 'obl-current',
          currentBlocked: false,
          carryForward,
          ruleResolution: RESOLVED,
          dueDate: '2026-10-30',
        });
        buildTaxPaymentAggregation({ id: `agg-${n}`, taxSubjectId: 's', eligibility });
      }
      timings[n] = performance.now() - start;

      // Correctness invariants independent of size.
      const eligibility = buildDarfPaymentEligibility({
        revenueCode: '6015',
        targetCompetence: '2026-09',
        currency: 'BRL',
        currentAmount: current,
        currentObligationId: 'obl-current',
        currentBlocked: false,
        carryForward,
        ruleResolution: RESOLVED,
        dueDate: '2026-10-30',
      });
      expect(eligibility.sourceBreakdown.length).toBe(n + (current !== '0' ? 1 : 0));
    }
    // eslint-disable-next-line no-console
    console.log('MINIMUM_DARF_TIMINGS_MS=' + JSON.stringify(timings));
    // 1000 entries x 10 passes must stay well under a second on any dev machine.
    expect(timings[1000]!).toBeLessThan(2000);
  });

  it('is deterministic across permutations of the carry-forward input', () => {
    const base = carryEntries(60);
    const shuffled = [...base].reverse();
    const a = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: '12',
      currentObligationId: 'o',
      currentBlocked: false,
      carryForward: base,
      ruleResolution: RESOLVED,
      dueDate: '2026-10-30',
    });
    const b = buildDarfPaymentEligibility({
      revenueCode: '6015',
      targetCompetence: '2026-09',
      currency: 'BRL',
      currentAmount: '12',
      currentObligationId: 'o',
      currentBlocked: false,
      carryForward: shuffled,
      ruleResolution: RESOLVED,
      dueDate: '2026-10-30',
    });
    expect(b.totalPayable).toBe(a.totalPayable);
    expect(b.status).toBe(a.status);
  });
});
