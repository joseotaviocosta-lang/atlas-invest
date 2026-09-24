# ADR-158 — Tail-Risk Sample Size and Confidence

**Status:** Accepted — 2026-09-23 (Fase 3N)
**Context:** A tail statistic computed on a tiny sample is statistically
fragile: the empirical tail may contain no observation at all. The minimum
sample and the supported confidence levels must be explicit.

**Decision:**

- Supported confidence levels: **95% and 99%** only. `confidenceLevel` is
  mandatory on the API; a missing or unsupported value → `400
TAIL_RISK.INVALID_CONFIDENCE_LEVEL` (no silent default).
- Minimum sample size for historical VaR/CVaR:
  - **95% → at least 20 observations**
  - **99% → at least 100 observations**
    These bounds guarantee that the nearest-rank tail contains at least ~1
    observation on average at the configured confidence.
- Below the minimum → `UNAVAILABLE` for VaR/CVaR (never a value computed merely
  because the array is sortable). Downside deviation and semideviation keep
  their own minimum (`n ≥ 2`) and may remain `AVAILABLE`, so the currency status
  is `PARTIAL` (metric-specific availability, ADR-153).
- Daily horizon; no sqrt-time scaling; no monetary VaR.

**Consequences:** Tail metrics are honest about sample adequacy and never
present fragile tail estimates as if precise.
