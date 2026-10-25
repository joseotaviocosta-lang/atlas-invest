import { describe, expect, it } from 'vitest';
import {
  aggregatePositionIncome,
  derivePositionActivity,
  isPositionIncomeType,
  POSITION_RECENT_ACTIVITY_LIMIT,
  POSITION_RECENT_INCOME_LIMIT,
} from '../../apps/api/src/application/portfolios/portfolio-position-intelligence.compose';

/**
 * Phase 5R-A — position intelligence composition (pure, zero I/O).
 *
 * Exact decimal aggregation of canonical per-asset rows. Currencies are
 * never mixed; ordering is deterministic; no advice, no scores, no
 * forecasts, no automation vocabulary anywhere near.
 */
describe('Phase 5R-A: position income and activity composition', () => {
  it('exposes the bounded policy limits', () => {
    expect(POSITION_RECENT_ACTIVITY_LIMIT).toBe(10);
    expect(POSITION_RECENT_INCOME_LIMIT).toBe(5);
  });

  it('recognizes only canonical income event types', () => {
    expect(isPositionIncomeType('DIVIDEND')).toBe(true);
    expect(isPositionIncomeType('JCP')).toBe(true);
    expect(isPositionIncomeType('FII_INCOME')).toBe(true);
    expect(isPositionIncomeType('BUY')).toBe(false);
    expect(isPositionIncomeType('SPLIT')).toBe(false);
  });

  it('aggregates income per currency without mixing money', () => {
    const { totalsByCurrency, recent } = aggregatePositionIncome([
      {
        id: 'a',
        type: 'DIVIDEND',
        tradeDate: '2026-01-10',
        currency: 'BRL',
        createdAt: '2026-01-10T00:00:00.000Z',
        amount: '100.50',
      },
      {
        id: 'b',
        type: 'JCP',
        tradeDate: '2026-02-10',
        currency: 'BRL',
        createdAt: '2026-02-10T00:00:00.000Z',
        amount: '25',
      },
      {
        id: 'c',
        type: 'DIVIDEND',
        tradeDate: '2026-03-10',
        currency: 'USD',
        createdAt: '2026-03-10T00:00:00.000Z',
        amount: '10',
      },
      {
        id: 'd',
        type: 'BUY',
        tradeDate: '2026-04-10',
        currency: 'BRL',
        createdAt: '2026-04-10T00:00:00.000Z',
        quantity: '10',
        unitPrice: '30',
      },
    ]);
    expect(totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '100.5', jcp: '25', fiiIncome: '0', total: '125.5' },
      { currency: 'USD', dividends: '10', jcp: '0', fiiIncome: '0', total: '10' },
    ]);
    expect(recent.map((row) => row.transactionId)).toEqual(['c', 'b', 'a']);
  });

  it('returns empty totals when no income events exist', () => {
    expect(
      aggregatePositionIncome([
        {
          id: 'a',
          type: 'BUY',
          tradeDate: '2026-01-10',
          currency: 'BRL',
          createdAt: '2026-01-10T00:00:00.000Z',
          quantity: '10',
        },
      ]),
    ).toEqual({ totalsByCurrency: [], recent: [] });
  });

  it('bounds recent income and orders newest first', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: `i${index}`,
      type: 'DIVIDEND' as const,
      tradeDate: `2026-0${(index % 9) + 1}-10`,
      currency: 'BRL',
      createdAt: `2026-0${(index % 9) + 1}-10T00:00:00.000Z`,
      amount: '10',
    }));
    const { recent, totalsByCurrency } = aggregatePositionIncome(rows);
    expect(recent).toHaveLength(5);
    expect(recent[0]?.tradeDate >= recent[4]?.tradeDate).toBe(true);
    expect(totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '80', jcp: '0', fiiIncome: '0', total: '80' },
    ]);
  });

  it('derives bounded recent activity newest first with deterministic ties', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `t${String(index).padStart(2, '0')}`,
      type: index % 3 === 0 ? 'SELL' : 'BUY',
      tradeDate: '2026-05-10',
      currency: 'BRL',
      createdAt: '2026-05-10T00:00:00.000Z',
      quantity: '5',
      unitPrice: '30',
    }));
    const activity = derivePositionActivity(rows);
    expect(activity).toHaveLength(10);
    // Same-timestamp ties resolve by id ascending (creation order), deterministically.
    expect(activity[0]?.transactionId).toBe('t00');
    expect(activity[9]?.transactionId).toBe('t09');
    expect(activity[0]).toMatchObject({
      tradeDate: '2026-05-10',
      type: 'SELL',
      quantity: '5',
      unitPrice: '30',
      amount: null,
      currency: 'BRL',
    });
  });

  it('keeps corporate actions and transfers visible without relabeling', () => {
    const activity = derivePositionActivity([
      {
        id: 's',
        type: 'SPLIT',
        tradeDate: '2026-06-01',
        currency: 'BRL',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 't',
        type: 'TRANSFER_IN',
        tradeDate: '2026-06-02',
        currency: 'BRL',
        createdAt: '2026-06-02T00:00:00.000Z',
        quantity: '3',
      },
    ]);
    expect(activity.map((row) => row.type)).toEqual(['TRANSFER_IN', 'SPLIT']);
    expect(activity[0]).toMatchObject({ quantity: '3', amount: null, unitPrice: null });
  });
});
