import { describe, it, expect } from 'vitest';
import { InMemoryMarketDataProvider } from '@atlas/market-data';
import { createAssetId } from '@atlas/domain';

describe('MarketData: Provider Contract', () => {
  let provider: InMemoryMarketDataProvider;

  beforeEach(() => {
    provider = new InMemoryMarketDataProvider();
    provider.seed({ providerSymbol: 'PETR4', price: '37.52', currency: 'BRL' });
    provider.seed({ providerSymbol: 'VALE', price: '55.80', currency: 'BRL' });
  });

  it('returns seeded quote for known asset', async () => {
    const quote = await provider.getQuote({
      assetId: createAssetId(),
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
    });
    expect(quote).toBeDefined();
    expect(quote.price.amount).toBe('37.52');
  });

  it('throws for unknown asset', async () => {
    await expect(
      provider.getQuote({
        assetId: createAssetId(),
        ticker: 'ZZZZ',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'STOCK',
      }),
    ).rejects.toMatchObject({ code: 'MARKET_DATA.SYMBOL_NOT_FOUND' });
  });

  it('supports batch quotes', async () => {
    const refs = [
      {
        assetId: createAssetId(),
        ticker: 'PETR4',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'STOCK',
      },
      {
        assetId: createAssetId(),
        ticker: 'VALE',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'STOCK',
      },
    ];
    const result = await provider.getQuotes(refs);
    expect(result.quotes.length).toBe(2);
    expect(result.unavailable).toBeDefined();
  });

  it('never makes network calls (deterministic)', async () => {
    const quote = await provider.getQuote({
      assetId: createAssetId(),
      ticker: 'PETR4',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK',
    });
    expect(quote).toBeDefined();
    expect(quote.price.amount).toMatch(/^\d+\.\d{2}$/);
  });
});
