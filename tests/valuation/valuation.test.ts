import { describe, it, expect } from 'vitest';
import {
  valuePosition,
  valuePortfolio,
  ValuationQuote,
  PositionValuationInput,
} from '@atlas/valuation-engine';

const makeQuote = (overrides: Partial<ValuationQuote> = {}): ValuationQuote => ({
  assetId: '11111111-1111-4111-8111-111111111111',
  price: '40.00',
  currency: 'BRL' as never,
  asOf: '2026-09-15T15:30:00Z',
  receivedAt: '2026-09-15T15:31:00Z',
  source: 'IN_MEMORY',
  status: 'LIVE' as never,
  freshness: 'FRESH' as never,
  providerSymbol: 'PETR4.SA',
  ...overrides,
});

const makePos = (overrides: Partial<PositionValuationInput> = {}): PositionValuationInput => ({
  assetId: '11111111-1111-4111-8111-111111111111',
  accountId: 'acc1',
  quantity: '100',
  currency: 'BRL' as never,
  totalCost: '3000.00',
  averageCost: '30.00',
  costBasisStatus: 'KNOWN',
  ...overrides,
});

describe('Valuation: Position', () => {
  it('normal: quantity 100 × price 40 = marketValue 4000, unrealized 1000, percent 33.333', () => {
    const pos = makePos();
    const quote = makeQuote();
    const v = valuePosition(pos, quote);
    expect(v.marketValue).toEqual({ amount: '4000', currency: 'BRL' });
    expect(v.unrealizedGainLoss).toEqual({ amount: '1000', currency: 'BRL' });
    expect(v.unrealizedGainLossPercent).toMatch(/^33\.33+/);
    expect(v.status).toBe('VALUED');
  });

  it('quote unavailable: marketValue null, unrealized null', () => {
    const pos = makePos();
    const v = valuePosition(pos, null);
    expect(v.marketValue).toBeNull();
    expect(v.unrealizedGainLoss).toBeNull();
    expect(v.unrealizedGainLossPercent).toBeNull();
    expect(v.status).toBe('QUOTE_UNAVAILABLE');
  });

  it('stale quote: still valued but status QUOTE_STALE', () => {
    const pos = makePos();
    const quote = makeQuote({ freshness: 'STALE' as never, status: 'STALE' as never });
    const v = valuePosition(pos, quote);
    expect(v.marketValue).toEqual({ amount: '4000', currency: 'BRL' });
    expect(v.status).toBe('QUOTE_STALE');
    expect(v.quoteFreshness).toBe('STALE');
  });

  it('incomplete cost: marketValue exists but unrealized null', () => {
    const pos = makePos({ costBasisStatus: 'INCOMPLETE', totalCost: null, averageCost: null });
    const quote = makeQuote();
    const v = valuePosition(pos, quote);
    expect(v.marketValue).toEqual({ amount: '4000', currency: 'BRL' });
    expect(v.unrealizedGainLoss).toBeNull();
    expect(v.unrealizedGainLossPercent).toBeNull();
    expect(v.status).toBe('COST_INCOMPLETE');
  });

  it('zero known cost: unrealized = marketValue, percent null (no div by zero)', () => {
    const pos = makePos({ totalCost: '0', averageCost: '0', costBasisStatus: 'KNOWN' });
    const quote = makeQuote({ price: '40.00' });
    const v = valuePosition(pos, quote);
    expect(v.marketValue).toEqual({ amount: '4000', currency: 'BRL' });
    expect(v.unrealizedGainLoss).toEqual({ amount: '4000', currency: 'BRL' });
    expect(v.unrealizedGainLossPercent).toBeNull();
    expect(v.status).toBe('VALUED');
  });

  it('currency mismatch: no marketValue, no unrealized', () => {
    const pos = makePos({ currency: 'BRL' as never });
    const quote = makeQuote({ currency: 'USD' as never, price: '10.00' });
    const v = valuePosition(pos, quote);
    expect(v.marketValue).toBeNull();
    expect(v.unrealizedGainLoss).toBeNull();
    expect(v.status).toBe('CURRENCY_MISMATCH');
  });

  it('loss: unrealized negative and percent negative', () => {
    const pos = makePos({ totalCost: '5000.00' });
    const quote = makeQuote({ price: '40.00' }); // 4000 market < 5000 cost
    const v = valuePosition(pos, quote);
    expect(v.unrealizedGainLoss).toEqual({ amount: '-1000', currency: 'BRL' });
    expect(v.unrealizedGainLossPercent).toBe('-20');
  });

  it('multi-currency: BRL and USD never mixed', () => {
    const brlPos = makePos({
      assetId: 'aaa',
      currency: 'BRL' as never,
      quantity: '10',
      totalCost: '100.00',
    });
    const usdPos = makePos({
      assetId: 'bbb',
      currency: 'USD' as never,
      quantity: '5',
      totalCost: '50.00',
    });
    const brlQuote = makeQuote({ assetId: 'aaa', price: '15.00', currency: 'BRL' as never });
    const usdQuote = makeQuote({ assetId: 'bbb', price: '20.00', currency: 'USD' as never });
    const brlVal = valuePosition(brlPos, brlQuote);
    const usdVal = valuePosition(usdPos, usdQuote);
    expect(brlVal.marketValue?.currency).toBe('BRL');
    expect(usdVal.marketValue?.currency).toBe('USD');
    expect(brlVal.marketValue?.amount).toBe('150');
    expect(usdVal.marketValue?.amount).toBe('100');
  });

  it('uses exact decimal, no float: 0.1 + 0.2 precision', () => {
    const pos = makePos({ quantity: '0.100000000000000001', totalCost: '1.00' });
    const quote = makeQuote({ price: '10.123456789012345678' });
    const v = valuePosition(pos, quote);
    // Should not lose precision due to float
    expect(v.marketValue).not.toBeNull();
    expect(v.marketValue?.amount).not.toContain('e');
  });
});

