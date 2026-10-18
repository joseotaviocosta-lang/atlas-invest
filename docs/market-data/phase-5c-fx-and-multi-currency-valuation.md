# Phase 5C — FX Time-Series & Multi-Currency Valuation Architecture

## 1. System Architecture Overview

Phase 5C delivers the foundational architecture for foreign exchange time-series and multi-currency valuation aggregation in Project Atlas.

### 1.1 Scope & Boundary

1. **Database Persistence (Migration 26)**:
   - `fx_observations`: Daily canonical exchange rates indexed by `(base_currency, quote_currency, observation_date, source)`.
   - `fx_observation_revisions`: Immutable audit trail for rate revisions from official authorities.
2. **Domain & Engine Contracts**:
   - `FxObservation`, `FxRate`, `FxAvailability`, `IFxDataProvider`.
   - Inversion semantics with 18 decimal places of precision.
   - Lookback resolution for weekends and banking holidays (up to 7 days).
3. **Upstream Ingestion & Persisted Read Separation**:
   - `BcbFxDataProvider`: Upstream ingestion from Banco Central do Brasil (PTAX Olinda & SGS).
   - `PersistedFxDataProvider`: Zero network calls on reads; queries PostgreSQL `fx_observations`.
   - `UpdateFxDataUseCase` & `GetFxCoverageUseCase`: Controlled administrative endpoints.
4. **Valuation Engine Integration**:
   - Valuation engine accepts an optional `fxProvider` / `rates` map.
   - Preserves native currency buckets (`totalsByCurrency`).
   - Translates portfolio totals to the reporting currency (`translatedSummary`).
5. **UI & Product Integration**:
   - Web & Mobile portfolio overview and performance screens render multi-currency breakdowns honestly.
   - Clear indicators when FX rates are unavailable or partial.
6. **Performance / TWR Decision (I4 Go/No-Go)**:
   - Evaluated under ADR guidelines: cross-currency TWR requires daily multi-currency cash flow conversion. If cash-flow conversion FX history is partial, TWR across multiple currencies must honestly signal `INSUFFICIENT_DATA` or remain segregated per native currency.

---

## 2. Database Schema (Migration 26)

### 2.1 Table: `fx_observations`

```sql
CREATE TABLE "fx_observations" (
    "id" UUID NOT NULL,
    "base_currency" VARCHAR(3) NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL,
    "observation_date" DATE NOT NULL,
    "rate" DECIMAL(38,18) NOT NULL,
    "rate_type" VARCHAR(16) NOT NULL DEFAULT 'MID',
    "source" VARCHAR(64) NOT NULL,
    "provider_series_id" VARCHAR(64),
    "first_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetch_count" INTEGER NOT NULL DEFAULT 1,
    "revised_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fx_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fx_observations_pair_date_idx" ON "fx_observations"("base_currency", "quote_currency", "observation_date");
CREATE INDEX "fx_observations_date_idx" ON "fx_observations"("observation_date");
CREATE INDEX "fx_observations_source_idx" ON "fx_observations"("source");
CREATE UNIQUE INDEX "fx_observations_pair_date_source_type_uniq" ON "fx_observations"("base_currency", "quote_currency", "observation_date", "source", "rate_type");
```

### 2.2 Table: `fx_observation_revisions`

```sql
CREATE TABLE "fx_observation_revisions" (
    "id" UUID NOT NULL,
    "fx_observation_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prior_rate" DECIMAL(38,18) NOT NULL,
    "new_rate" DECIMAL(38,18) NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_observation_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fx_observation_revisions_fx_obs_fkey" FOREIGN KEY ("fx_observation_id") REFERENCES "fx_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "fx_observation_revisions_obs_idx" ON "fx_observation_revisions"("fx_observation_id");
```

---

## 3. Migration Safety & Invariance

- Migration 26 is strictly additive (creates two new tables and indexes).
- Zero changes to existing tables (`users`, `portfolios`, `accounts`, `transactions`, `assets`, `market_quotes`, `benchmark_observations`).
- Zero data loss or modification of previous migrations 1 to 25.

---

## 4. Phase 5C-R1.1 Focused Architecture Additions

### 4.1 Cross-Currency Allocation (`translatedAllocation`)

- Native allocation buckets (`currencies[cur]`) remain 100% segregated and preserved.
- When `valuation.translatedSummary` is computed with `status: 'AVAILABLE'`, `computePortfolioAllocation` derives `translatedAllocation` containing `byAsset` and `byAssetClass` in `reportingCurrency`.
- **Anti-Fabrication Guard**: If `translatedStatus` is `PARTIAL` or `UNAVAILABLE`, all `allocationPercent` values are suppressed (`'0'`) to prevent fabricating a false 100% denominator across un-translated foreign assets.

### 4.2 Zero-Live-Read Invariant on Standard GET Endpoints

- All standard read endpoints (`/valuation`, `/allocation`, `/history`, `/state`, `/positions`, `/fx/:base/:quote/coverage`) read exclusively from persisted PostgreSQL repositories via `PersistedFxDataProvider` or Prisma.
- Zero network calls (`fetch`) are ever executed during read flows. Only `POST /api/v1/fx/:base/:quote/update` may query upstream official providers (BCB PTAX).

