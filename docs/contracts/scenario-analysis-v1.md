# Scenario Analysis Contract v1 — Fase 3O

**Status:** FOUNDATION — 2026-09-23
**Engine:** `@atlas/scenario-engine` `0.1.0` (new package; pure/deterministic/zero-I/O)
**Depends:** `@atlas/domain` public primitives only. Object.freeze outputs.

## 1. Boundary (ADR-159)

```
market-value snapshot + explicit deterministic scenario
  → scenario-engine@0.1.0 (pure, deterministic, zero I/O)
  → stressed value + absolute / percentage impact
```

- Separate from statistical risk (3I–3N) and from the Portfolio Engine. No
  fetch, no Prisma, no Nest, no React. Never mutates the ledger/portfolio/inputs.
- No Monte Carlo, probabilities, distributions, likelihood, forecasts, options
  pricing, Greeks, full bond pricing, curve modelling, credit/default/liquidity
  models, factor models, optimization or recommendations.

## 2. Determinism (ADR-160)

Explicit, deterministic, auditable, reproducible hypotheses. Presets map to
explicit inputs; no crisis/dated names.

## 3. Scenario types

`EQUITY_PRICE_SHOCK | BENCHMARK_SHOCK | RATE_SHOCK | COMBINED`.

- Equity (ADR-161): eligible `STOCK/FII/ETF/BDR`; `stressedPrice = basePrice ×
(1 + shock/100)`, `stressedValue = quantity × stressedPrice`; bounds
  `[−100%, +500%]`.
- Benchmark (ADR-162): IBOV; `estimatedReturn% = Beta × shock%`; 3K historical
  portfolio Beta; `Beta = null` → UNAVAILABLE (never `Beta = 1`).
- Rate (ADR-163): requires explicit `modifiedDuration`; none exists in the
  domain → **UNSUPPORTED**; guarded linear duration approximation only when a
  duration is explicitly provided (`ΔV/V = −D_mod × bps/10000`); no convexity.
- Combined (ADR-164): equity **and** benchmark together is forbidden
  (`SCENARIO.CONFLICTING_SHOCKS`); equity-or-benchmark + rate is allowed.

## 4. Data availability (ADR-165)

Unvalued positions are excluded and counted (`unvaluedPositionCount`), never
zero. Status: `AVAILABLE | PARTIAL | UNAVAILABLE`; currency-segregated, no FX.

## 5. Error codes

`SCENARIO.INVALID_TYPE`, `SCENARIO.INVALID_SHOCK`,
`SCENARIO.CONFLICTING_SHOCKS`, `SCENARIO.UNSUPPORTED_RATE_SHOCK`,
`SCENARIO.BETA_UNAVAILABLE`, `SCENARIO.RATE_SHOCK_NEGATIVE_VALUE`,
`SCENARIO.INVALID_AS_OF`.

## 6. Anti-scope

No Monte Carlo, probabilities, likelihood, forecasts, parametric VaR, CVaR
simulation, options/Greeks, full bond pricing, yield-curve/credit/default/
liquidity/factor models, optimization, recommendations, rebalance, FX, Tax,
prediction.
