import {
  Asset,
  AssetId,
  AssetType,
  Currency,
  DomainError,
  Money,
  Quantity,
  LocalDate,
  assertValidCurrency,
  isValidUUID,
} from '@atlas/domain';

export const MARKET_DATA_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Market data sources
// ---------------------------------------------------------------------------

export const MARKET_DATA_SOURCES = [
  'BRAPI',
  'YAHOO',
  'STOOQ',
  'IN_MEMORY',
  'MANUAL',
  'B3_DIRECT',
] as const;
export type MarketDataSource = (typeof MARKET_DATA_SOURCES)[number];

export function assertValidMarketDataSource(value: string): MarketDataSource {
  if ((MARKET_DATA_SOURCES as readonly string[]).includes(value)) {
    return value as MarketDataSource;
  }
  throw new MarketDataError(
    `Unsupported market data provider '${value}'. Supported: ${MARKET_DATA_SOURCES.join(', ')}`,
    'MARKET_DATA.PROVIDER_UNAVAILABLE',
    { retryable: false },
  );
}

// ---------------------------------------------------------------------------
// Quote status & freshness
// ---------------------------------------------------------------------------

export const QUOTE_STATUSES = ['LIVE', 'DELAYED', 'EOD', 'STALE', 'UNAVAILABLE'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_FRESHNESSES = ['FRESH', 'STALE', 'UNKNOWN'] as const;
export type QuoteFreshness = (typeof QUOTE_FRESHNESSES)[number];

// ---------------------------------------------------------------------------
// Canonical error model
// ---------------------------------------------------------------------------

export const MARKET_DATA_ERROR_CODES = [
  'MARKET_DATA.PROVIDER_UNAVAILABLE',
  'MARKET_DATA.RATE_LIMITED',
  'MARKET_DATA.SYMBOL_NOT_FOUND',
  'MARKET_DATA.INVALID_RESPONSE',
  'MARKET_DATA.TIMEOUT',
  'MARKET_DATA.AUTHENTICATION_FAILED',
  'MARKET_DATA.AUTHENTICATION_REQUIRED',
  'MARKET_DATA.UNSUPPORTED_ASSET',
  'MARKET_DATA.INVALID_PRICE',
  'MARKET_DATA.INVALID_TIMESTAMP',
  'MARKET_DATA.BATCH_LIMIT_EXCEEDED',
  'MARKET_DATA.INVALID_ASSET_ID',
] as const;
export type MarketDataErrorCode = (typeof MARKET_DATA_ERROR_CODES)[number];

/**
 * Canonical market data error.
 *
 * Every provider-specific failure is normalized to one of the canonical
 * codes above. Raw HTTP bodies, stack traces, API keys and any upstream
 * payload are NEVER attached to this error and must never reach the API
 * response or logs.
 *
 * Extends DomainError so the API GlobalExceptionFilter maps it to
 * `400 Bad Request` without any filter change (frozen error envelope).
 */
export class MarketDataError extends DomainError {
  override readonly code: MarketDataErrorCode;
  readonly retryable: boolean;
  readonly assetId?: string;

  constructor(
    message: string,
    code: MarketDataErrorCode,
    options: { retryable?: boolean; assetId?: string } = {},
  ) {
    super(message, code);
    this.code = code;
    this.name = this.constructor.name;
    this.retryable = options.retryable ?? false;
    this.assetId = options.assetId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Provider error -> canonical error mapping.
 *
 * Provider error                                     Canonical code                        Retryable?
 * -------------------------------                    ------------------------------------  ---------
 * timeout / aborted request                          MARKET_DATA.TIMEOUT                   true
 * HTTP 429                                           MARKET_DATA.RATE_LIMITED              true
 * network failure / HTTP 5xx / no response           MARKET_DATA.PROVIDER_UNAVAILABLE      true
 * HTTP 401 / 403                                     MARKET_DATA.AUTHENTICATION_FAILED     false
 * HTTP 404 / unknown symbol                          MARKET_DATA.SYMBOL_NOT_FOUND          false
 * malformed payload / invalid price / bad timestamp  MARKET_DATA.INVALID_RESPONSE          false
 */
export function normalizeProviderError(
  input: { httpStatus?: number; code?: string; timedOut?: boolean },
  context: { provider: MarketDataSource; assetId?: string },
): MarketDataError {
  const assetId = context.assetId;
  if (input.timedOut) {
    return new MarketDataError(
      `Market data provider '${context.provider}' timed out`,
      'MARKET_DATA.TIMEOUT',
      {
        retryable: true,
        assetId,
      },
    );
  }
  const status = input.httpStatus;
  if (status === 429) {
    return new MarketDataError(
      `Market data provider '${context.provider}' rate limit exceeded`,
      'MARKET_DATA.RATE_LIMITED',
      { retryable: true, assetId },
    );
  }
  if (status === 401 || status === 403) {
    return new MarketDataError(
      `Market data provider '${context.provider}' authentication failed`,
      'MARKET_DATA.AUTHENTICATION_FAILED',
      { retryable: false, assetId },
    );
  }
  if (status === 404) {
    return new MarketDataError(
      `Symbol not found at provider '${context.provider}'`,
      'MARKET_DATA.SYMBOL_NOT_FOUND',
      {
        retryable: false,
        assetId,
      },
    );
  }
  if (status !== undefined && status >= 500) {
    return new MarketDataError(
      `Market data provider '${context.provider}' is unavailable`,
      'MARKET_DATA.PROVIDER_UNAVAILABLE',
      { retryable: true, assetId },
    );
  }
  if (input.code === 'NETWORK_ERROR' || input.code === 'NO_RESPONSE') {
    return new MarketDataError(
      `Market data provider '${context.provider}' is unreachable`,
      'MARKET_DATA.PROVIDER_UNAVAILABLE',
      { retryable: true, assetId },
    );
  }
  return new MarketDataError(
    `Market data provider '${context.provider}' returned an invalid response`,
    'MARKET_DATA.INVALID_RESPONSE',
    { retryable: false, assetId },
  );
}

// ---------------------------------------------------------------------------
// Canonical quote
// ---------------------------------------------------------------------------

const DECIMAL_STRING_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Canonical market quote. Provider-independent.
 *
 * - `price` uses the exact-decimal `Money` primitive (never JS float).
 * - `currency` is always explicit, never assumed.
 * - Timestamps are technical/market temporality (ISO-8601 UTC instants),
 *   NOT economic `LocalDate` ledger dates. `marketTime` is the exchange
 *   timestamp when the provider supplies one; `receivedAt` is the
 *   ingestion timestamp. `asOf` is the effective timestamp of the quote.
 * - `freshness` is computed by the service/cache layer, never by the UI.
 */
export interface MarketQuote {
  assetId: AssetId;
  price: Money;
  currency: Currency;
  asOf: string;
  marketTime?: string;
  receivedAt: string;
  source: MarketDataSource;
  status: QuoteStatus;
  freshness: QuoteFreshness;
  providerSymbol: string;
}

/**
 * JSON-serializable quote. The price travels strictly as an exact
 * decimal string — never as a JSON number.
 */
export interface MarketQuoteJSON {
  assetId: string;
  price: string;
  currency: Currency;
  asOf: string;
  marketTime?: string;
  receivedAt: string;
  source: MarketDataSource;
  status: QuoteStatus;
  freshness: QuoteFreshness;
  providerSymbol: string;
}

function assertValidInstant(value: string, field: string): string {
  if (typeof value !== 'string') {
    throw new MarketDataError(
      `Invalid ${field} timestamp '${String(value)}'`,
      'MARKET_DATA.INVALID_TIMESTAMP',
      { retryable: false },
    );
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new MarketDataError(
      `Invalid ${field} timestamp '${String(value)}'`,
      'MARKET_DATA.INVALID_TIMESTAMP',
      { retryable: false },
    );
  }
  const parsedMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedMs)) {
    throw new MarketDataError(
      `Invalid ${field} timestamp '${String(value)}'`,
      'MARKET_DATA.INVALID_TIMESTAMP',
      { retryable: false },
    );
  }
  // Strict calendar validation: reject impossible civil dates that Date.parse rolls over
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) {
    throw new MarketDataError(
      `Invalid ${field} timestamp '${String(value)}'`,
      'MARKET_DATA.INVALID_TIMESTAMP',
      { retryable: false },
    );
  }
  const y = Number(dateMatch[1]);
  const m = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  if (m < 1 || m > 12) {
    throw new MarketDataError(
      `Invalid ${field} timestamp '${String(value)}'`,
      'MARKET_DATA.INVALID_TIMESTAMP',
      { retryable: false },
    );
  }
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > dim) {
    throw new MarketDataError(
      `Invalid ${field} timestamp '${String(value)}'`,
      'MARKET_DATA.INVALID_TIMESTAMP',
      { retryable: false },
    );
  }
  const timeMatch = trimmed.match(/[T ](\d{2}):(\d{2}):(\d{2})/);
  if (timeMatch) {
    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    const ss = Number(timeMatch[3]);
    if (hh > 23 || mm > 59 || ss > 59) {
      throw new MarketDataError(
        `Invalid ${field} timestamp '${String(value)}'`,
        'MARKET_DATA.INVALID_TIMESTAMP',
        { retryable: false },
      );
    }
  }
  return trimmed;
}

function assertValidAssetId(value: string): AssetId {
  if (!isValidUUID(value)) {
    throw new MarketDataError(`Invalid asset id '${value}'`, 'MARKET_DATA.INVALID_ASSET_ID', {
      retryable: false,
    });
  }
  return value as AssetId;
}

export function createMarketQuote(input: {
  assetId: string;
  price: string;
  currency: string;
  asOf: string;
  receivedAt: string;
  marketTime?: string;
  source: MarketDataSource;
  status: QuoteStatus;
  freshness?: QuoteFreshness;
  providerSymbol: string;
}): MarketQuote {
  const assetId = assertValidAssetId(input.assetId);
  const currency = assertValidCurrency(input.currency);
  if (typeof input.price !== 'string' || !DECIMAL_STRING_REGEX.test(input.price.trim())) {
    throw new MarketDataError(
      `Invalid market price '${String(input.price)}'`,
      'MARKET_DATA.INVALID_PRICE',
      {
        retryable: false,
        assetId,
      },
    );
  }
  let price: Money;
  try {
    price = Money.from(input.price.trim(), currency);
  } catch {
    throw new MarketDataError(
      `Invalid market price '${input.price}'`,
      'MARKET_DATA.INVALID_PRICE',
      {
        retryable: false,
        assetId,
      },
    );
  }
  if (price.isNegative() || price.isZero()) {
    throw new MarketDataError(
      `Invalid market price '${input.price}': must be strictly positive`,
      'MARKET_DATA.INVALID_PRICE',
      {
        retryable: false,
        assetId,
      },
    );
  }
  const asOf = assertValidInstant(input.asOf, 'asOf');
  const receivedAt = assertValidInstant(input.receivedAt, 'receivedAt');
  const marketTime =
    input.marketTime !== undefined ? assertValidInstant(input.marketTime, 'marketTime') : undefined;
  if (!(QUOTE_STATUSES as readonly string[]).includes(input.status)) {
    throw new MarketDataError(
      `Invalid quote status '${String(input.status)}'`,
      'MARKET_DATA.INVALID_RESPONSE',
      {
        retryable: false,
        assetId,
      },
    );
  }
  const freshness: QuoteFreshness =
    input.freshness !== undefined &&
    (QUOTE_FRESHNESSES as readonly string[]).includes(input.freshness)
      ? input.freshness
      : statusToFreshness(input.status);
  const frozen: MarketQuote = {
    assetId,
    price,
    currency,
    asOf,
    ...(marketTime ? { marketTime } : {}),
    receivedAt,
    source: input.source,
    status: input.status,
    freshness,
    providerSymbol: input.providerSymbol,
  };
  return Object.freeze(frozen);
}

