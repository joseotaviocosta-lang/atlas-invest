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
