# ADR-145 — Information Ratio Methodology

**Status:** Accepted — 2026-09-22 (Fase 3L)
**Context:** The Information Ratio must relate the portfolio's historical active
return to its tracking error, on the exact paired daily economic intervals of
3K — never a chart sample, cumulative level or a differently-conventioned
tracking error.

**Decision (single formula):**

```
active_t = Rp_t − Rm_t                       (percent points)
meanActive = Σactive / n
dailyTrackingError = sampleStdDev(active)    (n − 1)
informationRatioDaily = meanActive / dailyTrackingError
informationRatioAnnualized = informationRatioDaily × sqrt(252)
```

- The active returns use the SAME paired daily economic intervals as 3K (never
  re-aligned by end date). The denominator is EXACTLY the 3K daily tracking
  error convention (`n − 1`), never recomputed with another one.
- Annualization `× sqrt(252)` (daily market-day convention). Swapping 252 → 365
  is forbidden.
- `n < 2` or `dailyTrackingError = 0` → `UNAVAILABLE` with `null` (never
  `Infinity`/`NaN`), even when the mean active return is positive.
- Unit: unitless RATIO (`"1.27"`, rendered `1,27`) — never a percentage.
- Reference fixtures: positive/negative IR, zero mean active → `0`,
  identical returns / constant active return → `null` (pinned by tests).

**Consequences:** One documented Information Ratio, auditable from paired active
returns and the reused 3K tracking error with no float paths.