function statusToFreshness(status: QuoteStatus): QuoteFreshness {
  if (status === 'STALE' || status === 'UNAVAILABLE') return 'STALE';
  if (status === 'LIVE' || status === 'DELAYED' || status === 'EOD') return 'FRESH';
  return 'UNKNOWN';
}

export function serializeMarketQuote(quote: MarketQuote): MarketQuoteJSON {
  return {
    assetId: quote.assetId,
    price: quote.price.amount,
    currency: quote.currency,
    asOf: quote.asOf,
    ...(quote.marketTime ? { marketTime: quote.marketTime } : {}),
    receivedAt: quote.receivedAt,
    source: quote.source,
    status: quote.status,
    freshness: quote.freshness,
    providerSymbol: quote.providerSymbol,
  };
}

/**
 * Pure freshness computation. `ttlSeconds` comes from configuration.
 * A quote older than the TTL is STALE; a future-dated quote is UNKNOWN.
 * Stale quotes are never presented as fresh.
 */
export function getQuoteFreshness(
  asOfIso: string,
  nowMs: number,
  ttlSeconds: number,
): QuoteFreshness {
  const asOfMs = Date.parse(asOfIso);
  if (!Number.isFinite(asOfMs)) return 'UNKNOWN';
  if (asOfMs > nowMs) return 'UNKNOWN';
  return nowMs - asOfMs <= ttlSeconds * 1000 ? 'FRESH' : 'STALE';
}

// ---------------------------------------------------------------------------
// EOD Quote Freshness Classifier (Phase 5A)
// ---------------------------------------------------------------------------

export type EodFreshnessStatus = 'FRESH' | 'STALE' | 'MISSING' | 'ERROR';

export interface ClassifyEodQuoteFreshnessInput {
  quote?: {
    tradingDate: LocalDate | string;
    asOf?: string;
  } | null;
  hasProviderError?: boolean;
  viewDate?: LocalDate | string;
  viewHour?: number; // 0-23 in America/Sao_Paulo (default: 12)
  marketCloseThresholdHour?: number; // default: 18 (18:00 BRT)
}

/**
 * Classifies the operational freshness of an End-of-Day (EOD) market quote.
 *
 * Rules:
 * 1. If provider attempted and failed -> 'ERROR'
 * 2. If no quote exists -> 'MISSING'
 * 3. If quote exists:
 *    - Same calendar day -> 'FRESH'
 *    - Weekend handling: A Friday quote viewed on Saturday or Sunday is 'FRESH'
 *      because the exchange is closed over the weekend.
 *    - Monday handling: A Friday quote viewed on Monday before the market close
 *      threshold (default 18:00 BRT) is 'FRESH'. After 18:00 BRT on Monday,
 *      it becomes 'STALE'.
 *    - Next weekday handling: A quote from day D viewed on day D+1 before
 *      the market close threshold is 'FRESH'. After market close threshold (or D+2+),
 *      it becomes 'STALE'.
 *    - Any older quote beyond the expected market session -> 'STALE'.
 *
 * Note on Holiday Calendar:
 * This MVP classifier is weekend-aware. It does not yet include a dynamic
 * Brazilian federal/B3 holiday calendar. Conservative policy applies.
 */
export function classifyEodQuoteFreshness(
  input: ClassifyEodQuoteFreshnessInput,
): EodFreshnessStatus {
  if (input.hasProviderError) {
    return 'ERROR';
  }
  if (!input.quote) {
    return 'MISSING';
  }

  const quoteDate =
    input.quote.tradingDate instanceof LocalDate
      ? input.quote.tradingDate
      : LocalDate.from(String(input.quote.tradingDate));

  let viewDate: LocalDate;
  let viewHour = input.viewHour ?? 12;

  if (input.viewDate) {
    viewDate =
      input.viewDate instanceof LocalDate ? input.viewDate : LocalDate.from(String(input.viewDate));
  } else {
    // Current civil date and hour in America/Sao_Paulo
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const d = parts.find((p) => p.type === 'day')!.value;
    const h = parts.find((p) => p.type === 'hour')?.value ?? '12';
    viewDate = LocalDate.from(`${y}-${m}-${d}`);
    viewHour = input.viewHour ?? parseInt(h, 10);
  }

  const thresholdHour = input.marketCloseThresholdHour ?? 18;

  // Exact same day -> FRESH
  if (viewDate.equals(quoteDate)) {
    return 'FRESH';
  }

  // Future quote or viewDate before quoteDate -> STALE
  if (viewDate.isBefore(quoteDate)) {
    return 'STALE';
  }

  const daysDiff = daysBetweenLocalDates(quoteDate, viewDate);
  const quoteJs = new Date(Date.UTC(quoteDate.year, quoteDate.month - 1, quoteDate.day));
  const viewJs = new Date(Date.UTC(viewDate.year, viewDate.month - 1, viewDate.day));
  const quoteDayOfWeek = quoteJs.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
  const viewDayOfWeek = viewJs.getUTCDay();

  // Friday quote viewed on weekend (Saturday = 6, Sunday = 0)
  if (quoteDayOfWeek === 5 && daysDiff <= 2 && (viewDayOfWeek === 6 || viewDayOfWeek === 0)) {
    return 'FRESH';
  }

  // Friday quote viewed on Monday (daysDiff = 3, viewDayOfWeek = 1)
  if (quoteDayOfWeek === 5 && daysDiff === 3 && viewDayOfWeek === 1) {
    return viewHour < thresholdHour ? 'FRESH' : 'STALE';
  }

  // Weekday quote viewed on next calendar day (daysDiff = 1)
  if (daysDiff === 1) {
    return viewHour < thresholdHour ? 'FRESH' : 'STALE';
  }

  return 'STALE';
}

// ---------------------------------------------------------------------------
// Asset -> provider symbol resolution
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic asset reference used as input for symbol resolution
 * and quote requests. Identity is ALWAYS `assetId`; `ticker` is display
 * metadata only and never a global key.
 */
export interface MarketDataAssetRef {
  assetId: AssetId;
  ticker: string;
  exchange: string;
  currency: Currency;
  assetType: AssetType;
}

/**
 * Adapter-specific provider symbol. Scoped to a provider: the same asset
 * maps to different symbols on different providers (e.g. `PETR4.SA` on
 * Stooq vs `PETR4` on a B3-native API). Never replaces `AssetId`.
 */
export interface MarketDataSymbol {
  provider: MarketDataSource;
  providerSymbol: string;
  assetId: AssetId;
}

const B3_EXCHANGES = ['B3', 'BVMF', 'B3SA', 'BMFBOVESPA'] as const;
const US_EXCHANGES = ['NASDAQ', 'NYSE', 'NYSEARCA', 'AMEX', 'OTC'] as const;

const SUPPORTED_QUOTE_ASSET_TYPES: readonly AssetType[] = ['STOCK', 'FII', 'ETF', 'BDR'];

export function assetRefFromAsset(asset: Asset): MarketDataAssetRef {
  return {
    assetId: asset.id,
    ticker: asset.ticker,
    exchange: asset.exchange,
    currency: asset.currency,
    assetType: asset.type,
  };
}

/**
 * Resolves the provider-specific symbol for an asset.
 *
 * - B3-listed instruments map to `<TICKER>.SA` on suffix-style providers
 *   (e.g. Stooq). The `.SA` suffix is adapter metadata and is never
 *   stored as the canonical ticker.
 * - US-listed instruments map to the bare ticker.
 * - Fixed income and other unsupported types throw `UNSUPPORTED_ASSET`
 *   instead of inventing a quotation.
 * - Exchange-aware: identical tickers on different exchanges resolve
 *   to distinct provider symbols.
 */
export function resolveMarketDataSymbol(
  ref: MarketDataAssetRef,
  provider: MarketDataSource,
): MarketDataSymbol {
  if (!SUPPORTED_QUOTE_ASSET_TYPES.includes(ref.assetType)) {
    throw new MarketDataError(
      `Asset type '${ref.assetType}' has no market quotation support`,
      'MARKET_DATA.UNSUPPORTED_ASSET',
      { retryable: false, assetId: ref.assetId },
    );
  }
  const exchange = ref.exchange.trim().toUpperCase();
  const ticker = ref.ticker.trim().toUpperCase();
  if (ticker === '') {
    throw new MarketDataError(
      'Cannot resolve provider symbol for empty ticker',
      'MARKET_DATA.UNSUPPORTED_ASSET',
      {
        retryable: false,
        assetId: ref.assetId,
      },
    );
  }
  if ((B3_EXCHANGES as readonly string[]).includes(exchange)) {
    const suffix = provider === 'STOOQ' || provider === 'YAHOO' ? '.SA' : '';
    return { provider, providerSymbol: `${ticker}${suffix}`, assetId: ref.assetId };
  }
  if ((US_EXCHANGES as readonly string[]).includes(exchange)) {
    return { provider, providerSymbol: ticker, assetId: ref.assetId };
  }
  return { provider, providerSymbol: `${ticker}.${exchange}`, assetId: ref.assetId };
}

/**
 * Deterministic cache key. The provider is part of the key because the
 * same asset maps to different symbols on different providers.
 */
