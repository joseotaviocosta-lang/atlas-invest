# ADR-148 — Rolling Analytics Boundary

**Status:** Accepted — 2026-09-22 (Fase 3M)
**Context:** The Atlas has period metrics (volatility, Sharpe, Beta). Observing
how they evolve over time needs rolling series that reuse the canonical source
observations of prior phases without duplicating formulas or fetching data per
point.

**Decision:** Extend `@atlas/risk-engine` `0.4.0 → 0.5.0` additively (all prior
metrics untouched) with `calculateRollingVolatility`, `calculateRollingSharpe`
and `calculateRollingBeta` over windows of `20 | 60 | 120` observations; add
`GetPortfolioRollingAnalyticsUseCase`; expose
`GET /api/v1/portfolios/:id/performance/rolling`.

- Source series are reused verbatim: 3I Layer-B returns (volatility), 3J aligned
  portfolio/CDI observations (Sharpe), 3K paired intervals (Beta). No formula is
  duplicated and no alignment is redone.
- One portfolio context build, one IBOV range fetch and one CDI range fetch per
  request. A provider is never called once per rolling point. No Redis.
- `portfolio-engine@1.0.0-rc.1`, `performance-engine@0.2.0` and
  `benchmark-engine@0.2.0` unchanged.
- BRL gets all three series; any non-BRL currency gets rolling volatility only
  (volatility depends on neither CDI nor IBOV, so it must not be blocked by
  currency); Sharpe/Beta are `UNAVAILABLE` (no FX).
- Clients render only (`PortfolioRollingAnalyticsViewModel`).

**Consequences:** Rolling series share the audited 3I/3J/3K foundations; future
rolling metrics (never these three) have a clear home.
