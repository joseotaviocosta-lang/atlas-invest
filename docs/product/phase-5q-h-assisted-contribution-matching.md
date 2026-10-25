# Phase 5Q-H — Assisted Contribution Matching (Discovery Only)

## Candidate derivation

Candidates are derived on read from bounded ledger queries and never
persisted. Discovery window: plannedDate − 7d / +14d (asymmetric on
purpose: ledger dates lag or lead the planned date, rarely matching it).
Filters, in order: eligible type (DEPOSIT only), same currency as the
plan, trade date inside the window, not already CONFIRMED (any plan),
not REJECTED for this plan. Query bound: `take: 200`; engine cap: 50.

## Matching policy

Centralized in `CONTRIBUTION_MATCH_POLICY`:

```text
daysBefore: 7, daysAfter: 14
queryLimit: 200, maxCandidates: 50
groupBaseLimit: 20, maxGroupSize: 2  (C(20,2) = 190 pairs max)
```

The tracking response exposes the policy (`date window`, `queryLimit`,
`maxCandidates`) so the UI never implies hidden logic. The −7/+14
asymmetry is kept because contributions usually land on or just after
the planned date, with a small tolerance for early deposits.

## Explanations

Every candidate carries factual reasons, rendered verbatim:

- `SAME_CURRENCY` — mesma moeda do plano
- `WITHIN_DATE_WINDOW` — dentro da janela de busca
- `ON/BEFORE/AFTER_PLANNED_DATE` — posição temporal exata
- `EXACT_AMOUNT` / `PARTIAL_AMOUNT` / `ABOVE_PLANNED_AMOUNT` — relação
  com o total planejado

Plus exact metrics: `dateDistanceDays` ("2 dias depois da data
planejada") and `amountDifference` ("R$ 150 de diferença para o total
do plano"). No confidence, no probability, no score, no "best".

## Ranking

`rankContributionCandidates` is a pure, documented total order:
date distance → exact amount distance → trade date → id. No hidden
weights; what the UI lists ("ordenadas por proximidade de data e
valor") is the whole algorithm. Deterministic: same input set in any
order yields the same order (tested, including reversed inputs).

## Multi-deposit groups

Pairs from the top-20 ranked candidates (`maxGroupSize: 2`; subset-sum
is out of scope). Each group carries `combinedAmount` (exact decimal),
`amountDifference`, `dateSpanDays` and one combined reason
(`COMBINED_EXACT_AMOUNT` / `COMBINED_PARTIAL_AMOUNT` /
`COMBINED_ABOVE_AMOUNT`). Ordering mirrors candidates (amount
difference, date span, id pair). A `COMBINED_EXACT_AMOUNT` pair (e.g.
R$ 2.000 + R$ 3.000 = R$ 5.000) is flagged factually — never as a
"perfect match".

## Manual search

"Procurar outra operação" opens an explicit date range (default
planned ± 90d, span capped at 180d). Same eligibility (DEPOSIT),
same-currency and rejected/confirmed-exclusion rules as discovery;
results carry the same reasons/metrics and confirm through the single
existing mechanism. No ledger dump (`take: 200` bound). Rejected and
elsewhere-confirmed transactions stay hidden.

## Human confirmation

Individual: "Vincular" per candidate. Group: "Vincular estas 2
operações" opens an inline confirmation ("Vincular estas 2 operações
ao plano? ... Nenhum lançamento será criado ou executado.") and
persists both links in one transaction — all or nothing (tested
against partial state). Repeating the same confirmation is idempotent;
confirming a pair containing an elsewhere-confirmed transaction fails
the whole group (400), never half-applies.

## No confidence score

There is deliberately no `confidence`, `probability`, `score`,
`recommended` or `bestMatch` field anywhere (architecture-scanned).
The UI shows counts ("N operações próximas encontradas"), facts and
ties ("Soma exata") — never certainty.

## No auto-confirm

`getPlanTracking` never calls `links.confirm` (architecture test
slices the method body to prove it). Candidate derivation is a pure
function of (plan, transactions, rejected/confirmed ids). The only
writers are the explicit confirm endpoints. GET tracking performs
zero writes (tested via row counts before/after).

## Performance bounds

Discovery query: one bounded `findByPortfolioId` (type + date range +
take 200). Confirmed read: one links query + one batched transaction
fetch + one batched asset fetch (no N+1, new `findByIds`). Groups are
pure in-memory over ≤ 20 candidates (≤ 190 pairs, no extra DB queries).

## Mobile limitations

Mobile shows explanations, candidates (read-only) and pair groups with
an explicit group-confirm button; individual linking and manual search
stay web-only with notes. No dead CTAs, no execution language.

## Future tuning

If real usage shows the −7/+14 window or the top-20 pair base mislead,
tune the centralized policy (with a regression test per change) —
never silently. 5Q-I may aggregate planned-vs-confirmed history, but
only as factual reporting.
