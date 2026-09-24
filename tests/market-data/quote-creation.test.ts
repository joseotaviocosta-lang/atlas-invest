import { describe, it, expect } from 'vitest';
import { createMarketQuote } from '@atlas/market-data';
import { createAssetId } from '@atlas/domain';

describe('MarketData: Quote Creation', () => {
  it('creates a valid MarketQuote with exact decimal price string', () => {
    const quote = createMarketQuote({
      assetId: 'c9d7e5b0-5a75-42fb-8b7c-123456789abc',
      price: '37.52',
      currency: 'BRL',
      asOf: '2026-09-15',
      receivedAt: '2026-09-15T15:31:00Z',
      marketTime: '2026-09-15T15:30:00Z',
      source: 'IN_MEMORY',
      status: 'LIVE',
      providerSymbol: 'PETR4.SA',
    });
    expect(quote.price.amount).toBe('37.52');
    expect(quote.status).toBe('LIVE');
    expect(quote.freshness).toBe('FRESH');
  });

  it('rejects negative price', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: '-5.00',
        currency: 'BRL',
        asOf: '2026-09-15',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_PRICE');
    }
  });

  it('rejects zero price', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: '0.00',
        currency: 'BRL',
        asOf: '2026-09-15',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_PRICE');
    }
  });

  it('rejects non-decimal price string', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: 'not-a-number',
        currency: 'BRL',
        asOf: '2026-09-15',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_PRICE');
    }
  });

  it('rejects invalid asOf timestamp (not-a-valid-timestamp)', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: '10.00',
        currency: 'BRL',
        asOf: 'not-a-valid-timestamp',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_TIMESTAMP');
    }
  });

  it('rejects impossible calendar date 2026-02-30T10:00:00Z', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: '10.00',
        currency: 'BRL',
        asOf: '2026-02-30T10:00:00Z',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_TIMESTAMP');
    }
  });

  it('rejects invalid month 2026-13-01T10:00:00Z', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: '10.00',
        currency: 'BRL',
        asOf: '2026-13-01T10:00:00Z',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_TIMESTAMP');
    }
  });

  it('rejects generic invalid string', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: '10.00',
        currency: 'BRL',
        asOf: 'invalid',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_TIMESTAMP');
    }
  });

  it('rejects empty string timestamp', () => {
    try {
      createMarketQuote({
        assetId: createAssetId(),
        price: '10.00',
        currency: 'BRL',
        asOf: '',
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('MARKET_DATA.INVALID_TIMESTAMP');
    }
  });

  it('accepts valid UUID assetId', () => {
    const quote = createMarketQuote({
      assetId: 'c9d7e5b0-5a75-42fb-8b7c-123456789abc',
      price: '15.25',
      currency: 'USD',
      asOf: '2026-09-15',
      receivedAt: '2026-09-15T15:31:00Z',
      source: 'IN_MEMORY',
      status: 'LIVE',
      providerSymbol: 'AAPL',
    });
    expect(quote.assetId).toBe('c9d7e5b0-5a75-42fb-8b7c-123456789abc');
  });

  it('accepts valid instants: date-only, ISO UTC, and milliseconds', () => {
    const validInstants = [
      '2026-09-15',
      '2026-09-15T15:31:00Z',
      '2026-09-15T15:31:00.123Z',
      '2024-02-29T10:00:00Z',
    ];
    for (const instant of validInstants) {
      const quote = createMarketQuote({
        assetId: createAssetId(),
        price: '10.00',
        currency: 'BRL',
        asOf: instant,
        receivedAt: '2026-09-15T15:31:00Z',
        source: 'IN_MEMORY',
        status: 'LIVE',
        providerSymbol: 'PETR4.SA',
      });
      expect(quote.asOf).toBe(instant);
    }
  });
});
