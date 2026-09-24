# ADR-154 — Downside Deviation Methodology

**Status:** Accepted — 2026-09-23 (Fase 3N)
**Context:** Downside deviation measures dispersion of returns below a target.
In 3J the Sortino downside used the CDI reference; 3N freezes an absolute
target of 0%.

**Decision (single formula):**

```
downside_t = min(r_t, 0)
downsideDeviation = sqrt( Σ downside_t² / n )        (denominator = ALL n)
annualized = downsideDeviation × sqrt(252)
```

- Target = 0% (absolute), not the CDI reference and not the sample mean.
- Denominator is `n` (all observations), consistent with the 3J Sortino
  convention but with target 0%.
- `n < 2` → `UNAVAILABLE` (same minimum as the other daily risk metrics).
- All returns ≥ 0 → daily and annualized exactly `0` (a valid known value, not
  `UNAVAILABLE`).
- `negativeObservationCount` = number of returns `< 0`.
- Unit: percentage. Source `PARTIAL` propagates. No `NaN`/`Infinity`.

**Consequences:** One documented downside deviation, auditable and distinct from
semideviation.
