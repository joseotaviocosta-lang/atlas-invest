import { describe, it, expect } from 'vitest';
import {
  BrapiProviderAdapter,
  BrapiHistoricalMarketDataProvider,
  toCanonicalDecimalString,
  normalizeTradingDate,
  MarketDataError,
} from '@atlas/market-data';
import { LocalDate } from '@atlas/domain';

describe('Market Data: BRAPI Provider Adapter & Helpers', () => {
  describe('toCanonicalDecimalString', () => {
    it('normalizes valid decimal numbers and strips IEEE floating-point noise', () => {
      expect(toCanonicalDecimalString(38.45)).toBe('38.45');
      expect(toCanonicalDecimalString(38.45 + 0.000000000000002)).toBe('38.45');
      expect(toCanonicalDecimalString(50)).toBe('50');
      expect(toCanonicalDecimalString(0.1 + 0.2)).toBe('0.3');
    });

    it('passes through canonical decimal strings', () => {
      expect(toCanonicalDecimalString('38.45')).toBe('38.45');
      expect(toCanonicalDecimalString('123456789.123456')).toBe('123456789.123456');
    });

    it('returns null for null, undefined, empty or whitespace strings', () => {
      expect(toCanonicalDecimalString(null)).toBeNull();
      expect(toCanonicalDecimalString(undefined)).toBeNull();
      expect(toCanonicalDecimalString('')).toBeNull();
      expect(toCanonicalDecimalString('   ')).toBeNull();
      expect(toCanonicalDecimalString('null')).toBeNull();
    });

    it('throws MARKET_DATA.INVALID_PRICE for non-numeric strings or infinite numbers', () => {
      expect(() => toCanonicalDecimalString('abc')).toThrow(MarketDataError);
      expect(() => toCanonicalDecimalString('12.34.56')).toThrow(MarketDataError);
      expect(() => toCanonicalDecimalString(Infinity)).toThrow(MarketDataError);
      expect(() => toCanonicalDecimalString(NaN)).toThrow(MarketDataError);
    });
  });

  describe('normalizeTradingDate', () => {
    it('normalizes ISO string timestamps to America/Sao_Paulo calendar date', () => {
      // 2026-10-15 21:00:00 UTC = 2026-10-15 18:00:00 BRT
      const d1 = normalizeTradingDate('2026-10-15T21:00:00.000Z');
      expect(d1.toString()).toBe('2026-10-15');

      // 2026-10-16 01:00:00 UTC = 2026-10-15 22:00:00 BRT (previous calendar day in Sao Paulo)
      const d2 = normalizeTradingDate('2026-10-16T01:00:00.000Z');
      expect(d2.toString()).toBe('2026-10-15');
    });

    it('normalizes unix epoch seconds and milliseconds', () => {
      // 1760551200 seconds = 2025-10-15T18:00:00.000Z (which is 15:00 BRT)
      const tsSec = 1760551200;
      const d = normalizeTradingDate(tsSec);
      expect(d).toBeInstanceOf(LocalDate);
    });
  });

  describe('BrapiProviderAdapter: getQuotes', () => {
    it('successfully normalizes a valid EOD quote response from BRAPI', async () => {
      const mockFetch: typeof fetch = async (input, _init) => {
        const url = String(input);
        expect(url).toContain('/quote/PETR4');
        return new Response(
          JSON.stringify({
            results: [
              {
                symbol: 'PETR4',
                currency: 'BRL',
                regularMarketPrice: 38.45,
                regularMarketOpen: 37.9,
                regularMarketDayHigh: 38.7,
                regularMarketDayLow: 37.8,
                regularMarketVolume: 12500000,
                regularMarketTime: '2026-10-15T18:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const adapter = new BrapiProviderAdapter({
        fetchFn: mockFetch,
        token: 'secret-token-xyz',
      });

      const res = await adapter.getQuotes([
        {
          assetId: '11111111-1111-4111-8111-111111111111',
          ticker: 'PETR4',
          exchange: 'B3',
          currency: 'BRL',
          assetType: 'STOCK',
        },
      ]);

      expect(res.quotes).toHaveLength(1);
      expect(res.unavailable).toHaveLength(0);

      const quote = res.quotes[0]!;
      expect(quote.assetId).toBe('11111111-1111-4111-8111-111111111111');
      expect(quote.price.amount).toBe('38.45');
      expect(quote.currency).toBe('BRL');
      expect(quote.source).toBe('BRAPI');
      expect(quote.status).toBe('EOD');
      expect(quote.providerSymbol).toBe('PETR4');
    });

    it('maps 401/403 with MISSING_TOKEN to MARKET_DATA.AUTHENTICATION_REQUIRED', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            message: 'Authentication token required for this ticker',
            code: 'MISSING_TOKEN',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });

      const res = await adapter.getQuotes([
        {
          assetId: '22222222-2222-4222-8222-222222222222',
          ticker: 'HGLG11',
          exchange: 'B3',
          currency: 'BRL',
          assetType: 'FII',
        },
      ]);

      expect(res.quotes).toHaveLength(0);
      expect(res.unavailable).toHaveLength(1);
      expect(res.unavailable[0]!.code).toBe('MARKET_DATA.AUTHENTICATION_REQUIRED');
      expect(res.unavailable[0]!.retryable).toBe(false);
    });

    it('maps 404 to MARKET_DATA.SYMBOL_NOT_FOUND', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ message: 'Ticker not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });

      const res = await adapter.getQuotes([
        {
          assetId: '33333333-3333-4333-8333-333333333333',
          ticker: 'NONEXISTENT99',
          exchange: 'B3',
          currency: 'BRL',
          assetType: 'STOCK',
        },
      ]);

      expect(res.quotes).toHaveLength(0);
      expect(res.unavailable).toHaveLength(1);
      expect(res.unavailable[0]!.code).toBe('MARKET_DATA.SYMBOL_NOT_FOUND');
    });

    it('maps 429 to MARKET_DATA.RATE_LIMITED with retryable=true', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });

      const res = await adapter.getQuotes([
        {
          assetId: '44444444-4444-4444-8444-444444444444',
          ticker: 'VALE3',
          exchange: 'B3',
          currency: 'BRL',
          assetType: 'STOCK',
        },
      ]);

      expect(res.quotes).toHaveLength(0);
      expect(res.unavailable).toHaveLength(1);
      expect(res.unavailable[0]!.code).toBe('MARKET_DATA.RATE_LIMITED');
      expect(res.unavailable[0]!.retryable).toBe(true);
    });

    it('rejects invalid or non-positive price with MARKET_DATA.INVALID_PRICE', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                symbol: 'PETR4',
                currency: 'BRL',
                regularMarketPrice: 0,
                regularMarketTime: '2026-10-15T18:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });

      const res = await adapter.getQuotes([
        {
          assetId: '55555555-5555-4555-8555-555555555555',
          ticker: 'PETR4',
          exchange: 'B3',
          currency: 'BRL',
          assetType: 'STOCK',
        },
      ]);

      expect(res.quotes).toHaveLength(0);
      expect(res.unavailable).toHaveLength(1);
      expect(res.unavailable[0]!.code).toBe('MARKET_DATA.INVALID_PRICE');
    });

    it('never leaks api token in headers or query to exceptions', async () => {
      const token = 'super-secret-brapi-key-12345';
      let capturedAuth = '';
      const mockFetch: typeof fetch = async (_input, init) => {
        capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
        throw new Error('Network crash');
      };

      const adapter = new BrapiProviderAdapter({
        token,
        fetchFn: mockFetch,
      });

      const res = await adapter.getQuotes([
        {
          assetId: '66666666-6666-4666-8666-666666666666',
          ticker: 'PETR4',
          exchange: 'B3',
          currency: 'BRL',
          assetType: 'STOCK',
        },
      ]);

      expect(capturedAuth).toBe(`Bearer ${token}`);
      expect(res.unavailable).toHaveLength(1);
      expect(res.unavailable[0]!.code).toBe('MARKET_DATA.PROVIDER_UNAVAILABLE');
      // Verify token is NOT leaked in string representations
      expect(JSON.stringify(res)).not.toContain(token);
    });
  });

  describe('BrapiHistoricalMarketDataProvider', () => {
    it('fetches historical unadjusted daily bars within date range', async () => {
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input);
        expect(url).toContain('/quote/VALE3');
        expect(url).toContain('interval=1d');

        return new Response(
          JSON.stringify({
            results: [
              {
                symbol: 'VALE3',
                currency: 'BRL',
                historicalDataPrice: [
                  {
                    date: 1760464800, // 2025-10-14
                    close: 62.1,
                    open: 61.5,
                    high: 62.5,
                    low: 61.2,
                    volume: 8000000,
                  },
                  {
                    date: 1760551200, // 2025-10-15
                    close: 63.5,
                    open: 62.0,
                    high: 63.8,
                    low: 61.9,
                    volume: 9500000,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const provider = new BrapiHistoricalMarketDataProvider({ fetchFn: mockFetch });

      const prices = await provider.getDailyPrices(
        {
          assetId: '77777777-7777-4777-8777-777777777777',
          ticker: 'VALE3',
          exchange: 'B3',
          currency: 'BRL',
          assetType: 'STOCK',
        },
        LocalDate.from('2025-10-14'),
        LocalDate.from('2025-10-15'),
      );

      expect(prices).toHaveLength(2);
      expect(prices[0]!.close.amount).toBe('62.1');
      expect(prices[0]!.currency).toBe('BRL');
      expect(prices[0]!.status).toBe('EXACT');
      expect(prices[1]!.close.amount).toBe('63.5');
      expect(prices[1]!.status).toBe('EXACT');
    });
  });
});
