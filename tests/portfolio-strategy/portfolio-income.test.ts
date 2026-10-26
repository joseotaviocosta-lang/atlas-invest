import { describe, expect, it } from 'vitest';
import {
  aggregateIncomeTotals,
  bucketIncomeByMonth,
  incomeShareBp,
  isIncomeEventType,
  rankIncomeRows,
  INCOME_EVENT_TYPES,
  type IncomeLedgerRow,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5R-D — income engine (pure, zero I/O).
 *
 * Exact decimal aggregation by currency and type, monthly bucketing,
 * share math and deterministic ranking. No forecasts, no yield, no advice.
 */
function row(
  id: string,
  tradeDate: string,
  type: string,
  amount: string | null,
  currency = 'BRL',
): IncomeLedgerRow {
  return {
    id,
    assetId: 'a1',
    tradeDate,
    type,
    amount,
    currency,
    createdAt: `${tradeDate}T10:00:00.000Z`,
  };
}

describe('Phase 5R-D: income event classification', () => {
  it('recognizes only canonical income types', () => {
    expect([...INCOME_EVENT_TYPES]).toEqual(['DIVIDEND', 'JCP', 'FII_INCOME']);
    for (const type of ['DIVIDEND', 'JCP', 'FII_INCOME']) {
      expect(isIncomeEventType(type)).toBe(true);
    }
    for (const type of [
      'BUY',
      'SELL',
      'AMORTIZATION',
      'SPLIT',
      'BONUS',
      'TRANSFER_IN',
      'DEPOSIT',
      'FEE',
      'TAX',
      'SUBSCRIPTION',
      'INCOME',
    ]) {
      expect(isIncomeEventType(type)).toBe(false);
    }
  });

  it('ignores amortization, sales, transfers and deposits', () => {
    const totals = aggregateIncomeTotals([
      row('1', '2026-01-10', 'DIVIDEND', '100.00'),
      row('2', '2026-01-11', 'SELL', '5000.00'),
      row('3', '2026-01-12', 'AMORTIZATION', '200.00'),
      row('4', '2026-01-13', 'TRANSFER_IN', '100.00'),
      row('5', '2026-01-14', 'DEPOSIT', '10000.00'),
      row('6', '2026-01-15', 'BONUS', '0.00'),
    ]);
    expect(totals).toEqual([
      { currency: 'BRL', dividends: '100', jcp: '0', fiiIncome: '0', total: '100', eventCount: 1 },
    ]);
  });
});

describe('Phase 5R-D: income aggregation', () => {
  it('splits dividend, JCP and FII income without mixing types', () => {
    const totals = aggregateIncomeTotals([
      row('1', '2026-01-10', 'DIVIDEND', '100.50'),
      row('2', '2026-02-10', 'JCP', '25'),
      row('3', '2026-03-10', 'FII_INCOME', '10.00'),
      row('4', '2026-03-11', 'DIVIDEND', '0.50'),
    ]);
    expect(totals).toEqual([
      {
        currency: 'BRL',
        dividends: '101',
        jcp: '25',
        fiiIncome: '10',
        total: '136',
        eventCount: 4,
      },
    ]);
  });

  it('keeps currencies separate without conversion', () => {
    const totals = aggregateIncomeTotals([
      row('1', '2026-01-10', 'DIVIDEND', '100.00', 'BRL'),
      row('2', '2026-02-10', 'DIVIDEND', '10.00', 'USD'),
      row('3', '2026-03-10', 'JCP', '5.00', 'USD'),
    ]);
    expect(totals).toEqual([
      { currency: 'BRL', dividends: '100', jcp: '0', fiiIncome: '0', total: '100', eventCount: 1 },
      { currency: 'USD', dividends: '10', jcp: '5', fiiIncome: '0', total: '15', eventCount: 2 },
    ]);
  });

  it('skips rows without a string amount', () => {
    const totals = aggregateIncomeTotals([
      row('1', '2026-01-10', 'DIVIDEND', null),
      row('2', '2026-01-10', 'DIVIDEND', '50.00'),
    ]);
    expect(totals).toEqual([
      { currency: 'BRL', dividends: '50', jcp: '0', fiiIncome: '0', total: '50', eventCount: 1 },
    ]);
  });

  it('returns empty totals when there are no income events', () => {
    expect(aggregateIncomeTotals([])).toEqual([]);
    expect(aggregateIncomeTotals([row('1', '2026-01-10', 'BUY', '1000.00')])).toEqual([]);
  });
});

describe('Phase 5R-D: monthly buckets', () => {
  it('buckets by YYYY-MM across the enumerated range, zero-filled per observed currency', () => {
    const buckets = bucketIncomeByMonth(
      [row('1', '2026-01-15', 'DIVIDEND', '100.00'), row('2', '2026-03-20', 'JCP', '25.00', 'USD')],
      ['2026-01', '2026-02', '2026-03'],
    );
    expect(buckets.map((row) => row.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(buckets[1]).toEqual({
      month: '2026-02',
      totals: [
        { currency: 'BRL', dividends: '0', jcp: '0', fiiIncome: '0', total: '0', eventCount: 0 },
        { currency: 'USD', dividends: '0', jcp: '0', fiiIncome: '0', total: '0', eventCount: 0 },
      ],
    });
    expect(buckets[2]?.totals).toEqual([
      { currency: 'BRL', dividends: '0', jcp: '0', fiiIncome: '0', total: '0', eventCount: 0 },
      { currency: 'USD', dividends: '0', jcp: '25', fiiIncome: '0', total: '25', eventCount: 1 },
    ]);
  });

  it('ignores out-of-range months for bucketing', () => {
    const buckets = bucketIncomeByMonth([row('1', '2026-05-01', 'DIVIDEND', '10.00')], ['2026-06']);
    expect(buckets).toEqual([
      {
        month: '2026-06',
        totals: [
          { currency: 'BRL', dividends: '0', jcp: '0', fiiIncome: '0', total: '0', eventCount: 0 },
        ],
      },
    ]);
  });
});

describe('Phase 5R-D: income share math', () => {
  it('computes exact basis points and fails closed on a zero denominator', () => {
    expect(incomeShareBp('250', '1000')).toBe('2500');
    expect(incomeShareBp('0', '1000')).toBe('0');
    expect(incomeShareBp('100', '0')).toBeNull();
    expect(incomeShareBp('100', '0.00')).toBeNull();
  });
});

describe('Phase 5R-D: deterministic ranking', () => {
  it('orders by total desc with stable assetId tie-break and 1-based ranks', () => {
    const ranked = rankIncomeRows(
      [
        { assetId: 'b', total: '100' },
        { assetId: 'a', total: '100' },
        { assetId: 'c', total: '300' },
      ],
      (row) => row.total,
      (row) => row.assetId,
      2,
    );
    expect(ranked).toEqual([
      { rank: 1, row: { assetId: 'c', total: '300' } },
      { rank: 2, row: { assetId: 'a', total: '100' } },
    ]);
  });

  it('compares decimals exactly regardless of scale', () => {
    const ranked = rankIncomeRows(
      [
        { assetId: 'a', total: '10.0' },
        { assetId: 'b', total: '10' },
        { assetId: 'c', total: '9.99' },
      ],
      (row) => row.total,
      (row) => row.assetId,
      10,
    );
    expect(ranked.map((row) => row.row.assetId)).toEqual(['a', 'b', 'c']);
  });
});

describe('Phase 5R-D: engine boundaries', () => {
  it('contains no forecast, yield or annualization math', () => {
    const source = [
      aggregateIncomeTotals.toString(),
      bucketIncomeByMonth.toString(),
      incomeShareBp.toString(),
      rankIncomeRows.toString(),
    ].join('\n');
    expect(source).not.toMatch(/forecast|expected|annualiz|yield|future|predict/i);
    expect(source).not.toMatch(/\*\s*12|\/\s*12/);
  });
});
