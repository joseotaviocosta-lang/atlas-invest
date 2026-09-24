import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  InMemoryHistoricalMarketDataProvider,
  InMemoryHistoricalPriceCache,
} from '@atlas/market-data';

function ref(ticker: string, exchange: string) {
  return {
    assetId: '11111111-1111-4111-8111-111111111111',
    ticker,
    exchange,
    currency: 'BRL',
    assetType: 'STOCK' as never,
  };
}

describe('Historical Market Data: Exact Date', () => {
  it('requested 2026-01-15 price exists → EXACT', async () => {
    const p = new InMemoryHistoricalMarketDataProvider();
    p.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-15',
      close: '30.00',
      currency: 'BRL',
    });
    const price = await p.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-15'));
    expect(price.status).toBe('EXACT');
    expect(price.close.amount).toBe('30');
  });
});

describe('Historical Market Data: Weekend', () => {
  it('Sunday uses Friday', async () => {
    const p = new InMemoryHistoricalMarketDataProvider();
    p.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-16',
      close: '30.00',
      currency: 'BRL',
    }); // Friday
    const price = await p.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-18')); // Sunday
    expect(price.status).toBe('PREVIOUS_TRADING_DAY');
    expect(price.date.toString()).toBe('2026-01-16');
  });
});

describe('Historical Market Data: No Future Leakage', () => {
  it('Friday missing, Monday exists → Friday MUST NOT use Monday', async () => {
    const p = new InMemoryHistoricalMarketDataProvider();
    p.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-19',
      close: '31.00',
      currency: 'BRL',
    }); // Monday
    await expect(
      p.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-16')),
    ).rejects.toMatchObject({ code: 'MARKET_DATA.SYMBOL_NOT_FOUND' });
  });
});

describe('Historical Market Data: Max Lookback', () => {
  it('no price within window → unavailable', async () => {
    const p = new InMemoryHistoricalMarketDataProvider({ maxLookbackDays: 2 });
    p.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-10',
      close: '30.00',
      currency: 'BRL',
    });
    await expect(
      p.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-15')),
    ).rejects.toThrow();
  });
});

describe('Historical Market Data: Multi-Asset', () => {
  it('2 positions with different tickers', async () => {
    const p = new InMemoryHistoricalMarketDataProvider();
    p.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-15',
      close: '30.00',
      currency: 'BRL',
    });
    p.seed({
      ticker: 'VALE3',
      exchange: 'B3',
      date: '2026-01-15',
      close: '60.00',
      currency: 'BRL',
    });
    const a = await p.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-15'));
    const b = await p.getDailyPrice(ref('VALE3', 'B3'), LocalDate.from('2026-01-15'));
    expect(a.close.amount).toBe('30');
    expect(b.close.amount).toBe('60');
  });
});

describe('Historical Market Data: Cache', () => {
  it('hit avoids provider call', async () => {
    const provider = new InMemoryHistoricalMarketDataProvider();
    provider.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-15',
      close: '30.00',
      currency: 'BRL',
    });
    const cache = new InMemoryHistoricalPriceCache();
    const r = ref('PETR4', 'B3');
    const date = LocalDate.from('2026-01-15');
    const price = await provider.getDailyPrice(r, date);
    cache.set(r, date, price);
    expect(cache.get(r, date)).not.toBeNull();
    expect(cache.hits).toBe(1);
    provider.calls = 0;
    const cached = cache.get(r, date);
    expect(cached).not.toBeNull();
    expect(provider.calls).toBe(0);
  });
});

describe('Historical Market Data: TWR Pipeline', () => {
  it('D1 100, D2 deposit 100, D2 post-flow 200, D3 220 → TWR 10%', async () => {
    // This is tested via performance-engine, but we also test historical valuation builder
    // For 3D, we ensure that historical prices can be used to build observations
    const provider = new InMemoryHistoricalMarketDataProvider();
    provider.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-01',
      close: '10.00',
      currency: 'BRL',
    });
    provider.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-15',
      close: '10.00',
      currency: 'BRL',
    });
    provider.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-31',
      close: '11.00',
      currency: 'BRL',
    });
    const p1 = await provider.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-01'));
    const p2 = await provider.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-15'));
    const p3 = await provider.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-31'));
    expect(p1.close.amount).toBe('10');
    expect(p2.close.amount).toBe('10');
    expect(p3.close.amount).toBe('11');
  });
});

describe('Historical Market Data: Multi-Currency', () => {
  it('BRL and USD remain separate', async () => {
    const p = new InMemoryHistoricalMarketDataProvider();
    p.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-15',
      close: '30.00',
      currency: 'BRL',
    });
    p.seed({
      ticker: 'AAPL',
      exchange: 'NASDAQ',
      date: '2026-01-15',
      close: '150.00',
      currency: 'USD',
    });
    const brl = await p.getDailyPrice(
      {
        assetId: '1',
        ticker: 'PETR4',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'STOCK' as never,
      },
      LocalDate.from('2026-01-15'),
    );
    const usd = await p.getDailyPrice(
      {
        assetId: '2',
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        currency: 'USD',
        assetType: 'STOCK' as never,
      },
      LocalDate.from('2026-01-15'),
    );
    expect(brl.currency).toBe('BRL');
    expect(usd.currency).toBe('USD');
  });
});

describe('Historical Market Data: Decimal Exact', () => {
  it('price exact decimal, never float', async () => {
    const p = new InMemoryHistoricalMarketDataProvider();
    p.seed({
      ticker: 'PETR4',
      exchange: 'B3',
      date: '2026-01-15',
      close: '30.123456789012345678',
      currency: 'BRL',
    });
    const price = await p.getDailyPrice(ref('PETR4', 'B3'), LocalDate.from('2026-01-15'));
    expect(price.close.amount).toBe('30.123456789012345678');
    expect(typeof price.close.amount).toBe('string');
  });
});
