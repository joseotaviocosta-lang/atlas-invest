# Downside & Tail Risk Contract v1 — Fase 3N

**Status:** FOUNDATION — 2026-09-23
**Engine:** `@atlas/risk-engine` `0.6.0` (additive; 3I–3M untouched)
**Depends:** `@atlas/domain` public primitives only. Zero I/O. `Object.freeze` everywhere.

## 1. Boundary (ADR-153)

```
3I Layer-B economic TWR returns
  → risk-engine@0.6.0 (pure, deterministic, zero I/O)
  → downside deviation + semideviation + historical VaR + historical CVaR
```

- No chart points, cumulative levels, calendar-day zeros or raw value changes.
  No IBOV/CDI (portfolio alone). One context build per request; one sort per
  currency/confidence reused for VaR and CVaR.

## 2. Downside deviation (ADR-154)

- `downside_t = min(r_t, 0)`; `sqrt(Σ downside_t² / n) × sqrt(252)`.
- Target 0%. Denominator `n`. `n < 2` → `UNAVAILABLE`. All ≥ 0 → `0`.

## 3. Semideviation (ADR-155)

- `d_t = min(r_t − mean, 0)`; `sqrt(Σ d_t² / n) × sqrt(252)`.
- Target = sample mean. Denominator `n`. Constant → `0`.

## 4. Historical VaR (ADR-156)

- Empirical, nearest-rank: `rank = ceil((1−c) × n)` (`95 → n/20`, `99 → n/100`),
  clamp `[1, n]`; `quantile = sorted[rank−1]`; `loss = max(0, −quantile)`.
- Confidence `95 | 99` only. Minimum sample: 95 → 20; 99 → 100 (ADR-158).
- `tailObservationCount = rank`. Daily horizon; no sqrt-time scaling.

## 5. Historical CVaR (ADR-157)

- Same sorted sample and `rank` as VaR; tail = EXACTLY the first `rank` sorted
  observations (ties never expand the tail).
- `meanTail = Σ tail / rank`; `loss = max(0, −meanTail)`; `CVaR loss ≥ VaR loss`.

## 6. Statuses (ADR-153)

- Metric: `AVAILABLE | PARTIAL | UNAVAILABLE`. Source `PARTIAL` propagates.
- Combined per currency: `AVAILABLE` when all four available, `UNAVAILABLE` when
  all four unavailable, else `PARTIAL` (metric-specific nullability preserved).

## 7. Precision

- Exact `Quantity` decimal; roots via the 3I `decimalSqrt`. Sorting uses decimal
  comparison and never mutates the input. No `Math.sqrt`/`Math.pow`/`Number()`/
  `parseFloat` in the package.

## 8. Anti-scope

No parametric/Gaussian/Cornish-Fisher/Monte Carlo VaR or CVaR, no EWMA/GARCH,
no volatility forecasting, no regime detection, no stress/scenario analysis,
no drawdown-at-risk, no liquidity/factor/marginal/component/incremental VaR, no
per-asset/per-account VaR, no optimization, no risk scores, no recommendations,
no rebalance, no FX, no Tax, no prediction.
