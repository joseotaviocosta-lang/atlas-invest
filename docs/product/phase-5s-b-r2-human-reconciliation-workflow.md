# Phase 5S-B-R2 — Human Reconciliation Workflow Completion

Decisions from 5S-B-R1 now drive a derived workflow state across the
inbox, detail, and operations center — without touching engine facts,
run status, reconciliation summaries, or the ledger.

## Engine fact vs human decision vs workflow state

Three separate layers, never merged:

- `engineState` — `DIVERGENT`, `MISSING_LOCAL`, `MISSING_SOURCE`,
  `UNRESOLVED`, `MATCHED` from the canonical reconciliation summary.
  Immutable; R2 never rewrites it.
- `humanDecision` — `CONFIRM_MATCH` / `NOT_A_MATCH` per (run, item,
  transaction) pair, or absent. Append-only; a conflicting decision
  is rejected with 409, never overwritten.
- Workflow state — derived per pair and per run: `PENDING`,
  `PARTIALLY_RESOLVED`, `RESOLVED`, `NOT_ACTIONABLE`. No new column,
  no status write, recomputed on every read.

Example: `engineState: DIVERGENT` + `humanDecision: CONFIRM_MATCH`
→ review `RESOLVED` for that pair. The past is not rewritten: the run
still reports divergent, the ledger still holds the same facts, and
future tooling may still act on the divergence.

## No auto-close, no auto-rematch

Decisions never change `IntegrationRun.status`, never rewrite
reconciliation summaries, never touch transactions, and never trigger
syncs, retries, imports, corrections, or rematches. There is no
update or delete path for decisions.

## Reviewability matrix

| Engine / item state                                             | Decidable pair?       | Workflow                                         |
| --------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| `DIVERGENT` with linked tx                                      | Yes, per linked tx    | `PENDING` → decided per pair                     |
| `MISSING_LOCAL` / `MISSING_SOURCE` / `UNRESOLVED` (counts only) | No (no itemized pair) | explanatory semantics only                       |
| `MATCHED`                                                       | Never enters review   | excluded                                         |
| Actionable run, linked txs                                      | Yes, per pair         | `PENDING` → `PARTIALLY_RESOLVED` → `RESOLVED`    |
| Run without linked txs (incl. all historical runs)              | No                    | `NOT_ACTIONABLE` + `SOURCE_FACTS_NOT_PERSISTED`  |
| Legacy / aggregate-only reviews                                 | No                    | explicitly non-actionable, never forced resolved |

Pair-level decisions require a linked transaction (proves the pair
context); aggregate counts alone never become decidable. A `NOT_A_MATCH`
resolves the pair question without claiming the operational problem is
gone — the engine divergence remains visible for future phases.

## Pending / resolved semantics

- `PENDING`: at least one undecided pair, or no pairs but the run is
  still actionable (import decision outstanding elsewhere).
- `PARTIALLY_RESOLVED`: some but not all pairs decided.
- `RESOLVED`: every pair decided. The pair list is bounded by linked
  transactions actually present, so this is exact, not sampled.
- `NOT_ACTIONABLE`: zero pairs — historical and aggregate-only runs.
  These never count as pending and never pollute attention.

## Counts

- `pendingPairs`: undecided pairs across actionable runs in the review
  window (bounded, documented — not a lifetime total).
- `resolvedPairs`: decided pairs in the same window.
- `totalPairs`: linked pairs in scope.
- Engine counts (`divergent`, `missingLocal`, ...) are untouched and
  reported separately; data-quality reconciliation counts are
  untouched.

## Operations Center integration

The operations center adds `reviewWorkflow: { pendingPairs,
decidedPairs, totalPairs }` derived from a bounded 200-run window
(one link-count GROUP BY + one batched decision read, no per-run
loops, zero new portfolio replays). Attention items are unchanged
(no double counting): the existing `PENDING_REVIEWS` item still
tracks actionable runs, while the reconciliation card shows pair
progress (`N de M pares revisados`). 5S-A, 5R-E and review-inbox
counts remain consistent by construction (same derivation inputs).

## Run lifecycle

`IntegrationRun.status` is never written by the workflow. The
existing lifecycle (confirm/failure transitions only) is untouched;
no auto-close, no expiry, no "reviewed" transition was found or
invented. Progress is a read-model property, not a run state.

## Filters and defaults

List `state` filter: absent (default) = all actionable items —
unchanged behavior, so pair resolution never hides import work.
`PENDING` = actionable items that are not fully pair-resolved.
`RESOLVED` = actionable items with every pair decided.
`ALL` = explicit all-actionable. Source and portfolio filters are
preserved; cursor pagination semantics are unchanged (post-derivation
filtering, same as the existing severity filter).

## Detail and mobile

Detail shows engine state, per-pair human decisions with timestamps,
pair progress (`N de M`), and the workflow state line
(`Reconciliação detectada… · Revisão: Concluída/Parcial/Pendente/Não
acionável`). Actions appear only for undecided linked pairs; decided
pairs show state, never a conflicting CTA. Mobile mirrors the state
and decisions read-only, with the same state filters — no native
mutation path by design.

## Query plan

- Review list: existing bounded run window + 1 link-count GROUP BY + 1
  batched decision read per portfolio in the page.
- Detail: bounded links + batched transactions + assets + one decision
  list (already existed in R1).
- Operations center: existing reads + 1 bounded window + the same two
  batched queries.
- No N+1, no per-item reads, no new portfolio replays, no new tables
  (migration count stays 42).
