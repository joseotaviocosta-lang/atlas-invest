# Market Data Provider Contract v1

## Canonical MarketQuote

```typescript
export interface MarketQuote {
  /** Canonical asset identity — never ticker or provider symbol */
  assetId: AssetId;
  /** Exact unit price as Decimal.js Money primitive — serialized as string in JSON */
  price: Money;
  /** Currency of the price — always explicit, never assumed */
  currency: Currency;
  /** Cut-off date for the quote (civil LocalDate, YYYY-MM-DD) */
  asOf: string;
  /** Timestamp when the price was quoted in the market (ISO instant, UTC-aware) */
  marketTime: string;
  /** Timestamp when this quote was received/created by the system */
  receivedAt: string;
  /** Source of the market data */
  source: MarketDataSource;
  /** Current quote status */
  status: QuoteStatus;
  /** Freshness classification computed by MarketDataService */
  freshness: QuoteFreshness;
  /** Provider-specific symbol (e.g., "PETR4.SA") — adapter-only metadata */
  providerSymbol?: string;
}
```

## MarketDataSource

Enum of valid data source identifiers.

| Value       | Description                                                |
| ----------- | ---------------------------------------------------------- |
| `STOOQ`     | Public CSV-based provider (Brazilian equities/FII/ETF/BDR) |
| `IN_MEMORY` | Deterministic mock provider for tests (seeded, no network) |
| `MANUAL`    | Manually entered or overridden price                       |
| `UNKNOWN`   | Source could not be determined                             |

## QuoteStatus

| Value         | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `LIVE`        | Real-time/late quote, fresh enough for trading purposes                           |
| `DELAYED`     | Quote has known delay (e.g., Stooq delayed quotes) — **never presented as fresh** |
| `EOD`         | End-of-day quote (last price from prior session)                                  |
| `STALE`       | Quote is stale beyond TTL threshold                                               |
| `UNAVAILABLE` | No quote data available                                                           |

## QuoteFreshness

| Value     | Computed When                                                                         |
| --------- | ------------------------------------------------------------------------------------- |
| `FRESH`   | `marketTime` within TTL of `now` (computed by `MarketDataService.refreshFreshness()`) |
| `STALE`   | `marketTime` beyond TTL or `status` is `STALE`/`UNAVAILABLE`                          |
| `UNKNOWN` | Cannot determine freshness (missing timestamps)                                       |

## MarketDataProvider Interface

```typescript
export interface MarketDataProvider {
  /** Get a single quote for an asset reference */
  getQuote(assetRef: MarketDataAssetRef): Promise<MarketQuote | null>;

  /** Get quotes for multiple asset references (batch) */
  getQuotes(assetRefs: MarketDataAssetRef[]): Promise<BatchResult>;
}
```

## MarketDataAssetRef

Canonical reference to an asset, used as input to the provider.

```typescript
export interface MarketDataAssetRef {
  /** AssetId — canonical identity, never derived from ticker alone */
  assetId: AssetId;
  /** Optional ticker symbol — adapter-specific metadata only */
  ticker?: string;
  /** Optional exchange identifier — e.g., "B3", "NYSE" */
  exchange?: string;
}
```

## Symbol Resolution (`resolveMarketDataSymbol`)

Resolves a ticker + exchange combination to a `MarketDataAssetRef`.

| Input                                                                                                                                        | Resolution |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `ticker: "PETR4"`, `exchange: "B3"` → `{ assetId: uuid, ticker: "PETR4", exchange: "B3" }`                                                   |
| `ticker: "VALE"`, `exchange: "B3"` → `{ assetId: uuid, ticker: "VALE.SA", exchange: "B3" }` (`.SA` appended for B3 equities)                 |
| `ticker: "WHT"`, `exchange: "NYSE"` → `{ assetId: uuid, ticker: "WHT", exchange: "NYSE" }` (US equities, bare ticker)                        |
| `ticker: "XPFI11"`, `exchange: "B3"` → `{ assetId: uuid, ticker: "XPFI11", exchange: "B3" }` (FII on B3)                                     |
| `ticker: "UNKNOWN"`, `exchange: "UNKNOWN"` → `{ assetId: uuid, ticker: "UNKNOWN", exchange: "UNKNOWN" }` → returns `UNSUPPORTED_ASSET` error |
| **Same ticker, different exchange** → distinct `AssetId` for each exchange (exchange is part of the resolution key)                          |