export function buildMarketQuoteCacheKey(
  provider: MarketDataSource,
  providerSymbol: string,
): string {
  return `${provider}::${providerSymbol.trim().toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Provider abstraction (batch-first)
// ---------------------------------------------------------------------------

/**
 * Per-asset unavailable entry for partial batch success.
 */
export interface UnavailableQuote {
  assetId: string;
  code: MarketDataErrorCode;
  retryable: boolean;
}

/**
 * Batch result with partial-success semantics: valid quotes plus
 * per-asset unavailable entries. A batch NEVER fails as a whole
 * because of a single unknown symbol.
 */
export interface BatchQuoteResult {
  quotes: MarketQuote[];
  unavailable: UnavailableQuote[];
}

export function createEmptyBatchResult(): BatchQuoteResult {
  return { quotes: [], unavailable: [] };
}

/**
 * Canonical provider contract. Every adapter (real or mock) implements
 * this interface and NOTHING provider-specific may leak past it:
 * no `YahooFinanceQuote`, `StooqRow`, `BrapiQuote` types outside the
 * adapter module.
 */
export interface MarketDataProvider {
  readonly provider: MarketDataSource;
  getQuote(ref: MarketDataAssetRef): Promise<MarketQuote>;
  getQuotes(refs: readonly MarketDataAssetRef[]): Promise<BatchQuoteResult>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const MARKET_DATA_DEFAULT_TIMEOUT_MS = 8000;
export const MARKET_DATA_DEFAULT_CACHE_TTL_SECONDS = 60;
export const MARKET_DATA_MAX_BATCH_SIZE = 100;

export interface MarketDataConfig {
  provider: MarketDataSource;
  timeoutMs: number;
  cacheTtlSeconds: number;
  maxBatchSize: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^\d+$/.test(raw.trim())) return fallback;
  const parsed = parseInt(raw.trim(), 10);
  return parsed > 0 ? parsed : fallback;
}

/**
 * Reads provider configuration from the environment. No hardcoded
 * TTLs, timeouts or provider names anywhere else in the codebase.
 */
export function readMarketDataConfigFromEnv(
  env: Record<string, string | undefined>,
): MarketDataConfig {
  const providerRaw = (env.MARKET_DATA_PROVIDER ?? 'STOOQ').trim().toUpperCase();
  const provider = assertValidMarketDataSource(providerRaw);
  return {
    provider,
    timeoutMs: parsePositiveInt(env.MARKET_DATA_TIMEOUT_MS, MARKET_DATA_DEFAULT_TIMEOUT_MS),
    cacheTtlSeconds: parsePositiveInt(
      env.MARKET_DATA_CACHE_TTL_SECONDS,
      MARKET_DATA_DEFAULT_CACHE_TTL_SECONDS,
    ),
    maxBatchSize: Math.min(
      parsePositiveInt(env.MARKET_DATA_MAX_BATCH, MARKET_DATA_MAX_BATCH_SIZE),
      MARKET_DATA_MAX_BATCH_SIZE,
    ),
  };
}

// ---------------------------------------------------------------------------
// Quote cache
// ---------------------------------------------------------------------------

interface QuoteCacheEntry {
  quote: MarketQuote;
  expiresAtMs: number;
  cachedAtMs: number;
  hitCount: number;
}

export interface QuoteCacheStats {
  hits: number;
  misses: number;
  size: number;
}

/**
 * Minimal TTL quote cache: reduces external requests and protects the
 * provider from N+1 fan-out. Keyed by `provider + providerSymbol`.
 * Expired entries are served as STALE (explicitly marked) when
 * `allowStale` is set, never masqueraded as fresh.
 */
export class InMemoryQuoteCache {
  private readonly entries = new Map<string, QuoteCacheEntry>();
  private hits = 0;
  private misses = 0;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  get(key: string, options: { allowStale?: boolean } = {}): MarketQuote | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    const nowMs = this.now();
    if (nowMs <= entry.expiresAtMs) {
      this.hits += 1;
      entry.hitCount += 1;
      return entry.quote;
    }
    if (options.allowStale) {
      this.hits += 1;
      entry.hitCount += 1;
      const stale: MarketQuote = Object.freeze({
        ...entry.quote,
        freshness: 'STALE' as QuoteFreshness,
        status: 'STALE' as QuoteStatus,
      });
      return stale;
    }
    this.entries.delete(key);
    this.misses += 1;
    return null;
  }

  set(key: string, quote: MarketQuote, ttlSeconds: number): void {
    const nowMs = this.now();
    this.entries.set(key, {
      quote,
      expiresAtMs: nowMs + ttlSeconds * 1000,
      cachedAtMs: nowMs,
      hitCount: 0,
    });
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): QuoteCacheStats {
    return { hits: this.hits, misses: this.misses, size: this.entries.size };
  }
}

// ---------------------------------------------------------------------------
// Market data service (orchestrator)
// ---------------------------------------------------------------------------

export interface MarketDataServiceStats {
  cacheHits: number;
  cacheMisses: number;
  providerCalls: number;
  providerErrors: number;
  quotesRequested: number;
}

/**
 * Orchestrator: resolves provider symbols, serves the cache, fans out
 * batch requests, normalizes errors and returns canonical quotes.
 * Knows NOTHING about portfolios, positions or valuation.
 */
export class MarketDataService {
  private readonly provider: MarketDataProvider;
  private readonly cache: InMemoryQuoteCache;
  private readonly config: MarketDataConfig;
  private readonly now: () => number;
  private readonly stats: MarketDataServiceStats = {
    cacheHits: 0,
    cacheMisses: 0,
    providerCalls: 0,
    providerErrors: 0,
    quotesRequested: 0,
  };

  constructor(options: {
    provider: MarketDataProvider;
    cache?: InMemoryQuoteCache;
    config: MarketDataConfig;
    now?: () => number;
  }) {
    this.provider = options.provider;
    this.cache = options.cache ?? new InMemoryQuoteCache(options.now);
    this.config = options.config;
    this.now = options.now ?? (() => Date.now());
  }

  get providerName(): MarketDataSource {
    return this.provider.provider;
  }

  getStats(): MarketDataServiceStats {
    return { ...this.stats };
  }

  async getQuote(ref: MarketDataAssetRef): Promise<MarketQuote> {
    const result = await this.getQuotes([ref]);
    const quote = result.quotes.find((q) => q.assetId === ref.assetId);
    if (!quote) {
      const unavailable = result.unavailable.find((u) => u.assetId === ref.assetId);
      throw new MarketDataError(
        `Quote unavailable for asset '${ref.assetId}' (${unavailable?.code ?? 'MARKET_DATA.SYMBOL_NOT_FOUND'})`,
        (unavailable?.code ?? 'MARKET_DATA.SYMBOL_NOT_FOUND') as MarketDataErrorCode,
        { retryable: unavailable?.retryable ?? false, assetId: ref.assetId },
      );
    }
    return quote;
  }

  async getQuotes(refs: readonly MarketDataAssetRef[]): Promise<BatchQuoteResult> {
    if (refs.length === 0) {
      return createEmptyBatchResult();
    }
    const seen = new Set<string>();
    const deduped: MarketDataAssetRef[] = [];
    for (const ref of refs) {
      if (!seen.has(ref.assetId)) {
        seen.add(ref.assetId);
        deduped.push(ref);
      }
    }
    if (deduped.length > this.config.maxBatchSize) {
      throw new MarketDataError(
        `Batch of ${deduped.length} assets exceeds the limit of ${this.config.maxBatchSize}`,
        'MARKET_DATA.BATCH_LIMIT_EXCEEDED',
        { retryable: false },
      );
    }
    this.stats.quotesRequested += deduped.length;

    const result: BatchQuoteResult = createEmptyBatchResult();
    const misses: MarketDataAssetRef[] = [];

    for (const ref of deduped) {
      let symbol: MarketDataSymbol;
      try {
        symbol = resolveMarketDataSymbol(ref, this.provider.provider);
      } catch (err) {
        if (err instanceof MarketDataError) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: err.code,
            retryable: err.retryable,
          });
          continue;
        }
        throw err;
      }
      const key = buildMarketQuoteCacheKey(this.provider.provider, symbol.providerSymbol);
      const cached = this.cache.get(key);
      if (cached) {
        this.stats.cacheHits += 1;
        result.quotes.push(refreshFreshness(cached, this.now(), this.config.cacheTtlSeconds));
      } else {
        this.stats.cacheMisses += 1;
        misses.push(ref);
      }
    }

    if (misses.length > 0) {
      this.stats.providerCalls += 1;
      let batch: BatchQuoteResult;
      try {
        batch = await this.provider.getQuotes(misses);
      } catch (err) {
        this.stats.providerErrors += 1;
        if (err instanceof MarketDataError) {
          for (const ref of misses) {
            result.unavailable.push({
              assetId: ref.assetId,
              code: err.code,
              retryable: err.retryable,
            });
          }
          return sortBatchResult(result);
        }
        throw err;
      }
      for (const quote of batch.quotes) {
        const fresh = refreshFreshness(quote, this.now(), this.config.cacheTtlSeconds);
        result.quotes.push(fresh);
        try {
          const symbol = resolveMarketDataSymbol(
            misses.find((m) => m.assetId === quote.assetId) ??
              deduped.find((d) => d.assetId === quote.assetId)!,
            this.provider.provider,
          );
          this.cache.set(
            buildMarketQuoteCacheKey(this.provider.provider, symbol.providerSymbol),
            fresh,
            this.config.cacheTtlSeconds,
          );
        } catch {
          // Resolution already validated above; defensive no-op.
        }
      }
      for (const unavailable of batch.unavailable) {
        result.unavailable.push(unavailable);
      }
    }

    return sortBatchResult(result);
  }
}

function refreshFreshness(quote: MarketQuote, nowMs: number, ttlSeconds: number): MarketQuote {
  const freshness = getQuoteFreshness(quote.asOf, nowMs, ttlSeconds);
  if (freshness === quote.freshness) return quote;
  return Object.freeze({ ...quote, freshness });
}

function sortBatchResult(result: BatchQuoteResult): BatchQuoteResult {
  const quotes = [...result.quotes].sort((a, b) =>
    a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0,
  );
  const unavailable = [...result.unavailable].sort((a, b) =>
    a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0,
  );
  return { quotes, unavailable };
}

// ---------------------------------------------------------------------------
// Deterministic mock provider (tests only — never hits the network)
// ---------------------------------------------------------------------------

export interface MockSeedQuote {
  providerSymbol: string;
  price: string;
  currency: string;
  status?: QuoteStatus;
  marketTime?: string;
  asOf?: string;
}

export type MockFailureKind =
  'TIMEOUT' | 'RATE_LIMITED' | 'AUTHENTICATION_FAILED' | 'PROVIDER_UNAVAILABLE';

/**
 * Deterministic in-memory provider for unit/integration tests and CI.
 * Zero network, zero randomness: every quote is seeded explicitly and
 * `receivedAt`/`asOf` derive from the injected clock.
 */
export class InMemoryMarketDataProvider implements MarketDataProvider {
  readonly provider: MarketDataSource = 'IN_MEMORY';
  private readonly seeds = new Map<string, MockSeedQuote>();
  private readonly failures = new Map<string, MockFailureKind>();
  private readonly now: () => number;
  calls = 0;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  seed(quote: MockSeedQuote): void {
    this.seeds.set(quote.providerSymbol.trim().toUpperCase(), quote);
  }

  failWith(providerSymbol: string, kind: MockFailureKind): void {
    this.failures.set(providerSymbol.trim().toUpperCase(), kind);
  }

  clearFailure(providerSymbol: string): void {
    this.failures.delete(providerSymbol.trim().toUpperCase());
  }

  private buildQuote(ref: MarketDataAssetRef, seed: MockSeedQuote): MarketQuote {
    const nowIso = new Date(this.now()).toISOString();
    return createMarketQuote({
      assetId: ref.assetId,
      price: seed.price,
      currency: seed.currency,
      asOf: seed.asOf ?? seed.marketTime ?? nowIso,
      receivedAt: nowIso,
      ...(seed.marketTime ? { marketTime: seed.marketTime } : {}),
      source: 'IN_MEMORY',
      status: seed.status ?? 'DELAYED',
      providerSymbol: seed.providerSymbol,
    });
  }

  private failureFor(symbol: string, assetId: string): MarketDataError | null {
    const kind = this.failures.get(symbol.trim().toUpperCase());
    if (!kind) return null;
    switch (kind) {
      case 'TIMEOUT':
        return new MarketDataError(
          `Mock provider timed out for '${symbol}'`,
          'MARKET_DATA.TIMEOUT',
          {
            retryable: true,
            assetId,
          },
        );
      case 'RATE_LIMITED':
        return new MarketDataError(
          `Mock provider rate limited for '${symbol}'`,
          'MARKET_DATA.RATE_LIMITED',
          {
            retryable: true,
            assetId,
          },
        );
      case 'AUTHENTICATION_FAILED':
        return new MarketDataError(
          'Mock provider authentication failed',
          'MARKET_DATA.AUTHENTICATION_FAILED',
          {
            retryable: false,
            assetId,
          },
        );
      case 'PROVIDER_UNAVAILABLE':
        return new MarketDataError(
          'Mock provider unavailable',
          'MARKET_DATA.PROVIDER_UNAVAILABLE',
          {
            retryable: true,
            assetId,
          },
        );
    }
  }

  async getQuote(ref: MarketDataAssetRef): Promise<MarketQuote> {
    this.calls += 1;
    const symbol = resolveMarketDataSymbol(ref, 'IN_MEMORY');
    const key = symbol.providerSymbol.trim().toUpperCase();
    const failure = this.failureFor(key, ref.assetId);
    if (failure) throw failure;
    const seed = this.seeds.get(key);
    if (!seed) {
      throw new MarketDataError(
        `Symbol '${symbol.providerSymbol}' not found in mock provider`,
        'MARKET_DATA.SYMBOL_NOT_FOUND',
        {
          retryable: false,
          assetId: ref.assetId,
        },
      );
    }
    return this.buildQuote(ref, seed);
  }

  async getQuotes(refs: readonly MarketDataAssetRef[]): Promise<BatchQuoteResult> {
    this.calls += 1;
    const result = createEmptyBatchResult();
    for (const ref of refs) {
      let symbol: MarketDataSymbol;
      try {
        symbol = resolveMarketDataSymbol(ref, 'IN_MEMORY');
      } catch (err) {
        if (err instanceof MarketDataError) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: err.code,
            retryable: err.retryable,
          });
          continue;
        }
        throw err;
      }
      const key = symbol.providerSymbol.trim().toUpperCase();
      const failure = this.failureFor(key, ref.assetId);
      if (failure) {
        // Whole-batch transient failures short-circuit; per-symbol
        // not-found stays partial.
        if (
          failure.code === 'MARKET_DATA.TIMEOUT' ||
          failure.code === 'MARKET_DATA.PROVIDER_UNAVAILABLE'
        ) {
          throw failure;
        }
        result.unavailable.push({
          assetId: ref.assetId,
          code: failure.code,
          retryable: failure.retryable,
        });
        continue;
      }
      const seed = this.seeds.get(key);
      if (!seed) {
        result.unavailable.push({
          assetId: ref.assetId,
          code: 'MARKET_DATA.SYMBOL_NOT_FOUND',
          retryable: false,
        });
        continue;
      }
      try {
        result.quotes.push(this.buildQuote(ref, seed));
      } catch (err) {
        if (err instanceof MarketDataError) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: err.code,
            retryable: err.retryable,
          });
          continue;
        }
        throw err;
      }
    }
    return sortBatchResult(result);
  }
}

// ---------------------------------------------------------------------------
// Stooq provider adapter (first real adapter)
// ---------------------------------------------------------------------------

const STOOQ_CSV_URL = 'https://stooq.com/q/l/';
const STOOQ_PRICE_REGEX = /^-?\d+(\.\d+)?$/;

/** Adapter-internal row. Deliberately NOT exported: provider-specific
 * types must never leak outside the adapter. */
type StooqCsvRow = {
  symbol: string;
  close: string;
  date: string;
  time: string;
};

function parseStooqCsv(csv: string): StooqCsvRow[] {
  const lines = csv
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 2) return [];
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
  const symbolIdx = header.indexOf('symbol');
  const closeIdx = header.indexOf('close');
  const dateIdx = header.indexOf('date');
  const timeIdx = header.indexOf('time');
  if (symbolIdx === -1 || closeIdx === -1) return [];
  const rows: StooqCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    rows.push({
      symbol: (cols[symbolIdx] ?? '').trim(),
      close: (cols[closeIdx] ?? '').trim(),
      date: dateIdx === -1 ? '' : (cols[dateIdx] ?? '').trim(),
      time: timeIdx === -1 ? '' : (cols[timeIdx] ?? '').trim(),
    });
  }
  return rows;
}

function stooqRowToQuote(
  ref: MarketDataAssetRef,
  symbol: string,
  row: StooqCsvRow,
  receivedAtIso: string,
): MarketQuote | null {
  if (!STOOQ_PRICE_REGEX.test(row.close)) return null;
  let marketTime: string | undefined;
  if (row.date !== '' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    const timePart = /^\d{2}:\d{2}(:\d{2})?$/.test(row.time) ? row.time : '00:00:00';
    const candidate = `${row.date}T${timePart.length === 5 ? `${timePart}:00` : timePart}Z`;
    if (Number.isFinite(Date.parse(candidate))) {
      marketTime = candidate;
    }
  }
  try {
    // Stooq free quotes are delayed/EOD by nature: never presented as LIVE.
    return createMarketQuote({
      assetId: ref.assetId,
      price: row.close,
      currency: ref.currency,
      asOf: marketTime ?? receivedAtIso,
      receivedAt: receivedAtIso,
      ...(marketTime ? { marketTime } : {}),
      source: 'STOOQ',
      status: 'DELAYED',
      providerSymbol: symbol,
    });
  } catch {
    return null;
  }
}

/**
 * First real provider adapter: Stooq free CSV quotes.
 *
 * Why Stooq (ADR-091): Brazilian coverage (B3 via `.SA` suffix),
 * equities/FIIs/ETFs/BDRs, native batch (comma-separated symbols),
 * no API key for development, stable CSV contract. Free quotes are
 * delayed — always surfaced as `DELAYED`, never `LIVE`.
 *
 * Currency note: the Stooq CSV carries no currency field, so the quote
 * currency is the instrument's canonical currency from the asset
 * catalog (`ref.currency`). No silent conversion is ever performed.
 */
export class StooqProviderAdapter implements MarketDataProvider {
  readonly provider: MarketDataSource = 'STOOQ';
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: { timeoutMs?: number; fetchFn?: typeof fetch } = {}) {
    this.timeoutMs = options.timeoutMs ?? MARKET_DATA_DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getQuote(ref: MarketDataAssetRef): Promise<MarketQuote> {
    const batch = await this.getQuotes([ref]);
    const quote = batch.quotes.find((q) => q.assetId === ref.assetId);
    if (!quote) {
      const unavailable = batch.unavailable.find((u) => u.assetId === ref.assetId);
      throw new MarketDataError(
        `Quote unavailable for asset '${ref.assetId}' (${unavailable?.code ?? 'MARKET_DATA.SYMBOL_NOT_FOUND'})`,
        (unavailable?.code ?? 'MARKET_DATA.SYMBOL_NOT_FOUND') as MarketDataErrorCode,
        { retryable: unavailable?.retryable ?? false, assetId: ref.assetId },
      );
    }
    return quote;
  }

  async getQuotes(refs: readonly MarketDataAssetRef[]): Promise<BatchQuoteResult> {
    const result = createEmptyBatchResult();
    const supported: Array<{ ref: MarketDataAssetRef; symbol: string }> = [];
    for (const ref of refs) {
      try {
        const symbol = resolveMarketDataSymbol(ref, 'STOOQ');
        supported.push({ ref, symbol: symbol.providerSymbol });
      } catch (err) {
        if (err instanceof MarketDataError) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: err.code,
            retryable: err.retryable,
          });
          continue;
        }
        throw err;
      }
    }
    if (supported.length === 0) return sortBatchResult(result);

    const symbolsParam = supported.map((s) => s.symbol.toLowerCase()).join(',');
    const url = `${STOOQ_CSV_URL}?s=${encodeURIComponent(symbolsParam)}&f=sd2t2ohlcv&h&e=csv`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const timedOut =
        err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
      throw normalizeProviderError(timedOut ? { timedOut: true } : { code: 'NETWORK_ERROR' }, {
        provider: 'STOOQ',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw normalizeProviderError({ httpStatus: response.status }, { provider: 'STOOQ' });
    }
    let csv: string;
    try {
      csv = await response.text();
    } catch {
      throw normalizeProviderError({}, { provider: 'STOOQ' });
    }
    const rows = parseStooqCsv(csv);
    if (rows.length === 0) {
      throw normalizeProviderError({}, { provider: 'STOOQ' });
    }
    const receivedAtIso = new Date().toISOString();
    const bySymbol = new Map<string, StooqCsvRow>();
    for (const row of rows) {
      bySymbol.set(row.symbol.trim().toUpperCase(), row);
    }
    for (const { ref, symbol } of supported) {
      const row = bySymbol.get(symbol.trim().toUpperCase());
      if (
        !row ||
        row.close === '' ||
        row.close.toUpperCase() === 'N/A' ||
        row.close.toUpperCase() === 'NULL'
      ) {
        result.unavailable.push({
          assetId: ref.assetId,
          code: 'MARKET_DATA.SYMBOL_NOT_FOUND',
          retryable: false,
        });
        continue;
      }
      const quote = stooqRowToQuote(ref, symbol, row, receivedAtIso);
      if (!quote) {
        result.unavailable.push({
          assetId: ref.assetId,
          code: 'MARKET_DATA.INVALID_RESPONSE',
          retryable: false,
        });
        continue;
      }
      result.quotes.push(quote);
    }
    return sortBatchResult(result);
  }
}

// ---------------------------------------------------------------------------
// Historical Market Data (Phase 3D)
// ---------------------------------------------------------------------------

export const HISTORICAL_PRICE_STATUSES = ['EXACT', 'PREVIOUS_TRADING_DAY', 'UNAVAILABLE'] as const;
export type HistoricalPriceStatus = (typeof HISTORICAL_PRICE_STATUSES)[number];

export const HISTORICAL_ERROR_CODES = [
  'HISTORICAL_PRICE_NOT_FOUND',
  'HISTORICAL_PROVIDER_UNAVAILABLE',
  'HISTORICAL_INVALID_RESPONSE',
  'HISTORICAL_UNSUPPORTED_ASSET',
  'HISTORICAL_RANGE_TOO_LARGE',
] as const;
export type HistoricalErrorCode = (typeof HISTORICAL_ERROR_CODES)[number];

export interface HistoricalMarketPrice {
  assetId: string;
  date: LocalDate;
  close: Money;
  currency: Currency;
  source: MarketDataSource;
  status: HistoricalPriceStatus;
}

export interface ResolvedHistoricalPrice {
  requestedDate: LocalDate;
  priceDate: LocalDate;
  price: HistoricalMarketPrice;
  resolution: 'EXACT' | 'PREVIOUS_TRADING_DAY';
}

export interface HistoricalMarketDataProvider {
  readonly provider: MarketDataSource;
  getDailyPrice(assetRef: MarketDataAssetRef, date: LocalDate): Promise<HistoricalMarketPrice>;
  getDailyPrices(
    assetRef: MarketDataAssetRef,
    from: LocalDate,
    to: LocalDate,
  ): Promise<HistoricalMarketPrice[]>;
}

export const HISTORICAL_DEFAULT_MAX_LOOKBACK_DAYS = 7;
export const HISTORICAL_DEFAULT_MAX_RANGE_DAYS = 365 * 5; // 5 years

export class InMemoryHistoricalMarketDataProvider implements HistoricalMarketDataProvider {
  readonly provider: MarketDataSource = 'IN_MEMORY';
  private readonly prices = new Map<string, Map<string, HistoricalMarketPrice>>();
  private readonly maxLookbackDays: number;
  calls = 0;

  constructor(options: { maxLookbackDays?: number } = {}) {
    this.maxLookbackDays = options.maxLookbackDays ?? HISTORICAL_DEFAULT_MAX_LOOKBACK_DAYS;
  }

  seed(price: {
    assetId?: string;
    ticker: string;
    exchange: string;
    date: string;
    close: string;
    currency: string;
    source?: MarketDataSource;
  }): void {
    const assetKey = `${price.ticker.trim().toUpperCase()}::${price.exchange.trim().toUpperCase()}`;
    let assetMap = this.prices.get(assetKey);
    if (!assetMap) {
      assetMap = new Map();
      this.prices.set(assetKey, assetMap);
    }
    const date = LocalDate.from(price.date);
    const close = Money.from(price.close, price.currency);
    const hp: HistoricalMarketPrice = {
      assetId: price.assetId ?? assetKey,
      date,
      close,
      currency: close.currency,
      source: price.source ?? 'IN_MEMORY',
      status: 'EXACT',
    };
    assetMap.set(date.toString(), hp);
  }

  async getDailyPrice(
    assetRef: MarketDataAssetRef,
    date: LocalDate,
  ): Promise<HistoricalMarketPrice> {
    this.calls++;
    const key = `${assetRef.ticker.trim().toUpperCase()}::${assetRef.exchange.trim().toUpperCase()}`;
    const assetMap = this.prices.get(key);
    if (!assetMap) {
      throw new MarketDataError(
        `Historical price not found for ${assetRef.ticker} on ${date.toString()}`,
        'MARKET_DATA.SYMBOL_NOT_FOUND',
        {
          retryable: false,
          assetId: assetRef.assetId,
        },
      );
    }

    // Exact match
    const exact = assetMap.get(date.toString());
    if (exact) {
      return Object.freeze({ ...exact, status: 'EXACT' as HistoricalPriceStatus });
    }

    // Previous trading day within maxLookback, no future leakage
    let current = date;
    for (let i = 1; i <= this.maxLookbackDays; i++) {
      const prev = addDays(current, -1);
      // Check if prev is before the requested date's previous days, but not future
      const candidate = assetMap.get(prev.toString());
      if (candidate) {
        return Object.freeze({
          ...candidate,
          date: prev,
          status: 'PREVIOUS_TRADING_DAY' as HistoricalPriceStatus,
        });
      }
      current = prev;
    }

    throw new MarketDataError(
      `Historical price not found for ${assetRef.ticker} on ${date.toString()} within ${this.maxLookbackDays} days`,
      'MARKET_DATA.SYMBOL_NOT_FOUND',
      {
        retryable: false,
        assetId: assetRef.assetId,
      },
    );
  }

  async getDailyPrices(
    assetRef: MarketDataAssetRef,
    from: LocalDate,
    to: LocalDate,
  ): Promise<HistoricalMarketPrice[]> {
    this.calls++;
    if (from.compare(to) > 0) {
      throw new MarketDataError('Invalid range: from > to', 'MARKET_DATA.INVALID_RESPONSE', {
        retryable: false,
      });
    }
    const days = daysBetweenLocalDates(from, to);
    if (days > HISTORICAL_DEFAULT_MAX_RANGE_DAYS) {
      throw new MarketDataError('Historical range too large', 'MARKET_DATA.INVALID_RESPONSE', {
        retryable: false,
      });
    }
    const result: HistoricalMarketPrice[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      try {
        const price = await this.getDailyPrice(assetRef, current);
        // Only include EXACT matches for range, not previous day resolutions to avoid duplicates
        if (price.status === 'EXACT') {
          result.push(price);
        }
      } catch {
        // Skip missing dates
      }
      current = addDays(current, 1);
    }
    return result.map((p) => Object.freeze(p));
  }
}

export class StooqHistoricalMarketDataProvider implements HistoricalMarketDataProvider {
  readonly provider: MarketDataSource = 'STOOQ';
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxLookbackDays: number;

  constructor(
    options: { timeoutMs?: number; fetchFn?: typeof fetch; maxLookbackDays?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxLookbackDays = options.maxLookbackDays ?? HISTORICAL_DEFAULT_MAX_LOOKBACK_DAYS;
  }

  async getDailyPrice(
    assetRef: MarketDataAssetRef,
    date: LocalDate,
  ): Promise<HistoricalMarketPrice> {
    // Fetch a small window around the requested date to allow previous trading day resolution
    // We fetch from (date - maxLookback) to date, then search backwards
    const start = addDays(date, -this.maxLookbackDays);
    const prices = await this.fetchHistory(assetRef, start, date);
    // Search backwards from requestedDate
    let current = date;
    for (let i = 0; i <= this.maxLookbackDays; i++) {
      const found = prices.get(current.toString());
      if (found) {
        const isExact = current.toString() === date.toString();
        return Object.freeze({
          ...found,
          status: isExact
            ? ('EXACT' as HistoricalPriceStatus)
            : ('PREVIOUS_TRADING_DAY' as HistoricalPriceStatus),
        });
      }
      current = addDays(current, -1);
    }
    throw new MarketDataError(
      `Historical price not found for ${assetRef.ticker} on ${date.toString()} within ${this.maxLookbackDays} days`,
      'MARKET_DATA.SYMBOL_NOT_FOUND',
      { retryable: false, assetId: assetRef.assetId },
    );
  }

  async getDailyPrices(
    assetRef: MarketDataAssetRef,
    from: LocalDate,
    to: LocalDate,
  ): Promise<HistoricalMarketPrice[]> {
    if (from.compare(to) > 0) {
      throw new MarketDataError('Invalid range: from > to', 'MARKET_DATA.INVALID_RESPONSE', {
        retryable: false,
      });
    }
    const days = daysBetweenLocalDates(from, to);
    if (days > HISTORICAL_DEFAULT_MAX_RANGE_DAYS) {
      throw new MarketDataError('Historical range too large', 'MARKET_DATA.INVALID_RESPONSE', {
        retryable: false,
      });
    }
    const prices = await this.fetchHistory(assetRef, from, to);
    const result: HistoricalMarketPrice[] = [];
    let current = from;
    while (current.compare(to) <= 0) {
      const found = prices.get(current.toString());
      if (found) {
        result.push(Object.freeze({ ...found, status: 'EXACT' as HistoricalPriceStatus }));
      }
      current = addDays(current, 1);
    }
    return result;
  }

  private async fetchHistory(
    assetRef: MarketDataAssetRef,
    from: LocalDate,
    to: LocalDate,
  ): Promise<Map<string, HistoricalMarketPrice>> {
    const symbol = resolveMarketDataSymbol(assetRef, 'STOOQ').providerSymbol.toLowerCase();
    // Stooq daily history: https://stooq.com/q/d/l/?s=petr4.sa&i=d
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const timedOut =
        err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
      throw normalizeProviderError(timedOut ? { timedOut: true } : { code: 'NETWORK_ERROR' }, {
        provider: 'STOOQ',
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw normalizeProviderError({ httpStatus: response.status }, { provider: 'STOOQ' });
    }
    let csv: string;
    try {
      csv = await response.text();
    } catch {
      throw normalizeProviderError({}, { provider: 'STOOQ' });
    }
    const rows = parseHistoricalStooqCsv(csv);
    const map = new Map<string, HistoricalMarketPrice>();
    for (const row of rows) {
      // Only include rows within [from, to] for efficiency, but we need to allow lookback
      // For getDailyPrice, we fetched from (date - lookback) to date, so include that range
      // For getDailyPrices, from is already the start
      const rowDate = LocalDate.from(row.date);
      if (rowDate.compare(from) < 0 || rowDate.compare(to) > 0) continue;
      if (!row.close || row.close.toUpperCase() === 'N/A' || row.close.toUpperCase() === 'NULL')
        continue;
      try {
        const close = Money.from(row.close, assetRef.currency);
        const hp: HistoricalMarketPrice = {
          assetId: assetRef.assetId,
          date: rowDate,
          close,
          currency: close.currency,
          source: 'STOOQ',
          status: 'EXACT',
        };
        map.set(rowDate.toString(), hp);
      } catch {
        // Skip malformed price
      }
    }
    return map;
  }
}

function parseHistoricalStooqCsv(csv: string): Array<{ date: string; close: string }> {
  const lines = csv
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 2) return [];
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const closeIdx = header.indexOf('close');
  if (dateIdx === -1 || closeIdx === -1) return [];
  const rows: Array<{ date: string; close: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? '').split(',').map((c) => c.trim());
    const date = cols[dateIdx] ?? '';
    const close = cols[closeIdx] ?? '';
    if (!date || !close) continue;
    // Validate date is YYYY-MM-DD and close is decimal
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!/^-?\d+(\.\d+)?$/.test(close)) continue;
    rows.push({ date, close });
  }
  return rows;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function daysBetweenLocalDates(a: LocalDate, b: LocalDate): number {
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export class InMemoryHistoricalPriceCache {
  private readonly cache = new Map<string, HistoricalMarketPrice>();
  hits = 0;
  misses = 0;

  private key(assetRef: MarketDataAssetRef, date: LocalDate): string {
    return `${assetRef.ticker.toUpperCase()}::${assetRef.exchange.toUpperCase()}::${date.toString()}`;
  }

  get(assetRef: MarketDataAssetRef, date: LocalDate): HistoricalMarketPrice | null {
    const k = this.key(assetRef, date);
    const v = this.cache.get(k);
    if (v) {
      this.hits++;
      return v;
    }
    this.misses++;
    return null;
  }

  set(assetRef: MarketDataAssetRef, date: LocalDate, price: HistoricalMarketPrice): void {
    this.cache.set(this.key(assetRef, date), price);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

// ---------------------------------------------------------------------------
// Canonical Trading Date & Zero-Float Decimal Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes any timestamp or date into canonical civil LocalDate (YYYY-MM-DD)
 * evaluated strictly under America/Sao_Paulo (UTC-3).
 *
 * Prevents UTC timestamps near or after midnight (e.g. 21:30 BRT = 00:30 UTC next day)
 * from rolling over into the next trading day.
 */
export function normalizeTradingDate(input: string | number | Date): LocalDate {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    // Direct YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return LocalDate.from(trimmed);
    }
  }

  let ms: number;
  if (typeof input === 'number') {
    // If seconds timestamp (10 digits Unix), convert to ms
    ms = input < 1e11 ? input * 1000 : input;
  } else if (input instanceof Date) {
    ms = input.getTime();
  } else {
    ms = Date.parse(input);
  }

  if (!Number.isFinite(ms)) {
    throw new MarketDataError(
      `Invalid timestamp for trading date: '${String(input)}'`,
      'MARKET_DATA.INVALID_TIMESTAMP',
    );
  }

  // Format using Intl.DateTimeFormat in America/Sao_Paulo
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.format(new Date(ms)); // en-CA gives YYYY-MM-DD
  return LocalDate.from(parts);
}

/**
 * Normalizes raw numbers or numeric strings from providers to exact decimal strings
 * without IEEE 754 precision distortion.
 */
export function toCanonicalDecimalString(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return null;
    if (!DECIMAL_STRING_REGEX.test(trimmed)) {
      throw new MarketDataError(
        `Invalid decimal price string: '${value}'`,
        'MARKET_DATA.INVALID_PRICE',
      );
    }
    return trimmed;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new MarketDataError(
        `Invalid non-finite number: '${value}'`,
        'MARKET_DATA.INVALID_PRICE',
      );
    }
    // Strip floating point noise to 6 decimal places, removing redundant trailing zeros
    const fixed = value.toFixed(6);
    const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    return trimmed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Brapi Provider Adapters (Phase 5A Canonical Primary)
// ---------------------------------------------------------------------------

export interface BrapiAdapterOptions {
  token?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class BrapiProviderAdapter implements MarketDataProvider {
  readonly provider: MarketDataSource = 'BRAPI';
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: BrapiAdapterOptions = {}) {
    this.token = options.token ?? process.env.MARKET_DATA_API_TOKEN ?? process.env.BRAPI_API_KEY;
    this.baseUrl = (
      options.baseUrl ??
      process.env.BRAPI_BASE_URL ??
      'https://brapi.dev/api'
    ).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? MARKET_DATA_DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async getQuote(ref: MarketDataAssetRef): Promise<MarketQuote> {
    const batch = await this.getQuotes([ref]);
    const quote = batch.quotes[0];
    if (quote) {
      return quote;
    }
    const err = batch.unavailable[0];
    if (err) {
      throw new MarketDataError(
        `Failed to fetch quote for asset '${ref.ticker}': ${err.code}`,
        err.code,
        { retryable: err.retryable, assetId: ref.assetId },
      );
    }
    throw new MarketDataError(
      `Quote not found for asset '${ref.ticker}'`,
      'MARKET_DATA.SYMBOL_NOT_FOUND',
      { retryable: false, assetId: ref.assetId },
    );
  }

  async getQuotes(refs: readonly MarketDataAssetRef[]): Promise<BatchQuoteResult> {
    if (refs.length === 0) return createEmptyBatchResult();
    const result: BatchQuoteResult = createEmptyBatchResult();

    for (const ref of refs) {
      try {
        const symbolObj = resolveMarketDataSymbol(ref, 'BRAPI');
        const symbol = symbolObj.providerSymbol;

        const url = new URL(`${this.baseUrl}/quote/${encodeURIComponent(symbol)}`);
        if (this.token) {
          url.searchParams.set('token', this.token);
        }

        const headers: Record<string, string> = {
          'User-Agent': 'Atlas-Invest/0.1.0',
          Accept: 'application/json',
        };
        if (this.token) {
          headers['Authorization'] = `Bearer ${this.token}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        let res: Response;
        try {
          res = await this.fetchFn(url.toString(), {
            method: 'GET',
            headers,
            signal: controller.signal,
          });
        } catch (fetchErr: unknown) {
          clearTimeout(timeout);
          const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError';
          result.unavailable.push({
            assetId: ref.assetId,
            code: isTimeout ? 'MARKET_DATA.TIMEOUT' : 'MARKET_DATA.PROVIDER_UNAVAILABLE',
            retryable: true,
          });
          continue;
        }
        clearTimeout(timeout);

        if (res.status === 401 || res.status === 403) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
          const isMissingToken = body.code === 'MISSING_TOKEN' || !this.token;
          result.unavailable.push({
            assetId: ref.assetId,
            code: isMissingToken
              ? 'MARKET_DATA.AUTHENTICATION_REQUIRED'
              : 'MARKET_DATA.AUTHENTICATION_FAILED',
            retryable: false,
          });
          continue;
        }

        if (res.status === 404) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: 'MARKET_DATA.SYMBOL_NOT_FOUND',
            retryable: false,
          });
          continue;
        }

        if (res.status === 429) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: 'MARKET_DATA.RATE_LIMITED',
            retryable: true,
          });
          continue;
        }

        if (!res.ok) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: 'MARKET_DATA.PROVIDER_UNAVAILABLE',
            retryable: res.status >= 500,
          });
          continue;
        }

        const data = (await res.json()) as {
          error?: boolean;
          results?: Array<{
            symbol?: string;
            currency?: string;
            regularMarketPrice?: number;
            regularMarketOpen?: number;
            regularMarketDayHigh?: number;
            regularMarketDayLow?: number;
            regularMarketVolume?: number;
            regularMarketTime?: string;
          }>;
        };

        if (data.error || !data.results || data.results.length === 0) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: 'MARKET_DATA.INVALID_RESPONSE',
            retryable: false,
          });
          continue;
        }

        const quoteItem = data.results[0];
        if (!quoteItem) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: 'MARKET_DATA.INVALID_RESPONSE',
            retryable: false,
          });
          continue;
        }

        const priceStr = toCanonicalDecimalString(quoteItem.regularMarketPrice);
        if (!priceStr || priceStr === '0' || priceStr.startsWith('-')) {
          result.unavailable.push({
            assetId: ref.assetId,
            code: 'MARKET_DATA.INVALID_PRICE',
            retryable: false,
          });
          continue;
        }

        const currency = quoteItem.currency ?? ref.currency ?? 'BRL';
        const marketTime = quoteItem.regularMarketTime;
        const nowIso = new Date().toISOString();
        const asOf = marketTime ? new Date(marketTime).toISOString() : nowIso;

        const quote = createMarketQuote({
          assetId: ref.assetId,
          price: priceStr,
          currency,
          asOf,
          receivedAt: nowIso,
          marketTime: marketTime ? new Date(marketTime).toISOString() : undefined,
          source: 'BRAPI',
          status: 'EOD',
          providerSymbol: symbol,
        });

        result.quotes.push(quote);
      } catch (err: unknown) {
        const code = err instanceof MarketDataError ? err.code : 'MARKET_DATA.INVALID_RESPONSE';
        result.unavailable.push({
          assetId: ref.assetId,
          code,
          retryable: false,
        });
      }
    }

    return result;
  }
}

