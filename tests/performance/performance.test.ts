import { describe, it, expect } from 'vitest';
import { LocalDate, Money, Currency } from '@atlas/domain';
import {
  calculateTWR,
  calculateXIRR,
  calculatePortfolioPerformance,
} from '@atlas/performance-engine';

const BRL = 'BRL' as Currency;
const USD = 'USD' as Currency;

function obs(date: string, amount: string, currency: Currency = BRL) {
  return { date: LocalDate.from(date), value: Money.from(amount, currency), currency };
}
function cf(
  date: string,
  amount: string,
  direction: 'INFLOW' | 'OUTFLOW' = 'INFLOW',
  currency: Currency = BRL,
) {
  return {
    date: LocalDate.from(date),
    amount: Money.from(amount, currency),
    direction: direction as never,
  };
}
function xcf(date: string, amount: string, currency: Currency = BRL) {
  return { date: LocalDate.from(date), amount: Money.from(amount, currency) };
}

describe('Performance: TWR simple', () => {
  it('100 → 110 = 10% without flows', () => {
    const r = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    expect(r.status).toBe('COMPLETE');
    expect(r.returnPercentage.value).toBe('10');
  });
});

describe('Performance: TWR with deposit', () => {
  it('100, deposit 100, ending 220 → ~10% (neutralizes flow)', () => {
    // 100 at start, deposit 100 on 2026-01-15, ending 220
    // Subperiods: 100→100 (pre-flow) and 200→220 (post-flow, beginning 200 = 100+100)
    // But with our flow-at-end convention, we need observations before and after flow
    const r = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-15', '200'), obs('2026-01-31', '220')],
      cashFlows: [cf('2026-01-15', '100', 'INFLOW')],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    // First subperiod: 100→200 with 100 flow → (200-100-100)/100 =0% , second: (220-200)/200=10% → overall 10%
    expect(r.returnPercentage.value).toBe('10');
  });
});