### 4.3 I4 Go/No-Go Decision: Historical Multi-Currency TWR

- **Decision: `I4_NO_GO_BY_DESIGN` for Historical Cross-Currency TWR in Phase 5C**.
- Historical cross-currency TWR requires full daily historical FX series across every past cash flow date.
- Backfilling current spot FX rates to past portfolio dates is strictly forbidden.
- Spot valuation multi-currency translation is fully enabled, while historical TWR remains safely segregated by native currency.

---

## 5. Phase 5C-R1.2 Evidence & Validation Matrix Reconciliation

### 5.1 BRL-Only Backward Compatibility

- For portfolios holding solely BRL assets, all 8 standard surfaces (`valuation`, `allocation`, `performance`, `performance-series`, `intelligence`, `home`, `market`, `tax`) require exactly 0 FX lookups and 0 upstream network calls.
- Economic outputs are 100% identical to pre-5C baseline.

### 5.2 Zero-Live-Read Matrix

- All read surfaces (`valuation`, `allocation`, `home`, `market`, `performance`, `series`, `intelligence`, `fx coverage`) execute 0 upstream calls (`fetch` = 0).
- Reads query exclusively from persisted PostgreSQL repositories via `PersistedFxDataProvider` or Prisma repositories.

### 5.3 Cache Key & Invalidation Contract

- `valuation`: `['portfolio-valuation', portfolioId]`
- `allocation`: `['portfolio-allocation', portfolioId]`
- `home`: `['portfolio-state', portfolioId]`, `['portfolio-valuation', portfolioId]`
- `market`: `['portfolio-valuation', portfolioId]`
- **FX Update Invalidation**: A successful `POST /api/v1/fx/:base/:quote/update` invalidates `['portfolio-valuation', portfolioId]` and `['portfolio-allocation', portfolioId]`.
- Performance and intelligence engines currently operate in native currencies by design and do not consume FX.

### 5.4 Fixed-Host Provider & SSRF Safety

- Upstream BCB provider URL is fixed to `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{seriesId}/dados`.
- Host, scheme, and port are hardcoded in infrastructure code.
- Inputs are restricted to approved currency mappings and strictly validated civil calendar dates (`YYYY-MM-DD`).

### 5.5 Mobile Multi-Currency Parity

- Mobile application renders `MobileValuationSection` with dedicated multi-currency consolidated summary (`valuation-multi-currency-summary`).
- Displays `Câmbio PTAX` badge when complete, and `Câmbio Parcial` badge when missing foreign rates.
- Suppresses fake denominators and preserves native currency breakdowns without mixing.

---

## 6. Phase 5C-R1.3 Micro-Closure Specifications

### 6.1 Canonical Query-Key Shapes & Dimensions

- `valuation`: `['portfolio-valuation', portfolioId]` (via `valuationQueryKey(portfolioId)`)
- `allocation`: `['portfolio-allocation', portfolioId]` (via `allocationQueryKey(portfolioId)`)
- `home`: `['portfolio-state', firstPortfolioId]` and `['portfolio-valuation', firstPortfolioId]`
- `market`: `['portfolio-valuation', activePortfolioId]`
- **Reporting Currency Dimension**: Currently hardcoded to `BRL` across UI consumers (`FUTURE_EXTENSION_REQUIRED` if multi-reporting currencies become user-selectable).
- **As-Of Date Dimension**: Valuation and allocation represent current spot custody and persisted quotes only. Historical portfolio views use isolated performance/history endpoints.

### 6.2 FX Update Invalidation Matrix

- On successful FX ingestion (`POST /api/v1/fx/:base/:quote/update`):
  - Invalidate `['portfolio-valuation', portfolioId]` -> Refetches new PTAX converted valuation.
  - Invalidate `['portfolio-allocation', portfolioId]` -> Refetches updated converted allocation.
  - Home and Market pages consume `['portfolio-valuation', portfolioId]` and update automatically without page reload.

### 6.3 Same-Currency Ingestion Policy

- Same-currency pairs (e.g. `BRL/BRL`, `USD/USD`) are rejected by `UpdateFxDataUseCase` with `400 Bad Request` (`VALIDATION.SAME_CURRENCY_NOT_ALLOWED`).
- No upstream provider calls are made and 0 rows are inserted into `fx_observations`. Identity rate of 1.0 is handled internally in valuation logic.

### 6.4 Zero-Live-Read Invariant

- All 8 read surfaces (`valuation`, `allocation`, `home`, `market`, `performance`, `performance-series`, `intelligence`, `fx coverage`) execute 0 upstream calls (`fetch = 0`).
- Proven under hard-failure harness throwing `UPSTREAM_CALL_FORBIDDEN`.

### 6.5 I4 Surface Behavior Across API, Web, and Mobile

- In mixed-currency portfolios where historical rates are not unified:
  - API returns native segregated currency performance records; overall status is `PARTIAL` / `INSUFFICIENT_DATA`.
  - Zero fabricated consolidated TWR percentage is ever produced.
  - Web renders segregated currency cards with warning banners for partial history.
  - Mobile renders segregated currency cards with warning banners, showing `—` for unpriced historical currencies.
