# ADR-128 — Realized Volatility Methodology

**Status:** Accepted — 2026-09-21 (Fase 3I)
**Context:** Volatility must measure oscillation of economic returns, not of
contributed balances, and must state its statistical choices explicitly.

**Decision:**

- Input: subperiod TWR returns (`r1…rn`), percent-point convention
  (`Percentage.from('1')` = +1%). Cumulative-return levels are never fed as
  returns; the engine derives no returns from cumulative levels for
  volatility (drawdown chains its own wealth path from the same subperiods).
- Cash flows stay neutralized because inputs are TWR subperiods from
  `calculateTWR` (a deposit doubling wealth yields 0% subperiods, never a
  +100% spike). Internal transfers net to zero upstream.
- `mean = Σr / n`; `sampleVariance = Σ(r − mean)² / (n − 1)` — **sample**
  (`n−1`), never population (`n`). Provenance: Bessel-corrected estimator
  for realized (historical-sample) volatility.
- Minimum: `n < 2` → `UNAVAILABLE` with nulls; volatility is never invented
  as zero. `n ≥ 2` with all-equal returns → exactly `"0"` (known flat, not
  missing).
- Frequency is explicit and fixed: `DAILY` (no user selector in 3I).
  `DAILY` denotes valid market-day observations compatible with `sqrt(252)`
  annualization — NOT 365 calendar days (ADR-132).
- Calendar-day convention is REJECTED for statistics: Saturday/Sunday/holiday
  valuations resolve via the canonical previous-close rule for Layer A (TWR
  boundaries), but they carry no new market information and must never enter
  the sample as artificial `0%` returns. Economic observation = start anchor
  or ≥1 `EXACT` position price (multi-asset portfolios do not require all
  positions `EXACT`; partial coverage propagates `PARTIAL`).
- Dates with NO valuation are skipped, never zero-padded; expected-but-
  missing data yields `PARTIAL`, never a `0%` return.
- Duplicate dates fail closed to `UNAVAILABLE`.
- Units: `Percentage` percent-points on the wire; internal ratios
  (`percent/100`) for mean/variance, converted back exactly.

**Consequences:** `+1/−1/+1/−1` yields sample ≈ 1.1547% (pinned by test);
methodology is auditable end-to-end.
