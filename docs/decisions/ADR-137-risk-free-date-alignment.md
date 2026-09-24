# ADR-137 — Risk-Free Date Alignment

**Status:** Accepted — 2026-09-22 (Fase 3J)
**Context:** Portfolio economic dates (Layer B, ADR-132) and CDI business-day
observations have different native calendars. Pairing must be by valid
economic date — not by chart dates, positional index, or nearest-neighbor
invention.

**Decision:** Intersection semantics (`alignRiskFreeObservations`):

- Aligned sample = dates present in BOTH the portfolio statistical series
  and the CDI daily series. CDI `DAILY_PERCENT` maps directly to the
  percent-point daily return; `DAILY_FACTOR` maps to factor−1; unknown units
  are dropped (missing), never compounded.
- Portfolio dates without CDI are reported (`portfolioDatesWithoutReference`)
  and narrow the sample → `PARTIAL` when computable; they are never
  zero-filled. CDI dates without portfolio observations are reported and
  ignored.
- Zero overlap → empty alignment → `UNAVAILABLE` (never a ratio over
  nothing). Weekend/holiday gaps on either side simply do not intersect —
  no artificial zeros are ever created by alignment.
- Non-market-day flows stay neutralized in Layer A (TWR) and stay out of
  Layer B, hence out of alignment — same guarantee as 3I.

**Consequences:** Every Sharpe/Sortino observation is a real
portfolio-day/real-CDI-day pair; partial overlap degrades honestly.
