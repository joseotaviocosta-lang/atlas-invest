# ADR-146 — Treynor Ratio Methodology

**Status:** Accepted — 2026-09-22 (Fase 3L)
**Context:** The Treynor Ratio must relate the portfolio's historical excess
return over the risk-free proxy to its systematic risk (Beta), all from the
same period.

**Decision (single formula):**

```
treynor_period = (Rp − Rf) / Beta
```

- `Rp` = portfolio TWR for the period; `Rf` = CDI accumulated return for the
  SAME period; `Beta` = beta over the SAME period (ADR-147). Exact decimal.
- Unit contract: **percentage-per-beta** — percent points of period excess
  return per unit of Beta (`"7.42"`, rendered `7,42%`). This is a derived
  numeric, documented explicitly and never mixed with a plain percentage.
- `Beta = null` or `Beta = 0` → `UNAVAILABLE` with `null` (never `Infinity`).
  Missing CDI → `UNAVAILABLE`. Negative Beta is mathematically valid and simply
  flips the sign. Zero excess return → exactly `0`.
- Reference fixtures: `Rp=15/Rf=5/Beta=2` → `5`; `Beta=1` → excess;
  `Beta=−2` → negative; zero excess → `0` (pinned by tests).

**Consequences:** One documented period Treynor, auditable from same-period
inputs with no float paths.
