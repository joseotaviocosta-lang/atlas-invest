import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  BrapiProviderAdapter,
  BrapiHistoricalMarketDataProvider,
} from '@atlas/market-data';
import { LocalDate } from '@atlas/domain';
import { MarketDataConfigService } from '../../apps/api/src/market-data/market-data-config.service';

describe('APP-16A-R1: Token Redaction & Transport Security', () => {
  const SENSITIVE_OWNER_TOKEN = 'test_owner_secret_token_redaction_xyz789_CANONICAL';
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('1. BrapiProviderAdapter sends token exclusively in Authorization header, never in URL query string', async () => {
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

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: SENSITIVE_OWNER_TOKEN });

    await adapter.getQuotes([
      { assetId: '11111111-1111-4111-8111-111111111111', ticker: 'PETR4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(capturedUrl).not.toContain(SENSITIVE_OWNER_TOKEN);
    expect(capturedUrl).not.toContain('token=');
    expect(capturedHeaders['Authorization']).toBe(`Bearer ${SENSITIVE_OWNER_TOKEN}`);
  });

  it('2. BrapiHistoricalMarketDataProvider sends token exclusively in Authorization header, never in URL query string', async () => {
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
              historicalDataPrice: [{ date: 1762387200, close: 62.0, volume: 500 }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const histProvider = new BrapiHistoricalMarketDataProvider({ fetchFn: mockFetch, token: SENSITIVE_OWNER_TOKEN });

    await histProvider.getDailyPrices(
      { assetId: '22222222-2222-4222-8222-222222222222', ticker: 'VALE3', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
      LocalDate.from('2026-11-01'),
      LocalDate.from('2026-11-06'),
    );

    expect(capturedUrl).not.toContain(SENSITIVE_OWNER_TOKEN);
    expect(capturedUrl).not.toContain('token=');
    expect(capturedHeaders['Authorization']).toBe(`Bearer ${SENSITIVE_OWNER_TOKEN}`);
  });

  it('3. Upstream 401/403 or network errors never leak sensitive token in MarketDataError or unavailable records', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Invalid authorization credential',
          code: 'INVALID_TOKEN',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: SENSITIVE_OWNER_TOKEN });

    const result = await adapter.getQuotes([
      { assetId: '33333333-3333-4333-8333-333333333333', ticker: 'ITSA4', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(result.unavailable).toHaveLength(1);
    const unavailableJson = JSON.stringify(result.unavailable);
    expect(unavailableJson).not.toContain(SENSITIVE_OWNER_TOKEN);
    expect(result.unavailable[0].code).toBe('MARKET_DATA.AUTHENTICATION_FAILED');
  });

  it('4. Network throw containing sensitive substring is safely redacted from unavailable items', async () => {
    const mockFetch: typeof fetch = async () => {
      throw new Error(`Fetch failed connecting to remote host with authorization ${SENSITIVE_OWNER_TOKEN}`);
    };

    const adapter = new BrapiProviderAdapter({ fetchFn: mockFetch, token: SENSITIVE_OWNER_TOKEN });

    const result = await adapter.getQuotes([
      { assetId: '44444444-4444-4444-8444-444444444444', ticker: 'B3SA3', exchange: 'B3', currency: 'BRL', assetType: 'STOCK' },
    ]);

    expect(result.unavailable).toHaveLength(1);
    const serialized = JSON.stringify(result.unavailable);
    expect(serialized).not.toContain(SENSITIVE_OWNER_TOKEN);
  });

  it('5. MarketDataConfigService getStatus() DTO never leaks token string', () => {
    const adapter = new BrapiProviderAdapter({ token: SENSITIVE_OWNER_TOKEN });
    const hist = new BrapiHistoricalMarketDataProvider({ token: SENSITIVE_OWNER_TOKEN });
    const service = new MarketDataConfigService(adapter, hist, hist);

    process.env.BRAPI_API_KEY = SENSITIVE_OWNER_TOKEN;
    const status = service.getStatus();

    expect(status.authenticated).toBe(true);
    expect(status.status).toBe('CONFIGURED');
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain(SENSITIVE_OWNER_TOKEN);
  });

  it('6. MarketDataConfigService configureToken() writes metadata ONLY to secrets.json and purges raw token', () => {
    const adapter = new BrapiProviderAdapter();
    const hist = new BrapiHistoricalMarketDataProvider();
    const service = new MarketDataConfigService(adapter, hist, hist);

    const tmpSecretsDir = path.join(process.cwd(), 'tmp_test_secrets');
    process.env.LOCALAPPDATA = tmpSecretsDir;

    try {
      const res = service.configureToken(SENSITIVE_OWNER_TOKEN);
      expect(res.authenticated).toBe(true);

      const secretsFile = path.join(tmpSecretsDir, 'Atlas', 'secrets.json');
      expect(fs.existsSync(secretsFile)).toBe(true);

      const fileContent = fs.readFileSync(secretsFile, 'utf8');
      expect(fileContent).not.toContain(SENSITIVE_OWNER_TOKEN);

      const parsed = JSON.parse(fileContent);
      expect(parsed.provider).toBe('BRAPI');
      expect(parsed.configured).toBe(true);
      expect(parsed.BRAPI_API_KEY).toBeUndefined();
    } finally {
      if (fs.existsSync(tmpSecretsDir)) {
        fs.rmSync(tmpSecretsDir, { recursive: true, force: true });
      }
    }
  });
});