describe('Valuation: Percent', () => {
  it('gain percent exact', () => {
    const pos = makePos({ quantity: '10', totalCost: '100.00' });
    const quote = makeQuote({ price: '15.00' }); // market 150, cost 100, gain 50, 50%
    const v = valuePosition(pos, quote);
    expect(v.unrealizedGainLossPercent).toBe('50');
  });

  it('loss percent', () => {
    const pos = makePos({ quantity: '10', totalCost: '200.00' });
    const quote = makeQuote({ price: '15.00' }); // 150 market, -50, -25%
    const v = valuePosition(pos, quote);
    expect(v.unrealizedGainLossPercent).toBe('-25');
  });

  it('zero cost → percent null', () => {
    const pos = makePos({ totalCost: '0' });
    const v = valuePosition(pos, makeQuote());
    expect(v.unrealizedGainLossPercent).toBeNull();
  });

  it('unknown cost → percent null', () => {
    const pos = makePos({ costBasisStatus: 'INCOMPLETE', totalCost: null });
    const v = valuePosition(pos, makeQuote());
    expect(v.unrealizedGainLossPercent).toBeNull();
  });
});

describe('Valuation: Portfolio Totals', () => {
  it('BRL only: sums correctly', () => {
    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'a1', quantity: '10', totalCost: '100.00', currency: 'BRL' as never }),
      makePos({ assetId: 'a2', quantity: '5', totalCost: '50.00', currency: 'BRL' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['a1', makeQuote({ assetId: 'a1', price: '15.00', currency: 'BRL' as never })],
      ['a2', makeQuote({ assetId: 'a2', price: '20.00', currency: 'BRL' as never })],
    ]);
    const v = valuePortfolio({ portfolioId: 'p1', positions, accountPositions: new Map(), quotes });
    const brl = v.totalsByCurrency['BRL'];
    expect(brl.marketValue.amount).toBe('250'); // 150 + 100
    expect(brl.knownCost.amount).toBe('150');
    expect(brl.unrealizedGainLoss?.amount).toBe('100');
  });

  it('USD only', () => {
    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'u1', quantity: '2', totalCost: '100.00', currency: 'USD' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['u1', makeQuote({ assetId: 'u1', price: '60.00', currency: 'USD' as never })],
    ]);
    const v = valuePortfolio({ portfolioId: 'p1', positions, accountPositions: new Map(), quotes });
    expect(v.totalsByCurrency['USD'].marketValue.amount).toBe('120');
  });

  it('BRL + USD segregated, never summed', () => {
    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'b1', quantity: '10', totalCost: '100.00', currency: 'BRL' as never }),
      makePos({ assetId: 'u1', quantity: '2', totalCost: '100.00', currency: 'USD' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['b1', makeQuote({ assetId: 'b1', price: '15.00', currency: 'BRL' as never })],
      ['u1', makeQuote({ assetId: 'u1', price: '60.00', currency: 'USD' as never })],
    ]);
    const v = valuePortfolio({ portfolioId: 'p1', positions, accountPositions: new Map(), quotes });
    expect(Object.keys(v.totalsByCurrency)).toEqual(expect.arrayContaining(['BRL', 'USD']));
    expect(v.totalsByCurrency['BRL'].marketValue.amount).toBe('150');
    expect(v.totalsByCurrency['USD'].marketValue.amount).toBe('120');
    expect(v.totalsByCurrency['BRL'].marketValue.currency).toBe('BRL');
    expect(v.totalsByCurrency['USD'].marketValue.currency).toBe('USD');
  });

  it('partial quote: 10 pos, 8 valued, 2 unavailable → PARTIAL_QUOTES', () => {
    const positions: PositionValuationInput[] = Array.from({ length: 10 }, (_, i) =>
      makePos({ assetId: `a${i}`, quantity: '1', totalCost: '10.00' }),
    );
    const quotes = new Map<string, ValuationQuote>();
    for (let i = 0; i < 8; i++) {
      quotes.set(`a${i}`, makeQuote({ assetId: `a${i}`, price: '12.00' }));
    }
    const v = valuePortfolio({ portfolioId: 'p1', positions, accountPositions: new Map(), quotes });
    expect(v.completeness).toBe('PARTIAL_QUOTES');
    expect(v.summary.valuedPositions).toBe(8);
    expect(v.summary.unavailablePositions).toBe(2);
    expect(v.totalsByCurrency['BRL'].marketValue.amount).toBe('96'); // 8*12
  });

  it('partial cost: some incomplete', () => {
    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'a1', costBasisStatus: 'KNOWN', totalCost: '100.00' }),
      makePos({ assetId: 'a2', costBasisStatus: 'INCOMPLETE', totalCost: null }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['a1', makeQuote({ assetId: 'a1', price: '15.00' })],
      ['a2', makeQuote({ assetId: 'a2', price: '20.00' })],
    ]);
    const v = valuePortfolio({ portfolioId: 'p1', positions, accountPositions: new Map(), quotes });
    expect(v.completeness).toBe('PARTIAL_COST');
  });
});