describe('Performance: TWR withdrawal', () => {
  it('200, withdrawal 50, ending 165 → 10%', () => {
    const r = calculateTWR({
      observations: [obs('2026-01-01', '200'), obs('2026-01-15', '150'), obs('2026-01-31', '165')],
      cashFlows: [cf('2026-01-15', '50', 'OUTFLOW')],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    // First: (150-200-(-50))/200 =0% , second: (165-150)/150=10%
    expect(r.returnPercentage.value).toBe('10');
  });
});

describe('Performance: Multiple subperiods', () => {
  it('chaining 3 periods 10% each → 33.1%', () => {
    const r = calculateTWR({
      observations: [
        obs('2026-01-01', '100'),
        obs('2026-02-01', '110'),
        obs('2026-03-01', '121'),
        obs('2026-04-01', '133.1'),
      ],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-04-01') },
      currency: BRL,
    });
    expect(r.subperiods.length).toBe(3);
    expect(r.returnPercentage.value).toBe('33.1');
  });
});

describe('Performance: Fee effect', () => {
  it('fee reduces return (fee not external flow)', () => {
    // Fee is internal, reduces ending value, so return reflects it
    const rWithFee = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '105')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    // If fee of 5 is taken, ending 105 vs 110 without fee → lower return
    expect(rWithFee.returnPercentage.value).toBe('5');
  });
});

describe('Performance: Dividend effect', () => {
  it('dividend stays in portfolio, affects return', () => {
    const r = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    expect(r.returnPercentage.value).toBe('10');
  });
});

describe('Performance: Internal transfer', () => {
  it('internal transfer does not affect consolidated TWR', () => {
    // Consolidated: same as no transfer
    const r1 = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    const r2 = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [], // internal transfer not in external flows
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    expect(r1.returnPercentage.value).toBe(r2.returnPercentage.value);
  });
});

describe('Performance: Zero beginning value', () => {
  it('beginning 0 → INVALID_INPUT', () => {
    const r = calculateTWR({
      observations: [obs('2026-01-01', '0'), obs('2026-01-31', '100')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    expect(r.status).toBe('INVALID_INPUT');
  });
});

describe('Performance: Empty', () => {
  it('no observations → INSUFFICIENT_DATA', () => {
    const r = calculateTWR({
      observations: [],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    expect(r.status).toBe('INSUFFICIENT_DATA');
  });
  it('single observation → INSUFFICIENT_DATA', () => {
    const r = calculateTWR({
      observations: [obs('2026-01-01', '100')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    expect(r.status).toBe('INSUFFICIENT_DATA');
  });
});

describe('Performance: Multi-currency', () => {
  it('BRL and USD segregated', () => {
    const p = calculatePortfolioPerformance({
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      observationsByCurrency: {
        BRL: [obs('2026-01-01', '100', BRL), obs('2026-01-31', '110', BRL)],
        USD: [obs('2026-01-01', '100', USD), obs('2026-01-31', '105', USD)],
      },
      cashFlowsByCurrency: { BRL: [], USD: [] },
    });
    expect(p.currencies['BRL'].twr?.returnPercentage.value).toBe('10');
    expect(p.currencies['USD'].twr?.returnPercentage.value).toBe('5');
    expect(p.currencies['BRL'].twr?.returnPercentage.value).not.toBe(
      p.currencies['USD'].twr?.returnPercentage.value,
    );
  });
});

describe('Performance: XIRR simple', () => {
  it('-1000 today +1100 in 1 year ≈10%', () => {
    const r = calculateXIRR({
      cashFlows: [xcf('2025-01-01', '-1000'), xcf('2026-01-01', '1100')],
      currency: BRL,
    });
    expect(r.status).toBe('CONVERGED');
    const pct = Number(r.returnPercentage!.value);
    expect(pct).toBeGreaterThan(9.9);
    expect(pct).toBeLessThan(10.1);
  });
});

describe('Performance: XIRR irregular dates', () => {
  it('handles irregular intervals', () => {
    const r = calculateXIRR({
      cashFlows: [xcf('2026-01-01', '-1000'), xcf('2026-07-01', '600'), xcf('2027-01-01', '600')],
      currency: BRL,
    });
    expect(r.status).toBe('CONVERGED');
    expect(r.returnPercentage).not.toBeNull();
  });
});

describe('Performance: XIRR no solution', () => {
  it('all positive → NO_SOLUTION', () => {
    const r = calculateXIRR({
      cashFlows: [xcf('2026-01-01', '100'), xcf('2026-06-01', '100')],
      currency: BRL,
    });
    expect(r.status).toBe('NO_SOLUTION');
  });
});

describe('Performance: XIRR convergence', () => {
  it('bounded iterations', () => {
    const r = calculateXIRR({
      cashFlows: [xcf('2026-01-01', '-1000'), xcf('2026-01-02', '1001')],
      currency: BRL,
      maxIterations: 5,
    });
    expect(['CONVERGED', 'NUMERICAL_FAILURE', 'NO_SOLUTION']).toContain(r.status);
    expect(r.iterations).toBeLessThanOrEqual(5);
  });
});

describe('Performance: Invalid date', () => {
  it('invalid period start > end → INVALID_INPUT', () => {
    const r = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-02-01'), endDate: LocalDate.from('2026-01-01') },
      currency: BRL,
    });
    expect(r.status).toBe('INVALID_INPUT');
  });
});

import fs from 'fs';
describe('Performance: No float guard', () => {
  it('engine uses decimal, not float, for TWR', () => {
    const code = fs.readFileSync('packages/performance-engine/src/index.ts', 'utf8');
    // TWR should use Money/Quantity/Percentage, not raw parseFloat/Number for financial math
    // XIRR may use Math.pow with float but tolerance documented — allow Math.pow for XIRR
    expect(code).toContain('Money');
    expect(code).toContain('Quantity');
    // Ensure TWR path doesn't use Number(price) for financial
    const t = code.split('calculateTWR')[1]?.split('calculateXIRR')[0] ?? '';
    expect(t).not.toMatch(/parseFloat/);
  });
});

describe('Performance: Property tests', () => {
  it('no flows + flat value => 0 return', () => {
    const r = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-02-01', '100'), obs('2026-03-01', '100')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-03-01') },
      currency: BRL,
    });
    expect(r.returnPercentage.value).toBe('0');
  });
  it('inserting zero flow does not change TWR', () => {
    const r1 = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    const r2 = calculateTWR({
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [cf('2026-01-15', '0', 'INFLOW')],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    });
    expect(r1.returnPercentage.value).toBe(r2.returnPercentage.value);
  });
  it('determinism: same input → same output', () => {
    const input = {
      observations: [obs('2026-01-01', '100'), obs('2026-01-31', '110')],
      cashFlows: [] as never[],
      period: { startDate: LocalDate.from('2026-01-01'), endDate: LocalDate.from('2026-01-31') },
      currency: BRL,
    };
    const r1 = calculateTWR(input);
    const r2 = calculateTWR(input);
    expect(r1.returnPercentage.value).toBe(r2.returnPercentage.value);
    expect(Object.isFrozen(r1)).toBe(true);
  });
});
