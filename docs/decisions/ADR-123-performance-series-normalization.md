# ADR-123 — Performance Series Normalization (TWR Cumulative)

**Status:** Accepted — 2026-09-21 (Fase 3H)
**Context:** A chart of absolute wealth would confuse contributions with
returns. The 3H chart must represent cumulative performance normalized to
0.00% at the period start.

**Decision:**

- Each display point `D` is `calculateTWR` over calculation observations in
  `[startDate, D]` with external flows in `[startDate, D]`, i.e. chaining
  `(1+r1)×…×(1+rn)−1` up to `D` with exact decimal arithmetic.
- The start anchor point is exactly `"0"` when the start valuation exists;
  when it does not, the point is `UNAVAILABLE`/`null` — zero is never invented.
- Raw market-value ratios (`value(D)/value(start)−1`) are forbidden: they
  would show +120% after a 100→200 deposit instead of the true +10%.
- The final display point uses the same inputs as the summary endpoint, so
  `series[last].portfolioReturn === summary TWR` by construction (critical
  consistency test).
- Deposits/withdrawals are neutralized; BUY/SELL are internal (not flows);
  internal transfers net to zero consolidated.

**Consequences:** The chart shows performance, never contributed balance.
