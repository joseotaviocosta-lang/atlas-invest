# Rolling Analytics Contract v1 — Fase 3M

**Status:** FOUNDATION — 2026-09-22
**Engine:** `@atlas/risk-engine` `0.5.0` (additive; 3I/3J/3K/3L untouched)
**Depends:** `@atlas/domain` public primitives only. Zero I/O. `Object.freeze` everywhere.

## 1. Boundary (ADR-148)

```
3I Layer-B returns (volatility) | 3J aligned observations (Sharpe) | 3K paired intervals (Beta)
  → risk-engine@0.5.0 (pure, deterministic, zero I/O)
  → rolling series over 20/60/120 economic observations
```

- Sources are reused verbatim; no formula is duplicated and no alignment is
  redone. One context build + one IBOV range fetch + one CDI range fetch per
  request; never one provider call per point.

## 2. Window semantics (ADR-149)

- Window = number of VALID ECONOMIC OBSERVATIONS, never calendar days.
- Supported windows: `20 | 60 | 120`. Invalid → `InvalidRollingWindowError` /
  API `400 ROLLING_ANALYTICS.INVALID_WINDOW`.
- No partial windows: `points = max(0, n − W + 1)`; `n < W` → `UNAVAILABLE`
  with empty points.
- Each point: `{ windowStartDate, endDate, observationCount, <value>, status }`,
  sorted `endDate ASC`, frozen.

## 3. Rolling volatility (ADR-150)

- `calculateRollingVolatility` reuses `calculateRealizedVolatility` per slice.
- Value: annualized percentage (`n − 1`, `× sqrt(252)`). Constant → `0`.

## 4. Rolling Sharpe (ADR-152)

- `calculateRollingSharpe` reuses `calculateSharpeRatio` per slice over the 3J
  aligned series. CDI never zero-filled.
- Value: unitless annualized ratio. Zero denominator → `null` point
  (`UNAVAILABLE`). Source `PARTIAL` propagates.

## 5. Rolling Beta (ADR-151)

- `calculateRollingBeta` reuses `calculateBeta` per slice over the 3K paired
  series. No realignment; same-end/different-start and missing-intermediate-
  session pairs remain excluded upstream.
- Value: unitless ratio. Zero benchmark variance → `null` point. Source
  `PARTIAL` propagates.

## 6. Statuses

- Point: `AVAILABLE | UNAVAILABLE`.
- Series: `AVAILABLE` (source complete + all points calculable) |
  `PARTIAL` (source partial or some points `null`) | `UNAVAILABLE`
  (history `< W` or source unavailable).
- No `NaN`/`Infinity` anywhere; always `null`.

## 7. Precision

- Sums, means, variances, covariance: exact `Quantity` decimal. Roots reuse the
  3I `decimalSqrt`. No `Math.sqrt`/`Math.pow`/`Number()`/`parseFloat` in the
  package.

## 8. Anti-scope

No rolling Sortino/Correlation/Tracking Error/Alpha/IR/Treynor/drawdown, no EWMA,
GARCH, regime detection, prediction, attribution, VaR/CVaR, Monte Carlo,
optimization, risk scores, recommendations, rebalance, FX, Tax.
