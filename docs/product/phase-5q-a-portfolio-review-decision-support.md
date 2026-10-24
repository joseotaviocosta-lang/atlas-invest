# Phase 5Q-A — Portfolio Review & Decision Support Foundation

Status: implementation complete, awaiting owner review/push. B3 CERT stays blocked (`ENGINEERING_READY_FOR_CERT`, `CERT_ACCESS_BLOCKED` — unchanged by this phase; no integration code touched).

## Purpose

Consolidate what the Atlas already knows — positions, valuation, allocation, performance, income, reconciliation, pending reviews — into one decision layer:

```text
dados da carteira → sinais objetivos → priorização → explicação → ação sugerida
```

The review never tells the investor what to buy or sell. It answers: _what deserves attention, for which reasons, with which data, and where to review it._

## Facts vs signals vs interpretation vs action

- FACT: persisted or computed values (weights, coverage %, gaps, counts). Produced by existing engines; the review only reads them.
- SIGNAL: a deterministic rule firing on facts (`ALLOCATION_SINGLE_ASSET_CONCENTRATION` because weight ≥ 25%) — stable code, severity, evidence.
- INTERPRETATION: fixed pt-BR copy per code ("Uma parcela relevante do patrimônio depende de um único ativo"). No personalized judgment, no predictions.
- ACTION: navigation only (`ROUTE` + href + label) to an existing feature. No auto-anything.

## Signal catalog

| Code                                  | Category     | Severity                      | Fires when                                      |
| ------------------------------------- | ------------ | ----------------------------- | ----------------------------------------------- |
| DATA_VALUATION_COVERAGE               | DATA_QUALITY | INFO (80–99%) / REVIEW (<80%) | coverage < 100% and positions exist             |
| DATA_RECONCILIATION_DIVERGENCE        | DATA_QUALITY | WARNING                       | divergent+missing+unresolved > 0 in recent runs |
| INTEGRATION_PENDING_REVIEW            | INTEGRATION  | REVIEW                        | pending review items > 0                        |
| ALLOCATION_SINGLE_ASSET_CONCENTRATION | ALLOCATION   | REVIEW                        | top weight ≥ 25% of known value                 |
| PERFORMANCE_BENCHMARK_GAP             | PERFORMANCE  | REVIEW                        | gap ≤ −2 p.p. vs IBOV/CDI (trailing 365d)       |
| PERFORMANCE_BENCHMARK_UNAVAILABLE     | PERFORMANCE  | INFO                          | no benchmark data for the period                |
| INCOME_RECEIVED                       | INCOME       | INFO                          | totalIncome > 0 in any currency                 |

TAX: category reserved; no signals — no portfolio-scoped tax intelligence exists (fiscal domain is keyed by taxSubject/competence, not portfolio; mapping it would mix scopes). Deliberate gap, not an omission.

Sector/class/issuer concentration: NOT implemented — `assetType` is the only classifier and no sector/issuer model exists; inventing one would fabricate insight (audit decision, STEP 10).

## Data quality

Data-quality signals outrank everything (reconciliation → coverage → pending → allocation → performance → income). Rules:

- Coverage < 100% suppresses absolute language: every dependent number carries "do valor conhecido" and the hero shows "Cobertura de preços: X%".
- A 0-position portfolio yields no financial signals, but pending reviews and reconciliation issues still surface (a fresh import awaiting review is how holdings arrive).
- No valuation denominator → no concentration signal (translated AVAILABLE preferred; else single-currency bucket; else skip, documented).
- Unparseable numbers suppress the signal instead of guessing (fail closed).

## Threshold policy

Centralized in `packages/portfolio-review/src/policy.ts`, compared as integer basis points parsed from decimal strings (no binary floats):

- coverage attention < 10000bp, low < 8000bp
- single-asset ≥ 2500bp
- benchmark gap ≤ −200bp
- review window: trailing 365 days

Each threshold is documented as an attention heuristic, explicitly NOT financial advice, NOT a suitability rule, NOT a target allocation.

## Advice boundary

Forbidden in review surfaces: buy/sell recommendations, suitability, robo-advice, rebalancing, price targets, forecasts, guarantees, health scores. Enforced by boundary tests scanning engine + UI copy. The UI never says "sua carteira está saudável" nor "tudo perfeito" — empty state: "Nenhum ponto relevante identificado com os dados disponíveis."

## Evidence model

Raw values only (decimal/money strings, counts, codes, period dates). The UI formats with canonical helpers (`formatPercentage`, pt-BR dates); the domain never floats. Technical ids are stripped at the API mapper (no `assetId`, no fingerprints, no externalIds in responses).

## Ordering

Deterministic: category rank (data integrity → coverage → integration → allocation → performance → income), then code. One signal per code maximum (aggregation built into derivation — e.g. one concentration card listing the count, one gap card with the worst benchmark).

## UX

- Portfolio Overview: `Revisão da carteira` section between valuation and positions (current-only; hidden in historical `asOf` mode), hero summary + coverage warning + signal cards with severity badges, evidence lines and a single CTA each. No new tab, no new route.
- Today: compact card only when attention exists → "N pontos precisam da sua atenção" → Ver revisão (links to overview).
- Mobile: read-only compact card on portfolio overview (summary + top 3 signals, CTAs only to natively existing screens).
- Accessibility: headings, text+color severity, named CTAs, 44px targets, loading/error/empty states, pt-BR formatting.

## API

`GET /api/v1/portfolios/:portfolioId/review` → `{ data: { portfolioId, asOf: {generatedAt, marketDataAsOf}, summary, dataQuality, signals[], isEmpty } }`. Read-only, ownership-guarded (foreign → 404). Composes state + valuation + allocation + intelligence summary (trailing 365d) + recent runs; bounded run window (200), no N+1 beyond existing batched repository reads. Zero migrations, zero persistence.

## Future phases

- 5Q-B: drill-down + historical evolution (allocation over time, signal history).
- 5Q-C: user-defined targets/strategy (explicit goals make class-level guidance possible).
- Not in scope: auto-actions, rebalancing simulation, external alerts.
