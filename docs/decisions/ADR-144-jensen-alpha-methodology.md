# ADR-144 — Jensen's Alpha Methodology

**Status:** Accepted — 2026-09-22 (Fase 3L)
**Context:** Alpha must measure the historical return above the CAPM-expected
return given the portfolio's Beta, using period-consistent inputs — never a
regression intercept, never a rolling or predictive figure.

**Decision (single formula):**

```
alpha_period = Rp − [ Rf + Beta × (Rm − Rf) ]
```

- `Rp` = portfolio TWR for the period; `Rf` = CDI accumulated return for the
  SAME period; `Rm` = IBOV return for the SAME period; `Beta` = beta over the
  SAME period's paired daily economic returns (ADR-147). All exact decimal.
- The result is the **PERIOD** alpha. It is NEVER silently annualized — a
  3-month period yields the 3-month alpha (ADR-144).
- Unit: percentage (e.g. `"+2.35"`, rendered `+2,35%`).
- `Beta = null` → `UNAVAILABLE` with `null` (never a fabricated expected
  return). Missing CDI or missing IBOV → `UNAVAILABLE`. Any dependency
  `PARTIAL` → `PARTIAL`.
- Reference fixtures: `Rp=15/Rf=5/Rm=10/Beta=1` → `5`; `Beta=0` → `Rp−Rf`;
  negative alpha and negative beta are supported (pinned by tests).

**Consequences:** One documented period Alpha, auditable from same-period inputs
with no float paths and no hidden annualization.