export class BrapiHistoricalMarketDataProvider implements HistoricalMarketDataProvider {
  readonly provider: MarketDataSource = 'BRAPI';
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: BrapiAdapterOptions = {}) {
    this.token = options.token ?? process.env.MARKET_DATA_API_TOKEN ?? process.env.BRAPI_API_KEY;
    this.baseUrl = (
      options.baseUrl ??
      process.env.BRAPI_BASE_URL ??
      'https://brapi.dev/api'
    ).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? MARKET_DATA_DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async getDailyPrice(
    assetRef: MarketDataAssetRef,
    date: LocalDate,
  ): Promise<HistoricalMarketPrice> {
    const prices = await this.getDailyPrices(assetRef, date, date);
    const found = prices.find((p) => p.date.equals(date));
    if (found) return found;

    return {
      assetId: assetRef.assetId,
      date,
      close: Money.from('0.01', assetRef.currency),
      currency: assetRef.currency,
      source: 'BRAPI',
      status: 'UNAVAILABLE',
    };
  }

  async getDailyPrices(
    assetRef: MarketDataAssetRef,
    from: LocalDate,
    to: LocalDate,
  ): Promise<HistoricalMarketPrice[]> {
    const symbolObj = resolveMarketDataSymbol(assetRef, 'BRAPI');
    const symbol = symbolObj.providerSymbol;

    // Calculate approximate range needed (e.g. 5d, 1mo, 3mo, 1y, 2y, 5y, max)
    const days = daysBetweenLocalDates(from, to) + 1;
    let range = '5d';
    if (days <= 5) range = '5d';
    else if (days <= 30) range = '1mo';
    else if (days <= 90) range = '3mo';
    else if (days <= 180) range = '6mo';
    else if (days <= 365) range = '1y';
    else if (days <= 730) range = '2y';
    else if (days <= 1825) range = '5y';
    else range = 'max';

    const url = new URL(`${this.baseUrl}/quote/${encodeURIComponent(symbol)}`);
    url.searchParams.set('range', range);
    url.searchParams.set('interval', '1d');
    if (this.token) {
      url.searchParams.set('token', this.token);
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Atlas-Invest/0.1.0',
      Accept: 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      return [];
    }
    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as {
      results?: Array<{
        currency?: string;
        historicalDataPrice?: Array<{
          date?: number;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          adjustedClose?: number;
          volume?: number;
        }>;
      }>;
    };

    if (!data.results || data.results.length === 0) return [];
    const item = data.results[0];
    if (!item) return [];
    const currency = (item.currency ?? assetRef.currency ?? 'BRL') as Currency;
    const history = item.historicalDataPrice ?? [];

    const prices: HistoricalMarketPrice[] = [];
    for (const row of history) {
      if (!row.date || row.close === undefined || row.close === null) continue;
      const tradeDate = normalizeTradingDate(row.date);
      if (tradeDate.compare(from) >= 0 && tradeDate.compare(to) <= 0) {
        const closeStr = toCanonicalDecimalString(row.close);
        if (!closeStr || closeStr === '0' || closeStr.startsWith('-')) continue;

        prices.push({
          assetId: assetRef.assetId,
          date: tradeDate,
          close: Money.from(closeStr, currency),
          currency,
          source: 'BRAPI',
          status: 'EXACT',
        });
      }
    }

    return prices;
  }
}

