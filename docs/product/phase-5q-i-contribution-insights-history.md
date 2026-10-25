# Phase 5Q-I — Contribution Insights & Planning History (Facts Only)

## Data sources

Insights derive from three sources — nothing else, no market prices:

```text
plans (intent: name, date, status, items)
+
CONFIRMED plan↔transaction links (relation + audit state)
+
ledger transactions (amount, currency, trade date, asset)
```

Candidates and rejected links never enter any total. No snapshots, no
caches, no analytics tables (0 migrations).

## Plan vs actual semantics

`plannedTotal` sums PLANNED + COMPLETED plans in the period.
`confirmedTotal` sums CONFIRMED ledger amounts for those plans.
COMPLETED is a manual status; confirmed actuals are ledger evidence —
the two facts are reported side by side, never merged into a verdict.
Completed plans with no confirmed links are listed explicitly
("Aguardar vínculo de operações"), not treated as errors; PLANNED plans
with confirmed links are shown as-is, with no auto-complete.

## Status vs evidence

Status breakdown counts PLANNED / COMPLETED / CANCELLED with their
planned totals. `completedWithoutConfirmedCount` and
`plannedWithConfirmedCount` are neutral facts. Status never changes as
a result of tracking (architecturally and behaviorally tested).

## Timeline

Monthly `YYYY-MM` buckets from civil dates only (no `Date`, no
timezone): planned (by plannedDate), confirmed (by tradeDate),
difference, planned/completed counts. Range = selected period
intersected with activity; INCEPTION starts at the earliest activity
instead of loading unbounded history. A bar chart (hand-rolled SVG,
string-only pixel math) always ships with a full data table.

## Currency handling

Mixed currencies are never summed. Multi-currency portfolios get
`MIXED_CURRENCIES` + per-currency summaries instead of a consolidated
hero. Plans carry server-derived currency; confirmed transactions must
match it (enforced since 5Q-G).

## Cancelled-plan semantics

CANCELLED plans are excluded from planned totals, timelines and
category breakdowns, and appear only in the status breakdown plus a
separate `cancelledPlannedTotal` / `cancelledCount`. Cancelling never
deletes history.

## Category limitations

Planned categories come from plan items; actuals from canonical
classification (DEPOSIT → CASH, asset type if known, else OTHER).
Because only DEPOSIT counts as actual, confirmed money lands in CASH
while plans split across classes — the UI/API surface a
`CASH_ACTUAL_SEMANTICS` limitation instead of asserting the category
was realized. No BUY inference, ever: post-deposit purchases are not
read back as allocation proof.

## No buy inference

Deliberate and documented: a cash deposit followed by a stock purchase
does not retroactively label the plan's STOCK slice as realized. Only
explicitly CONFIRMED links count, and only for their ledger category.

## No score

`completionBp` is an exact ratio rendered as "R$ X de R$ Y planejados
foram identificados em operações confirmadas." Never a score, streak,
discipline metric, meta, or comparison with other users.

## No forecast

No averages-as-guidance, no "mantendo este ritmo", no projected
income, no recommendations. The surface ends at recorded facts.

## Performance/query strategy

Constant bounded reads per request: plans (3 status lists), one
batched link read (`listByPlanIds`), one batched transaction read
(`findByIds`), one batched asset read — no per-plan or per-month
queries, no N+1, no per-combination work (aggregation is in-memory over
bounded inputs). Recent plans capped at 10; timeline buckets bounded by
activity (hard cap 120 months).

## Mobile

Summary hero, status counts, textual monthly timeline, recent plans
with "Ver plano" navigation, limitations. No chart (text replaces it),
no advice, no dead actions.

## Future tuning

`5Q-J` may add user-defined savings targets — only if the user defines
them ("Quero aportar R$ 3.000 por mês"), and the Atlas still must not
choose the target. Unbounded-history pagination (additive, non-breaking)
remains an option if history outgrows the bounded list.
