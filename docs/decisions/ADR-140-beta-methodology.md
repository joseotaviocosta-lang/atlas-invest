# ADR-140 — Beta Methodology

**Status:** Accepted — 2026-09-22 (Fase 3K)
**Context:** Beta must measure historical sensitivity of portfolio returns to
the benchmark, using the same economic intervals as the other relative-risk
metrics — never raw market-value changes, chart samples or annualized-figure
ratios.

**Decision (single formula):**

```
beta = sampleCovariance(Rp, Rb) / sampleVariance(Rb)
```

- `sampleCovariance = Σ[(Rp − meanRp)(Rb − meanRb)] / (n − 1)`;
  `sampleVariance(Rb) = Σ(Rb − meanRb)² / (n − 1)` (both sample, `n−1`, exact
  decimal via `Quantity`; roots via the 3I `decimalSqrt`).
- Minimum `n ≥ 2`, else `UNAVAILABLE`. `variance(Rb) = 0` → `UNAVAILABLE` with
  `beta = null` — never `Infinity`/`NaN`.
- Beta is a unitless RATIO (`"0.87"`), never a percentage (`"0.87%"`). Positive,
  zero and negative betas are all valid; no qualitative classification.
- Reference fixtures: `Rb = 1/2/3%`, `Rp = 2/4/6%` → `beta = 2`;
  identical returns → `beta = 1`; `Rp = −1/−2/−3%` → `beta = −1`; orthogonal
  returns → `beta = 0` (pinned by tests).

**Consequences:** One documented Beta, auditable from aligned interval returns
to the ratio with no float paths.
