# Phase 5Q-J - Contribution Goals & User-Defined Savings Targets (Intent Only)

User-declared monthly contribution goals. The Atlas never suggests a value:
it only compares declared plans and confirmed ledger actuals against the
number the user defined.

## User ownership of goal

- The amount and the effective month are always user-declared (`PUT
/api/v1/portfolios/:id/contribution-goal` with `{ amount, effectiveMonth }`).
- The server owns currency (derived from the portfolio, never accepted from
  the client), timestamps and history. Unknown/injected fields 400.
- With no goal, `GET` returns `{ current: null, upcoming: null, history: [] }`
  — a valid state, never a prompt to "fix" anything.

## Monthly v1 scope

- Only `MONTHLY` exists. No weekly/quarterly/annual/custom cadences.
- Amount is a canonical decimal string (`parseScenarioAmountToCanonical`,
  pt-BR or plain); `> 0` enforced by Zod-shaped validation and a DB `CHECK`.
- Amounts never touch binary floats (storage `DECIMAL(38,18)`, engine
  `BigInt` compare, UI string math).

## Goal versioning

- Table `portfolio_contribution_goals`: one row per effective version,
  half-open `[effective_from, effective_to)` with `NULL` end = open-ended.
- Only one open version per portfolio (partial unique index).
- Writes are atomic (`replaceOpen`: close + create in one transaction) with
  an optimistic `expectedUpdatedAt` guard so concurrent writers converge on
  exactly one winner (losers get `null` → 400 retry, never 500).
- A scheduled future version that never took effect is replaced outright
  (no fake history); an in-effect version is never mutated — edits close it
  at the chosen month and open a new row.

## Effective month

- Stored date-only as the first day (`YYYY-MM-01`); compared as `YYYY-MM`
  civil strings, no timezones, no `Date` construction in the engine.
- Effective month must be the current month or a future month. Past months
  are rejected (`PAST_MONTH`) so analytics history is never rewritten.
- `PUT` with the same effective month updates the amount in place
  (optimistic, no history churn).

## Goal vs plan vs actual

- The goal is declared intent; a plan is operational intent
  (`PLANNED`/`COMPLETED` only — `CANCELLED` excluded, as in 5Q-I); the
  actual is ledger evidence (`CONFIRMED` links only, candidates and
  `REJECTED` invisible).
- Planned amounts fall in the month of `plan.plannedDate`; confirmed
  amounts fall in the month of `transaction.tradeDate`. A plan linked to a
  deposit in another month does not move the actual — the calendar is
  factual, linkage is for tracking only (`contribution-tracking-read`).
- Differences are exact: `plannedDifference = planned - goal`,
  `confirmedDifference = confirmed - goal`. Status is factual position
  (`NO_GOAL | BELOW | AT | ABOVE`) — never success/failure language.

## Current vs historical goals

- `GET` returns `{ current, upcoming, history }`: the version in force for
  the current month, an optional scheduled future version, and closed
  history newest-first.
- `DELETE` ends the current goal at the current month (history preserved)
  or drops a never-effective scheduled version (returns `goal: null`).
- Copy rule: "A alteração não reescreve os meses anteriores." History rows
  are never mutated by any path.

## Timeline integration

- Insights timeline rows carry `goalAmount` (the version in force that
  month, or `null`). Multi-month totals sum the version in force per month
  (`enumerateGoalMonths` over the full period range): a goal started 3
  months ago contributes 3 months, never 12.
- Months without a goal contribute nothing and are counted
  (`monthsWithGoal` / `monthsWithoutGoal`) — never extrapolated, never
  zero-filled.

## Currency semantics

- Goal currency is server-derived (translated reporting currency, else the
  lone holding currency, else the portfolio base currency). Multi-currency
  without consolidated totals fails closed: the goal cannot be created.
- Historical rows keep the currency they were declared in. If the goal
  currency differs from the insights currency, insights return
  `goal: null` + `GOAL_CURRENCY_MISMATCH` instead of mixing money (same
  fail-closed principle as 5Q-I `MIXED_CURRENCIES`).

## Current-month semantics

- The current month is facts-so-far: "Até agora, R$ 1.500 foram
  identificados em operações confirmadas para uma meta mensal de R$ 3.000."
- Never "meta não atingida" before month end; the timeline marks the row
  `(mês atual)` without judgment. Past months use past-tense factual copy.

## No recommendation

- The Atlas never suggests a value: no placeholder with a number
  (`R$ 0,00` only), no "ideal", no "recomendamos", no income-percentage or
  reserve advice. Prohibited copy is covered by architecture tests and web
  copy scans (5Q-J boundary test + web test).

## No gamification

- No streaks, badges, "Parabéns", "Meta batida", discipline language,
  consistency tracking or social comparison. Progress is a difference and a
  factual status only.

## No forecast

- No end-of-year projection, no "mantendo a média", no linkage to
  projected wealth or expected returns. Insights remain read-only
  (zero writes) with a bounded query plan (plans + links + transactions +
  goal versions, no per-month queries).

## Mobile

- Read-only `Meta de aporte mensal` card (current goal + factual progress)
  and goal amounts in the textual timeline. Create/edit/end stay web-only
  with an explicit note ("Definir e alterar metas está disponível na versão
  web"). No dead CTAs, no forms, no execution paths.

## Concurrency & integrity

- Partial unique index guarantees at most one open version; atomic
  close+create prevents overlaps; optimistic guards make concurrent edits
  deterministic. Cascade on portfolio delete (goals are portfolio-scoped
  intent, like plans and scenarios).

## Future boundary

- Possible `5Q-K - Contribution Goal Planning Calendar` or `5Q-K -
Portfolio Cash Flow Planning`, only after evaluating real 5Q-J usage.
  Never: auto-plan, auto-invest, recurring execution, brokerage orders.