// ---------------------------------------------------------------------------
// Phase 5C: Foreign Exchange (FX) Domain & Provider Models
// ---------------------------------------------------------------------------

export const FX_RATE_TYPES = ['MID', 'BID', 'ASK'] as const;
export type FxRateType = (typeof FX_RATE_TYPES)[number];

export const FX_AVAILABILITY = ['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type FxAvailability = (typeof FX_AVAILABILITY)[number];

export interface FxObservation {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  date: LocalDate;
  rate: Quantity;
  rateType: FxRateType;
  source: string;
}

export interface IFxDataProvider {
  readonly provider: string;
  getRate(baseCurrency: Currency, quoteCurrency: Currency, date: LocalDate): Promise<FxObservation>;
  getRates(
    baseCurrency: Currency,
    quoteCurrency: Currency,
    from: LocalDate,
    to: LocalDate,
  ): Promise<FxObservation[]>;
}

export class InMemoryFxDataProvider implements IFxDataProvider {
  readonly provider = 'IN_MEMORY';
  private readonly observations = new Map<string, FxObservation>();

  private key(baseCurrency: Currency, quoteCurrency: Currency, date: LocalDate): string {
    return `${baseCurrency}::${quoteCurrency}::${date.toString()}`;
  }

  addObservation(obs: FxObservation): void {
    this.observations.set(this.key(obs.baseCurrency, obs.quoteCurrency, obs.date), obs);
  }

  async getRate(
    baseCurrency: Currency,
    quoteCurrency: Currency,
    date: LocalDate,
  ): Promise<FxObservation> {
    if (baseCurrency === quoteCurrency) {
      return Object.freeze({
        baseCurrency,
        quoteCurrency,
        date,
        rate: Quantity.from('1'),
        rateType: 'MID',
        source: 'IDENTITY',
      });
    }

    const exact = this.observations.get(this.key(baseCurrency, quoteCurrency, date));
    if (exact) return Object.freeze({ ...exact });

    // Try inversion
    const inverted = this.observations.get(this.key(quoteCurrency, baseCurrency, date));
    if (inverted) {
      const one = Quantity.from('1');
      const invRate = one.divide(inverted.rate);
      return Object.freeze({
        baseCurrency,
        quoteCurrency,
        date,
        rate: invRate,
        rateType: inverted.rateType,
        source: `${inverted.source}_INVERTED`,
      });
    }

    throw new Error(`FX rate not found for ${baseCurrency}/${quoteCurrency} on ${date.toString()}`);
  }

  async getRates(
    baseCurrency: Currency,
    quoteCurrency: Currency,
    from: LocalDate,
    to: LocalDate,
  ): Promise<FxObservation[]> {
    if (from.compare(to) > 0) throw new Error('Invalid range');
    const results: FxObservation[] = [];
    let cur = from;
    while (cur.compare(to) <= 0) {
      try {
        const rate = await this.getRate(baseCurrency, quoteCurrency, cur);
        results.push(rate);
      } catch {
        // Missing rates not pushed
      }
      const d = new Date(Date.UTC(cur.year, cur.month - 1, cur.day + 1));
      cur = LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return results;
  }
}

export class BcbFxDataProvider implements IFxDataProvider {
  readonly provider = 'BCB_PTAX';
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: { timeoutMs?: number; fetchFn?: typeof fetch } = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async getRate(
    baseCurrency: Currency,
    quoteCurrency: Currency,
    date: LocalDate,
  ): Promise<FxObservation> {
    if (baseCurrency === quoteCurrency) {
      return Object.freeze({
        baseCurrency,
        quoteCurrency,
        date,
        rate: Quantity.from('1'),
        rateType: 'MID',
        source: 'IDENTITY',
      });
    }

    const rates = await this.getRates(baseCurrency, quoteCurrency, date, date);
    const found = rates.find((r) => r.date.toString() === date.toString());
    if (!found) {
      throw new Error(
        `BCB PTAX observation not found for ${baseCurrency}/${quoteCurrency} on ${date.toString()}`,
      );
    }
    return found;
  }

  async getRates(
    baseCurrency: Currency,
    quoteCurrency: Currency,
    from: LocalDate,
    to: LocalDate,
  ): Promise<FxObservation[]> {
    if (from.compare(to) > 0) throw new Error('Invalid range');

    // Only BRL pairs supported directly by BCB (e.g. USD/BRL, EUR/BRL)
    const isDirectBrl = quoteCurrency === 'BRL';
    const isInverseBrl = baseCurrency === 'BRL';

    if (!isDirectBrl && !isInverseBrl) {
      throw new Error(
        `BCB PTAX provider only supports crosses against BRL (requested ${baseCurrency}/${quoteCurrency})`,
      );
    }

    const foreignCurrency = isDirectBrl ? baseCurrency : quoteCurrency;

    // BCB SGS Series for daily PTAX closing ask (venda)
    // 10813 = Dólar americano (venda) PTAX fechamento
    // 21619 = Euro (venda) PTAX fechamento
    let seriesId: string;
    if (foreignCurrency === 'USD') {
      seriesId = '10813';
    } else if (foreignCurrency === 'EUR') {
      seriesId = '21619';
    } else {
      throw new Error(`Unsupported currency for BCB PTAX: ${foreignCurrency}`);
    }

    const formatDate = (d: LocalDate): string =>
      `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;

    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados?formato=json&dataInicial=${formatDate(from)}&dataFinal=${formatDate(to)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(
        `BCB PTAX provider unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`BCB PTAX provider error: ${response.status}`);
    }

    let json: Array<{ data: string; valor: string }>;
    try {
      json = (await response.json()) as never;
    } catch {
      throw new Error('BCB PTAX invalid response format');
    }

    const results: FxObservation[] = [];
    for (const row of json) {
      if (!row.data || !row.valor) continue;
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.data.trim());
      if (!match) continue;
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      let date: LocalDate;
      try {
        date = LocalDate.fromParts(year, month, day);
      } catch {
        continue;
      }

      if (date.compare(from) < 0 || date.compare(to) > 0) continue;

      const rateStr = row.valor.trim().replace(',', '.');
      if (!/^-?\d+(\.\d+)?$/.test(rateStr)) continue;

      try {
        let directRate = Quantity.from(rateStr);
        if (isInverseBrl) {
          // Requested BRL / foreignCurrency -> 1 / rate
          const one = Quantity.from('1');
          directRate = one.divide(directRate);
        }

        results.push(
          Object.freeze({
            baseCurrency,
            quoteCurrency,
            date,
            rate: directRate,
            rateType: 'ASK',
            source: 'BCB_PTAX',
          }),
        );
      } catch {
        // Skip invalid numbers
      }
    }

    return results;
  }
}

