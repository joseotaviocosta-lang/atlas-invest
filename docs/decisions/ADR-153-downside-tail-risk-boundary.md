# ADR-153 — Downside & Tail Risk Boundary

**Status:** Accepted — 2026-09-23 (Fase 3N)
**Context:** Downside deviation, semideviation, historical VaR and historical
CVaR need a home that reuses the canonical 3I Layer-B economic TWR returns
without disturbing any frozen contract.

**Decision:** Extend `@atlas/risk-engine` `0.5.0 → 0.6.0` additively (all prior
metrics untouched) with `calculateDownsideDeviation`, `calculateSemideviation`,
`calculateHistoricalVar`, `calculateHistoricalCvar` and `calculateTailRisk`; add
`GetPortfolioTailRiskMetricsUseCase`; expose
`GET /api/v1/portfolios/:id/performance/tail-risk`.

- Source: 3I Layer-B economic TWR returns only (`selectRiskStatisticalReturns`).
  No chart points, cumulative levels, calendar-day zeros or raw value changes.
- No parametric assumptions, no Monte Carlo, no Cornish-Fisher, no EWMA/GARCH,
  no sqrt-time scaling, no monetary VaR, no stress/scenario analysis.
- ONE portfolio context build per request; the portfolio alone is the source
  (no IBOV/CDI). The sorted sample is computed once per currency/confidence and
  reused for VaR and CVaR.
- BRL and USD are both eligible when their history is sufficient; currencies are
  segregated, never aggregated, no FX.
- Clients render only (`PortfolioTailRiskViewModel`).

**Consequences:** Downside/tail metrics share the audited 3I foundation; future
tail metrics (never these four) have a clear home.
