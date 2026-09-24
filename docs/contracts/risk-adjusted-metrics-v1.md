# Risk-Adjusted Metrics Contract v1 — Fase 3J

**Status:** FOUNDATION — 2026-09-22
**Engine:** `@atlas/risk-engine` `0.2.0` (additive; 3I volatility/drawdown untouched)
**Depends:** `@atlas/domain` public primitives only. Zero I/O. `Object.freeze` everywhere.

## 1. Boundary (ADR-133)

```
Layer-B TWR subperiod returns ∩ real CDI daily returns (per date)
  → risk-engine@0.2.0 (pure, deterministic, zero I/O)
  → SharpeRatioResult + SortinoRatioResult (BRL only)
```

- `portfolio-engine@1.0.0-rc.1` and `performance-engine@0.2.0` TWR/XIRR
  unchanged; `benchmark-engine@0.2.0` unchanged (3G provider reused as-is).
- Inputs are pure aligned observations (`RiskAdjustedReturnObservation`),
  never view models, chart samples, ledgers or providers.

## 2. Risk-free proxy (ADR-134)

- Canonical `RiskFreeProxy = 'CDI'`, BRL-only. CDI is a methodological
  **proxy** ("Referência usada: CDI"), never a literal zero-risk guarantee.
- No hardcoded rate, no `riskFree = 0` fallback, no IBOV substitution, no
  CDI applied to USD (→ `UNAVAILABLE`, `riskFreeProxy: null`), no FX.

## 3. Sharpe methodology (ADR-135)

- Per-observation excess: `excess_t = portfolioReturn_t − riskFreeReturn_t`
  (ratios, exact decimal). Never `annualReturn − annualCDI` as pseudo-daily.
- `mean = Σexcess / n`; `sampleStddev = sqrt(Σ(excess−mean)² / (n−1))`;
  `sharpeDaily = mean / stddev`; `sharpeAnnualized = sharpeDaily × sqrt(252)`.
- `n < 2` → `UNAVAILABLE`. `stddev = 0` → `UNAVAILABLE` (`null`, never
  `Infinity`/`NaN` — even with positive mean).

## 4. Sortino methodology (ADR-136)

- Same excess with target = reference itself; downside measured on excess.
- `downsideDeviation = sqrt(Σ min(excess_t, 0)² / n)` — denominator `n` =
  ALL observations (documented convention, not the negative count).
- `sortinoDaily = mean / downsideDeviation`;
  `sortinoAnnualized = sortinoDaily × sqrt(252)`.
- `n < 2` or `downsideDeviation = 0` (no negative excess) → `UNAVAILABLE`.

## 5. Date alignment (ADR-137)

- Intersection of portfolio Layer-B economic dates with real CDI
  observation dates (both `DAILY_PERCENT` business-day series, no invented
  weekend/holiday zeros on either side). Missing CDI on a portfolio date
  narrows the sample and marks `PARTIAL`; zero overlap → `UNAVAILABLE`.
- CDI range fetch (single call per period), never one HTTP call per day.

## 6. Precision

- Subtraction, mean, variance: `Quantity` exact decimal. Roots: reused
  `decimalSqrt` (Newton-Raphson, ADR-129). No `Math.sqrt`/`Math.pow`/
  `Number()`/`parseFloat` in the package.

## 7. Presentation

- Sharpe/Sortino are unitless RATIOS: serialized as decimal strings
  (`"1.24"`), rendered `"1,24"` — never `"1,24%"`.

## 8. Anti-scope

No Beta/Alpha, correlation, tracking error, information ratio, Calmar,
Treynor, VaR/CVaR, Monte Carlo, risk scores, recommendations, rebalance,
benchmark-relative risk analytics, per-asset/per-account risk-adjusted
metrics, FX, Tax, forecasts.
