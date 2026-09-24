import { describe, it, expect } from 'vitest';
import { InMemoryMarketDataProvider, MarketDataService } from '@atlas/market-data';
import { createAssetId } from '@atlas/domain';

describe('MarketData: Batch and Partial Success', () => {
  let provider: InMemoryMarketDataProvider;

  beforeEach(() => {
    provider = new InMemoryMarketDataProvider();
    provider.seed({ providerSymbol: 'PETR4', price: '37.52', currency: 'BRL' });
    provider.seed({ providerSymbol: 'VALE', price: '55.80', currency: 'BRL' });
  });

  it('batch with valid and invalid assets returns partial result', async () => {
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
        ticker: 'ZZZZ',
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
    const total = result.quotes.length + result.unavailable.length;
    expect(total).toBe(refs.length);
  });

  it('batch does not fail entirely when some assets are unavailable', async () => {
    const refs = [
      {
        assetId: createAssetId(),
        ticker: 'UNKNOWN1',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'STOCK',
      },
      {
        assetId: createAssetId(),
        ticker: 'UNKNOWN2',
        exchange: 'B3',
        currency: 'BRL',
        assetType: 'STOCK',
      },
    ];
    const result = await provider.getQuotes(refs);
    expect(result.unavailable.length).toBeGreaterThan(0);
    expect(result.quotes.length).toBe(0);
  });

  it('enforces batch limit', async () => {
    const service = new MarketDataService({
      provider,
      config: { provider: 'IN_MEMORY', timeoutMs: 8000, cacheTtlSeconds: 60, maxBatchSize: 100 },
    });
    const manyRefs = Array.from({ length: 101 }, () => ({
      assetId: createAssetId(),
      ticker: 'TICK',
      exchange: 'B3',
      currency: 'BRL',
      assetType: 'STOCK' as const,
    }));
    await expect(service.getQuotes(manyRefs)).rejects.toMatchObject({
      code: 'MARKET_DATA.BATCH_LIMIT_EXCEEDED',
    });
  });
});
