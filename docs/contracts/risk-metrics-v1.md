# Risk Metrics Contract v1 — Fase 3I

**Status:** FOUNDATION — 2026-09-21
**Engine:** `@atlas/risk-engine` `0.1.0` (new; performance-engine TWR/XIRR untouched)
**Depends:** `@atlas/domain` public primitives only (`LocalDate`, `Currency`, `Percentage`, `Quantity`). Zero I/O. `Object.freeze` everywhere.

## 1. Boundary (ADR-127)

```
TWR subperiod returns (performance-engine, flows neutralized)
  → risk-engine@0.1.0 (pure, deterministic, zero I/O)
  → RealizedVolatilityResult + DrawdownResult (per currency)
```

- Performance Engine = return (TWR/XIRR/series). Risk Engine = risk
  (volatility/drawdown/future metrics). `portfolio-engine` (1.0.0-rc.1)
  imports neither; `benchmark-engine` (0.2.0) unchanged.
- Inputs are pure financial data (`RiskSubperiodReturn`), never view models,
  ledgers, prices or providers. `DecimalValue`/raw `Decimal` never imported
  or re-exported.

## 2. Volatility methodology (ADR-128, ADR-132)

- Input: subperiod TWR returns (`r1…rn`), percent-point convention
  (`Percentage.from('1')` = +1%). Cumulative levels are NEVER fed as returns.
- **Two-layer observation rule:** Layer A (TWR boundaries) values every
  civil date ∪ flow dates for exact neutralization; Layer B (statistics)
  keeps only subperiods ending on ECONOMIC dates — the start anchor plus
  dates with ≥1 `EXACT` position price. Saturday/Sunday/holiday valuations
  resolved via `PREVIOUS_TRADING_DAY` are valid TWR boundaries but NEVER
  volatility observations (no artificial `0%`); flow-only non-market dates
  likewise stay out of the sample while remaining neutralized in Layer A.
- `mean = Σr / n`; `sampleVariance = Σ(r − mean)² / (n − 1)` (**sample**,
  `n−1`, never population `n`); `sampleVolatility = sqrt(sampleVariance)`.
- `n < 2` → `UNAVAILABLE` with nulls (never invented zero). `n ≥ 2` with
  all-equal returns → exactly `"0"` (known, not missing).
- Frequency is explicit: `DAILY` denotes valid market-day observations
  (exchange calendar approximated by `EXACT` price availability — same
  limitation class as the 3G CDI calendar note), NOT 365 calendar days.
  Dates with NO valuation are skipped, never zero-padded; expected-but-
  missing data yields `PARTIAL`, never `0%`.

## 3. Annualization (ADR-129)

- `annualizedVolatility = dailyVolatility × sqrt(252)` (252 business days,
  daily market convention), exposed as `annualizationFactor: "252"`. Valid
  precisely because Layer B observations are market-day compatible; a
  calendar-day sample would require a different methodology, never a silent
  factor swap (252 → 365 is forbidden as a code-preserving shortcut).

## 4. Precision policy (ADR-129)

- Sums, means and variances use `Quantity` decimal arithmetic (40 digits,
  `ROUND_HALF_UP`) — no IEEE drift.
- The square root is mathematically irrational: it is computed by
  Newton-Raphson iteration in the SAME decimal arithmetic (`decimalSqrt`,
  single boundary, converged to decimal equality, ≤100 iterations).
  There is no `Math.sqrt` / `Math.pow` / `Number()` / `parseFloat` anywhere
  in the package. Tolerance is structural (decimal convergence), and
  regression tests pin `sqrt(2)`/`sqrt(252)` within `1e-12` of float truth.

## 5. Drawdown semantics (ADR-130)

- Wealth path from cumulative TWR: `wealthIndex = 1 + cumulativeReturn`
  (anchor `1` at `startDate` = normalized 0%).
- `runningPeak = max(previousPeak, wealth)`; `drawdown = wealth / peak − 1`
  (always ≤ 0). Maximum drawdown is the most negative value.
- Sign convention explicit: drawdowns are NEGATIVE (`"-25"`), never unsigned.
- `peakDate` = peak anchoring the max drawdown (`startDate` when the path
  never draws down); `troughDate` = max-drawdown date (`startDate` when max
  is 0); `recoveryDate` = first date strictly after trough with wealth ≥
  anchoring peak, else `null` (open drawdown, or no drawdown at all).
- `currentPercentage` = drawdown at the last point (`"0"` at a new high).
- Cash flows cannot fabricate peaks: the path is TWR-derived, so a deposit
  that doubles wealth without economic gain leaves the trajectory flat.

## 6. Statuses

- `AVAILABLE` / `PARTIAL` / `UNAVAILABLE`. PARTIAL propagates from upstream
  valuations and is never labelled complete. UNAVAILABLE uses `null`, never
  `"0"`.

## 7. Multi-currency

Per currency (`BRL`, `USD`, …), never aggregated. No FX.

## 8. Anti-scope

No Calmar, alpha, beta, correlation, covariance, tracking error,
information ratio, VaR/CVaR, Monte Carlo, benchmark-relative risk,
attribution, per-asset/per-account risk, scores, labels, recommendations,
rebalance, FX, Tax, forecasts. (Sharpe/Sortino/downside deviation live in
`risk-adjusted-metrics-v1.md`, Fase 3J.)
