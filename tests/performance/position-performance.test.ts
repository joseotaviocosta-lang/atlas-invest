import { describe, expect, it } from 'vitest';
import { LocalDate, Currency } from '@atlas/domain';
import { calculatePositionTwr, toPositionCapitalFlow } from '@atlas/performance-engine';

const BRL = 'BRL' as Currency;

/**
 * Phase 5R-B — position capital-flow classification (pure, zero I/O).
 * Mirrors the replay engine exactly: BUY/SUBSCRIPTION in, SELL out (net),
 * transfers at carried cost, everything else ignored like the portfolio
 * engine (which only counts DEPOSIT/WITHDRAWAL).
 */
describe('Phase 5R-B: position capital flow classification', () => {
  it('treats buys as inflows with gross cost including fees and taxes', () => {
    expect(
      toPositionCapitalFlow(
        {
          type: 'BUY',
          tradeDate: '2026-01-05',
          quantity: '100',
          unitPrice: '30.00',
          fees: '10.00',
          taxes: '5.00',
        },
        BRL,
      ),
    ).toEqual({
      date: LocalDate.from('2026-01-05'),
      amount: expect.objectContaining({}),
      direction: 'INFLOW',
    });
    const flow = toPositionCapitalFlow(
      {
        type: 'BUY',
        tradeDate: '2026-01-05',
        quantity: '100',
        unitPrice: '30.00',
        fees: '10.00',
        taxes: '5.00',
      },
      BRL,
    );
    expect(flow?.amount.amount).toBe('3015');
  });

  it('treats subscriptions as inflows without fee fields', () => {
    const flow = toPositionCapitalFlow(
      { type: 'SUBSCRIPTION', tradeDate: '2026-02-01', quantity: '50', unitPrice: '20.00' },
      BRL,
    );
    expect(flow?.direction).toBe('INFLOW');
    expect(flow?.amount.amount).toBe('1000');
  });

  it('treats sells as outflows net of costs', () => {
    const flow = toPositionCapitalFlow(
      {
        type: 'SELL',
        tradeDate: '2026-04-10',
        quantity: '40',
        unitPrice: '40.00',
        fees: '8.00',
        taxes: '2.00',
      },
      BRL,
    );
    expect(flow?.direction).toBe('OUTFLOW');
    expect(flow?.amount.amount).toBe('1590');
  });

  it('moves transfers at carried cost without inventing gains', () => {
    const inFlow = toPositionCapitalFlow(
      {
        type: 'TRANSFER_IN',
        tradeDate: '2026-03-01',
        quantity: '10',
        carriedCost: '250',
        costKnown: true,
      },
      BRL,
    );
    expect(inFlow?.direction).toBe('INFLOW');
    expect(inFlow?.amount.amount).toBe('250');
    const outFlow = toPositionCapitalFlow(
      {
        type: 'TRANSFER_OUT',
        tradeDate: '2026-03-01',
        quantity: '10',
        carriedCost: '250',
        costKnown: true,
      },
      BRL,
    );
    expect(outFlow?.direction).toBe('OUTFLOW');
    expect(outFlow?.amount.amount).toBe('250');
  });

  it('refuses unknown transfer costs instead of fabricating flows', () => {
    expect(
      toPositionCapitalFlow(
        { type: 'TRANSFER_IN', tradeDate: '2026-03-01', quantity: '10', costKnown: false },
        BRL,
      ),
    ).toBeNull();
    expect(
      toPositionCapitalFlow({ type: 'TRANSFER_OUT', tradeDate: '2026-03-01', quantity: '10' }, BRL),
    ).toBeNull();
  });

  it('ignores income, corporate actions, fees and cash movements like the portfolio engine', () => {
    for (const type of [
      'DIVIDEND',
      'JCP',
      'FII_INCOME',
      'SPLIT',
      'REVERSE_SPLIT',
      'BONUS',
      'AMORTIZATION',
      'FEE',
      'TAX',
      'DEPOSIT',
      'WITHDRAWAL',
    ]) {
      expect(
        toPositionCapitalFlow(
          { type, tradeDate: '2026-01-05', quantity: '10', amount: '100' },
          BRL,
        ),
        type,
      ).toBeNull();
    }
  });
});

describe('Phase 5R-B: position TWR through the shared engine', () => {
  it('computes a buy-and-hold return with the same engine as the portfolio', () => {
    const result = calculatePositionTwr({
      observations: [
        { date: LocalDate.from('2026-01-01'), value: '3000' },
        { date: LocalDate.from('2026-06-30'), value: '3450' },
      ],
      flows: [],
      startDate: LocalDate.from('2026-01-01'),
      endDate: LocalDate.from('2026-06-30'),
      currency: BRL,
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.returnPercentage.value).toBe('15');
  });

  it('neutralizes an end-of-period inflow exactly', () => {
    const result = calculatePositionTwr({
      observations: [
        { date: LocalDate.from('2026-01-01'), value: '1000' },
        { date: LocalDate.from('2026-02-01'), value: '2000' },
      ],
      flows: [{ date: LocalDate.from('2026-02-01'), amount: '1000', direction: 'INFLOW' }],
      startDate: LocalDate.from('2026-01-01'),
      endDate: LocalDate.from('2026-02-01'),
      currency: BRL,
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.returnPercentage.value).toBe('0');
  });

  it('fails closed with a single observation', () => {
    const result = calculatePositionTwr({
      observations: [{ date: LocalDate.from('2026-01-01'), value: '1000' }],
      flows: [],
      startDate: LocalDate.from('2026-01-01'),
      endDate: LocalDate.from('2026-06-30'),
      currency: BRL,
    });
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });
});
