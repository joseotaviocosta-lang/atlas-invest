# Active Performance Contract v1 — Fase 3L

**Status:** FOUNDATION — 2026-09-22
**Engine:** `@atlas/risk-engine` `0.4.0` (additive; 3I/3J/3K untouched)
**Depends:** `@atlas/domain` public primitives only. Zero I/O. `Object.freeze` everywhere.

## 1. Boundary (ADR-143)

```
Portfolio TWR (Rp) + CDI (Rf) + IBOV (Rm) + Beta + paired daily observations
  → risk-engine@0.4.0 (pure, deterministic, zero I/O)
  → Jensen Alpha + Information Ratio + Treynor (BRL only)
```

- `portfolio-engine@1.0.0-rc.1`, `performance-engine@0.2.0` and
  `benchmark-engine@0.2.0` unchanged. No new pipeline, no Redis.
- IBOV is the market benchmark, CDI the BRL risk-free proxy. Multi-currency
  map (consistent with 3I/3J/3K): BRL gets metrics, any non-BRL currency is
  `UNAVAILABLE` in the SAME response (no FX).

## 2. Period consistency (ADR-147)

`Rp`, `Rf`, `Rm` and `Beta` all describe the SAME `[effectiveStart,
effectiveEnd]`. Single context build + single IBOV range fetch + single CDI
range fetch per request. No secondary period drift.

Proven by instrumentation: the use case derives ONE effective period object and
passes it to every dependency. Trace tests assert the IBOV range fetch, the CDI
range fetch and every historical valuation date fall exactly within
`[effectiveStart, effectiveEnd]`, for explicit, default and inception-clamped
periods. The Information Ratio consumes the 3K paired observations unchanged —
no second alignment is created.

## 3. Jensen's Alpha (ADR-144)

- `alpha_period = Rp − [ Rf + Beta × (Rm − Rf) ]`, exact decimal.
- Period alpha — never silently annualized. Unit: percentage.
- `Beta = null` / missing CDI / missing IBOV → `null`. Any dependency `PARTIAL`
  → `PARTIAL`.

## 4. Information Ratio (ADR-145)

- `active_t = Rp_t − Rm_t` on the EXACT 3K paired daily economic intervals.
- `meanActive / dailyTrackingError`; `dailyTrackingError` is EXACTLY the 3K
  `n−1` tracking error. `annualized = daily × sqrt(252)`. Unit: unitless ratio.
- `n < 2` or `dailyTrackingError = 0` → `null` (never `Infinity`/`NaN`).

## 5. Treynor Ratio (ADR-146)

- `treynor_period = (Rp − Rf) / Beta`, exact decimal.
- Unit: percentage-per-beta (`periodPercentagePerBeta`). `Beta = null` or `0`
  → `null`. Negative Beta valid; zero excess → `0`.

## 6. Metric-specific availability (ADR-143)

Status is `AVAILABLE` when all three metrics are available, `UNAVAILABLE` when
all three are unavailable, and `PARTIAL` otherwise. Metric-level `null`s are
preserved (e.g. Alpha `null`, IR available, Treynor `null` → `PARTIAL`).

## 7. Precision

- Sums, means, variances, ratios: exact `Quantity` decimal. Roots reuse the 3I
  `decimalSqrt`. No `Math.sqrt`/`Math.pow`/`Number()`/`parseFloat` in the
  package.

## 8. Anti-scope

No rolling Alpha/IR/Treynor/Beta, regression intercept/forecast, R² product
metric, attribution, active contribution, per-asset/per-account active
performance, VaR/CVaR, Monte Carlo, optimization, efficient frontier, risk
scores, recommendations, rebalance, S&P500/Nasdaq, Selic, FX, Tax, prediction.
