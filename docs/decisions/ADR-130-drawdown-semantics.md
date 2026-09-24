# ADR-130 — Drawdown Semantics

**Status:** Accepted — 2026-09-21 (Fase 3I)
**Context:** Drawdown needs exact peak/trough/recovery definitions and an
unambiguous sign convention, computed on the economic trajectory — not on
raw market value polluted by contributions.

**Decision:**

- Input: cumulative TWR wealth path (`wealthIndex = 1 + cumulativeReturn`,
  anchor `1` at `startDate` = normalized 0%), chained exactly from the SAME
  subperiod returns that feed volatility (single-trajectory consistency).
- `runningPeak = max(previousPeak, wealth)`; `drawdown = wealth / peak − 1`
  (always ≤ 0). Maximum drawdown is the most negative value.
- Sign convention: drawdowns are NEGATIVE (`"-25"` for peak 120 → trough
  90), never unsigned magnitudes.
- Metadata:
  - `peakDate`: peak anchoring the max drawdown; `startDate` when the path
    never draws down (the unbroken high starts at the anchor).
  - `troughDate`: max-drawdown date; `startDate` when max is 0.
  - `recoveryDate`: first date strictly after trough with wealth ≥ anchoring
    peak; `null` for open drawdowns or when no drawdown occurred.
  - `currentPercentage`: drawdown at the last point (`"0"` at a new high —
    every new maximum zeroes it).
- Flat series (`0/0/0`): max 0, current 0, peak = trough = start,
  recovery null — documented, not special-cased silently.
- Cash-flow invariance: deposits cannot fabricate peaks because the path is
  TWR-derived (a deposit doubling wealth without gain leaves wealth flat).

**Consequences:** Canonical example `1.00 → 1.10 → 0.99 → 1.05 → 1.12`
yields max −10%, peak/trough/recovery exact, current 0 — pinned by test.
