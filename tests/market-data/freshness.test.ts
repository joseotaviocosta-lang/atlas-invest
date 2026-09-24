import { describe, it, expect } from 'vitest';
import { getQuoteFreshness } from '@atlas/market-data';

describe('MarketData: Freshness', () => {
  it('returns FRESH when asOf within TTL', () => {
    const now = Date.now();
    const freshness = getQuoteFreshness(new Date(now - 60000).toISOString(), now, 300);
    expect(freshness).toBe('FRESH');
  });

  it('returns STALE when asOf beyond TTL', () => {
    const now = Date.now();
    const freshness = getQuoteFreshness(new Date(now - 600000).toISOString(), now, 300);
    expect(freshness).toBe('STALE');
  });

  it('returns UNKNOWN for future-dated asOf', () => {
    const now = Date.now();
    const freshness = getQuoteFreshness(new Date(now + 1000000).toISOString(), now, 300);
    expect(freshness).toBe('UNKNOWN');
  });

  it('stale never presented as fresh', () => {
    const now = Date.now();
    const freshness = getQuoteFreshness(new Date(now - 600000).toISOString(), now, 300);
    expect(freshness).not.toBe('FRESH');
    expect(freshness).toBe('STALE');
  });
});