describe('Valuation: Account Totals', () => {
  it('aggregates per account and portfolio', () => {
    const accPos1 = [
      makePos({ assetId: 'a1', accountId: 'acc1', quantity: '10', totalCost: '100.00' }),
    ];
    const accPos2 = [
      makePos({ assetId: 'a2', accountId: 'acc2', quantity: '5', totalCost: '50.00' }),
    ];
    const all = [...accPos1, ...accPos2];
    const quotes = new Map<string, ValuationQuote>([
      ['a1', makeQuote({ assetId: 'a1', price: '12.00', currency: 'BRL' as never })],
      ['a2', makeQuote({ assetId: 'a2', price: '12.00', currency: 'BRL' as never })],
    ]);
    const v = valuePortfolio({
      portfolioId: 'p1',
      positions: all,
      accountPositions: new Map([
        ['acc1', accPos1],
        ['acc2', accPos2],
      ]),
      quotes,
    });
    expect(v.accounts.length).toBe(2);
    expect(v.accounts[0].totalsByCurrency['BRL'].marketValue.amount).toBe('120');
    expect(v.accounts[1].totalsByCurrency['BRL'].marketValue.amount).toBe('60');
    expect(v.totalsByCurrency['BRL'].marketValue.amount).toBe('180');
  });
});

describe('Valuation: No Float Guard', () => {
  it('never uses parseFloat or Number for financial math', () => {
    const pos = makePos({ quantity: '100.123456789012345678', totalCost: '1234.567890123456789' });
    const quote = makeQuote({ price: '12.34567890123456789' });
    const v = valuePosition(pos, quote);
    // Amounts are serialized as strings, never numbers
    expect(typeof v.marketValue?.amount).toBe('string');
    expect(typeof v.unrealizedGainLoss?.amount).toBe('string');
    expect(typeof v.unrealizedGainLossPercent).toBe('string');
  });
});
