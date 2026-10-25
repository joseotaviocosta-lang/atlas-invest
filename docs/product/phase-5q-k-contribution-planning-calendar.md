# Phase 5Q-K - Contribution Planning Calendar (Read-Only Temporal View)

A monthly planning timeline composing the user-defined goal, contribution
plans and confirmed ledger actuals. It organizes existing facts only:
no plans, goals, links or transactions are created, and nothing is
scheduled, recommended or executed.

## Goal vs plan vs actual

- The **goal** is user-declared intent (5Q-J: amount + effective month).
- A **plan** is operational intent (5Q-F: name, plannedDate, amounts).
- An **actual** is ledger evidence (5Q-G: CONFIRMED link to a transaction).
- The calendar is the temporal composition of the three. It never blurs
  them: goal rows, plan rows and actual rows stay visually distinct, and
  the summary keeps goal/planned/confirmed totals separate.

## Month identity

- Every month is `YYYY-MM` (civil, no timezone, no `Date` math).
- `isCurrentMonth` flags the wall-clock month for factual "Até agora" copy.
- Months render in chronological order; plans sort by
  (plannedDate, name, id); actuals by (tradeDate, amount, planName, planId).

## Range semantics

- `GET /contribution-calendar?from=YYYY-MM&to=YYYY-MM`; both optional.
- Defaults to January–December of the current server year.
- Invalid month → 400; `from > to` → 400; more than 24 months → 400
  (`MAX_CALENDAR_MONTHS = 24`, engine-centralized).
- The web surface navigates by year (← 2025 2026 2027 → + Hoje).

## Goal versions

- Each month uses the goal version in force via 5Q-J `goalVersionForMonth`
  (half-open [effectiveFrom, effectiveTo)). Never `currentGoal × N`.
- A month whose version starts that month carries `goalChange: true` and
  the UI marks it factually: "Meta passa a R$ X/mês neste mês."
- Future scheduled versions appear in their month as soon as the range
  covers them — declared configuration, not forecast.
- An open-ended goal applies to future months shown because the user
  declared it active (documented rule, not prediction).

## Plan date semantics

- Plans bucket by `plan.plannedDate` (5Q-I/5Q-J preserved).
- Cancelled plans are listed for history but never enter planned totals
  (their currency still renders a zeroed totals row for transparency).
- Completed plans stay in planned totals (intent that existed).
- Past-due PLANNED rows keep the existing "Data planejada já passou"
  badge; the calendar never completes or cancels anything.

## Actual trade-date semantics

- Actuals bucket by `transaction.tradeDate`, only for CONFIRMED links.
- Candidates and REJECTED links never enter (callers pass CONFIRMED only).
- Cross-month case (October plan, November deposit): intent shows in
  October, evidence in November with "Vinculado ao plano X". Money is
  never moved to match the plan.

## Cross-month links

- The owner plan may live outside the requested range: the use-case loads
  all plans (one batched link query for the whole portfolio scope), so
  the linked plan name still resolves. An actual-only month (no plans)
  renders normally.

## Currency

- Each month aggregates per currency (`totalsByCurrency`); BRL and USD are
  never summed. Goal-vs-month differences only compute when the whole
  month speaks one currency equal to the goal currency, else `null`.
- The summary is per currency (`summaryByCurrency`): goal totals sum the
  real version in force per month, scoped to months with that goal
  currency (`monthsWithGoal`/`monthsWithoutGoal`).
- Multi-currency ranges add the `MIXED_CURRENCIES` limitation (same
  fail-closed principle as 5Q-I); `NO_ACTIVITY` only when the range has
  no goals, plans or actuals at all.

## Current/future/past month behavior

- Current: "Mês atual" badge, facts-so-far ("nenhuma operação confirmada
  ainda"), never "meta não atingida".
- Future: "Planejamento" badge; confirmed starts at zero without implying
  anything is missing.
- Past: "Histórico" badge; factual differences ("R$ 500 abaixo do valor
  definido"), never "meta perdida".

## Plan creation boundary

- Current/future months offer "Criar plano", which only opens the 5Q-F
  form with `plannedDate` pre-filled (today for the current month, the
  1st for future months). Amounts stay empty — the Atlas never pre-fills
  values, not even the goal gap.
- The prefill handler validates the date format and announces the
  date-only prefill distinctly from the scenario amount prefill.

## No amount prefill

- Prohibited and tested: the calendar dispatch carries `plannedDate`
  only. The web test asserts the dispatched payload contains no
  `items`/`amount`/`name`.

## No reminder

- No "lembrar de aportar", no notification copy, no nudges. Past-due is
  the pre-existing factual badge, not a call to action.

## No forecast

- No end-of-year projection, no "mantendo a média", no annualization of
  a monthly goal. The in-range goal total is a sum of declared versions,
  not a projection.

## Query strategy

- Per request: goal versions (1) + plans by status (3, parallel) +
  batched links for all plans (1) + batched transactions (1). No
  per-month and no per-plan reads; no N+1 (asserted structurally).
- The use-case performs zero writes; purity is covered by an API
  row-count test (plans, goals, links, transactions unchanged).

## Mobile

- Vertical monthly timeline from the same endpoint, expandable months
  (`accessibilityState={{ expanded }}`), same per-currency facts.
- Year navigation (← →); plan rows navigate via the existing plan
  opener; goal/plan creation stays web-only with explicit notes.
- No dead CTAs, no forms, no execution paths.

## Future boundary

- After 5Q-K, STOP for roadmap review instead of auto-starting 5Q-L.
  Candidate directions: portfolio cash-flow planning, asset/position
  intelligence, tax workflow evolution, or B3 CERT if prerequisites exist.
