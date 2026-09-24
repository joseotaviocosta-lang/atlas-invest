# ADR-138 — Benchmark-Relative Risk Boundary

**Status:** Accepted — 2026-09-22 (Fase 3K)
**Context:** Beta, Pearson correlation and tracking error measure how portfolio
returns relate to a market benchmark. They need a home that reuses the audited
3I economic-observation pipeline and the 3F/3G benchmark provider without
disturbing frozen return, series, valuation, risk or risk-adjusted contracts.

**Decision:** Extend `@atlas/risk-engine` `0.2.0 → 0.3.0` additively (3I
volatility/drawdown and 3J Sharpe/Sortino untouched) with interval-aligned
benchmark-relative functions; add
`GetPortfolioBenchmarkRelativeRiskUseCase` reusing
`PerformanceCalculationContextBuilder` and the existing 3F
`BenchmarkDataProvider` (Yahoo `^BVSP`) as-is; expose
`GET /api/v1/portfolios/:id/performance/relative-risk`.

- The engine stays pure/deterministic/zero-I/O/frozen-outputs, depending only
  on public `@atlas/domain` primitives. Benchmark levels arrive as plain
  `Quantity` values — the engine never imports `@atlas/benchmark-engine` and no
  provider DTO (`YahooFinanceQuote`, `StooqCsvRow`, `^BVSP`) leaks.
- `portfolio-engine@1.0.0-rc.1`, `performance-engine@0.2.0` TWR/XIRR/series and
  `benchmark-engine@0.2.0` semantics are unchanged. No new pipeline, no Redis,
  no per-day / per-pair benchmark HTTP loop (single range fetch per period).
- Clients render only (`PortfolioBenchmarkRelativeRiskViewModel`).
- IBOV is the ONLY benchmark-relative market benchmark in 3K. CDI remains a
  `RATE_SERIES` risk-free/reference proxy (3G/3J) and is explicitly excluded
  from market-relative risk.

**Consequences:** Relative-risk metrics share the audited 3H/3I/3F/3G
foundations; future market-relative metrics (never Beta/correlation dupes) have
a clear home. USD stays `UNAVAILABLE` (no FX).
