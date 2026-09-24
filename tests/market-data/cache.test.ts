import { describe, it, expect } from 'vitest';
import {
  InMemoryQuoteCache,
  createMarketQuote,
  buildMarketQuoteCacheKey,
} from '@atlas/market-data';
import { createAssetId } from '@atlas/domain';

describe('MarketData: Cache', () => {
  let cache: InMemoryQuoteCache;

  beforeEach(() => {
    cache = new InMemoryQuoteCache();
  });

  it('miss returns null', () => {
    const result = cache.get('STOOQ::PETR4.SA');
    expect(result).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });

  it('hit returns cached quote', () => {
    const now = () => 1000000;
    const cache2 = new InMemoryQuoteCache(now);
    const quote = createMarketQuote({
      assetId: createAssetId(),
      price: '37.52',
      currency: 'BRL',
      asOf: '2026-09-15',
      receivedAt: '2026-09-15T15:31:00Z',
      source: 'IN_MEMORY',
      status: 'LIVE',
      providerSymbol: 'PETR4.SA',
    });
    cache2.set('STOOQ::PETR4.SA', quote, 300);
    const result = cache2.get('STOOQ::PETR4.SA');
    expect(result).toBeDefined();
    expect(result!.price.amount).toBe('37.52');
    expect(cache2.stats().hits).toBe(1);
  });

  it('expired entry returns null', () => {
    let nowMs = 1000000;
    const clock = () => nowMs;
    const cache2 = new InMemoryQuoteCache(clock);
    const quote = createMarketQuote({
      assetId: createAssetId(),
      price: '37.52',
      currency: 'BRL',
      asOf: '2026-09-15',
      receivedAt: '2026-09-15T15:31:00Z',
      source: 'IN_MEMORY',
      status: 'LIVE',
      providerSymbol: 'PETR4.SA',
    });
    cache2.set('STOOQ::PETR4.SA', quote, 0);
    nowMs = 1000100; // advance past TTL=0 expiry
    const result = cache2.get('STOOQ::PETR4.SA');
    expect(result).toBeNull();
  });

  it('deterministic cache key', () => {
    const key1 = buildMarketQuoteCacheKey('STOOQ', 'PETR4.SA');
    const key2 = buildMarketQuoteCacheKey('STOOQ', 'PETR4.SA');
    expect(key1).toBe(key2);
    expect(key1).toBe('STOOQ::PETR4.SA');
  });

  it('clear resets stats', () => {
    const now = () => 1000000;
    const cache2 = new InMemoryQuoteCache(now);
    const quote = createMarketQuote({
      assetId: createAssetId(),
      price: '37.52',
      currency: 'BRL',
      asOf: '2026-09-15',
      receivedAt: '2026-09-15T15:31:00Z',
      source: 'IN_MEMORY',
      status: 'LIVE',
      providerSymbol: 'PETR4.SA',
    });
    cache2.set('STOOQ::PETR4.SA', quote, 300);
    cache2.get('STOOQ::PETR4.SA');
    cache2.clear();
    expect(cache2.stats().size).toBe(0);
  });
});
