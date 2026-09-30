import { describe, expect, it } from 'vitest';
import {
  applyEquityIrrfCredit,
  computeEquityProductionTaxForMonth,
  replayEquityProductionTax,
  EQUITY_IRRF_POOL_IDS,
  EQUITY_TAX_RATE_PERCENTAGE,
  type EquityIrrfWithholdingEntry,
  type EquityLossCategory,
  type EquityProductionTaxMonthInput,
} from '@atlas/tax-engine';

function month(
  competence: string,
  normalBase: string,
  dayTradeBase: string,
  withholding: EquityIrrfWithholdingEntry[] = [],
): EquityProductionTaxMonthInput {
  return {
    competence,
    core: {
      normal: { taxableBaseBeforeRate: normalBase },
      dayTrade: { taxableBaseBeforeRate: dayTradeBase },
    },
    withholding,
  };
}

function wh(
  category: EquityLossCategory,
  amount: string,
  fingerprint: string,
): EquityIrrfWithholdingEntry {
  return { category, amount, fingerprint };
}

describe('Phase 4G.2B — equity production tax & IRRF pools', () => {
  it('A. normal IRRF fully used', () => {
    const r = applyEquityIrrfCredit({
      category: 'EQUITY_NORMAL',
      grossTax: '100',
      opening: '0',
      current: '3',
    });
    expect(r.irrfUsed).toBe('3');
    expect(r.netTaxBefore6015Aggregation).toBe('97');
    expect(r.irrfClosing).toBe('0');
  });

  it('B. normal IRRF exceeds gross tax', () => {
    const r = applyEquityIrrfCredit({
      category: 'EQUITY_NORMAL',
      grossTax: '2',
      opening: '0',
      current: '3',
    });
    expect(r.irrfUsed).toBe('2');
    expect(r.netTaxBefore6015Aggregation).toBe('0');
    expect(r.irrfClosing).toBe('1');
  });

  it('C. opening + current against gross tax', () => {
    const r = applyEquityIrrfCredit({
      category: 'EQUITY_NORMAL',
      grossTax: '2.5',
      opening: '1',
      current: '2',
    });
    expect(r.irrfOpening).toBe('1');
    expect(r.irrfCurrent).toBe('2');
    expect(r.irrfUsed).toBe('2.5');
    expect(r.irrfClosing).toBe('0.5');
    expect(r.netTaxBefore6015Aggregation).toBe('0');
  });

  it('D. day-trade IRRF applied to day-trade gross tax', () => {
    const r = applyEquityIrrfCredit({
      category: 'EQUITY_DAY_TRADE',
      grossTax: '100',
      opening: '0',
      current: '10',
    });
    expect(r.irrfUsed).toBe('10');
    expect(r.netTaxBefore6015Aggregation).toBe('90');
  });

  it('E. normal IRRF never offsets day-trade tax', () => {
    const normal = applyEquityIrrfCredit({
      category: 'EQUITY_NORMAL',
      grossTax: '0',
      opening: '0',
      current: '3',
    });
    const dayTrade = applyEquityIrrfCredit({
      category: 'EQUITY_DAY_TRADE',
      grossTax: '100',
      opening: '0',
      current: '0',
    });
    expect(dayTrade.netTaxBefore6015Aggregation).toBe('100');
    expect(normal.irrfClosing).toBe('3');
    expect(normal.irrfUsed).toBe('0');
  });

  it('F. day-trade IRRF never offsets normal tax', () => {
    const dayTrade = applyEquityIrrfCredit({
      category: 'EQUITY_DAY_TRADE',
      grossTax: '0',
      opening: '0',
      current: '10',
    });
    const normal = applyEquityIrrfCredit({
      category: 'EQUITY_NORMAL',
      grossTax: '50',
      opening: '0',
      current: '0',
    });
    expect(normal.netTaxBefore6015Aggregation).toBe('50');
    expect(dayTrade.irrfClosing).toBe('10');
  });

  it('G. pools are category-specific and there is no FII IRRF pool', () => {
    expect(EQUITY_IRRF_POOL_IDS.EQUITY_NORMAL).toBe('EQUITY_NORMAL_IRRF');
    expect(EQUITY_IRRF_POOL_IDS.EQUITY_DAY_TRADE).toBe('EQUITY_DAY_TRADE_IRRF');
    expect(Object.values(EQUITY_IRRF_POOL_IDS)).not.toContain('FII');
  });

  it('H/I. year-end residual is terminal and January resets', () => {
    const results = replayEquityProductionTax([
      month('2026-12', '0', '0', [
        wh('EQUITY_NORMAL', '5', 'n-dec'),
        wh('EQUITY_DAY_TRADE', '7', 'd-dec'),
      ]),
      month('2027-01', '1000', '1000'),
    ]);
    const december = results[0]!;
    expect(december.normal.irrfClosing).toBe('5');
    expect(december.normal.yearEndState).toBe('AVAILABLE_FOR_ANNUAL_ADJUSTMENT');
    expect(december.dayTrade.irrfClosing).toBe('7');
    expect(december.dayTrade.yearEndState).toBe('AVAILABLE_FOR_RESTITUTION');

    const january = results[1]!;
    expect(january.normal.irrfOpening).toBe('0');
    expect(january.normal.irrfUsed).toBe('0');
    expect(january.normal.netTaxBefore6015Aggregation).toBe('150');
    expect(january.dayTrade.irrfOpening).toBe('0');
    expect(january.dayTrade.netTaxBefore6015Aggregation).toBe('200');
  });

  it('J. normal rate is 15%', () => {
    const r = computeEquityProductionTaxForMonth(month('2026-08', '1000', '0'));
    expect(r.normal.ratePercentage).toBe('15');
    expect(r.normal.grossTax).toBe('150');
  });

  it('K. day-trade rate is 20%', () => {
    const r = computeEquityProductionTaxForMonth(month('2026-08', '0', '1000'));
    expect(r.dayTrade.ratePercentage).toBe('20');
    expect(r.dayTrade.grossTax).toBe('200');
  });

  it('L. exempt month (zero base) does not consume IRRF credit', () => {
    const r = replayEquityProductionTax([
      month('2026-08', '0', '0', [wh('EQUITY_NORMAL', '10', 'n1')]),
    ])[0]!;
    expect(r.normal.grossTax).toBe('0');
    expect(r.normal.irrfUsed).toBe('0');
    expect(r.normal.irrfClosing).toBe('10');
    expect(r.normal.netTaxBefore6015Aggregation).toBe('0');
  });

  it('carries normal and day-trade credit into subsequent months (same year)', () => {
    const results = replayEquityProductionTax([
      month('2026-06', '0', '0', [wh('EQUITY_NORMAL', '5', 'n1')]),
      month('2026-07', '100', '0'),
    ]);
    expect(results[1]!.normal.irrfOpening).toBe('5');
    expect(results[1]!.normal.irrfUsed).toBe('5');
    expect(results[1]!.normal.netTaxBefore6015Aggregation).toBe('10');
  });

  it('never uses the same withholding fingerprint twice', () => {
    const r = replayEquityProductionTax([
      month('2026-08', '0', '0', [
        wh('EQUITY_NORMAL', '10', 'same-fp'),
        wh('EQUITY_NORMAL', '10', 'same-fp'),
      ]),
    ])[0]!;
    expect(r.normal.irrfCurrent).toBe('10');
    expect(r.normal.irrfClosing).toBe('10');
  });

  it('property: credit invariants hold across 10,000 deterministic cases', () => {
    const seed = 20260930;
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    const decimal = (max: number) => (Math.floor(rand() * max * 100) / 100).toFixed(2);
    const categories: EquityLossCategory[] = ['EQUITY_NORMAL', 'EQUITY_DAY_TRADE'];
    let cases = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const category = categories[i % 2]!;
      const opening = decimal(500);
      const current = decimal(500);
      const grossTax = decimal(1000);
      const r = applyEquityIrrfCredit({ category, grossTax, opening, current });
      const num = (v: string) => Number(v);
      expect(num(r.irrfUsed)).toBeGreaterThanOrEqual(0);
      expect(num(r.irrfClosing)).toBeGreaterThanOrEqual(0);
      expect(num(r.netTaxBefore6015Aggregation)).toBeGreaterThanOrEqual(0);
      expect(num(r.irrfUsed)).toBeLessThanOrEqual(num(r.irrfOpening) + num(r.irrfCurrent) + 1e-9);
      expect(num(r.irrfUsed)).toBeLessThanOrEqual(num(r.grossTax) + 1e-9);
      expect(num(r.netTaxBefore6015Aggregation)).toBeCloseTo(num(r.grossTax) - num(r.irrfUsed), 6);
      expect(num(r.irrfClosing)).toBeCloseTo(
        num(r.irrfOpening) + num(r.irrfCurrent) - num(r.irrfUsed),
        6,
      );
      cases += 1;
    }
    expect(cases).toBe(10_000);
  });

  it('property: no automatic January carry across many seeded year boundaries', () => {
    const seed = 424242;
    let s = seed >>> 0;
    const rand = () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return s / 0xffffffff;
    };
    for (let i = 0; i < 500; i += 1) {
      const credit = (Math.floor(rand() * 1000 * 100) / 100).toFixed(2);
      const results = replayEquityProductionTax([
        month('2026-12', '0', '0', [
          wh('EQUITY_NORMAL', credit, `n-${i}`),
          wh('EQUITY_DAY_TRADE', credit, `d-${i}`),
        ]),
        month('2027-01', '1000', '1000'),
      ]);
      expect(results[1]!.normal.irrfOpening).toBe('0');
      expect(results[1]!.dayTrade.irrfOpening).toBe('0');
    }
  });

  it('exposes frozen rate constants', () => {
    expect(EQUITY_TAX_RATE_PERCENTAGE.EQUITY_NORMAL).toBe('15');
    expect(EQUITY_TAX_RATE_PERCENTAGE.EQUITY_DAY_TRADE).toBe('20');
  });
});
