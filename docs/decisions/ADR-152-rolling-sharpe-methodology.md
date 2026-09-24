# ADR-152 — Rolling Sharpe Methodology

**Status:** Accepted — 2026-09-22 (Fase 3M)
**Context:** Rolling Sharpe must be the 3J Sharpe computed on each rolling slice
of already-aligned portfolio/CDI observations. Missing CDI must never be filled
with zero.

**Decision:** For each window of `W` 3J `RiskAdjustedReturnObservation`, reuse
`calculateSharpeRatio(slice)` (3J): mean excess ÷ sample standard deviation of
excess (`n − 1`), annualized `× sqrt(252)`. The point value is the slice's
`annualizedSharpe`.

- Source: the 3J aligned observations produced by `alignRiskFreeObservations`
  (portfolio Layer-B returns ∩ real CDI observations). CDI is never zero-filled;
  dates without CDI simply do not enter the aligned series.
- No independent CDI alignment is performed in the rolling layer.
- A window whose excess standard deviation is `0` keeps its point with
  `annualized = null` and `status = UNAVAILABLE` (never `Infinity`).
- `n < W` → series `UNAVAILABLE` with empty points. A `PARTIAL` source alignment
  (portfolio partial or missing CDI dates) propagates to the series status even
  when each local window has `W` observations.
- Ratio formatting: unitless, never `%`.

**Consequences:** Rolling Sharpe preserves the 3J CDI/alignment semantics
(equivalence pinned by tests).
