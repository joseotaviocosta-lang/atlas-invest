# ADR-141 — Correlation Methodology

**Status:** Accepted — 2026-09-22 (Fase 3K)
**Context:** Pearson correlation must measure the historical linear association
between portfolio and benchmark returns over identical economic intervals.

**Decision (single formula):**

```
correlation = covariance(Rp, Rb) / (sampleStdDev(Rp) × sampleStdDev(Rb))
```

- Sample statistics (`n−1`), exact decimal, reusing the 3I `decimalSqrt`.
- Result is bounded to `[-1, 1]`. If exact decimal residuals produce a value
  marginally outside `[-1, 1]`, it is clamped to ±1 ONLY within a documented
  tolerance of `1e-18`. A genuinely out-of-range value (e.g. `1.01`) is never
  hidden.
- Minimum `n ≥ 2`, else `UNAVAILABLE`. `sampleStdDev(Rp) = 0` or
  `sampleStdDev(Rb) = 0` → `correlation = null` (never `NaN`).
- Correlation is a unitless RATIO (`"0.74"`), never a percentage. No
  qualitative interpretation.
- Reference fixtures: perfectly correlated → `+1`; perfectly inverse → `−1`;
  orthogonal → `0`; non-perfect positive/negative pinned against a reference
  (by tests).

**Consequences:** One documented Pearson correlation, auditable and bounded,
with no float paths.
