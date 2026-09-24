# ADR-139 — Relative-Return Interval Alignment

**Status:** Accepted — 2026-09-22 (Fase 3K)
**Context:** Comparing a portfolio return to a benchmark return is only valid
when both legs span the SAME economic interval. Aligning by the return's end
date alone silently compares different windows (e.g. a portfolio `Friday→Tuesday`
return against a benchmark `Monday→Tuesday` return), producing a fabricated pair.

**Decision:** A valid benchmark-relative pair requires

```
portfolio.startDate === benchmark.startDate
AND
portfolio.endDate   === benchmark.endDate
```

The canonical pair identity is `(startDate, endDate)`, keyed as
`startDate::endDate`. Pairing by end date alone is forbidden.

- Interval boundaries are economic dates only (ADR-132): portfolio boundaries
  are the period anchor plus dates with an EXACT valuation; benchmark boundaries
  are dates with a legitimate index level. Weekend/holiday dates resolved via
  `PREVIOUS_TRADING_DAY` and flow-only non-market dates are TWR boundaries, not
  statistical boundaries — they never become pair boundaries and never create
  an artificial `0%` leg.
- `alignBenchmarkRelativeReturns` pairs strictly by exact key, reports
  `portfolioIntervalCount`, `benchmarkIntervalCount`, `pairedObservationCount`,
  `droppedPortfolioIntervalCount` and `droppedBenchmarkIntervalCount`, and
  deduplicates duplicate keys deterministically (first in canonical order).
- Status: `0` pairs → `UNAVAILABLE`; any dropped interval → `PARTIAL`; else
  `AVAILABLE`. Missing benchmark data is never zero-filled.
- Reference cases: portfolio `Fri→Tue` vs benchmark `Mon→Tue` → **0 pairs**;
  portfolio `Fri→Tue` vs benchmark `Fri→Tue` → **1 pair**.

**Consequences:** No silent window mismatch; alignment is auditable and
reproducible.
