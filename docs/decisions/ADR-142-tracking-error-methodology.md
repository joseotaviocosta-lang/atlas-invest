# ADR-142 — Tracking Error Methodology

**Status:** Accepted — 2026-09-22 (Fase 3K)
**Context:** Tracking error must measure the dispersion of the portfolio's
active returns versus the benchmark, over identical economic intervals.

**Decision (single formula):**

```
active_t = portfolioReturn_t − benchmarkReturn_t      (percent points)
dailyTrackingError   = sampleStdDev(active)            (sample, n − 1)
annualizedTrackingError = dailyTrackingError × sqrt(252)
```

- Exact decimal arithmetic via `Quantity`; the root uses the 3I `decimalSqrt`.
- Frequency is `DAILY` with the ADR-132 economic semantics (`DAILY` ≠
  calendar-day returns); annualization uses `sqrt(252)` (daily market-day
  convention). Swapping 252 → 365 is forbidden.
- Minimum `n ≥ 2`, else `UNAVAILABLE` with `null` percentages — never
  `Infinity`/`NaN`. Identical returns in every pair → exactly `0` (a known
  value, not missing).
- Tracking error is a PERCENTAGE (`"12.06"`, rendered `"12,06%"`), unlike the
  unitless Beta/Correlation ratios.
- Reference fixtures: identical returns → daily and annualized `0`; active
  `+1/−1/+1%` → daily `sqrt(4/3)` (pinned by tests).

## Interval frequency (DAILY) invariant

`DAILY × sqrt(252)` is valid only if every paired interval represents exactly
one economic market step. This is guaranteed by construction (ADR-139): a
paired interval must be a **consecutive benchmark interval** (no benchmark level
strictly inside) and a **consecutive portfolio economic interval** (no exact
portfolio valuation strictly inside). The benchmark provider series is treated
as the authoritative market-session calendar, so a weekend or holiday between
two sessions is a single valid step.

If a real intermediate session is observed on EITHER side, the aggregated
interval no longer matches a consecutive interval on the other side, so it is
dropped (never paired) and the result is marked `PARTIAL`. An aggregated return
is therefore never silently fed as a `DAILY` observation. The only
indistinguishable case — both series missing the same session — is, without an
official exchange calendar, treated as a non-session (a documented provider
data-quality limitation), never as two aggregated sessions.

**Consequences:** One documented tracking error, auditable from active returns
to the annualized percentage with no float paths.
