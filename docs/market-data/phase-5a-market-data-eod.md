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

## 6. Freshness Classification & Weekend Policy

The system classifies End-of-Day (EOD) quote freshness using `classifyEodQuoteFreshness`:

- **FRESH:** The quote corresponds to the expected active trading session:
  - Same calendar day.
  - Friday quote viewed on Saturday or Sunday (markets are closed).
  - Friday quote viewed on Monday prior to the market close threshold (18:00 BRT).
  - Weekday quote from day $D$ viewed on day $D+1$ prior to 18:00 BRT.
- **STALE:** The quote is older than expected (e.g. Friday quote viewed on Monday after 18:00 BRT, or older weekdays).
- **MISSING:** No market quote has been ingested for the asset.
- **ERROR:** A provider request was attempted and returned an error or timed out.
- **Holiday Calendar Limitation:** The MVP freshness classifier is weekend-aware. It does not yet include a dynamic Brazilian federal/B3 holiday calendar. Conservative policy applies.

---

## 7. Bounded Historical Backfill & Boundary Safety

- **Held Asset Boundary:** Quotes are only backfilled for assets with positive custody actively discovered by portfolio replay.
- **Bounded Ranges:** Rejects unbounded historical queries (`from > to` returns `400 VALIDATION.INVALID_DATE_RANGE`; ranges exceeding 5 years or 1,825 days return `400 VALIDATION.RANGE_TOO_LARGE`).
- **Idempotency:** Re-running backfill on previously fetched identical dates updates `fetchCount` with zero duplicate rows and status `COMPLETED`.

---

## 8. Revision Atomicity & Decimal Equality

- **Atomicity:** Revisions are written within an explicit database transaction (`$transaction`). If any error occurs while logging a revision, the entire operation is rolled back.
- **Decimal Equality:** Comparison uses arbitrary precision via `Money` / `Decimal`. Values like `57.36` and `57.360` evaluate as numerically equal, preventing phantom revision rows from IEEE 754 precision noise.

---

## 9. Fiscal & Tax Engine Isolation

- **Zero Dependency:** `@atlas/tax-engine` has zero dependency on `@atlas/market-data`, `@atlas/valuation-engine`, or quote tables.
- **Tax Source of Truth:** Monthly tax, day-trade exemptions, and DARF calculations rely strictly on transaction executions and historical cost basis.
- **Bens e Direitos Invariance:** Annual IRPF declaration (Bens e Direitos) acquisition costs remain 100% invariant to market quotes.

---

---

## 10. Portfolio Valuation & Allocation Read Models (Phase 5A-I2)

Phase 5A-I2 exposes deterministic, server-side Portfolio Valuation and Allocation read models:

### 10.1. `GET /api/v1/portfolios/:portfolioId/valuation`

- **Read-Only / DB-Cached:** Performs zero live network requests or external provider calls during GET. Fetches the latest persisted EOD quotes directly from the `market_quotes` repository in a single query.
- **Freshness Classification:** Uses `classifyEodQuoteFreshness` to evaluate whether cached EOD quotes are `FRESH` or `STALE` relative to the current civil date and hour (`America/Sao_Paulo`).
- **Exact Arbitrary-Precision Math:** Market values (`quantity × quote.price`), cost basis, unrealized gain/loss (`marketValue - totalCost`), and percentage returns are computed using exact decimal arithmetic with zero IEEE 754 floats.
- **Explicit Missing & Stale Handling:**
  - `VALUED`: Quote is available and fresh; cost basis is known.
  - `QUOTE_STALE`: Quote is older than expected session; market value is computed and flagged.
  - `QUOTE_UNAVAILABLE`: No quote persisted; market value is `null`, position flagged as unavailable.
  - `COST_INCOMPLETE`: Cost basis is unknown (e.g. unmatched transfer in); market value is computed, but unrealized gain/loss is `null`.
  - `CURRENCY_MISMATCH`: Position currency differs from quote currency; cross-currency synthetic aggregation is prohibited, market value is `null`.
