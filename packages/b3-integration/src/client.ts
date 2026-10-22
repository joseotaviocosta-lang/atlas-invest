import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { B3TransportError, classifyThrownB3Error, translateHttpStatusToB3Error } from './errors';
import { backoffDelayMs, isRetryableB3Error, type B3RetryPolicy } from './retry';
import { parseB3JsonPayload } from './dto';
import { redactSensitiveKeys, summarizeB3ResultForLog } from './redaction';
import type { ValidatedB3IntegrationConfig } from './config';

/**
 * Phase 5O-B — transport-only HTTP client.
 *
 * Responsibilities: base URL per environment, timeout, retries, pagination
 * support (via caller), error translation, safe observability. It NEVER
 * writes to the ledger, decides dedupe, corrects positions, applies tax, or
 * transforms unknown payloads into canonical events. Fetch is INJECTED
 * (mTLS agents, sandbox stubs and tests provide their own); there is no
 * global-fetch fallback, so importing this module can never touch a network.
 */
export interface B3FetchHeaders {
  get(name: string): string | null;
}

export interface B3FetchResponse {
  status: number;
  headers: B3FetchHeaders;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type B3FetchImpl = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<B3FetchResponse>;

export interface B3RequestOptions<T> {
  method?: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Zod schema the JSON body must satisfy before leaving the boundary. */
  responseSchema: z.ZodType<T>;
  /** Logical endpoint name for logs and error messages (never a URL). */
  endpoint: string;
  /** Optional bearer token; never logged. */
  bearerToken?: string;
  signal?: AbortSignal;
}

export interface B3RequestResult<T> {
  data: T;
  attempts: number;
  correlationId: string | null;
}

export interface B3HttpClientOptions {
  config: ValidatedB3IntegrationConfig;
  fetchImpl: B3FetchImpl;
  retryPolicy?: B3RetryPolicy;
  onDelay?: (delayMs: number) => Promise<void>;
  logger?: (entry: Record<string, unknown>) => void;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.min(60_000, Math.max(0, date - Date.now()));
  return null;
}

export class B3HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryPolicy: B3RetryPolicy;
  private readonly onDelay: (delayMs: number) => Promise<void>;
  private readonly fetchImpl: B3FetchImpl;
  private readonly logger?: (entry: Record<string, unknown>) => void;

  constructor(options: B3HttpClientOptions) {
    if (!options.config.baseUrl) {
      throw new B3TransportError(
        'CONFIGURATION_ERROR',
        'B3HttpClient requires a validated CERT/PROD config with an explicit baseUrl',
      );
    }
    this.baseUrl = options.config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.config.timeoutMs;
    this.fetchImpl = options.fetchImpl;
    this.retryPolicy = {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 5_000,
      ...options.retryPolicy,
    };
    this.onDelay =
      options.onDelay ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.logger = options.logger;
  }

  async request<T>(options: B3RequestOptions<T>): Promise<B3RequestResult<T>> {
    const correlationId = randomUUID();
    const url = new URL(`${this.baseUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-request-id': correlationId,
    };
    if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const maxAttempts = Math.min(10, Math.max(1, Math.floor(this.retryPolicy.maxAttempts)));
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const timeoutSignal =
        typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(this.timeoutMs) : undefined;
      const signal =
        options.signal && timeoutSignal
          ? AbortSignal.any([options.signal, timeoutSignal])
          : (options.signal ?? timeoutSignal);
      try {
        const response = await this.fetchImpl(url.toString(), { method, headers, body, signal });
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        if (response.status === 429 && retryAfterMs !== null) {
          throw new B3TransportError('RATE_LIMITED', `B3 rate limit hit on ${options.endpoint}`, {
            status: 429,
            retryAfterMs,
          });
        }
        if (response.status < 200 || response.status >= 300) {
          throw translateHttpStatusToB3Error(response.status, options.endpoint);
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.toLowerCase().includes('json')) {
          throw new B3TransportError(
            'INVALID_UPSTREAM_PAYLOAD',
            `B3 answered ${options.endpoint} with non-JSON content`,
            { status: response.status },
          );
        }
        const payload = await response.json().catch((error: unknown) => {
          throw new B3TransportError(
            'INVALID_UPSTREAM_PAYLOAD',
            `B3 answered ${options.endpoint} with malformed JSON`,
            { status: response.status, cause: error },
          );
        });
        const data = parseB3JsonPayload(options.responseSchema, payload);
        this.log({
          endpoint: options.endpoint,
          status: response.status,
          itemCount: Array.isArray((data as { items?: unknown }).items)
            ? ((data as { items: unknown[] }).items.length as number)
            : 1,
          pageCount: 1,
          retryCount: attempt - 1,
          sourceAsOf: null,
          correlationId,
        });
        return { data, attempts: attempt, correlationId };
      } catch (error) {
        // 401 invalidates any cached token upstream; surface immediately.
        lastError =
          error instanceof B3TransportError
            ? error
            : classifyThrownB3Error(error, options.endpoint);
        if (!isRetryableB3Error(lastError) || attempt === maxAttempts) break;
        const advertised =
          lastError instanceof B3TransportError && lastError.retryAfterMs !== null
            ? lastError.retryAfterMs
            : null;
        const delay = Math.min(
          this.retryPolicy.maxDelayMs,
          Math.max(0, advertised ?? backoffDelayMs(attempt, this.retryPolicy)),
        );
        await this.onDelay(delay);
      }
    }
    throw lastError;
  }

  private log(entry: Parameters<typeof summarizeB3ResultForLog>[0]): void {
    if (!this.logger) return;
    this.logger(redactSensitiveKeys(summarizeB3ResultForLog(entry)) as Record<string, unknown>);
  }
}
