# Phase 5S-B-R1 — Reconciliation Decision Persistence Foundation

Minimal persistence for human reconciliation decisions, explicitly
authorized by the owner. A decision asserts that a human reviewed one
(run, source item, transaction) pair — nothing more.

## Existing gap

5S-B proved: review items are derived, per-entry reconciliation rows
are discarded after sync/preview, source snapshots are never
persisted, and no decision table existed. Decisions therefore had no
stable identity and no audit trail — the workspace stayed read-only
(`PHASE_5S_B_PARTIAL / DECISION_PERSISTENCE_BLOCKED`).

## Stable identity

Pair identity `(portfolioId, integrationRunId, sourceItemKey,
localTransactionId)`:

- `sourceItemKey` is **server-derived, never client-provided**. When
  the linked transaction carries the import identity
  (`provider` + `externalId`), the key reuses it normalized
  (`B3:B3-5M-0001`) — the same identity the ledger unique constraint
  already enforces. Otherwise a canonical `hash:` + SHA-256 over
  canonical facts (portfolio, source, run, type, civil date, asset,
  exact quantity/amount, currency).
- No array positions, no preview order, no JSON-stringify key order:
  the key is built from a fixed field order with canonical decimals.
- Cross-run semantics are explicit: different runs never share keys,
  so an identical source item in a later run needs its own decision —
  no silent carryover.
- Duplicate-looking legitimate rows share a key by design; the pair
  unique constraint (including the transaction id) keeps their
  decisions distinct instead of collapsing them.

The key never contains credentials, tokens, secrets, certificates or
raw provider payloads, and is never serialized to clients (responses
carry the decision `id`; the key stays server-side).

## Duplicate-item handling

Same canonical facts in the same run → same key (correct: same source
item). Different transactions with that key → separate decision rows
allowed (correct: pair-scoped). Different runs → different keys
(correct: run-scoped review). No legitimate duplicates collapse.

## Schema

`reconciliation_decisions` (additive table, migration
`20261026120000_add_reconciliation_decisions`):

- `id` UUID PK; `portfolio_id`, `integration_run_id`,
  `local_transaction_id` UUID FKs; `source` (50), `source_item_key`
  (255), `decision` CHECK (`CONFIRM_MATCH`, `NOT_A_MATCH`);
  `decided_by_principal` (255, server-derived user id — audit survives
  user deletion, following the `created_by_principal` convention);
  `decidedAt` server time; `createdAt` default.
- FKs: portfolio CASCADE (scoped child vanishes), run CASCADE (history
  scope), transaction RESTRICT (append-only ledger protection).
- Unique `(portfolio_id, integration_run_id, source_item_key,
local_transaction_id)` — idempotency plus race safety.
- Index on `integration_run_id` (detail lookup). No other indexes.

## Decision semantics

- `CONFIRM_MATCH`: the human confirmed this source item corresponds
  to this existing local transaction. Creates/edits/deletes nothing.
- `NOT_A_MATCH`: the human rejected the correspondence. Removes
  nothing, on either side.
- Pair-scoped always: `localTransactionId` is required for both
  decisions (a NOT_A_MATCH names the rejected candidate). No global
  per-source or per-item rejections.

## Human audit

Every row records who (`decided_by_principal`, server principal —
never `"system"`), when (`decided_at`, server time — never client
time), what (`decision`), which source item (`source_item_key`),
which run (`integration_run_id`) and which local transaction.
`GET detail` rereads deterministically: same rows, same order
(`createdAt` ascending).

## Idempotency

Repeat the same decision → 200 with the existing row (no duplicate).
The unique constraint makes concurrent identical submissions safe:
one row wins, the other reads it back.

## Conflict behavior

A different decision for an existing pair → 409
(`RECONCILIATION.DECISION_CONFLICT`), row unchanged. No update
endpoint, no delete endpoint, no silent overwrite, no undo in v1.

## Ledger immutability

Decision writes touch only `reconciliation_decisions`. Transaction
rows and run rows are byte-identical before/after (API-asserted).
The write path imports no transaction writers and never calls
record/run confirmation.

## Source immutability

Run reconciliation summaries and metrics are never rewritten.
Decisions live in their own table; engine state and human decision
stay separate columns of the truth.

## Historical reviews

Runs without linked transactions (including all pre-R1 runs) expose
no decision CTAs and keep the read-only detail with
`SOURCE_FACTS_NOT_PERSISTED`. No backfill was attempted: historical
runs keep zero decision rows, which is a valid state, not an error.

## Security

No raw provider payload in any column. No secrets, certificates,
tokens or credentials persisted. `sourceItemKey` is server-side only.
Ownership enforced before any write (portfolio → run → transaction,
all same-portfolio). Foreign ids 404 (anti-enumeration). Strict DTO.

## Query plan

Create: ownership read + run read + transaction read + link
membership read + identity lookup + one insert. Detail: bounded run
context + bounded link lookup + batched transaction read + batched
asset read + one decision list read. No per-item loops, no N+1, no
transaction wrapping (unique constraint covers races).

## Migration

42 total (was 41): one additive table, CHECK, unique, index, three
FKs. No alteration of existing tables, no data migration, no seed
changes. Frozen historical-count evidence files now report the new
total (41 → 42) with the same hardcoded expectations — pre-existing
category, recorded, not edited.
