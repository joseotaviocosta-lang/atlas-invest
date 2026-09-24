# ADR-150 — Rolling Volatility Methodology

**Status:** Accepted — 2026-09-22 (Fase 3M)
**Context:** Rolling volatility must be the 3I realized volatility computed on
each rolling slice — never a separate formula.

**Decision:** For each window of `W` Layer-B `RiskSubperiodReturn`, reuse
`calculateRealizedVolatility(slice)` (3I): sample standard deviation (`n − 1`)
of the slice returns, annualized `× sqrt(252)`. The point value is the slice's
`annualizedPercentage`.

- Source: 3I Layer-B economic returns (`selectRiskStatisticalReturns` over TWR
  subperiods) — never chart samples or calendar-day returns.
- Constant returns → exactly `0` (a known value, not missing).
- `n < W` → series `UNAVAILABLE` with empty points (no partial window).
- No `NaN`/`Infinity`; a point is `null` only if the underlying slice is
  unavailable.
- Source `PARTIAL` propagates to the series status.

**Consequences:** Rolling volatility is auditable and identical to applying the
3I primitive slice by slice (equivalence pinned by tests).
