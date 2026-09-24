# ADR-156 — Historical VaR Methodology

**Status:** Accepted — 2026-09-23 (Fase 3N)
**Context:** Historical Value at Risk must use the empirical return
distribution without assuming normality, and its quantile convention must be
frozen so results are reproducible across libraries.

**Decision:**

- **Empirical only.** Historical VaR uses the observed distribution of 3I
  Layer-B economic TWR returns. No parametric/Gaussian, Cornish-Fisher, Monte
  Carlo, EWMA or GARCH assumptions.
- **Confidence levels:** `95 | 99` only (`TailConfidenceLevel`). No arbitrary
  confidence in 3N.
- **Nearest-rank quantile (frozen):** with returns sorted ASC,
  `tailProbability = 1 − c`, `rank = ceil(tailProbability × n)` (integer ceil
  division: `95 → n/20`, `99 → n/100`), clamped to `[1, n]`;
  `quantile = sorted[rank − 1]`. Linear interpolation, R type 7, Excel/Numpy
  defaults are NOT used.
- **Loss-magnitude convention:** `loss = max(0, −quantile)`, always ≥ 0. The
  threshold return remains separately auditable
  (`quantileReturnPercentage`). A positive quantile yields `loss = 0`.
- **Minimum sample (ADR-158):** 95 → `n ≥ 20`; 99 → `n ≥ 100`. Below the
  minimum → `UNAVAILABLE` (no fake precision from a fragile tail).
- **Daily horizon only.** No sqrt-time scaling, no multi-day VaR, no monetary
  VaR. `tailObservationCount = rank`.

**Consequences:** One deterministic, library-independent historical VaR.
