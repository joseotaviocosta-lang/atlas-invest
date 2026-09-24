# ADR-133 — Risk-Adjusted Metrics Boundary

**Status:** Accepted — 2026-09-22 (Fase 3J)
**Context:** Sharpe and Sortino need a home that reuses the 3I economic
observation pipeline and the 3G CDI provider without disturbing frozen
return, series, valuation or benchmark contracts.

**Decision:** Extend `@atlas/risk-engine` `0.1.0 → 0.2.0` additively (3I
volatility/drawdown functions untouched) with Sharpe/Sortino over ALIGNED
observations; add `GetPortfolioRiskAdjustedMetricsUseCase` reusing
`PerformanceCalculationContextBuilder` and the 3G
`RateBenchmarkDataProvider` as-is; expose
`GET /api/v1/portfolios/:id/performance/risk-adjusted`.

- Risk engine stays pure/deterministic/zero-I/O/frozen-outputs, depending
  only on public `@atlas/domain` primitives (never benchmark-engine types —
  conversion happens in the application layer).
- `portfolio-engine@1.0.0-rc.1`, `performance-engine@0.2.0` TWR/XIRR and
  `benchmark-engine@0.2.0` unchanged. No new pipeline, no Redis, no
  per-day CDI HTTP loop (single range fetch per period).
- Clients render only (`PortfolioRiskAdjustedViewModel`).

**Consequences:** Risk-adjusted metrics share the audited 3H/3I/3G
foundations; future ratios (never Sharpe dupes) have a clear home.