**Invariants**:

- `AssetId` remains the canonical global identity — **never** replaced by ticker or provider symbol
- Provider symbol is adapter-specific metadata — **does not substitute** `AssetId` or `ticker`
- Exchange-aware: same ticker on different exchanges resolves to different `AssetId` entries

## Exact Decimal Price Semantics

- `MarketQuote.price` is a `Money` value from `@atlas/domain`
- `Money` wraps `DecimalValue` — an exact decimal primitive with 40-digit precision and `ROUND_HALF_UP` rounding
- **Zero float math**: Price is **always** serialized to JSON as an exact decimal string (e.g., `"37.52"`), never as a JSON number or JavaScript `float`
- **No `parseFloat`, `Number()`, or unary `+`** anywhere in the market-data code path
- Guard: `createMarketQuote()` validates that price is a valid decimal string > 0

## Money / Currency Relationship

- `MarketQuote.price: Money` carries its own currency internally (Money's invariant)
- `MarketQuote.currency: Currency` is an **explicit duplicate field** in the contract for API contract clarity and auditable serialization
- **Risk mitigation**: Both fields must always agree for price quotes (same currency), but the explicit `currency` field ensures the API contract is self-documenting and prevents silent misinterpretation
- `Money` serialization: `money.toString()` → `"1234.56"` (exact decimal string)
- **Never convert `Prisma.Decimal` to `Number`** — always use `money.toString()`

## Timestamp Semantics

| Field        | Meaning                                                          | Format                   |
| ------------ | ---------------------------------------------------------------- | ------------------------ |
| `asOf`       | Cut-off date for replay semantics (civil `YYYY-MM-DD`)           | string, ISO-local-date   |
| `marketTime` | When the price was quoted in the market (instant, UTC-aware)     | string, ISO-8601 instant |
| `receivedAt` | When the system received/created this quote (instant, UTC-aware) | string, ISO-8601 instant |

**Critical**: `asOf` is **not** a JS `Date` — it is a civil `LocalDate`. Using `new Date(asOf)` for economic semantics is **prohibited** (deserializes to wrong day due to timezone offset).

## Source / Status / Freshness

- `source`: Indicates where the quote originated (STOOQ, IN_MEMORY, MANUAL, UNKNOWN)
- `status`: Current liveness state of the quote (LIVE, DELAYED, EOD, STALE, UNAVAILABLE)
- `freshness`: Computed classification (FRESH, STALE, UNKNOWN)
- **Invariant**: `freshness === STALE` **must never be presented as** `freshness === FRESH` to the user
- Freshness is computed by `MarketDataService.refreshFreshness(asOf, marketTime, now, ttlConfig)`

## Error Codes (MarketDataError)

| Code                    | Meaning                                      | HTTP | Retryable      |
| ----------------------- | -------------------------------------------- | ---- | -------------- |
| `PROVIDER_UNAVAILABLE`  | Provider process/HTTP request failed         | 503  | No             |
| `RATE_LIMITED`          | Too many requests (429)                      | 429  | Yes (back-off) |
| `SYMBOL_NOT_FOUND`      | Symbol/ticker not recognized by provider     | 404  | No             |
| `INVALID_RESPONSE`      | Malformed or unexpected provider response    | 400  | No             |
| `TIMEOUT`               | Request exceeded `MARKET_DATA_TIMEOUT_MS`    | 504  | Yes (retry)    |
| `AUTHENTICATION_FAILED` | Invalid provider API key/credentials         | 401  | No             |
| `UNSUPPORTED_ASSET`     | Asset not supported by this provider         | 400  | No             |
| `INVALID_PRICE`         | Price string is not a valid positive decimal | 400  | No             |
| `INVALID_TIMESTAMP`     | Timestamp format is not a valid instant      | 400  | No             |
| `BATCH_LIMIT_EXCEEDED`  | Requested asset count exceeds batch limit    | 400  | No             |

## Partial Success (Batch Quotes)

```typescript
export interface BatchResult {
  /** Quotes that were successfully resolved */
  data: MarketQuote[];
  /** Errors per asset that could not be resolved */
  errors: MarketDataError[];
  /** AssetIds that are unavailable (not necessarily same as errors) */
  unavailable: string[];
}
```

**Invariants**:

- `data.length + errors.length + unavailable.length = assetRefs.length` (total requested)
- Batch does **not** fail entirely if some assets fail
- Each error carries a canonical `MarketDataError` code
- Partial success is the normative state, not an edge case

## Cache Semantics

```typescript
export interface InMemoryQuoteCache {
  /** Deterministic key: "provider::providerSymbol" or "provider::assetId" */
  key: string;
  /** Cached quote, or null if not present */
  quote: MarketQuote | null;
  /** TTL in seconds (configurable via MARKET_DATA_CACHE_TTL_SECONDS) */
  ttl: number;
  /** Timestamp when entry was created (ISO instant) */
  createdAt: string;
  /** Hit/miss tracking for analytics */
  stats: { hits: number; misses: number; lastHitAt?: string; lastMissAt?: string };
}
```

**Invariants**:

- Cache key is **deterministic**: `buildMarketQuoteCacheKey()` = `"${provider}::${providerSymbol || assetId}"`
- **Cache hit avoids provider call**: if cache has entry and not expired, provider is NOT called
- **Expiry**: entry expires after `ttl` seconds from `createdAt`; after expiry, cache returns `null` and provider is re-invoked
- **Stale never presented as fresh**: even if cache serves an entry, `refreshFreshness()` is re-computed; if stale, freshness is updated before presentation
- **Configurable TTL**: set via `MARKET_DATA_CACHE_TTL_SECONDS` env var (default 300s = 5 min)

## Timeout & Retryability

- All provider calls respect `MARKET_DATA_TIMEOUT_MS` env var (default 15000ms = 15s)
- `AbortController` used to enforce timeout per request
- HTTP 429 (Rate Limited) → `normalizeProviderError()` classifies as `RATE_LIMITED` with `retryable: true`
- Other 5xx/timeout → `PROVIDER_UNAVAILABLE` with `retryable: true`
- 4xx client errors (symbol not found, invalid price, etc.) → **not** retryable
- **Single-flight**: concurrent duplicate requests for the same asset are deduplicated (only one Promise in flight)

## Provider Isolation

**Strict boundary**: All provider-specific types, adapters, and implementations are confined to `packages/market-data`.

**Must never escape into**:

| Package                      | Reason                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- |
| `packages/domain`            | Domain is pure TypeScript, agnostic of any provider                       |
| `packages/api` / NestJS DTOs | API contracts use read-models, not provider internals                     |
| `packages/ui`                | UI consumes read-models serializados; never provider types                |
| `packages/portfolio-engine`  | Portfolio Engine is frozen at 1.0.0-rc.1; market data is separate concern |

**Provider adapter example** (`StooqProviderAdapter`, `InMemoryMarketDataProvider`) lives entirely within `packages/market-data/src/`. No adapter type or function is imported or referenced by any other package.

## No Live Network Dependency in Tests

**All unit and integration tests for market data MUST use `InMemoryMarketDataProvider`** — a deterministic mock with seeded quotes. No test may:

- Import or instantiate `StooqProviderAdapter` in test context
- Call any external HTTP endpoint or network API
- Depend on internet connectivity or CI environment

**Test pattern**:

```typescript
import { InMemoryMarketDataProvider } from '@atlas/market-data';

const provider = new InMemoryMarketDataProvider();
await provider.getQuote({ assetId: '...', ticker: 'PETR4', exchange: 'B3' });
// Returns seeded quote, never network
```

## Contract Versioning

This document is version v1.0, aligned with MarketDataPackage `0.1.0`. Any breaking change to the `MarketQuote` interface, `MarketDataProvider` contract, or error codes requires a new minor version and updating all consuming packages.