// ============================================================================
// Phase 5D: Official Calendar Foundation & Macro Series Contracts
// ============================================================================

export type CalendarType = 'B3_TRADING' | 'BANKING';

export type CalendarClosureReason =
  'WEEKEND' | 'NATIONAL_HOLIDAY' | 'LOCAL_EXCHANGE_HOLIDAY' | 'SPECIAL_CLOSURE' | 'UNKNOWN';

export interface CalendarDay {
  readonly id?: string;
  readonly calendarType: CalendarType;
  readonly date: LocalDate;
  readonly isOpen: boolean;
  readonly reason?: string;
  readonly source: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface CalendarCoverage {
  readonly calendarType: CalendarType;
  readonly minDate: string; // YYYY-MM-DD
  readonly maxDate: string; // YYYY-MM-DD
  readonly totalDays: number;
  readonly openDays: number;
  readonly closedDays: number;
  readonly sources: string[];
  readonly latestImportedAt?: string;
}

export type ObservationDataStatus =
  'EXPECTED' | 'CLOSED_DAY' | 'DATA_GAP' | 'NOT_PUBLISHED_YET' | 'CALENDAR_COVERAGE_MISSING';

export interface ClassifyObservationInput {
  readonly seriesId: string;
  readonly date: LocalDate;
  readonly asOfDate: LocalDate;
  readonly hasData: boolean;
  readonly calendarDay?: CalendarDay | null;
  readonly coverageMin?: LocalDate;
  readonly coverageMax?: LocalDate;
  readonly publicationDate?: LocalDate;
}

export interface ObservationClassificationResult {
  readonly status: ObservationDataStatus;
  readonly reason: string;
  readonly isOpenDay: boolean;
}

/**
 * Classifies whether a missing observation is a legitimate market closure,
 * an authentic data gap from the provider, or a future/unpublished session.
 */
export function classifyObservationStatus(
  input: ClassifyObservationInput,
): ObservationClassificationResult {
  const { date, asOfDate, hasData, calendarDay, coverageMin, coverageMax, publicationDate } = input;

  // Check if calendar coverage is present for this date
  if (
    !calendarDay ||
    (coverageMin && date.isBefore(coverageMin)) ||
    (coverageMax && date.isAfter(coverageMax))
  ) {
    if (hasData) {
      return {
        status: 'EXPECTED',
        reason: 'Dado presente (cobertura de calendário ausente)',
        isOpenDay: true,
      };
    }
    return {
      status: 'CALENDAR_COVERAGE_MISSING',
      reason: 'Cobertura de calendário oficial ausente para esta data',
      isOpenDay: false,
    };
  }

  // If the session is officially closed (weekend or holiday)
  if (!calendarDay.isOpen) {
    const reasonText = calendarDay.reason
      ? `Mercado fechado: ${calendarDay.reason}`
      : 'Mercado fechado';
    return {
      status: 'CLOSED_DAY',
      reason: reasonText,
      isOpenDay: false,
    };
  }

  // The session was open
  if (hasData) {
    return {
      status: 'EXPECTED',
      reason: 'Sessão aberta com dado presente',
      isOpenDay: true,
    };
  }

  // Open day but no data: is it in the future or prior to official publication lag?
  if (date.isAfter(asOfDate) || (publicationDate && asOfDate.isBefore(publicationDate))) {
    return {
      status: 'NOT_PUBLISHED_YET',
      reason: 'Sessão futura ou dado ainda não publicado',
      isOpenDay: true,
    };
  }

  // Open day in the past or on asOfDate with no quote -> Authentic Data Gap
  return {
    status: 'DATA_GAP',
    reason: 'Sessão aberta com dado ausente do provedor',
    isOpenDay: true,
  };
}

/**
 * Computes Easter Sunday for a given year using the Meeus/Jones/Butcher algorithm.
 */
export function computeEasterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return LocalDate.fromParts(year, month, day);
}

