# ADR-151 — Rolling Beta Methodology

**Status:** Accepted — 2026-09-22 (Fase 3M)
**Context:** Rolling Beta must be the 3K Beta computed on each rolling slice of
already-paired intervals. It must not create a new alignment or re-introduce the
same-end/different-start bug that 3K eliminated.

**Decision:** For each window of `W` 3K `BenchmarkRelativeReturnObservation`,
reuse `calculateBeta(slice)` (3K): sample covariance ÷ benchmark sample variance
(`n − 1`). The point value is the slice's `beta`.

- Source: the 3K paired observations produced by
  `alignBenchmarkRelativeReturns` (exact `(startDate, endDate)` identity). No
  independent alignment is performed — the same-end/different-start rejection
  and the missing-intermediate-session rejection remain in force upstream.
- Point dates: `windowStartDate` = `startDate` of the first pair; `endDate` =
  `endDate` of the last pair.
- A window whose benchmark variance is exactly `0` keeps its point with
  `beta = null` and `status = UNAVAILABLE` (never removed, never `Infinity`).
- `n < W` → series `UNAVAILABLE` with empty points. Source `PARTIAL` (dropped
  intervals) propagates to the series status.
- Ratio formatting: unitless, never `%`.

**Consequences:** Rolling Beta preserves the 3K interval invariants exactly
(equivalence pinned by tests).
