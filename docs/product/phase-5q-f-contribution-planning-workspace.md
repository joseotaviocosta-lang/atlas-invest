# Phase 5Q-F — Contribution Planning Workspace (Intent Only)

## Scenario vs Plan vs Transaction

Three concepts, never confused:

```text
SCENARIO
= hypothetical exploration ("what if I contributed X?")
= ephemeral or saved inputs; always recomputed live.

CONTRIBUTION PLAN
= user-declared future intent ("this is what I intend to contribute,
  on this date")
= persisted intent; status machine PLANNED → COMPLETED | CANCELLED;
  live impact recomputed; never executes anything.

TRANSACTION
= actual ledger event (buy/sell, provider, external id, settlement).
= the only financial truth. Plans never create or reference one.
```

No automatic plan ↔ transaction matching exists in v1 (explicit
future phase, explicit design — never inferred).

## Plan model

```text
PortfolioContributionPlan {
  id
  portfolioId
  name               // plain text, trimmed, 1..80, no markup
  plannedDate        // date-only YYYY-MM-DD (DATE column, no time)
  status             // PLANNED | COMPLETED | CANCELLED
  currency           // server-derived, never client-supplied
  sourceScenarioId?  // optional provenance, SET NULL on scenario delete
  completedAt?       // set only on COMPLETED
  createdAt, updatedAt
  items[]            // { category, amount } exact Decimals, > 0
}
```

Total is derived (`sum(items)`, exact decimal strings) — never a stored
column. Categories reuse the portfolio-strategy vocabulary; money reuses
the 5Q-D/5Q-E canonical decimal + pt-BR parsing (no floats anywhere).

## Status machine

- PLANNED: declared future intent. The only editable/deletable state.
- COMPLETED: user-marked as done. Status flip (+ completedAt) only —
  no transaction, order, or ledger write happens.
- CANCELLED: user-gave-up. History preserved, immutable.
- Allowed: PLANNED → COMPLETED, PLANNED → CANCELLED. Everything else
  blocked (400), including COMPLETED/CANCELLED → anything (no reopen in
  v1) and delete of terminal plans (cancel preserves the trail).

## Money semantics

Storage `Decimal(38,18)` with `amount > 0` CHECK; unique (plan,
category); engine accepts only canonical decimals; edges parse pt-BR
(`10.000,50` → `10000.5`). Totals and hypothetical sums use BigInt
decimal math. Currency is server authority: translated reporting
currency, else the single holding currency, else the portfolio base
currency when the portfolio is still empty; multi-currency without a
consolidated basis blocks creation fail-closed. A live basis in a
different currency than the plan yields `CURRENCY_MISMATCH` (no FX ever
invented).

## Date semantics

- Storage is `DATE` (no time component); the repository maps through
  UTC-midnight ISO date parts, so `2024-02-29` round-trips exactly in
  any timezone (tested, including leap day).
- Validation is pure string/calendar logic (`YYYY-MM-DD` + real month
  lengths, no `Date` construction); lexicographic compare for past
  checks.
- New plans reject past dates (400 `PAST_DATE`); an existing plan that
  ages past its date stays editable (update allows past) and the UI
  labels it "Data planejada já passou" — no auto-cancel, no
  auto-complete.

## Live impact

Detail reuses the 5Q-D/5Q-E engine path (`simulateMany` with the plan's
items): same current allocation, same strategy, same coverage rules.
Unavailable states keep the plan stored and explain themselves:
`NO_STRATEGY` ("Defina metas…"), `INSUFFICIENT_DATA`, `NEEDS_REVIEW`
(saved category left the domain — never silently dropped),
`CURRENCY_MISMATCH`, `PARTIAL_COVERAGE` qualifier. The detail carries
the disclosure: "O impacto abaixo é recalculado com a carteira e as
metas atuais. Ele pode ser diferente do que você viu quando criou o
plano." No projected result is ever persisted (schema-guard tested).

## Scenario conversion

- Saved scenario detail and the ephemeral simulator both offer "Criar
  plano", which hands the user-declared inputs (never server-computed
  values, never targets) to the plans form via an explicit event; the
  user still chooses name + date before saving.
- `sourceScenarioId` is provenance only; deleting the scenario SETs
  NULL and the plan stays valid (tested).
- Saving a scenario never auto-creates a plan; the Atlas never fills
  amounts from target gaps (no "distribute to reach goals" anywhere).

## No execution guarantee

Marking complete shows: "Marcar este plano como realizado? Isso apenas
atualiza o status do planejamento. Nenhuma operação será criada ou
executada no Atlas." The API test asserts transaction counts are
unchanged across create/update/complete/cancel/delete. Architecture
tests forbid plan code from importing or calling transaction writers,
B3, brokers, fiscal engines, and execution vocabulary.

## Advice boundary

Allowed: neutral before/after counts, aggregate absolute deviation,
per-category projected weights, "Nenhum cenário é apontado como
melhor". Forbidden (scanned): "recomendamos", "deveria aportar",
"ideal", "melhor distribuição", "comprar/vender" directives,
"executar aporte", "gerar ordem", Markowitz/risk-parity/optimizer
language, tax or return predictions. The UI keeps the user's order
(no sorting by "best") and the strategy section states plans "não
executam nada".

## Today, review, history

- Today shows the next PLANNED plan only ("Próximo aporte planejado
  10/11 · R$ 5.000", CTA "Ver plano"); past-due shows "Plano de aporte
  pendente desde 10/11" (no financial-late language). No query cost
  beyond one next-plan read.
- Review gains no signal from plans; history gains no plan entries.

## Mobile

List (upcoming + history) + read-only live detail + complete/cancel are
native; create/edit stay web-only with an explicit note. No dead CTAs,
no execution, no advice. The web-only 5Q-D simulator note is retained.

## Future matching possibilities

`5Q-G — Contribution Plan vs Actual Tracking` may compare "what the
user planned vs what entered the ledger" — only after explicit design.
Never: automatic matching, recurrence, reminders, calendars, tax-aware
or return-projecting planning, suitability, AI planning, B3 CERT.
