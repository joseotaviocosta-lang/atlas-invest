# ADR-155 — Semideviation Methodology

**Status:** Accepted — 2026-09-23 (Fase 3N)
**Context:** Semideviation measures dispersion below the SAMPLE MEAN of the
series. It must not be confused with downside deviation (target 0%).

**Decision (single formula):**

```
mean = Σ r_t / n
d_t = min(r_t − mean, 0)
semideviation = sqrt( Σ d_t² / n )        (denominator = ALL n)
annualized = semideviation × sqrt(252)
```

- Target = sample mean (distinct from downside deviation's target 0%).
- Denominator is `n` (all observations).
- `n < 2` → `UNAVAILABLE`.
- Constant series → exactly `0`; all-positive varying and all-negative varying
  series both produce strictly positive semideviation when dispersion exists.
- Unit: percentage. Source `PARTIAL` propagates. No `NaN`/`Infinity`.

**Consequences:** One documented semideviation, explicitly distinct from
downside deviation.