/**
 * Computes official Brazilian national holidays for a given year.
 */
export function generateOfficialBrazilianHolidays(
  year: number,
): Map<string, { name: string; type: CalendarClosureReason }> {
  const holidays = new Map<string, { name: string; type: CalendarClosureReason }>();

  // Fixed National Holidays
  holidays.set(`${year}-01-01`, { name: 'Confraternização Universal', type: 'NATIONAL_HOLIDAY' });
  holidays.set(`${year}-04-21`, { name: 'Tiradentes', type: 'NATIONAL_HOLIDAY' });
  holidays.set(`${year}-05-01`, { name: 'Dia do Trabalho', type: 'NATIONAL_HOLIDAY' });
  holidays.set(`${year}-09-07`, { name: 'Independência do Brasil', type: 'NATIONAL_HOLIDAY' });
  holidays.set(`${year}-10-12`, { name: 'Nossa Senhora Aparecida', type: 'NATIONAL_HOLIDAY' });
  holidays.set(`${year}-11-02`, { name: 'Finados', type: 'NATIONAL_HOLIDAY' });
  holidays.set(`${year}-11-15`, { name: 'Proclamação da República', type: 'NATIONAL_HOLIDAY' });

  // Consciência Negra: National Holiday by Federal Law 14.759/2023 (and previously observed by B3)
  holidays.set(`${year}-11-20`, { name: 'Dia da Consciência Negra', type: 'NATIONAL_HOLIDAY' });

  holidays.set(`${year}-12-25`, { name: 'Natal', type: 'NATIONAL_HOLIDAY' });
  holidays.set(`${year}-12-31`, {
    name: 'Não há expediente (Balanço Anual)',
    type: 'SPECIAL_CLOSURE',
  });

  // Movable holidays relative to Easter Sunday
  const easter = computeEasterSunday(year);

  // Carnaval: Segunda (-48) e Terça (-47)
  const carnavalSeg = addDays(easter, -48);
  const carnavalTer = addDays(easter, -47);
  holidays.set(carnavalSeg.toString(), {
    name: 'Carnaval (Segunda-feira)',
    type: 'NATIONAL_HOLIDAY',
  });
  holidays.set(carnavalTer.toString(), {
    name: 'Carnaval (Terça-feira)',
    type: 'NATIONAL_HOLIDAY',
  });

  // Paixão de Cristo / Sexta-feira Santa (-2)
  const sextaSanta = addDays(easter, -2);
  holidays.set(sextaSanta.toString(), { name: 'Paixão de Cristo', type: 'NATIONAL_HOLIDAY' });

  // Corpus Christi (+60)
  const corpusChristi = addDays(easter, 60);
  holidays.set(corpusChristi.toString(), { name: 'Corpus Christi', type: 'NATIONAL_HOLIDAY' });

  return holidays;
}

