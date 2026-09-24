# ADR-143 — Active Performance Boundary

**Status:** Accepted — 2026-09-22 (Fase 3L)
**Context:** Jensen's Alpha, Information Ratio and Treynor Ratio combine
portfolio, market and risk-free returns with Beta and Tracking Error. They need
a home that reuses the audited 3H/3I/3G/3K pipelines without disturbing frozen
return, series, valuation, risk, risk-adjusted or relative-risk contracts.

**Decision:** Extend `@atlas/risk-engine` `0.3.0 → 0.4.0` additively (volatility,
drawdown, Sharpe, Sortino, Beta, Correlation and Tracking Error untouched) with
`calculateJensenAlpha`, `calculateInformationRatio`, `calculateTreynorRatio` and
`calculateActivePerformance`; add `GetPortfolioActivePerformanceUseCase`
reusing `PerformanceCalculationContextBuilder`, the 3G CDI provider and the 3K
IBOV relative-risk pipeline as-is; expose
`GET /api/v1/portfolios/:id/performance/active`.

- The engine stays pure/deterministic/zero-I/O/frozen-outputs, depending only on
  public `@atlas/domain` primitives. No provider DTO leaks.
- `portfolio-engine@1.0.0-rc.1`, `performance-engine@0.2.0` and
  `benchmark-engine@0.2.0` semantics are unchanged. No new pipeline, no Redis,
  no per-day HTTP loop (single IBOV range fetch + single CDI range fetch).
- IBOV is the market benchmark, CDI the BRL risk-free proxy. The response uses
  a **multi-currency map** (consistent with 3I/3J/3K): BRL gets metrics, any
  non-BRL currency is `UNAVAILABLE` in the SAME response (no FX). A portfolio
  holding BRL + USD therefore returns both blocks, BRL computed and USD `null`.
- Metric-specific availability is preserved per currency: Alpha/Treynor may be
  `null` while the Information Ratio is available (`PARTIAL`), never forced
  all-or-nothing.
- Clients render only (`PortfolioActivePerformanceViewModel`).

**Consequences:** Active performance metrics share the audited foundations;
future active metrics (never Alpha/IR/Treynor dupes) have a clear home.
