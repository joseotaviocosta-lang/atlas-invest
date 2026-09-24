# ADR-124 — Performance Series Sampling (Calculation vs Display Dates)

**Status:** Accepted — 2026-09-21 (Fase 3H)
**Context:** Returning one point per day for multi-year periods would waste
provider calls and bandwidth, while naive downsampling (dropping TWR points)
could corrupt flow neutralization.

**Decision:** Calculation dates and display dates are distinct concepts:

- **Calculation dates** = display dates ∪ external-flow dates in the period.
  Flow-date valuations keep TWR neutralization exact even when granularity
  skips those dates (ADR-100 boundaries preserved).
- **Display dates** (`selectDisplayDates`, pure):
  - `DAILY`: every civil date in `[start, end]`.
  - `WEEKLY`: every 7th civil date from start + `endDate` always.
  - `MONTHLY`: last civil date of each month in `(start, end]` + `endDate`.
  - `startDate` and `endDate` always included; no weekend price is invented
    (valuation resolution reuses EXACT / PREVIOUS_TRADING_DAY).
- **AUTO**: ≤90 days → DAILY; 91–365 → WEEKLY; >365 → MONTHLY.
- **Cap**: ≤400 display points (`MAX_PERFORMANCE_SERIES_POINTS`); widening
  keeps endpoints and stays deterministic.
- Each displayed cumulative value is computed correctly up to its own date —
  downsampling only selects a subset, never recomputes or interpolates.

**Consequences:** 1M ≈ 31 calc dates, 1Y WEEKLY ≈ 53, 5Y MONTHLY ≈ 61 —
no O(days × assets) replay for long periods.
