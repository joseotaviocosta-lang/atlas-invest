# ADR-135 — Sharpe Methodology

**Status:** Accepted — 2026-09-22 (Fase 3J)
**Context:** Sharpe must measure return per unit of total variability on the
same economic observations as 3I volatility — not on chart samples,
cumulative levels, raw value changes, or annualized-figure differences.

**Decision (single formula):**

- Per-observation excess (ratios, exact decimal):
  `excess_t = portfolioReturn_t − riskFreeReturn_t`.
- `mean = Σexcess / n`;
  `sampleStddev = sqrt(Σ(excess − mean)² / (n − 1))` (sample, `n−1`, reusing
  the 3I decimal variance path and `decimalSqrt`).
- `sharpeDaily = mean / stddev`;
  `sharpeAnnualized = sharpeDaily × sqrt(252)` (DAILY market-day
  compatibility per ADR-132; 252 → 365 swap forbidden).
- Minimum `n ≥ 2`, else `UNAVAILABLE`. Zero denominator → `UNAVAILABLE`
  with `null` ratios — never `Infinity`/`NaN`, even with positive mean.
- Reference fixture: portfolio `1%/2%/3%` vs `0%` yields exactly
  `daily = 2`, `annualized = 2 × sqrt(252)` (pinned by test).

**Consequences:** One documented Sharpe; auditable from aligned daily
excess to annualized ratio with no float paths.
