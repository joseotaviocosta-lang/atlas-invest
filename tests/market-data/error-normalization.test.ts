import { describe, it, expect } from 'vitest';
import { normalizeProviderError } from '@atlas/market-data';

describe('MarketData: Error Normalization', () => {
  it('maps 429 to RATE_LIMITED with retryable true', () => {
    const error = normalizeProviderError({ httpStatus: 429 }, { provider: 'STOOQ' });
    expect(error.code).toBe('MARKET_DATA.RATE_LIMITED');
    expect(error.retryable).toBe(true);
  });

  it('maps 503 to PROVIDER_UNAVAILABLE', () => {
    const error = normalizeProviderError({ httpStatus: 503 }, { provider: 'STOOQ' });
    expect(error.code).toBe('MARKET_DATA.PROVIDER_UNAVAILABLE');
  });

  it('maps 404 to SYMBOL_NOT_FOUND', () => {
    const error = normalizeProviderError({ httpStatus: 404 }, { provider: 'STOOQ' });
    expect(error.code).toBe('MARKET_DATA.SYMBOL_NOT_FOUND');
  });

  it('maps timeout to TIMEOUT with retryable true', () => {
    const error = normalizeProviderError({ timedOut: true }, { provider: 'STOOQ' });
    expect(error.code).toBe('MARKET_DATA.TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('maps auth error to AUTHENTICATION_FAILED', () => {
    const error = normalizeProviderError({ httpStatus: 401 }, { provider: 'STOOQ' });
    expect(error.code).toBe('MARKET_DATA.AUTHENTICATION_FAILED');
  });

  it('raw provider error never leaks to consumer', () => {
    const error = normalizeProviderError({ httpStatus: 500 }, { provider: 'STOOQ' });
    expect(error.message).not.toContain('stack');
  });

  it('classifies 4xx client errors as non-retryable', () => {
    const error = normalizeProviderError({ httpStatus: 400 }, { provider: 'STOOQ' });
    expect(error.retryable).toBe(false);
  });
});
