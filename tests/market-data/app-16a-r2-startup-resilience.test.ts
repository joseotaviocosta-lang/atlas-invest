import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  BrapiProviderAdapter,
  BrapiHistoricalMarketDataProvider,
} from '@atlas/market-data';
import { MarketDataConfigService } from '../../apps/api/src/market-data/market-data-config.service';

describe('APP-16A-R2: Local API Startup Resilience & Hotfix Verification', () => {
  const originalEnv = { ...process.env };
  const tmpDir = path.join(process.cwd(), 'tmp_startup_test_' + Date.now());

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.BRAPI_API_KEY;
    delete process.env.MARKET_DATA_API_TOKEN;
    process.env.LOCALAPPDATA = tmpDir;
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. PARTE L: Bootstraps safely when BRAPI_API_KEY is unset (PUBLIC_LIMITED mode)', () => {
    delete process.env.BRAPI_API_KEY;
    delete process.env.MARKET_DATA_API_TOKEN;

    const adapter = new BrapiProviderAdapter();
    const hist = new BrapiHistoricalMarketDataProvider();
    const service = new MarketDataConfigService(adapter, hist, hist);

    const status = service.getStatus();
    expect(status.authenticated).toBe(false);
    expect(status.status).toBe('NOT_CONFIGURED');
    expect(status.provider).toBe('BRAPI');
    expect(status.source).toBe('NONE');
    expect(adapter.hasToken()).toBe(false);
  });

  it('2. PARTE M: Bootstraps with configured=true when BRAPI_API_KEY is present in environment', () => {
    process.env.BRAPI_API_KEY = 'test_env_key_12345';

    const adapter = new BrapiProviderAdapter({ token: process.env.BRAPI_API_KEY });
    const hist = new BrapiHistoricalMarketDataProvider({ token: process.env.BRAPI_API_KEY });
    const service = new MarketDataConfigService(adapter, hist, hist);

    const status = service.getStatus();
    expect(status.authenticated).toBe(true);
    expect(status.status).toBe('CONFIGURED');
    expect(status.source).toBe('ENVIRONMENT');
    expect(adapter.hasToken()).toBe(true);
  });

  it('3. PARTE N: Bootstraps safely with metadata secrets.json (configured: false or true)', () => {
    const secretsDir = path.join(tmpDir, 'Atlas');
    fs.mkdirSync(secretsDir, { recursive: true });
    const secretsFile = path.join(secretsDir, 'secrets.json');

    // Case 1: configured: false
    fs.writeFileSync(secretsFile, JSON.stringify({ provider: 'BRAPI', configured: false, updatedAt: '2026-11-07' }));
    const adapter1 = new BrapiProviderAdapter();
    const hist1 = new BrapiHistoricalMarketDataProvider();
    const service1 = new MarketDataConfigService(adapter1, hist1, hist1);
    const status1 = service1.getStatus();
    expect(status1.authenticated).toBe(false);
    expect(status1.status).toBe('NOT_CONFIGURED');

    // Case 2: configured: true with in-memory adapter token
    fs.writeFileSync(secretsFile, JSON.stringify({ provider: 'BRAPI', configured: true, updatedAt: '2026-11-07' }));
    adapter1.setToken('in_memory_token_5678');
    const status2 = service1.getStatus();
    expect(status2.authenticated).toBe(true);
    expect(status2.status).toBe('CONFIGURED');
    expect(status2.source).toBe('LOCAL_SECRET_STORE');
  });

  it('4. PARTE O: Bootstraps gracefully when secrets.json does not exist', () => {
    const secretsFile = path.join(tmpDir, 'Atlas', 'secrets.json');
    expect(fs.existsSync(secretsFile)).toBe(false);

    const adapter = new BrapiProviderAdapter();
    const hist = new BrapiHistoricalMarketDataProvider();
    const service = new MarketDataConfigService(adapter, hist, hist);

    expect(() => service.getStatus()).not.toThrow();
    const status = service.getStatus();
    expect(status.authenticated).toBe(false);
    expect(status.status).toBe('NOT_CONFIGURED');
  });
});
