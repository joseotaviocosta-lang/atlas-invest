# Portfolio Intelligence Summary Contract v1 — Fase 3P

**Status:** FOUNDATION — 2026-09-23
**Package:** `@atlas/portfolio-intelligence` `0.1.0` (pure/deterministic/zero-I/O)
**Depends:** none (plain read-model inputs; frozen outputs).

## 1. Boundary (ADR-166)

The package aggregates ALREADY-COMPUTED read models. It owns no financial
formula, performs no I/O, never replays/fetches/recomputes, and never touches
the AI engine. Outputs are `Object.freeze`d.

## 2. Unified period (ADR-167)

One immutable effective period is used by all historical blocks. Current-only
valuation is anchored at the effective end and distinguished from period metrics.

## 3. Domains

`overview`, `performance`, `benchmarks`, `risk`, `riskAdjusted`, `relativeRisk`,
`activePerformance`, `tailRisk` (confidence 95 canonical), `scenario`
(EQUITY_DOWN_10 only), `dataQuality`, `observations`.

- Overview: currentMarketValue, positionCount, valuedPositionCount,
  unvaluedPositionCount (no currency aggregation).
- Benchmarks: IBOV and CDI (BRL); `differencePercentagePoints` reused from the
  canonical comparison (never recomputed).
- Tail risk: 95% canonical in the summary (the detailed 3N screen keeps 95/99).
- Scenario: only `EQUITY_PRICE_SHOCK −10%` (`EQUITY_DOWN_10`), hypothetical,
  reusing the current valuation snapshot; no benchmark or rate shock.

## 4. Observations (ADR-168)

`{ code, scope, status, source, values }` — deterministic order, no duplicates,
facts only, no interpretation/recommendation/score.

## 5. Data quality (ADR-169)

Structured availability + stable reason codes. No numeric score/rating/grade.

## 6. Status

`AVAILABLE | PARTIAL | UNAVAILABLE`. Structural `UNSUPPORTED` limitations
(e.g. USD benchmark) do not downgrade the summary on their own (ADR-171).

## 7. Isolation

No Prisma, no Nest, no React, no market-data/benchmark/performance/risk/
scenario/portfolio engine imports. `@atlas/portfolio-engine` never imports this
package.

## 8. Anti-scope

No LLM/AI, RAG, embeddings, vector DB, chatbot, recommendations, buy/sell,
rebalance, score, rating, ranking, grade, traffic light, optimization,
prediction, forecast, new formulas, new risk metrics, Monte Carlo, FX, Tax.
