# Phase 5Q-D — Rebalancing Scenario Simulation (Hypothetical-Only)

## Purpose

Let the user answer "if I contributed R$ X split manually across classes,
what would my allocation look like?" without moving money, generating
orders, or receiving advice. The Atlas computes the mathematical effect of
a user-declared hypothesis against current allocation and the user's own
5Q-C targets. The Atlas never chooses the allocation.

## Hypothetical-only boundary

- Input: one `CONTRIBUTION` scenario with manually-declared changes
  (`category` + locale money string). No auto-distribution, no optimizer,
  no solver.
- Output: projected values, weights, and deviations. Ephemeral:
  `POST /api/v1/portfolios/:id/allocation-strategy/simulate` persists
  nothing (0 migrations), executes nothing, generates no orders/tickers.
- Review (5Q-A) and history (5Q-B) never ingest hypothetical data.
  Today shows no scenario data.
- WITHDRAWAL is explicitly unsupported in v1: the engine rejects it with
  `UNKNOWN_SCENARIO_TYPE` instead of coercing it. Floor-at-zero and
  no-implicit-sale semantics are deferred, not improvised.

## Scenario model

```text
AllocationScenario { type: 'CONTRIBUTION', changes: [{ category, amount }][] }
```

- `amount` arrives as a locale string (`10.000,50`, `10000.50`, `10000`);
  the API parses it to a canonical decimal before the engine sees it.
- Validation (engine `validateScenarioInput`): known type, 1..N changes
  (N = number of supported categories), known categories, no duplicates
  (fail, never silent-sum), canonical `^\d+(\.\d{1,2})?$`, strictly
  positive. Zero/negative/malformed → `INVALID_AMOUNT` /
  `NON_POSITIVE_AMOUNT`.
- Server authority: the client sends only hypothetical changes. Current
  allocation, strategy targets, currency, and coverage load server-side.
  Strict Zod DTO (`.strict()`) rejects `portfolioId`, current/projected/
  target values, currency, provider, source, and unknown fields with 400.

## Money semantics

- Engine math is exact decimal strings via BigInt (no `number`,
  no `parseFloat`, no binary float) for addition and for
  `ratioToBasisPoints` (ROUND_HALF_UP, fail-closed on zero total or
  out-of-range instead of NaN/Infinity).
- Locale parsing (`parseScenarioAmountToCanonical`): `.` thousands +
  `,` decimal when both present; `,` decimal when alone; ambiguous `.`
  resolves as thousands only for `^\d{1,3}(\.\d{3})+$`, else decimal
  with ≤2 places. Max 18 digits (storage sanity, not a product cap).
- Cent precision preserved (`10000,50` → `10000.5` canonical,
  displayed `R$ 10.000,50`). The web total uses integer-cent BigInt;
  weights are server-computed, never re-derived in UI.

## Current vs projected

- Current values come from the canonical allocation read model via the
  shared `loadComparisonBasis` (same basis as 5Q-C `compareStrategy`):
  translated `reportingMarketValue` when available, else the single
  currency bucket. One strategy read + one allocation read; no per-asset N+1.
- `projectedValue = currentKnownValue + hypotheticalContribution` (exact),
  `projectedTotal = currentKnownTotal + scenarioTotal`,
  `projectedWeight = projectedValue / projectedTotal` (integer bp).
- A target category with zero current value starts from `0` and projects
  normally; a contribution to a zero-target category is allowed and shows
  its deviation. Unknown categories → 400. Empty known total → no
  simulation (throws, caught as fail-closed).
- Rows are canonically ordered (`STRATEGY_CATEGORIES`); same input always
  yields the same output. Response carries `generatedAt`/`asOf` via the
  shared comparison (`asOf` from allocation).

## Strategy reuse

- Projected deviations reuse `compareAllocationToStrategy` — no second
  deviation implementation. `currentBp`/`currentDeviationBp` come from the
  shared comparison; a missing current leg stays `null`/`UNAVAILABLE`
  without clobbering the valid projected classification.
- Result contains `current`, `projected`, `target`, `currentDeviationBp`,
  `projectedDeviationBp` per row plus aggregates: `beforeOutsideCount`,
  `afterOutsideCount`, `beforeTotalAbsDeviationBp`,
  `afterTotalAbsDeviationBp`, `worstGap`. Neutral facts only —
  never "better", scores, or rankings.

## Data quality

- Coverage floor (`STRATEGY_MIN_COVERAGE_BP` = 8000): below it, or on
  multi-currency without translated totals, unparseable weights, or empty
  portfolios, the API returns `scenario: null` with
  `limitations: ['INSUFFICIENT_DATA']` and an UNAVAILABLE comparison
  (fail-closed, never a partial projection dressed as complete).
- Partial coverage (80–100%): simulation runs and adds
  `limitations: ['PARTIAL_COVERAGE']`; the UI shows "A simulação considera
  apenas o valor conhecido da carteira."

## Multi-currency

- V1 simulates only with a consolidated currency: the translated
  reporting currency when `translatedAllocation.status === 'AVAILABLE'`,
  else a single-currency bucket (`KNOWN_VALUE_<CCY>`). Multi-currency
  without translation → `SCENARIO_UNAVAILABLE` (`INSUFFICIENT_DATA`).
  No FX is invented: no live rates, no guessed rates, no last-known
  without source — only the canonical translated totals.

## Advice boundary

Allowed: "Você informou um aporte hipotético de R$ 10.000 em Renda Fixa.
Após essa hipótese, a participação estimada dessa classe seria 38,4%."
/ "O desvio passaria de −6 p.p. para −2 p.p." / before/after
outside-target counts / aggregate absolute deviation (bp).

Forbidden (scanned in tests): buy/sell directives, "você deveria",
"recomendamos", "melhor cenário", "ideal/ótimo", "rebalancear agora",
"executar", "ordem", scores, rankings, auto-distribution, Markowitz /
risk parity / optimizer / solver language. The simulator has no
"Comprar agora / Executar aporte / Enviar ordem" CTA — only `Simular`,
`Limpar simulação`, `Fechar`.

## No execution

- No ledger writes, no transaction writer, no B3/broker transport, no
  fiscal engine in the path (architecture tests). The API test asserts
  strategy-row and transaction counts are unchanged by simulation.
- Web keeps scenario in local component state (no URL persistence, no
  financial values in query strings). Mobile v1 is read-only with the
  explicit note "Simulações de aporte hipotético disponíveis na versão
  web." — no dead CTA.

## Future extensions

- `5Q-E — Contribution Planning Assistant` or `Saved Scenarios &
Comparison`, only after evaluating 5Q-D. Never automatic optimization:
  each scenario stays independent, no "best scenario" selection.
- WITHDRAWAL (amount ≤ current value, projected never negative,
  projected total > 0, no implicit sale) only with explicit semantics
  and tests. No per-ticker purchases, no tax-aware or cost-aware
  rebalancing, no suitability, no B3 CERT coupling.
