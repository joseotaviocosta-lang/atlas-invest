# Benchmark-Relative Risk Contract v1 — Fase 3K

**Status:** FOUNDATION — 2026-09-22
**Engine:** `@atlas/risk-engine` `0.3.0` (additive; 3I volatility/drawdown and 3J Sharpe/Sortino untouched)
**Depends:** `@atlas/domain` public primitives only. Zero I/O. `Object.freeze` everywhere.

## 1. Boundary (ADR-138)

```
Portfolio TWR economic intervals  ∩  IBOV economic intervals  (exact (start,end))
  → risk-engine@0.3.0 (pure, deterministic, zero I/O)
  → Beta + Pearson Correlation + Tracking Error (BRL only)
```

- `portfolio-engine@1.0.0-rc.1`, `performance-engine@0.2.0` and
  `benchmark-engine@0.2.0` unchanged; the 3F Yahoo provider (`^BVSP`) is reused
  as-is via a single range fetch.
- Inputs are pure aligned interval observations; provider DTOs never leak.

## 2. Benchmark (ADR-138)

- Only `IBOV` (`PRICE_INDEX`, BRL). `^BVSP` is adapter metadata, never a
  canonical identity.
- CDI is a `RATE_SERIES` risk-free proxy (3G/3J) and is NOT a market-relative
  benchmark: `?benchmark=CDI` → `400 RELATIVE_RISK.UNSUPPORTED_BENCHMARK`.
- USD (or any non-BRL) → `UNAVAILABLE`; no FX.

## 3. Interval alignment (ADR-139)

- Valid pair: `startDate` AND `endDate` both equal. Key `startDate::endDate`.
- Pairing by end date alone is forbidden. Weekend/holiday/flow dates never
  become boundaries.
- Result reports interval counts, paired count and dropped counts; duplicate
  keys are deduplicated deterministically.

## 4. Beta (ADR-140)

- `beta = sampleCovariance(Rp, Rb) / sampleVariance(Rb)`, both `n−1`.
- `n < 2` or `variance(Rb) = 0` → `null`. Unitless ratio, never a percentage.

## 5. Pearson correlation (ADR-141)

- `corr = covariance / (stdRp × stdRb)`; bounded to `[-1, 1]`, clamped only
  within `1e-18`. Either stddev `= 0` → `null`. Unitless ratio.

## 6. Tracking error (ADR-142)

- `active_t = Rp_t − Rb_t`; `daily = sampleStdDev(active)` (`n−1`);
  `annualized = daily × sqrt(252)`.
- `n < 2` → `null`. Identical returns → exactly `0`. Percentage.

## 7. Precision

- Sums, means, variances, covariance: exact `Quantity` decimal. Roots reuse the
  3I `decimalSqrt` (Newton-Raphson). No `Math.sqrt`/`Math.pow`/`Number()`/
  `parseFloat` in the package.

## 8. Anti-scope

No Alpha/Jensen Alpha, Information Ratio, Treynor, R² product metric,
regression intercept, rolling metrics, correlation matrix, attribution,
per-asset/per-account relative risk, VaR/CVaR, Monte Carlo, optimization, risk
scores, recommendations, rebalance, S&P500/Nasdaq, CDI as market benchmark,
Selic, FX, Tax, forecasts.