- **Currency Segregation:** Totals are partitioned strictly by currency (`totalsByCurrency[currency]`). No synthetic multi-currency conversion is attempted without an FX layer.

### 10.2. `GET /api/v1/portfolios/:portfolioId/allocation`

- **Segregated Allocation Buckets:** Breakdowns are partitioned by currency bucket (`currencies[currency]`).
- **Asset Allocation:** Computes each valued asset's market value and exact percentage of the valued currency bucket:
  $$\text{allocationPercent} = \frac{\text{asset.marketValue}}{\sum \text{valued.marketValue}} \times 100$$
- **Asset Class Allocation:** Aggregates by asset class (`STOCK`, `REAL_ESTATE_FUND`, `BDR`, `ETF`, etc.), computing group market value, percentage, and asset count.
- **Unvalued Assets Disclosure:** Positions with missing or mismatched quotes are segregated into `unvaluedAssets` with explicit diagnostic reasons (`QUOTE_UNAVAILABLE`, `CURRENCY_MISMATCH`).
- **Portfolio Status:** Emits `COMPLETE` (100% valued), `PARTIAL` (< 100% coverage), or `EMPTY` (zero custody positions).
- **Sector Allocation Status:** Formally **DEFERRED** until canonical sector metadata is modeled on the `Asset` entity.

---

## 11. Security & Invariants Checklist

- [x] **Zero Floats:** All prices, volumes, and currency values use canonical string representations and `Prisma.Decimal` (`NUMERIC(38,18)`). `Number()`, `parseFloat()`, and unary `+` are forbidden for financial rules.
- [x] **Immutable Ledger Untouched:** Transaction ledger remains the single source of truth; market quotes do not mutate cost basis, quantities, or trade dates.
- [x] **Zero Live Provider Calls on GET:** Valuation and allocation endpoints query strictly from persisted database quotes.
- [x] **Anti-Enumeration:** Access to non-owned portfolios returns `404 Not Found` without disclosing existence.
- [x] **Zero Secret Leakage:** `MARKET_DATA_API_TOKEN` / `BRAPI_API_KEY` are injected via headers or queries and never echoed in receipts, logs, or error responses.
- [x] **Bounded Backfill Safety:** Ranges exceeding 5 years or inverted dates are safely rejected with 400.
- [x] **Revision Atomicity & Audit Trail:** Provider price revisions generate atomic records in `market_quote_revisions` without phantom noise.
- [x] **Fiscal Isolation:** Tax Engine remains strictly isolated from market quotation data.
- [x] **Development Database Preserved:** Port 5434 dev database untouched (20 transactions, 4 portfolios, 5 accounts, 5 users).

---

## 12. Portfolio UI Valuation, Allocation & Manual Update (Phase 5A-I3)

Phase 5A-I3 wires the server-side valuation and allocation read models into the Web frontend (`apps/web`):

### 12.1. Overview Tab Enhancements

- **Four Standard Cards per Currency Bucket:**
  1. _Custo em custódia_: Total historical cost invested in positions (`knownCost`).
  2. _Valor de mercado_: Total market valuation of priced positions (`marketValue`).
  3. _Resultado não realizado_: Absolute and percentage unrealized gain/loss (`unrealizedGainLoss` and `unrealizedGainLossPercent`). Displays exact color indicators (green for positive, red for negative, neutral for zero/missing).
  4. _Cobertura de cotação_: Visual coverage badge (e.g., `100%` or `50%`) and ratio of valued positions vs total custody positions.
- **Explicit Diagnostic Disclosures:**
  - _Partial Valuation Banner_: Displayed when coverage is less than 100%, disclosing that market values reflect only priced assets.
  - _Stale Quotes Banner_: Displayed when one or more positions rely on quotations older than the expected session.
- **Action Header:**
  - Includes the "Atualizar cotações" button hooked up to `useMutation` calling `POST /api/v1/portfolios/:id/market-data/update`.
  - Automatically invalidates `valuationQueryKey`, `allocationQueryKey`, and `stateQueryKey`.
  - Shows feedback toast with updated/missing count summary.
  - Disabled and hidden in historical snapshot mode (`isHistorical`).

