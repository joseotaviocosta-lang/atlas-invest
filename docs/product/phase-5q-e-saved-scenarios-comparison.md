# Phase 5Q-E — Saved Scenarios & Comparison (Hypothetical Inputs Only)

## Saved input model

A saved scenario is the user's declared hypothesis, nothing else:

```text
PortfolioAllocationScenario {
  id
  portfolioId
  name        // plain text, trimmed, 1..80 chars, no markup
  type        // 'CONTRIBUTION' (v1 only)
  changes[]   // { category, amount } — exact Decimal, canonical, > 0
  createdAt
  updatedAt
}
```

Identity is the id; duplicate names are allowed (no artificial product
constraint). Amounts persist as `Decimal(38,18)` (canonical ≤2 decimals);
formatted strings (`R$ 10.000,00`) are never stored. Validation reuses the
5Q-D engine (`validateScenarioName` + `validateScenarioInput`) — no second
implementation.

## Live recompute semantics

A saved scenario is NOT a snapshot of the portfolio. Opening (or
comparing) always computes fresh:

```text
saved hypothetical inputs
+ current portfolio state (now)
+ current strategy (now)
= fresh simulation result
```

`createdAt` (when the hypothesis was written) is never confused with
`generatedAt` (when the result was computed) or `marketDataAsOf`
(allocation data date). If targets changed since saving, the result uses
the live targets (the UI notes the recomputation). If holdings changed,
the result recomputes — that is the expected behavior.

## Current-state dependency

Detail and compare load one comparison basis (same code path as 5Q-C/D:
translated reporting values when available, else the single-currency
bucket). Empty portfolios, unparseable weights, or multi-currency
without translation yield `live: null` + `INSUFFICIENT_DATA` — the saved
inputs stay stored, untouched.

## Strategy dependency

Strategy is required for a live result but never for storage. If targets
were removed after saving, the scenario persists and detail returns
`live: null` + `NO_STRATEGY` with a "Definir metas" path. If a saved
category leaves the domain (future vocabulary change), validation fails
safely with `NEEDS_REVIEW` instead of deleting or silently fixing the
scenario. Compare with an unavailable basis refuses with
`NO_STRATEGY`/`INSUFFICIENT_DATA` (400) rather than mixing states.

## Persistence

One additive migration (`portfolio_allocation_scenarios` +
`portfolio_allocation_scenario_changes`): FK portfolio→cascade,
scenario→changes cascade, unique (scenario, category), `amount > 0`
CHECK, index on portfolio (+ listing order `updatedAt DESC, id ASC`).
Writes are atomic (scenario + full change set in one transaction);
update replaces the whole set; delete cascades to changes and touches
nothing else (portfolio, strategy, transactions, ledger intact).
Cap: 50 scenarios per portfolio (abuse guard; hitting it fails closed
without deleting anything). List is light metadata + hypothetical
input totals — never a simulation per card (no N+1, no stale results).

## CRUD

- `POST /:id/allocation-scenarios` → 201 saved input (strict DTO: name,
  type, changes only).
- `GET /:id/allocation-scenarios` → metadata list (no simulation).
- `GET /:id/allocation-scenarios/:scenarioId` → saved + live result +
  limitations.
- `PUT .../:scenarioId` → atomic full replacement.
- `DELETE .../:scenarioId` → `{ deleted: true }`; missing → 404.
- Duplicate is client-side: load → create with same changes and
  `" — cópia"` name (user edits before/after).
- Ownership everywhere: foreign portfolio or cross-portfolio id → 404,
  never leaked. Delete of an already-deleted scenario → 404 (existing
  API pattern).

## Comparison

- `POST /:id/allocation-scenarios/compare` with exactly two distinct
  scenario ids (strict tuple DTO; duplicates/malformed → 400).
- The server loads both scenarios, then simulates BOTH against ONE
  shared basis (one strategy read + one allocation read) and compares
  with the pure `compareScenarioResults` engine, which re-checks the
  shared basis (same currency, same current total) and refuses to mix
  states.
- Reported facts: per side `scenarioTotal`, `projectedTotal`,
  `outsideCount`, `totalAbsDeviationBp`, per-category projected weights
  - deviations; `sameScenarioTotal` flags different contribution totals
    (the UI calls out non-equivalence). No `winner`, no `bestScenario`,
    no score, no ranking, no advice — structurally and by test.

## Same-basis guarantee

Two independent requests could straddle a portfolio or strategy change.
Compare avoids that by construction: one basis load, two pure
simulations, one factual diff — plus an engine-level re-check and an
API test asserting each side equals its independent live detail.

## Data quality

Partial coverage (80–100%) attaches `PARTIAL_COVERAGE` to both sides
identically ("A comparação considera apenas o valor conhecido da
carteira."). Below floor / empty / multi-currency without translation →
compare fails closed; detail returns `live: null`. Categories never
invented; FX never invented.

## Advice boundary

Allowed: "Cenário A deixa 2 categorias fora das metas. Cenário B deixa 3."
/ "O desvio absoluto agregado seria 5,2 p.p. no cenário A e 7,1 p.p. no
cenário B." Forbidden (scanned): "melhor cenário", "recomendado",
"ideal", "otimizado", "deveria escolher", buy/sell directives,
execution CTAs, scores. The UI states no scenario is pointed out as
better; cards keep the user's chosen order (no sorting by "best").

## No execution

No ledger writes, no transaction writer, no B3/broker transport, no
fiscal engine in the path. Saved storage and live recompute are the only
writes/reads; the API test asserts strategy and transaction counts are
unchanged by every scenario operation.

## Mobile limitations

Mobile lists saved scenarios and opens the live result read-only
(recalculated server-side). Create/edit stay web-only with an explicit
note ("Criar e editar cenários estão disponíveis na versão web.").
No dead CTAs, no execution, no advice. Saved scenarios never appear in
Today and never produce PortfolioReview signals or history entries.

## Future possibilities

- `5Q-F — Contribution Planning Workspace`: manual construction help,
  still never an automatic optimizer without an explicit product and
  regulatory decision.
- WITHDRAWAL scenarios only with floor-at-zero + no-implicit-sale
  semantics specified and tested.
- Never: automatic optimization, ranking, backtesting, return/income/
  volatility projections, tax-aware rebalancing, suitability, B3 CERT
  coupling.
