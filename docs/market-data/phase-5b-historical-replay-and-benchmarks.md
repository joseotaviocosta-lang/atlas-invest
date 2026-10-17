# Phase 5B — Benchmark Data & Historical Replay Integration Architecture

## 1. Overview and Core Objectives

Phase 5B extends the verified EOD market-data and portfolio engine baseline from Phase 5A to unlock multi-session historical replay and canonical benchmark-relative performance analysis (IBOV and CDI).

The phase introduces three core pillars:

1. **Performance Asset Universe & Controlled Historical Backfill**: Ensures multi-session historical quote backfills cover the entire asset universe that influenced the portfolio across the chosen performance window—including assets liquidated prior to the end date.
2. **Persisted Benchmark Data Foundation**: Introduces Migration 25 (`benchmark_observations` and `benchmark_observation_revisions`) to store point-in-time benchmark levels (IBOV index points) and daily accrual rates (CDI daily factor/rate), enabling deterministic historical replay strictly from PostgreSQL without live external network calls on reads.
3. **Canonical Benchmark Semantics & Pure Math Invariants**: Strictly enforces exact decimal arithmetic (`Money`, `Quantity`, `Percentage` wrapping Decimal.js), zero synthetic FX conversions, zero fake zero returns, zero forward-filling across unobserved days, and complete isolation from the tax engine and transaction ledger.

---

## 2. Performance Asset Universe (`derivePerformanceAssetUniverse`)

### 2.1 The Incomplete Universe Problem

In historical portfolio performance analysis, fetching quotes solely for _currently open holdings_ introduces survivorship bias and causes mathematical replay breakdowns whenever an investor held and sold an asset earlier in the period.

### 2.2 Replay-Derived Universe

The `derivePerformanceAssetUniverse` function in `@atlas/portfolio-engine`:

- Replays the ledger up to the query end date (`to`).
- Inspects all transactions occurring within `[from, to]` as well as holdings active at `from`.
- Returns the complete deduplicated set of `AssetId`s required to accurately value the portfolio across every trading session in `[from, to]`.

```typescript
export function derivePerformanceAssetUniverse(
  transactions: readonly Transaction[],
  window: { from: LocalDate; to: LocalDate },
): readonly AssetId[] {
  // Pure, deterministic, zero I/O
}
```

---

## 3. Database Schema & Migration 25

### 3.1 `benchmark_observations` Table

Stores daily closing values or daily rate percentages for canonical benchmarks:

- `benchmark_id`: `VARCHAR(16)` (e.g., `IBOV`, `CDI`)
- `observation_date`: `DATE` (`LocalDate` civil calendar date)
- `value`: `NUMERIC(38, 18)` (points for price index `IBOV`, daily percentage factor for `CDI`)
- `provider`: `VARCHAR(32)`
- `fetch_count`: `INTEGER`
- `created_at` / `updated_at`: `TIMESTAMPTZ`

### 3.2 `benchmark_observation_revisions` Table

Immutable audit trail capturing any upstream value updates or corporate/official retrospective corrections.

### 3.3 Upgrade Drill Verification

Migration 25 (`20261016200000_add_benchmark_observations_and_revisions`) was validated across three isolated database drills in `tests/database/phase-5b-migration-upgrade.test.ts`:

- **Upgrade Drill (24 -> 25)**: Applies existing 24 migrations, seeds data, applies migration 25, asserts 100% data preservation and 0 schema drift.
- **Zero-to-Head Drill (0 -> 25)**: Clean migration run on empty database, confirms idempotency on second run.
- **Idempotency Drill**: Verifies zero drift when re-applying on fully deployed databases.

---

## 4. Persisted Benchmark Data Provider (`PersistedBenchmarkDataProvider`)

### 4.1 Strict Zero Live Read Invariant

Implements both `BenchmarkDataProvider` (for price index benchmarks like IBOV) and `RateBenchmarkDataProvider` (for compounding rate benchmarks like CDI):

- **GET / Read queries**: Queries solely `IBenchmarkObservationRepository`. Absolutely 0 live network calls.
- **Honest Availability**: If observations are missing or incomplete, returns `INSUFFICIENT_DATA` / `UNAVAILABLE` rather than faking 0% returns or interpolating points.

### 4.2 Ingestion & Coverage Use Cases

- `UpdateBenchmarkDataUseCase`: Ingests benchmark data from authorized providers and persists to `benchmark_observations`.
- `GetBenchmarkCoverageUseCase`: Computes date bounds, total observation counts, and missing trading sessions.

---

## 5. Web UI Performance Flow

The web performance interface (`apps/web/src/app/(app)/portfolio/performance/page.tsx`):

- Provides a controlled **"Atualizar histórico"** action button that invokes `POST /api/v1/portfolios/:portfolioId/market-data/backfill`.
- Displays real-time loading state (`isBackfilling`).
- Renders structured toast feedback using `formatUpdateReceiptFeedback` indicating quotes updated, unchanged, or failed.
- When historical data is insufficient, renders an honest empty state with clear diagnostic guidance and an action button to backfill historical quotes.

---

## 6. Fiscal & Ledger Isolation Proofs

Verified in `tests/tax-engine/phase-5b-benchmark-fiscal-isolation.test.ts`:

1. **Zero Domain Leakage**: `@atlas/tax-engine` has 0 dependencies on `@atlas/benchmark-engine` or benchmark repository tables.
2. **Monthly Fiscal Invariance**: Historical quote updates and benchmark observations have 0 effect on monthly capital gains, taxable net, or DARF computations.
3. **Bens e Direitos Cost Basis Isolation**: Historical quote persistence never alters the tax acquisition cost basis or year-end balance reporting in DIRPF.

---

## 7. Replay Edge Cases & Read-Isolation Guarantees (Phase 5B-R1.1)

Verified in `tests/performance/phase-5b-r1-1-historical-replay-edge-cases.test.ts` and `tests/benchmark/phase-5b-r1-1-read-isolation.test.ts`:

1. **Rectification Replay Guarantee**: Rectifications follow the canonical append-only compensation flow. Compensating records negate erroneous positions without mutating or deleting original transaction rows. Replay reflects zero position under ADR-039, and `derivePerformanceAssetUniverse` accurately tracks effective asset exposure during the active period while excluding it after rectification.
2. **Corporate-Action No-Double-Adjustment Guarantee**: SPLIT and BONUS corporate actions adjust holding quantities and average costs according to ledger mechanics. Historical quotes remain raw (`UNADJUSTED_CLOSE`), preventing double-adjustment distortions and ensuring exact valuation and true unrealized gain/loss calculations.
3. **Income No-Double-Counting Guarantee**: Corporate income (`DIVIDEND`, `JCP`, `FII_INCOME`) is recorded as internal income in cash/account balances. Because raw unadjusted quotes reflect the ex-dividend price drop and internal income is not an external deposit, total return is calculated with zero double-counting and zero client-side calculation.
4. **Zero-Live-Read Invariant**: All normal performance and benchmark reads resolve strictly through persisted repositories (`IMarketQuoteRepository`, `IBenchmarkObservationRepository`). External provider adapters (BRAPI, Yahoo, Stooq, BCB) record exactly 0 calls.
5. **Provider Outage Tolerance**: In the event of full external provider outage or network loss, all portfolio performance and benchmark comparison endpoints resolve completely from the database without errors or fallback requests.