### 12.2. Assets Tab Integration

- Each asset card in custody displays:
  - Cotação atual (`quote.price`) and reference date (`quote.asOf`).
  - Valor de mercado (`marketValue.amount`).
  - Resultado não realizado (`unrealizedGainLoss.amount` and `%`).
  - Canonical status badges:
    - `Atualizada` (Fresh quote)
    - `Desatualizada` (Stale quote)
    - `Sem cotação` (Quote unavailable)
    - `Custo incompleto` (Cost basis missing)
    - `Moeda incompatível` (Currency mismatch)

### 12.3. Allocation Tab Integration

- Replaces placeholder with full `<PortfolioAllocationSection />`:
  - **Alocação por Ativo**: Visual distribution bars with ticker, asset type, market value, and exact percentage.
  - **Alocação por Classe de Ativo**: Aggregated groups (Ações, FIIs, ETFs, BDRs) with market value, percentage, and asset count.
  - **Partial Valuation Notice**: Explains percentages are calculated over valued positions.
  - **Ativos sem Cotação**: Segregated section detailing unvalued assets with diagnostic reason.
  - **Multi-Currency Segregation**: Distinct buckets for BRL, USD, EUR without synthetic cross-currency summing.

---

## 13. Owner Development Database Migration (Migration 24)

On 2026-10-16, Migration `20261016140000_add_market_quotes_and_revisions` was applied cleanly to the local owner PostgreSQL instance (`atlas_postgres_dev5434` / `atlas_dev`):

- **Baseline Before Migration:**
  - Migrations applied: 23
  - Users: 5
  - Portfolios: 4
  - Accounts: 5
  - Transactions: 20
  - `market_quotes` table: Not present
- **Baseline After Migration:**
  - Migrations applied: 24 (`20261016140000_add_market_quotes_and_revisions` added)
  - Users: 5 (preserved)
  - Portfolios: 4 (preserved)
  - Accounts: 5 (preserved)
  - Transactions: 20 (100% immutable and preserved)
  - `market_quotes` count: 0 (clean initial state)
  - `market_quote_revisions` count: 0 (clean initial state)

---

## 14. Controlled Human Validation Checklist

The owner can execute the following steps to perform visual validation in the local browser:

1. **Start Development Servers:**
   ```bash
   pnpm dev
   ```
2. **Access Web Application:**
   - Open `http://localhost:3000` in browser.
   - Log in with owner credentials (`investidor@atlas.dev` or configured owner account).
3. **Verify Initial State (Unvalued Baseline):**
   - Navigate to `/portfolio`.
   - On the **Visão Geral** tab, observe that custody positions show "Custo em custódia", while "Valor de mercado" reflects the initial unquoted status or partial badge.
   - Verify that no synthetic R$ 0 or arbitrary balances are invented.
4. **Trigger Manual Quote Update:**
   - Click the **"Atualizar cotações"** button in the top action area.
   - If `MARKET_DATA_API_TOKEN` is configured with a valid BRAPI token, observe the loading state and subsequent success toast (e.g. `Cotações atualizadas com sucesso: X ativos`).
   - If no token is configured, observe that missing tickers or warning feedback are safely presented without app crash.
5. **Verify Populated Valuation:**
   - Inspect the **Visão Geral** cards: confirm "Custo em custódia", "Valor de mercado", "Resultado não realizado", and "Cobertura de cotação".
   - Switch to the **Ativos** tab: verify that each position displays current quote price, date, market value, unrealized P/L, and status badge (`Atualizada` or `Desatualizada`).
   - Switch to the **Alocação** tab: inspect allocation bars by asset and by asset class. Verify disclosure note and unvalued assets section if applicable.
6. **Verify Historical Snapshot Safety:**
   - Select a past date in the date selector (`asOf`).
   - Confirm that the "Atualizar cotações" button and valuation cards are cleanly hidden in historical mode, keeping historical replay semantics pure.
