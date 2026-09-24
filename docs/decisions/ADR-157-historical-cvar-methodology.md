# ADR-157 — Historical CVaR Methodology

**Status:** Accepted — 2026-09-23 (Fase 3N)
**Context:** Historical CVaR (Expected Shortfall) must average the observed
losses in the tail. With duplicate values at the threshold, a naive
"all returns ≤ quantile" rule would let ties expand the tail arbitrarily.

**Decision:**

- CVaR uses the SAME sorted sample and the SAME nearest-rank `rank` as VaR
  (ADR-156). The tail is EXACTLY the first `rank` sorted observations
  (`sorted[0 .. rank−1]`), never "all returns ≤ threshold".
- `meanTail = Σ tail / rank`; `loss = max(0, −meanTail)`, always ≥ 0. The mean
  tail return remains separately auditable (`meanTailReturnPercentage`).
- `tailObservationCount = rank` — deterministic, unaffected by duplicate
  threshold values.
- Relationship: in the ordered sample, `CVaR loss ≥ VaR loss` (the tail mean is
  at least as severe as the threshold). Pinned by test.
- All-positive series → `loss = 0`. Minimum sample identical to VaR (ADR-158):
  95 → `n ≥ 20`; 99 → `n ≥ 100`; below → `UNAVAILABLE`.
- Unit: percentage. Source `PARTIAL` propagates. No `NaN`/`Infinity`.

**Consequences:** One deterministic, tie-safe historical CVaR.
