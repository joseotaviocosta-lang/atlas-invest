# ADR-136 — Sortino Methodology

**Status:** Accepted — 2026-09-22 (Fase 3J)
**Context:** Sortino must penalize only downside variability of the same
daily excess used by Sharpe, with an explicit denominator convention
(the classic ambiguity between total-`n` and negative-count denominators).

**Decision:**

- Same excess with target = reference itself: downside is measured on
  `excess_t`, and only `excess_t < 0` contributes to the numerator.
- **Denominator convention (explicit):** `n` = ALL aligned observations:
  `downsideDeviation = sqrt(Σ min(excess_t, 0)² / n)`.
- `sortinoDaily = mean / downsideDeviation`;
  `sortinoAnnualized = sortinoDaily × sqrt(252)`.
- Minimum `n ≥ 2`, else `UNAVAILABLE`. Zero downside deviation (no negative
  excess) → `UNAVAILABLE` with `null` — never `Infinity`.
- `downsideObservationCount` (negative-excess count) is exposed alongside
  for auditability; it does NOT divide the variance.
- Reference fixture: excess `+1/−2/+3/−1` → downside from `−2/−1` only,
  count 2, deviation `≈ 1.1180%` (pinned by test).

**Consequences:** Denominator ambiguity resolved by contract; Sortino is
reproducible from the same aligned sample as Sharpe.
