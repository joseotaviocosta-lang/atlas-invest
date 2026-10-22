import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  B3HttpClient,
  type B3FetchImpl,
  B3HttpProvider,
  type B3ApiMapper,
  createStrictB3Mapper,
  B3TokenCache,
  B3TransportError,
  validateB3IntegrationConfig,
  resolveB3IntegrationMode,
  collectB3Pages,
  isRetryableB3Error,
  backoffDelayMs,
  withB3Retry,
  translateHttpStatusToB3Error,
  classifyThrownB3Error,
  mapAuthorizationVerdictToSyncState,
  resolveSourceAsOf,
  redactSensitiveKeys,
  parseB3JsonPayload,
  B3UnknownJsonSchema,
  DEFAULT_B3_RETRY_POLICY,
} from '@atlas/b3-integration';

/**
 * Phase 5O-B — transport contract tests (mocked HTTP, zero real calls).
 *
 * A fake `fetchImpl` stands in for the network: every behavior below runs
 * against fictitious payloads shaped by strict fixture schemas. Nothing
 * here asserts real B3 shapes (those require the CERT package); what is
 * pinned is the machinery — validation boundary, retries, pagination,
 * error taxonomy, redaction and the provider seam.
 */

interface PlannedResponse {
  status?: number;
  body?: unknown;
  rawText?: string;
  headers?: Record<string, string>;
  thrown?: unknown;
}