/**
 * Generator for authoritative Brazilian market calendars (B3_TRADING and BANKING).
 */
export class BrazilianOfficialCalendarProvider {
  /**
   * Generates calendar days for an entire civil calendar year.
   */
  generateYear(year: number, calendarType: CalendarType): CalendarDay[] {
    const holidays = generateOfficialBrazilianHolidays(year);
    const easter = computeEasterSunday(year);
    const quartaCinzas = addDays(easter, -46);
    const results: CalendarDay[] = [];

    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const totalDays = isLeap ? 366 : 365;

    let current = LocalDate.fromParts(year, 1, 1);
    for (let d = 0; d < totalDays; d++) {
      const jsDate = new Date(Date.UTC(current.year, current.month - 1, current.day));
      const dayOfWeek = jsDate.getUTCDay(); // 0 = Sunday, 6 = Saturday

      const dateStr = current.toString();
      const holiday = holidays.get(dateStr);

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        results.push(
          Object.freeze({
            calendarType,
            date: current,
            isOpen: false,
            reason: dayOfWeek === 0 ? 'Domingo' : 'Sábado',
            source: 'OFFICIAL_BRAZILIAN_CALENDAR',
          }),
        );
      } else if (holiday) {
        results.push(
          Object.freeze({
            calendarType,
            date: current,
            isOpen: false,
            reason: holiday.name,
            source: 'OFFICIAL_BRAZILIAN_CALENDAR',
          }),
        );
      } else if (dateStr === quartaCinzas.toString()) {
        // Ash Wednesday: Special session open starting 13h for B3, 12h for banking
        results.push(
          Object.freeze({
            calendarType,
            date: current,
            isOpen: true,
            reason: 'Quarta-feira de Cinzas (Início das negociações às 13h)',
            source: 'OFFICIAL_BRAZILIAN_CALENDAR',
          }),
        );
      } else {
        results.push(
          Object.freeze({
            calendarType,
            date: current,
            isOpen: true,
            reason: 'Dia útil regular',
            source: 'OFFICIAL_BRAZILIAN_CALENDAR',
          }),
        );
      }

      current = addDays(current, 1);
    }

    return results;
  }
}

// ============================================================================
// Macroeconomic Series Contracts & Providers
// ============================================================================

export type MacroSeriesId = 'IPCA' | 'SELIC_TARGET' | 'SELIC_EFFECTIVE';

export type MacroFrequency = 'MONTHLY' | 'EVENT_DRIVEN' | 'DAILY';

export type MacroUnit = 'PERCENT' | 'PERCENT_PER_ANNUM' | 'INDEX_POINTS';

export interface MacroObservation {
  readonly id?: string;
  readonly seriesId: MacroSeriesId;
  readonly referenceDate: LocalDate;
  readonly value: Quantity;
  readonly unit: MacroUnit;
  readonly frequency: MacroFrequency;
  readonly source: string;
  readonly publishedAt?: Date;
  readonly firstFetchedAt?: Date;
  readonly lastFetchedAt?: Date;
  readonly fetchCount?: number;
  readonly revisedAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface MacroObservationRevision {
  readonly id: string;
  readonly macroObservationId: string;
  readonly changedAt: Date;
  readonly priorValue: Quantity;
  readonly newValue: Quantity;
  readonly reason?: string;
  readonly createdAt: Date;
}

export interface MacroCoverage {
  readonly seriesId: MacroSeriesId;
  readonly count: number;
  readonly minReferenceDate: string;
  readonly maxReferenceDate: string;
  readonly latestPublishedAt?: string;
  readonly source: string;
  readonly frequency: MacroFrequency;
}

export interface MacroContextSummary {
  readonly ipcaMonthly?: {
    readonly referenceMonth: string; // YYYY-MM
    readonly value: string; // e.g. "0.44%"
    readonly publishedAt?: string;
    readonly source: string;
  };
  readonly selicTarget?: {
    readonly rate: string; // e.g. "10.75% a.a."
    readonly effectiveDate: string; // YYYY-MM-DD
    readonly source: string;
  };
  readonly selicEffective?: {
    readonly rate: string; // e.g. "10.65% a.a."
    readonly effectiveDate: string; // YYYY-MM-DD
    readonly source: string;
  };
}

export interface IMacroDataProvider {
  getObservation(seriesId: MacroSeriesId, date: LocalDate): Promise<MacroObservation>;
  getObservations(
    seriesId: MacroSeriesId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<MacroObservation[]>;
}

/**
 * Authoritative BCB SGS Macro Data Provider.
 * Fetches:
 * - IPCA: SGS 433 (Monthly variation %)
 * - SELIC_TARGET: SGS 432 (Copom Target rate % a.a.)
 * - SELIC_EFFECTIVE: SGS 1178 (Annualized effective rate base 252 % a.a.)
 */
export class BcbMacroDataProvider implements IMacroDataProvider {
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: { timeoutMs?: number; fetchFn?: typeof fetch } = {}) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  private mapSeriesToSgsId(seriesId: MacroSeriesId): {
    sgsId: string;
    unit: MacroUnit;
    frequency: MacroFrequency;
  } {
    switch (seriesId) {
      case 'IPCA':
        return { sgsId: '433', unit: 'PERCENT', frequency: 'MONTHLY' };
      case 'SELIC_TARGET':
        return { sgsId: '432', unit: 'PERCENT_PER_ANNUM', frequency: 'EVENT_DRIVEN' };
      case 'SELIC_EFFECTIVE':
        return { sgsId: '1178', unit: 'PERCENT_PER_ANNUM', frequency: 'DAILY' };
      default:
        throw new Error(`Unsupported macro series ID: ${seriesId}`);
    }
  }

  async getObservation(seriesId: MacroSeriesId, date: LocalDate): Promise<MacroObservation> {
    const list = await this.getObservations(seriesId, date, date);
    const found = list.find((obs) => obs.referenceDate.toString() === date.toString());
    if (!found) {
      throw new Error(`Macro observation not found for ${seriesId} on ${date.toString()}`);
    }
    return found;
  }

  async getObservations(
    seriesId: MacroSeriesId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<MacroObservation[]> {
    if (from.compare(to) > 0) throw new Error('Invalid range: from cannot be after to');

    const meta = this.mapSeriesToSgsId(seriesId);

    const formatDate = (d: LocalDate): string =>
      `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;

    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${meta.sgsId}/dados?formato=json&dataInicial=${formatDate(from)}&dataFinal=${formatDate(to)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(
        `BCB SGS macro provider unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`BCB SGS macro provider error: HTTP ${response.status}`);
    }

    let json: Array<{ data: string; valor: string }>;
    try {
      json = (await response.json()) as never;
    } catch {
      throw new Error('BCB SGS macro invalid JSON response');
    }

    const results: MacroObservation[] = [];
    for (const row of json) {
      if (!row.data || !row.valor) continue;
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.data.trim());
      if (!match) continue;
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);

      let refDate: LocalDate;
      try {
        refDate = LocalDate.fromParts(year, month, day);
      } catch {
        continue;
      }

      if (refDate.compare(from) < 0 || refDate.compare(to) > 0) continue;

      const valStr = row.valor.trim().replace(',', '.');
      if (!/^-?\d+(\.\d+)?$/.test(valStr)) continue;

      try {
        const valDecimal = Quantity.from(valStr);
        results.push(
          Object.freeze({
            seriesId,
            referenceDate: refDate,
            value: valDecimal,
            unit: meta.unit,
            frequency: meta.frequency,
            source: `BCB_SGS_${meta.sgsId}`,
          }),
        );
      } catch {
        // Skip unparseable decimal rows
      }
    }

    return results;
  }
}
