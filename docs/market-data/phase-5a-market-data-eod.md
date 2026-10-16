# Project Atlas — Phase 5A: Market Data EOD Foundation & Persisted Ingestion

## 1. Executive Summary

Phase 5A-I1 introduces the canonical persisted End-of-Day (EOD) market data foundation for Project Atlas. This unlocks deterministic portfolio valuation, asset allocation, and market-price presentation while strictly preserving the Transaction Ledger as the sole source of truth for asset custody, cost basis, and tax events.

---

## 2. Canonical Provider Decisions

As formalized in `docs/research/market-data-provider-evaluation.md` and `docs/research/market-data-licensing-decision.md`:

| Role                             | Provider                  | Rationale                                                                                                                                                  |
| :------------------------------- | :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary Production Provider**  | **BRAPI** (`brapi.dev`)   | Native B3 coverage (`PETR4`, `VALE3`, FIIs, BDRs, ETFs), clean JSON API, EOD unadjusted prices, explicit token authentication, commercial terms available. |
| **Dev Fallback Provider**        | **Yahoo Finance**         | Best-effort, unauthenticated community scrapers for dev only; not canonical for production financial reporting.                                            |
| **Testing / CI Provider**        | **In-Memory Mock**        | Zero network, zero external latency, deterministic clock and seed fixtures.                                                                                |
| **Enterprise / Future Provider** | **B3 Direct Market Data** | Official direct feed for scale and institutional compliance.                                                                                               |

---

## 3. Canonical Price Policy

- **Current Valuation:** `UNADJUSTED_CLOSE` represents the actual closing price on the trading calendar day.
- **Historical Performance:** `UNADJUSTED_CLOSE` + explicit ledger cash flows (`BUY`, `SELL`, `DIVIDEND`, `JCP`, `FII_INCOME`).
- **No Double Adjustment:** Split and bonus events are already modeled as first-class transactions in the immutable ledger. Using split-adjusted historical prices would distort average cost calculations.
- **Timezone Normalization:** All market trading dates are strictly normalized to `America/Sao_Paulo` civil calendar dates (`YYYY-MM-DD`).

---

## 4. Database Schema & Persistence

Database migrations introduce two append-safe, auditable tables:

### 4.1. `market_quotes`

Stores the canonical daily quote for an asset:

- `asset_id` (UUID, Foreign Key to `assets.id` with CASCADE delete)
- `trading_date` (Date, civil trading calendar day)
- `currency` (VARCHAR(3), e.g., 'BRL')
- `open`, `high`, `low`, `close`, `adjusted_close`, `volume` (`NUMERIC(38,18)`)
- `provider` (VARCHAR(32), e.g., 'BRAPI')
- `provider_symbol` (VARCHAR(32), e.g., 'PETR4')
- `first_fetched_at` (TIMESTAMP UTC)
- `last_fetched_at` (TIMESTAMP UTC)
- `fetch_count` (INTEGER, increments on refetches)
- `revised_at` (TIMESTAMP UTC, nullable)
- **Constraint:** Unique composite key on `(asset_id, trading_date, provider)`.

### 4.2. `market_quote_revisions`

Append-only audit trail capturing provider revisions to historical or EOD prices:

- `market_quote_id` (UUID, Foreign Key to `market_quotes.id` with CASCADE delete)
- `changed_at` (TIMESTAMP UTC)
- `prior_open`, `prior_high`, `prior_low`, `prior_close`, `prior_adjusted_close`, `prior_volume` (`NUMERIC(38,18)`)
- `new_open`, `new_high`, `new_low`, `new_close`, `new_adjusted_close`, `new_volume` (`NUMERIC(38,18)`)
- `reason` (TEXT, e.g., "Provider published revised EOD data")

### 4.3. Upsert State Machine

- **CASE A (INSERTED):** No record exists for `(asset_id, trading_date, provider)`. Insert row with `fetch_count = 1`.
- **CASE B (UNCHANGED):** Record exists and new prices equal existing prices. Increment `fetch_count`, update `last_fetched_at`. No revision record created.
- **CASE C (REVISED):** Record exists and incoming prices differ. Insert audit row into `market_quote_revisions`, update quote record, set `revised_at = now()`.

---

## 5. API Ingestion Endpoint

### `POST /api/v1/portfolios/:portfolioId/market-data/update`

#### Request Body (Optional)

```json
{
  "lookbackDays": 0,
  "from": "2026-10-01",
  "to": "2026-10-15",
  "providerOverride": "BRAPI"
}
```

#### Ingestion Workflow

1. **Ownership Authorization:** Validates `portfolio.userId === principal.userId`. Enforces 404 anti-enumeration (never returns 403 for unauthorized access).
2. **Replay Asset Discovery:** Pure replay of ledger transactions discovers currently held positive custody positions.
3. **Symbol Resolution:** Resolves provider symbols (`PETR4` on BRAPI, `PETR4.SA` on Stooq/Yahoo).
4. **Batch Fetch & Normalization:** Retrieves quotes, converts to canonical decimal strings (zero float distortion), maps error codes.
5. **Database Upsert:** Atomic transaction handles Case A, Case B, or Case C.
6. **Receipt Response:** Returns detailed summary with zero token leakage.

#### Ingestion Receipt Example

```json
{
  "data": {
    "portfolioId": "ca3f5682-f01f-4cbf-848b-71e40fcf1cc7",
    "provider": "BRAPI",
    "requestedAssets": 2,
    "resolvedAssets": 2,
    "skippedAssets": 0,
    "quotesFetched": 2,
    "quotesInserted": 2,
    "quotesUnchanged": 0,
    "quotesRevised": 0,
    "authRequiredAssets": [],
    "missingAssets": [],
    "rateLimitedAssets": [],
    "providerErrors": [],
    "startedAt": "2026-10-16T12:59:53.000Z",
    "finishedAt": "2026-10-16T12:59:53.050Z",
    "status": "COMPLETED"
  }
}
```

---

## 6. Security & Invariants Checklist

- [x] **Zero Floats:** All prices, volumes, and currency values use canonical string representations and `Prisma.Decimal` (`NUMERIC(38,18)`). `Number()`, `parseFloat()`, and unary `+` are forbidden for financial rules.
- [x] **Immutable Ledger Untouched:** Transaction ledger remains the single source of truth; market quotes do not mutate cost basis, quantities, or trade dates.
- [x] **Anti-Enumeration:** Access to non-owned portfolios returns `404 Not Found` without disclosing existence.
- [x] **Zero Secret Leakage:** `MARKET_DATA_API_TOKEN` / `BRAPI_API_KEY` are injected via headers or queries and never echoed in receipts, logs, or error responses.
- [x] **Development Database Preserved:** Port 5434 dev database untouched (20 transactions, 4 portfolios, 5 accounts, 5 users).
