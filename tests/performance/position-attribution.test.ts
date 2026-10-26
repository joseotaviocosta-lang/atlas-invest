import { describe, expect, it } from 'vitest';
import { Quantity } from '@atlas/domain';
import {
  attributePositionContributions,
  POSITION_PERFORMANCE_MAX_MONTHS,
  sumPositionRealized,
} from '@atlas/performance-engine';

function closeTo(actual: string, expected: string, epsilon = '1e-12'): boolean {
  return (
    Quantity.from(actual).subtract(Quantity.from(expected)).abs().compare(Quantity.from(epsilon)) <
    0
  );
}

/**
 * Phase 5R-B — attribution engine (pure, zero I/O).
 *
 * Monthly Brinson-style attribution with exact decimals: contributions
 * chain with the portfolio's own monthly returns, so their sum equals
 * the chained portfolio return. No current-weight approximation, no
 * invented formulas.
 */
describe('Phase 5R-B: position contribution attribution', () => {
  it('attributes a single-position portfolio exactly to its own return', () => {
    const result = attributePositionContributions({
      months: ['2026-01', '2026-02'],
      positions: [{ assetId: 'a', startValues: ['1000', '1100'], monthlyReturns: ['10', '-5'] }],
      targetAssetId: 'a',
    });
    // Month 1: +10% on 1000. Month 2: -5% chained after +10%.
    expect(result.months[0]).toMatchObject({
      month: '2026-01',
      positionReturn: '10',
      weightStart: '100',
      valued: true,
    });
    expect(closeTo(result.months[0]?.contributionPp as string, '10')).toBe(true);
    expect(closeTo(result.months[1]?.contributionPp as string, '-5.5')).toBe(true);
    expect(closeTo(result.contributions['a'] as string, '4.5')).toBe(true);
    expect(closeTo(result.portfolioReturnOnGrid, '4.5')).toBe(true);
    expect(result.monthsValued).toBe(2);
    expect(POSITION_PERFORMANCE_MAX_MONTHS).toBe(120);
  });

  it('reconciles contributions with the portfolio return across positions', () => {
    const positions = [
      {
        assetId: 'a',
        startValues: ['600', '660', '600'],
        monthlyReturns: ['10', '-9.0909090909090909090909090909090909091', '5'],
      },
      {
        assetId: 'b',
        startValues: ['400', '440', '460'],
        monthlyReturns: ['10', '4.5454545454545454545454545454545454545', '5'],
      },
    ];
    const result = attributePositionContributions({
      months: ['2026-01', '2026-02', '2026-03'],
      positions,
      targetAssetId: 'a',
    });
    const total = Quantity.from(result.contributions['a'] as string).add(
      Quantity.from(result.contributions['b'] as string),
    );
    expect(closeTo(total.value, result.portfolioReturnOnGrid, '1e-9')).toBe(true);
    // Weights renormalize per month from start values.
    expect(closeTo(result.months[0]?.weightStart as string, '60')).toBe(true);
  });

  it('excludes unvalued positions per month without zero-filling', () => {
    const result = attributePositionContributions({
      months: ['2026-01', '2026-02'],
      positions: [
        { assetId: 'a', startValues: ['1000', '1000'], monthlyReturns: ['0', '0'] },
        { assetId: 'b', startValues: [null, '1000'], monthlyReturns: [null, '0'] },
      ],
      targetAssetId: 'a',
    });
    // January: only A is valued, weight 100.
    expect(result.months[0]?.weightStart).toBe('100');
    // February: both valued 50/50.
    expect(closeTo(result.months[1]?.weightStart as string, '50')).toBe(true);
    expect(result.monthsValued).toBe(2);
  });

  it('marks months with an empty universe as unvalued', () => {
    const result = attributePositionContributions({
      months: ['2026-01'],
      positions: [{ assetId: 'a', startValues: [null], monthlyReturns: [null] }],
      targetAssetId: 'a',
    });
    expect(result.months[0]).toMatchObject({
      positionReturn: null,
      weightStart: null,
      contributionPp: null,
      valued: false,
    });
    expect(result.monthsValued).toBe(0);
    expect(result.portfolioReturnOnGrid).toBe('0');
  });

  it('never uses current weight times return', () => {
    const result = attributePositionContributions({
      months: ['2026-01', '2026-02'],
      positions: [
        // A doubles then halves; B is flat. Current-weight approx would misstate month 1.
        { assetId: 'a', startValues: ['100', '200'], monthlyReturns: ['100', '-50'] },
        { assetId: 'b', startValues: ['900', '900'], monthlyReturns: ['0', '0'] },
      ],
      targetAssetId: 'a',
    });
    // Correct month-1 contribution: w=10% * +100% = +10 p.p. (not end weight 200/1100 * 100).
    expect(closeTo(result.months[0]?.contributionPp as string, '10')).toBe(true);
    // Chained total: portfolio +10% then month 2: (200*-50% + 900*0)/1100 = -9.0909...%
    // (1.10) * (1 - 1/11) - 1 = 0 exactly.
    expect(closeTo(result.portfolioReturnOnGrid, '0', '1e-9')).toBe(true);
    const total = Quantity.from(result.contributions['a'] as string).add(
      Quantity.from(result.contributions['b'] as string),
    );
    expect(closeTo(total.value, result.portfolioReturnOnGrid, '1e-9')).toBe(true);
  });

  it('is deterministic across input order', () => {
    const months = ['2026-01', '2026-02'];
    const first = attributePositionContributions({
      months,
      positions: [
        { assetId: 'b', startValues: ['400', '420'], monthlyReturns: ['5', '5'] },
        { assetId: 'a', startValues: ['600', '630'], monthlyReturns: ['5', '5'] },
      ],
      targetAssetId: 'a',
    });
    const second = attributePositionContributions({
      months,
      positions: [
        { assetId: 'a', startValues: ['600', '630'], monthlyReturns: ['5', '5'] },
        { assetId: 'b', startValues: ['400', '420'], monthlyReturns: ['5', '5'] },
      ],
      targetAssetId: 'a',
    });
    expect(second).toEqual(first);
  });
});

describe('Phase 5R-B: realized aggregation guards', () => {
  it('sums only KNOWN disposal gains per the poison rule', () => {
    expect(
      sumPositionRealized([
        { gainLoss: '400', status: 'KNOWN' },
        { gainLoss: '-50', status: 'KNOWN' },
      ]),
    ).toEqual({ total: '350', status: 'KNOWN', count: 2 });
  });

  it('poisons the total on any INCOMPLETE disposal instead of partial sums', () => {
    expect(
      sumPositionRealized([
        { gainLoss: '400', status: 'KNOWN' },
        { gainLoss: null, status: 'INCOMPLETE' },
      ]),
    ).toEqual({ total: null, status: 'INCOMPLETE', count: 2 });
  });

  it('returns zero with no disposals', () => {
    expect(sumPositionRealized([])).toEqual({ total: '0', status: 'KNOWN', count: 0 });
  });
});
