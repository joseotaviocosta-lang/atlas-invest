# ADR-162 — Benchmark (Beta) Shock Methodology

**Status:** Accepted — 2026-09-23 (Fase 3O)
**Context:** A benchmark shock estimates the portfolio's response to an IBOV
move via its historical Beta. This must be an explicit historical estimate, not
a causal guarantee or a forecast.

**Decision:**

- Benchmark: **IBOV** only.
- Beta source: the **3K historical portfolio Beta** (reused as-is; never
  recomputed in the client, never a per-asset Beta).
- Formula (exact decimal):
  `estimatedReturn% = Beta × benchmarkShock%`;
  `stressedValue = baseValue × (1 + estimatedReturn/100)`.
- `Beta = null` (unavailable) → the benchmark component is **UNAVAILABLE**
  (`SCENARIO.BETA_UNAVAILABLE`). **Never** a fallback to `Beta = 1`.
- `Beta = 0` → zero impact (valid). Negative Beta is mathematically valid and
  simply flips the sign; it is never classified qualitatively.
- The result is labeled "Estimativa baseada no beta histórico da carteira em
  relação ao Ibovespa." Beta is historical, not causal.
- Applied at the consolidated **portfolio** level (BRL), not per asset.
  Non-BRL currencies have no compatible Beta → `UNAVAILABLE` (no FX).

**Consequences:** Benchmark shocks are honest historical estimates.
