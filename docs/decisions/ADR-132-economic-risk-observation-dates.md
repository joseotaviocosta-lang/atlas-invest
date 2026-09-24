# ADR-132 — Economic Risk Observation Dates (Two-Layer Model)

**Status:** Accepted — 2026-09-22 (Fase 3I hotfix)
**Context:** The risk use-case valued every civil date in `[start, end]`
(including Saturdays, Sundays and holidays, resolved via
`PREVIOUS_TRADING_DAY`) and fed ALL resulting TWR subperiods into the
volatility sample while declaring `frequency: DAILY` with `sqrt(252)`
annualization. Audit verdict: Saturday/Sunday/holiday valuations ARE
generated, previous-day prices ARE reused, and artificial 0% subperiods DID
enter the sample — methodologically incompatible with business-day
annualization (YES on all five audit questions).

**Decision:** Two-layer model with three formally distinct date concepts:

- **Layer A — TWR calculation boundaries**: every civil date in
  `[start, end]` ∪ external-flow dates. Valuations resolve via the canonical
  `EXACT` / `PREVIOUS_TRADING_DAY` rule; `calculateTWR` chains over all of
  them, so flow neutralization stays exact (including flows on non-market
  days: a Saturday deposit is neutralized in the Saturday subperiod even
  though Saturday never becomes a statistic).
- **Layer B — statistical risk observations**: only subperiods ending on
  ECONOMIC dates — the period start anchor plus dates with ≥1 position
  valued at an `EXACT` price (`priceDate === date`, tracked as
  `exactValuedPositions` → `exactPriceByDate`). Implemented once, purely, in
  `selectRiskStatisticalReturns`; the use-case feeds ONLY the selected
  subperiods to `calculateRiskMetrics` (volatility AND drawdown share the
  single filtered trajectory).
- **Chart display dates** (ADR-124: `AUTO/DAILY/WEEKLY/MONTHLY`, ≤400) remain
  presentation-only and are consumed by neither layer.

Economic-observation rule (§4): a new return observation exists iff (a) new
price information arrived (`EXACT` for ≥1 position — multi-asset portfolios
do NOT require all positions EXACT; partial coverage propagates `PARTIAL`
per §18), or (b) the period start anchor. Flow-only non-market dates are
Layer A boundaries, never Layer B statistics. Expected-but-missing data
yields `PARTIAL`, never a `0%` return.

Drawdown audit (§19): no semantic change was needed — the wealth path is now
built from the same filtered subperiods, so peaks/troughs/recoveries can
only land on economic dates (flat repeats could never move them anyway
given the strict `wealth > peak` comparison).

**Consequences:** `frequency: DAILY` now denotes valid market-day
observations compatible with `sqrt(252)`; `observationCount` counts
statistics, not calendar days; 1Y/5Y reporting separates civil dates, TWR
boundaries, risk observations and display points.