interface SeenCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function headersOf(headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function makeFetch(plans: Record<string, PlannedResponse[]>, seen: SeenCall[] = []): B3FetchImpl {
  return async (url, init) => {
    seen.push({ url, method: init.method, headers: init.headers, body: init.body });
    const path = new URL(url).pathname;
    const queue = plans[path];
    if (!queue || queue.length === 0) {
      return {
        status: 404,
        headers: headersOf({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'no plan' }),
        text: async () => 'no plan',
      };
    }
    const planned = queue.shift()!;
    if (planned.thrown) throw planned.thrown;
    const responseHeaders = headersOf({
      'content-type': 'application/json',
      ...planned.headers,
    });
    return {
      status: planned.status ?? 200,
      headers: responseHeaders,
      json: async () => {
        if (planned.rawText !== undefined) throw new SyntaxError('Unexpected token');
        return planned.body;
      },
      text: async () => planned.rawText ?? JSON.stringify(planned.body ?? null),
    };
  };
}

const CERT_CONFIG = validateB3IntegrationConfig({
  mode: 'CERT',
  baseUrl: 'https://cert-api-b3.example.invalid',
  clientId: 'atlas-cert-client',
  clientSecretReference: 'SECRET_REF_B3_CLIENT_SECRET',
  certificateReference: 'SECRET_REF_B3_CERT',
  privateKeyReference: 'SECRET_REF_B3_KEY',
});

function clientFor(
  plans: Record<string, PlannedResponse[]>,
  seen: SeenCall[] = [],
  logger = vi.fn(),
) {
  return {
    client: new B3HttpClient({
      config: CERT_CONFIG,
      fetchImpl: makeFetch(plans, seen),
      retryPolicy: { ...DEFAULT_B3_RETRY_POLICY },
      onDelay: async () => {},
      logger,
    }),
    seen,
    logger,
  };
}

// Strict fixture schemas: the mapper provably receives validated DTOs only.
const FixtureMovementItemSchema = z.object({
  movementId: z.string().min(1),
  nature: z.string().min(1),
  ticker: z.string().min(1),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.string().min(1),
  amount: z.string().optional(),
});
const FixturePositionItemSchema = z.object({
  ticker: z.string().min(1),
  quantity: z.string().min(1),
});

function fixtureMapper(): B3ApiMapper {
  return {
    mapMovements: createStrictB3Mapper(z.array(FixtureMovementItemSchema), (items) =>
      items.map((item) => ({
        movementId: item.movementId,
        nature: item.nature,
        ticker: item.ticker,
        tradeDate: item.tradeDate,
        quantity: item.quantity,
        ...(item.amount ? { amount: item.amount } : {}),
        currency: 'BRL',
      })),
    ),
    mapPositions: createStrictB3Mapper(z.array(FixturePositionItemSchema), (items) =>
      items.map((item) => ({ ticker: item.ticker, quantity: item.quantity })),
    ),
    mapProvisionedEvents: createStrictB3Mapper(z.array(FixtureMovementItemSchema), (items) =>
      items.map((item) => ({
        movementId: item.movementId,
        nature: item.nature,
        ticker: item.ticker,
        tradeDate: item.tradeDate,
        quantity: item.quantity,
        ...(item.amount ? { amount: item.amount } : {}),
        currency: 'BRL',
      })),
    ),
  };
}

function tokenCacheFor(token = 'fake-token'): B3TokenCache {
  return new B3TokenCache(async () => ({ token, expiresAtMs: Date.now() + 3600_000 }));
}

describe('Phase 5O-B: B3 transport contracts (mocked HTTP)', () => {
  it('1: valid OAuth client-credentials response yields a cached token', async () => {
    const acquire = vi.fn(async () => ({ token: 'tok-1', expiresAtMs: Date.now() + 60_000 }));
    const cache = new B3TokenCache(acquire);
    await expect(cache.getToken()).resolves.toBe('tok-1');
    await expect(cache.getToken()).resolves.toBe('tok-1');
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('2: token endpoint 401 surfaces AUTHENTICATION_FAILED without caching', async () => {
    const acquire = vi.fn(async () => {
      throw new B3TransportError('AUTHENTICATION_FAILED', 'bad client', { status: 401 });
    });
    const cache = new B3TokenCache(acquire);
    await expect(cache.getToken()).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    await expect(cache.getToken()).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('3: TLS failures map to CERTIFICATE_ERROR', () => {
    const classified = classifyThrownB3Error(
      new Error('certificate verify failed: unable to get local issuer certificate'),
      'posicao',
    );
    expect(classified).toMatchObject({ code: 'CERTIFICATE_ERROR' });
  });

  it('4: position payload valid → mapped snapshot rows', async () => {
    const { client } = clientFor({
      '/investidor/fintech-sistema': [{ body: { lastLoadDate: '2026-10-21' } }],
      '/investidor/posicao': [{ body: { items: [{ ticker: 'PETR4', quantity: '100' }] } }],
    });
    const provider = new B3HttpProvider({
      config: CERT_CONFIG,
      client,
      mapper: fixtureMapper(),
      tokens: tokenCacheFor(),
    });
    const positions = await provider.getPositions();
    expect(positions.asOf).toBe('2026-10-21');
    expect(positions.records).toEqual([{ ticker: 'PETR4', quantity: '100' }]);
    expect(positions.partial).toBe(false);
  });

  it('5: movement payloads paginate through nextCursor into one record list', async () => {
    const seen: SeenCall[] = [];
    const { client } = clientFor(
      {
        '/investidor/guia': [{ body: { documents: [{ document: 'DOC-1' }] } }],
        '/investidor/fintech-sistema': [{ body: { lastLoadDate: '2026-10-21' } }],
        '/investidor/movimentacao': [
          {
            body: {
              items: [
                {
                  movementId: 'M-1',
                  nature: 'COMPRA',
                  ticker: 'PETR4',
                  tradeDate: '2026-10-20',
                  quantity: '10',
                },
              ],
              nextCursor: 'page-2',
            },
          },
          {
            body: {
              items: [
                {
                  movementId: 'M-2',
                  nature: 'VENDA',
                  ticker: 'PETR4',
                  tradeDate: '2026-10-20',
                  quantity: '5',
                },
              ],
              nextCursor: null,
            },
          },
        ],
      },
      seen,
    );
    const provider = new B3HttpProvider({
      config: CERT_CONFIG,
      client,
      mapper: fixtureMapper(),
      tokens: tokenCacheFor(),
    });
    const movements = await provider.getMovements({ dateFrom: '2026-10-20', dateTo: '2026-10-21' });
    expect(movements.records.map((record) => record.movementId)).toEqual(['M-1', 'M-2']);
    expect(movements.partial).toBe(false);
    expect(movements.asOf).toBe('2026-10-21');
    const movementCalls = seen.filter((call) => call.url.includes('/movimentacao'));
    expect(movementCalls).toHaveLength(2);
    // Guia-first strategy: the guide is consulted before product calls.
    const guideIndex = seen.findIndex((call) => call.url.includes('/guia'));
    const firstMovementIndex = seen.findIndex((call) => call.url.includes('/movimentacao'));
    expect(guideIndex).toBeGreaterThanOrEqual(0);
    expect(firstMovementIndex).toBeGreaterThan(guideIndex);
  });

  it('6: trade payload valid → BUY/SELL natures preserved verbatim', async () => {
    const { client } = clientFor({
      '/investidor/fintech-sistema': [{ body: { lastLoadDate: '2026-10-21' } }],
      '/investidor/guia': [{ body: { documents: [] } }],
      '/investidor/movimentacao': [
        {
          body: {
            items: [
              {
                movementId: 'T-1',
                nature: 'COMPRA',
                ticker: 'VALE3',
                tradeDate: '2026-10-19',
                quantity: '50',
              },
              {
                movementId: 'T-2',
                nature: 'VENDA',
                ticker: 'VALE3',
                tradeDate: '2026-10-19',
                quantity: '10',
              },
            ],
            nextCursor: null,
          },
        },
      ],
    });
    const provider = new B3HttpProvider({
      config: CERT_CONFIG,
      client,
      mapper: fixtureMapper(),
      tokens: tokenCacheFor(),
    });
    const movements = await provider.getMovements({ dateFrom: '2026-10-19', dateTo: '2026-10-19' });
    expect(movements.records.map((record) => record.nature)).toEqual(['COMPRA', 'VENDA']);
  });

  it('7: provisioned event valid → income record with exact amount', async () => {
    const { client } = clientFor({
      '/investidor/fintech-sistema': [{ body: { lastLoadDate: '2026-10-21' } }],
      '/investidor/eventos-provisionados': [
        {
          body: {
            items: [
              {
                movementId: 'P-1',
                nature: 'DIVIDENDO',
                ticker: 'PETR4',
                tradeDate: '2026-10-15',
                quantity: '100',
                amount: '87.30',
              },
            ],
          },
        },
      ],
    });
    const provider = new B3HttpProvider({
      config: CERT_CONFIG,
      client,
      mapper: fixtureMapper(),
      tokens: tokenCacheFor(),
    });
    const events = await provider.getProvisionedEvents();
    expect(events.records).toHaveLength(1);
    expect(events.records[0]).toMatchObject({ movementId: 'P-1', amount: '87.30' });
  });

  it('8: malformed JSON → INVALID_UPSTREAM_PAYLOAD', async () => {
    const { client } = clientFor({
      '/investidor/posicao': [{ rawText: '{not json' }],
    });
    await expect(
      client.request({
        path: '/investidor/posicao',
        responseSchema: B3UnknownJsonSchema,
        endpoint: 'posicao',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_PAYLOAD' });
  });

  it('9: schema mismatch → INVALID_UPSTREAM_PAYLOAD and mapper never runs', async () => {
    const mapFn = vi.fn();
    const { client } = clientFor({
      '/investidor/guia': [{ body: { documents: [] } }],
      '/investidor/fintech-sistema': [{ body: { lastLoadDate: '2026-10-21' } }],
      '/investidor/movimentacao': [{ body: { items: [{ ticker: 'PETR4' }], nextCursor: null } }],
    });
    const provider = new B3HttpProvider({
      config: CERT_CONFIG,
      client,
      mapper: {
        mapMovements: createStrictB3Mapper(FixtureMovementItemSchema.array(), mapFn),
        mapPositions: () => [],
        mapProvisionedEvents: () => [],
      },
      tokens: tokenCacheFor(),
    });
    await expect(
      provider.getMovements({ dateFrom: '2026-10-20', dateTo: '2026-10-21' }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_PAYLOAD' });
    expect(mapFn).not.toHaveBeenCalled();
  });

  it('10: collectB3Pages is bounded — cap reports truncated instead of looping', async () => {
    const fetchPage = vi.fn(async (cursor: string | null) => ({
      items: [cursor ?? 'first'],
      nextCursor: 'more',
    }));
    const collected = await collectB3Pages(fetchPage, { maxPages: 3 });
    expect(collected).toEqual({ items: ['first', 'more', 'more'], pages: 3, truncated: true });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('11: timeout → UPSTREAM_TIMEOUT after bounded attempts', async () => {
    const seen: SeenCall[] = [];
    const { client } = clientFor(
      {
        '/investidor/posicao': [
          { thrown: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
          { thrown: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
          { thrown: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
        ],
      },
      seen,
    );
    await expect(
      client.request({
        path: '/investidor/posicao',
        responseSchema: B3UnknownJsonSchema,
        endpoint: 'posicao',
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
    expect(seen).toHaveLength(3);
  });

  it('12: 429 with Retry-After → RATE_LIMITED, advertised backoff honored, then success', async () => {
    const delays: number[] = [];
    const seen: SeenCall[] = [];
    const client = new B3HttpClient({
      config: CERT_CONFIG,
      fetchImpl: makeFetch(
        {
          '/investidor/posicao': [
            { status: 429, body: { error: 'slow down' }, headers: { 'retry-after': '2' } },
            { body: { ok: true } },
          ],
        },
        seen,
      ),
      retryPolicy: { ...DEFAULT_B3_RETRY_POLICY },
      onDelay: async (delayMs) => {
        delays.push(delayMs);
      },
    });
    const result = await client.request({
      path: '/investidor/posicao',
      responseSchema: z.object({ ok: z.boolean() }),
      endpoint: 'posicao',
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.attempts).toBe(2);
    expect(delays).toEqual([2000]);
    expect(seen).toHaveLength(2);
  });

  it('13: 503 retries bounded — exhaustion surfaces UPSTREAM_UNAVAILABLE', async () => {
    const seen: SeenCall[] = [];
    const { client } = clientFor(
      {
        '/investidor/posicao': [
          { status: 503, body: {} },
          { status: 503, body: {} },
          { status: 503, body: {} },
        ],
      },
      seen,
    );
    await expect(
      client.request({
        path: '/investidor/posicao',
        responseSchema: B3UnknownJsonSchema,
        endpoint: 'posicao',
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(seen).toHaveLength(3);
  });

  it('14: revoked authorization maps previous AUTHORIZED → REVOKED', async () => {
    const provider = new B3HttpProvider({
      config: CERT_CONFIG,
      client: new B3HttpClient({
        config: CERT_CONFIG,
        fetchImpl: makeFetch({
          '/investidor/autorizacao-fintech': [{ body: { authorized: false } }],
        }),
        onDelay: async () => {},
      }),
      mapper: fixtureMapper(),
      tokens: tokenCacheFor(),
      previousState: 'AUTHORIZED',
    });
    await expect(provider.getAuthorizationStatus()).resolves.toBe('REVOKED');
    expect(mapAuthorizationVerdictToSyncState('NOT_AUTHORIZED', 'NOT_CONNECTED')).toBe(
      'NOT_CONNECTED',
    );
    expect(mapAuthorizationVerdictToSyncState('AUTHORIZED', 'NOT_CONNECTED')).toBe('AUTHORIZED');
    expect(mapAuthorizationVerdictToSyncState('UNKNOWN', 'SYNCED')).toBe(
      'REQUIRES_REAUTHORIZATION',
    );
    expect(mapAuthorizationVerdictToSyncState('UNKNOWN', 'NOT_CONNECTED')).toBe('NOT_CONNECTED');
  });

  it('15: truncated pagination surfaces partial:true instead of fake completeness', async () => {
    const { client } = clientFor({
      '/investidor/guia': [{ body: { documents: [] } }],
      '/investidor/fintech-sistema': [{ body: { lastLoadDate: '2026-10-21' } }],
      '/investidor/movimentacao': [
        {
          body: {
            items: [
              {
                movementId: 'M-1',
                nature: 'COMPRA',
                ticker: 'PETR4',
                tradeDate: '2026-10-20',
                quantity: '1',
              },
            ],
            nextCursor: 'p2',
          },
        },
        {
          body: {
            items: [
              {
                movementId: 'M-2',
                nature: 'COMPRA',
                ticker: 'PETR4',
                tradeDate: '2026-10-20',
                quantity: '1',
              },
            ],
            nextCursor: 'p3',
          },
        },
      ],
    });
    const narrow = new B3HttpProvider({
      config: { ...CERT_CONFIG, maxPages: 1 },
      client,
      mapper: fixtureMapper(),
      tokens: tokenCacheFor(),
    });
    const movements = await narrow.getMovements({ dateFrom: '2026-10-20', dateTo: '2026-10-21' });
    expect(movements.records).toHaveLength(1);
    expect(movements.partial).toBe(true);
  });

  it('16: sourceAsOf is the B3 load date, never the Atlas sync instant', () => {
    expect(resolveSourceAsOf('2026-10-21')).toEqual({ sourceAsOf: '2026-10-21' });
    expect(() => resolveSourceAsOf('21/10/2026')).toThrow(
      expect.objectContaining({ code: 'INVALID_UPSTREAM_PAYLOAD' }),
    );
  });

  it('17: logs carry counts only — tokens, secrets and documents redacted', () => {
    const logger = vi.fn();
    const { client } = clientFor(
      {
        '/investidor/posicao': [{ body: { items: [] } }],
      },
      [],
      logger,
    );
    return client
      .request({
        path: '/investidor/posicao',
        responseSchema: B3UnknownJsonSchema,
        endpoint: 'posicao',
        bearerToken: 'super-secret-token',
      })
      .then(() => {
        expect(logger).toHaveBeenCalledTimes(1);
        const entry = JSON.stringify(logger.mock.calls[0]![0]);
        expect(entry).not.toContain('super-secret-token');
        expect(entry).toContain('posicao');
      });
  });

  it('18: redaction helper strips nested secrets, keeps safe fields', () => {
    expect(
      redactSensitiveKeys({
        endpoint: 'posicao',
        authorization: 'Bearer abc',
        nested: { client_secret: 'shh', count: 3 },
        items: [{ token: 't', ticker: 'PETR4' }],
      }),
    ).toEqual({
      endpoint: 'posicao',
      authorization: '[REDACTED]',
      nested: { client_secret: '[REDACTED]', count: 3 },
      items: [{ token: '[REDACTED]', ticker: 'PETR4' }],
    });
  });

  it('19: error taxonomy pins status mapping and retry matrix', () => {
    expect(translateHttpStatusToB3Error(401, 'x')).toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(translateHttpStatusToB3Error(403, 'x')).toMatchObject({ code: 'AUTHORIZATION_REVOKED' });
    expect(translateHttpStatusToB3Error(404, 'x')).toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(translateHttpStatusToB3Error(429, 'x')).toMatchObject({ code: 'RATE_LIMITED' });
    expect(translateHttpStatusToB3Error(503, 'x')).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    for (const code of ['RATE_LIMITED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_UNAVAILABLE'] as const) {
      expect(isRetryableB3Error(new B3TransportError(code, 'x'))).toBe(true);
    }
    for (const code of [
      'AUTHENTICATION_FAILED',
      'AUTHORIZATION_REVOKED',
      'INVALID_UPSTREAM_PAYLOAD',
      'CERTIFICATE_ERROR',
      'CONFIGURATION_ERROR',
      'PARTIAL_DATA',
    ] as const) {
      expect(isRetryableB3Error(new B3TransportError(code, 'x'))).toBe(false);
    }
    expect(backoffDelayMs(1, DEFAULT_B3_RETRY_POLICY)).toBe(500);
    expect(backoffDelayMs(2, DEFAULT_B3_RETRY_POLICY)).toBe(1000);
    expect(backoffDelayMs(99, DEFAULT_B3_RETRY_POLICY)).toBe(5000);
  });

  it('20: strict mapper proves validated-DTO-only flow; raw JSON never mapped', () => {
    const mapFn = vi.fn((items: unknown[]) => items);
    const strict = createStrictB3Mapper(z.array(FixtureMovementItemSchema), mapFn);
    expect(() =>
      strict([
        {
          movementId: 'M-1',
          nature: 'COMPRA',
          ticker: 'PETR4',
          tradeDate: '2026-10-20',
          quantity: '1',
        },
      ]),
    ).not.toThrow();
    expect(mapFn).toHaveBeenCalledTimes(1);
    expect(() => strict([{ ticker: 'PETR4' }])).toThrow(
      expect.objectContaining({ code: 'INVALID_UPSTREAM_PAYLOAD' }),
    );
    expect(mapFn).toHaveBeenCalledTimes(1);
  });

  it('config: DISABLED default-safe; CERT/PROD fail closed without explicit refs', () => {
    expect(resolveB3IntegrationMode()).toBe('DISABLED');
    expect(resolveB3IntegrationMode({ mode: 'PROD' })).toBe('PROD');
    expect(resolveB3IntegrationMode({ mode: 'prod' })).toBe('DISABLED');
    expect(validateB3IntegrationConfig({ mode: 'DISABLED' }).baseUrl).toBeNull();
    expect(() => validateB3IntegrationConfig({ mode: 'CERT' })).toThrow(
      expect.objectContaining({ code: 'CONFIGURATION_ERROR' }),
    );
    expect(() =>
      validateB3IntegrationConfig({
        mode: 'PROD',
        baseUrl: 'http://insecure',
        clientId: 'x',
        clientSecretReference: 's',
        certificateReference: 'c',
        privateKeyReference: 'k',
      }),
    ).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  it('retry helper: bounded attempts with deterministic backoff', async () => {
    const delays: number[] = [];
    let calls = 0;
    await expect(
      withB3Retry(
        { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
        async () => {
          calls += 1;
          throw new B3TransportError('UPSTREAM_UNAVAILABLE', 'down');
        },
        async (delayMs) => {
          delays.push(delayMs);
        },
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(calls).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it('payload boundary: unknown JSON passes through, strict schemas reject garbage', () => {
    expect(parseB3JsonPayload(B3UnknownJsonSchema, { anything: [1] })).toEqual({ anything: [1] });
    expect(() => parseB3JsonPayload(FixtureMovementItemSchema, { ticker: 'PETR4' })).toThrow(
      expect.objectContaining({ code: 'INVALID_UPSTREAM_PAYLOAD' }),
    );
  });
});
