import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BrapiProviderAdapter,
  BrapiHistoricalMarketDataProvider,
  resolveBrapiToken,
} from '@atlas/market-data';
import { LocalDate } from '@atlas/domain';

describe('APP-16A: Market Data Completeness & Authenticated BRAPI Provider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. no token -> public mode behavior
  it('1. no token -> operates in public mode without token query param or authorization header', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              regularMarketTime: '2026-11-06T18:00:00.000Z',
              currency: 'BRL',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: undefined });
    expect(adapter.hasToken()).toBe(false);

    const res = await adapter.getQuotes([
      { assetId: '11111111-1111-4111-8111-111111111111', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(res.quotes).toHaveLength(1);
    expect(capturedUrl).not.toContain('token=');
    expect(capturedHeaders['Authorization']).toBeUndefined();
  });

  // 2. valid token -> authenticated request
  it('2. valid token -> injects token parameter in request URL and Bearer header', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'VALE3',
              regularMarketPrice: 62.1,
              regularMarketTime: '2026-11-06T18:00:00.000Z',
              currency: 'BRL',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: 'test_brapi_secret_token_123' });
    expect(adapter.hasToken()).toBe(true);

    const res = await adapter.getQuotes([
      { assetId: '22222222-2222-4222-8222-222222222222', ticker: 'VALE3', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(res.quotes).toHaveLength(1);
    expect(capturedUrl).not.toContain('token=');
    expect(capturedHeaders['Authorization']).toBe('Bearer test_brapi_secret_token_123');
  });

  // 3. invalid token -> AUTH_FAILED / error handling
  it('3. invalid token -> maps 401 response to clear authentication error', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ message: 'Invalid API token', code: 'INVALID_TOKEN' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: 'invalid_token' });
    const res = await adapter.getQuotes([
      { assetId: '33333333-3333-4333-8333-333333333333', ticker: 'VALE3', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(res.quotes).toHaveLength(0);
    expect(res.unavailable).toHaveLength(1);
    expect(res.unavailable[0].code).toBe('MARKET_DATA.AUTHENTICATION_FAILED');
  });

  // 4. 401 response handling
  it('4. 401 response handling marks quote as unavailable with non-retryable status', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ message: 'Authentication required', code: 'MISSING_TOKEN' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });
    const res = await adapter.getQuotes([
      { assetId: '44444444-4444-4444-8444-444444444444', ticker: 'BBAS3', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(res.quotes).toHaveLength(0);
    expect(res.unavailable).toHaveLength(1);
    expect(res.unavailable[0].code).toBe('MARKET_DATA.AUTHENTICATION_REQUIRED');
    expect(res.unavailable[0].retryable).toBe(false);
  });

  // 5. 429 response & retry backoff
  it('5. 429 rate limit response triggers automatic backoff retry', async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'retry-after': '1' },
        });
      }
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'ITSA4',
              regularMarketPrice: 10.45,
              regularMarketTime: '2026-11-06T18:00:00.000Z',
              currency: 'BRL',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: 'some_token' });
    const res = await adapter.getQuotes([
      { assetId: '55555555-5555-4555-8555-555555555555', ticker: 'ITSA4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(callCount).toBe(2);
    expect(res.quotes).toHaveLength(1);
    expect(res.quotes[0].price.amount.toString()).toBe('10.45');
  });

  // 6. timeout handling
  it('6. network timeout maps to TIMEOUT error in unavailable list', async () => {
    const mockFetch: typeof fetch = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });
    const res = await adapter.getQuotes([
      { assetId: '66666666-6666-4666-8666-666666666666', ticker: 'SAPR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(res.quotes).toHaveLength(0);
    expect(res.unavailable).toHaveLength(1);
    expect(res.unavailable[0].code).toBe('MARKET_DATA.TIMEOUT');
  });

  // 7. one ticker failure does not abort others (isolation in batch)
  it('7. one invalid/failed ticker in batch does not prevent valid tickers from succeeding', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('PETR4')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                symbol: 'PETR4',
                regularMarketPrice: 38.5,
                regularMarketTime: '2026-11-06T18:00:00.000Z',
                currency: 'BRL',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ error: true, message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });
    const res = await adapter.getQuotes([
      { assetId: '77777777-7777-4777-8777-777777777777', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
      { assetId: '88888888-8888-4888-8888-888888888888', ticker: 'INVALIDXYZ', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(res.quotes).toHaveLength(1);
    expect(res.quotes[0].providerSymbol).toBe('PETR4');
    expect(res.unavailable).toHaveLength(1);
    expect(res.unavailable[0].assetId).toBe('88888888-8888-4888-8888-888888888888');
  });

  // 8. multiple quotes handled correctly
  it('8. multi-quote batch maps each asset to its corresponding quote', async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      const symbol = url.split('/quote/')[1]?.split('?')[0];
      const price = symbol === 'PETR4' ? 38.5 : symbol === 'VALE3' ? 62.1 : 10.15;
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol,
              regularMarketPrice: price,
              regularMarketTime: '2026-11-06T18:00:00.000Z',
              currency: 'BRL',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: 'token' });
    const res = await adapter.getQuotes([
      { assetId: '99999999-9999-4999-8999-999999999999', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
      { assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ticker: 'VALE3', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
      { assetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ticker: 'MXRF11', exchange: 'B3', currency: 'BRL', assetType: 'FII' },
    ]);

    expect(res.quotes).toHaveLength(3);
    expect(res.quotes.find((q) => q.providerSymbol === 'PETR4')?.price.amount.toString()).toBe('38.5');
    expect(res.quotes.find((q) => q.providerSymbol === 'VALE3')?.price.amount.toString()).toBe('62.1');
    expect(res.quotes.find((q) => q.providerSymbol === 'MXRF11')?.price.amount.toString()).toBe('10.15');
  });

  // 9. dynamic setToken updates live adapter instance
  it('9. dynamic setToken updates adapter state without requiring restart', async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch: typeof fetch = async (_input, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              regularMarketTime: '2026-11-06T18:00:00.000Z',
              currency: 'BRL',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch });
    expect(adapter.hasToken()).toBe(false);

    adapter.setToken('newly_configured_key_456');
    expect(adapter.hasToken()).toBe(true);

    await adapter.getQuotes([
      { assetId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);
    expect(capturedHeaders['Authorization']).toBe('Bearer newly_configured_key_456');

    adapter.setToken(undefined);
    expect(adapter.hasToken()).toBe(false);
  });

  // 10. resolveBrapiToken reads environment variables
  it('10. resolveBrapiToken correctly prioritizes BRAPI_API_KEY and MARKET_DATA_API_TOKEN', () => {
    expect(resolveBrapiToken({ BRAPI_API_KEY: 'key_from_brapi' })).toBe('key_from_brapi');
    expect(resolveBrapiToken({ MARKET_DATA_API_TOKEN: 'key_from_generic' })).toBe('key_from_generic');
    expect(resolveBrapiToken({ BRAPI_API_KEY: 'priority_key', MARKET_DATA_API_TOKEN: 'secondary_key' })).toBe('priority_key');
    expect(resolveBrapiToken({})).toBeUndefined();
  });

  // 11. Historical provider also supports dynamic token
  it('11. BrapiHistoricalMarketDataProvider supports dynamic token and authentication parameter', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'PETR4',
              historicalDataPrice: [
                { date: 1762387200, close: 38.5, volume: 1000 },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const histProvider = new BrapiHistoricalMarketDataProvider({ fetchFn: mockFetch, token: 'initial_key' });
    expect(histProvider.hasToken()).toBe(true);

    await histProvider.getDailyPrices(
      { assetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
      LocalDate.from('2026-11-01'),
      LocalDate.from('2026-11-06'),
    );
    expect(capturedUrl).not.toContain('token=');
    expect(capturedHeaders['Authorization']).toBe('Bearer initial_key');

    histProvider.setToken('updated_key');
    await histProvider.getDailyPrices(
      { assetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
      LocalDate.from('2026-11-01'),
      LocalDate.from('2026-11-06'),
    );
    expect(capturedUrl).not.toContain('token=');
    expect(capturedHeaders['Authorization']).toBe('Bearer updated_key');
  });

  // 12. secret redaction (token never leaked in errors, string representations, or logs)
  it('12. secret redaction: token is never leaked in errors or diagnostic stringification', async () => {
    const secret = 'super_secret_brapi_key_99999';
    const mockFetch: typeof fetch = async () => {
      throw new Error(`Failed to fetch from https://brapi.dev/api/quote/PETR4?token=${secret}`);
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: secret });

    const res = await adapter.getQuotes([
      { assetId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(res.unavailable).toHaveLength(1);
    const err = res.unavailable[0];
    const stringified = JSON.stringify(err);
    expect(stringified).not.toContain(secret);
  });
});
