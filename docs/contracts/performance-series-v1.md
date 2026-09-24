# Performance Series Contract v1 — Fase 3H

**Status:** FOUNDATION — 2026-09-21
**Engine:** `@atlas/performance-engine` `0.2.0` (additive: `0.1.0` TWR/XIRR untouched)
**Depends:** `@atlas/domain` only. Zero I/O. `Object.freeze` everywhere.

## 1. Types

```ts
type PerformanceSeriesGranularity = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'AUTO';
type ResolvedSeriesGranularity = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface PerformanceSeriesPoint {
  date: LocalDate;
  cumulativeReturn: Percentage | null; // "0" at start; null = unavailable (never invented "0")
  status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
}

interface PortfolioPerformanceSeries {
  currency: Currency;
  startDate: LocalDate;
  endDate: LocalDate;
  granularity: ResolvedSeriesGranularity;
  points: readonly PerformanceSeriesPoint[];
  status: PerformanceStatus;
  dataAvailability: PerformanceDataAvailability;
}
```

`MAX_PERFORMANCE_SERIES_POINTS = 400`.

## 2. Normalization (ADR-123)

Point `D` = cumulative TWR over `[startDate, D]` with 3C subperiod semantics
(chaining `(1+r1)×…×(1+rn)−1`, exact decimal). Raw market-value ratios are
forbidden. Start anchor is exactly `"0"` iff the start valuation exists.

## 3. Sampling (ADR-124)

- `resolveSeriesGranularity`: AUTO → ≤90d DAILY, 91–365d WEEKLY, >365d MONTHLY.
- `selectDisplayDates`: DAILY every civil date; WEEKLY every 7th + end;
  MONTHLY month-ends + end. Start/end always included. Capped at 400
  (deterministic widening, endpoints kept).
- Calculation dates (application layer) = display dates ∪ flow dates.

## 4. Benchmark series points (ADR-125)

- IBOV: `level(D)/startLevel − 1` per point (`calculateBenchmarkReturn`).
- CDI: accumulated `DAILY_PERCENT` factors over `(start, D]` − 1
  (`calculateRateBenchmarkReturn`); start point `"0"`.
- Levels/factors never sent raw to the client when unneeded — only the
  normalized `benchmarkReturn` string (or null) per display date.

## 5. Statuses

- Point: `COMPLETE` / `PARTIAL` (partial valuation) / `UNAVAILABLE` (null).
- Series: `COMPLETE` / `PARTIAL` / `INSUFFICIENT_DATA` (+ `INVALID_INPUT`).
- `PARTIAL` is never labelled complete; gaps are never connected silently
  (chart splits paths at nulls).

## 6. Multi-currency

Series are per currency; BRL may carry IBOV/CDI, non-BRL is portfolio-only.
No FX.

## 7. Version

`performance-engine@0.2.0`, `benchmark-engine@0.2.0` (unchanged),
`portfolio-engine@1.0.0-rc.1` FROZEN, `valuation@0.1.0` unchanged.

**Anti-scope:** Sharpe, Sortino, volatility, drawdown, alpha, beta,
correlation, tracking error, attribution, IPCA, Selic, S&P500, Nasdaq, FX,
Tax, per-asset/per-account performance, intraday.
