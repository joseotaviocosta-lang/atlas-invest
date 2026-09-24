# ADR-149 — Economic Observation Window Semantics

**Status:** Accepted — 2026-09-22 (Fase 3M)
**Context:** A rolling window must not silently count calendar days: weekends,
holidays, previous-trading-day fallbacks and flow-only boundaries are not new
market information (ADR-132). Counting them would dilute the sample.

**Decision:** A rolling window is a count of **valid economic observations**,
never calendar days. `window = 20` means 20 `RiskSubperiodReturn` /
`RiskAdjustedReturnObservation` / `BenchmarkRelativeReturnObservation` entries,
exactly the Layer-B / aligned / paired series of 3I/3J/3K.

- Weekends, holidays, `PREVIOUS_TRADING_DAY` fallbacks and flow-only boundaries
  never create a statistical observation and therefore never advance the window.
- Partial windows are forbidden: no expanding window and no point for the first
  `W − 1` observations. The first valid point appears once `W` observations
  exist; `points = max(0, n − W + 1)`.
- Each point is identified by the `endDate` of its last observation and,
  additionally, by `windowStartDate` (the first observation) for auditability.
- Points are sorted by `endDate ASC` and are deterministic for the same input.
- Outputs are frozen (`Object.freeze` on the series, the points array and each
  point).

**Consequences:** Rolling series are economically correct by construction and
consistent with the 3I risk-observation semantics.
