# ADR-169 — Data Quality Summary

**Status:** Accepted — 2026-09-23 (Fase 3P)
**Context:** Consolidated summaries hide missingness. Data quality must be
explicit without inventing a score.

**Decision:** A `dataQuality` section reports structured status per dimension:
`portfolioStateCompleteness`, `valuationCompleteness`,
`performanceAvailability`, `benchmarkAvailability`, `riskAvailability`,
`tailRiskAvailability`, `scenarioAvailability`.

- Each block: `{ status: AVAILABLE | PARTIAL | UNAVAILABLE, reason }` with
  stable reason codes (`INSUFFICIENT_HISTORY`, `MISSING_MARKET_PRICE`,
  `COST_BASIS_INCOMPLETE`, `BENCHMARK_UNAVAILABLE`, `RISK_FREE_PROXY_UNAVAILABLE`,
  `MULTI_CURRENCY_NO_FX`, `BETA_UNAVAILABLE`, `PARTIAL_VALUATION`, `UNSUPPORTED`).
- **No numeric data-quality score** (no `dataQualityScore = 82`), no rating.
- Structural limitations (`UNSUPPORTED`, `MULTI_CURRENCY_NO_FX`) are
  distinguished from accidental data gaps and never downgrade the overarching
  status on their own.
- Current valuation and historical period metrics remain explicitly
  distinguishable.

**Consequences:** Completeness is auditable and honest.
