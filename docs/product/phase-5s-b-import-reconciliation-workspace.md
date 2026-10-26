# Phase 5S-B — Import & Reconciliation Workspace

Read-only comparison surface over persisted runs and canonical
transactions. Explains what the source reported, what Atlas holds and
why an item needs review — without deciding anything automatically.

## Review source

`IntegrationRun` rows (counts + reconciliation summaries) feed
`deriveReviewItems`, projected on every read. No inbox table, no
read/dismissed flags, no drift. `getReview` resolves one run with its
state (`ACTIONABLE` + item, or `RESOLVED` + reason); `listReviews`
pages actionable items with severity/portfolio/source filters and a
run-id cursor.

## Reconciliation states

Canonical vocabulary from the import engine (per-asset position
verdicts, quantities only): `MATCHED`, `DIVERGENT`, `MISSING_LOCAL`,
`MISSING_SOURCE`, `UNRESOLVED`. Counts are persisted on the run;
per-entry rows are derived in memory and discarded. The workspace
explains each state factually (UI copy) but never reconstructs
entries for historical runs.

## Source facts

Persisted source itemization does not exist: previews parse content
in memory and discard it; CSV confirm explicitly stores no snapshot;
B3 sync persists only the summary. The detail therefore reports
`SOURCE_FACTS_NOT_PERSISTED` whenever reconciliation or candidate
metrics are present, and shows run-level totals instead. No raw
provider payloads, credentials, tokens, certificates, fingerprints or
external IDs are ever serialized.

## Local facts

Transactions confirmed by a run are linked via
`IntegrationRunTransaction` (run → transaction ids, forward only).
The detail resolves them in one bounded batch (`findByIds`, cap 50 +
`LINKED_TRANSACTIONS_TRUNCATED`) plus one batched asset lookup for
tickers, and renders canonical facts: type, civil trade date, asset,
quantity, amount, currency. Zero ledger impact — pure reads.

## Difference model

`ReconciliationComparison` (pure engine): `{ state, differences[],
matchingFacts[] }` with semantic per-field diffs (`DATE/AMOUNT/
QUANTITY/TYPE/ASSET/CURRENCY_DIFFERENCE`), deterministic field order,
exact decimal/date/identity math, asset identity by canonical
`assetId` (ticker alone never confirms). Matching reasons are factual
equalities (`SAME_DATE`, …), never scores. In v1 the API populates
the source side as null — differences then stay empty and the
limitation explains why; the engine is fully tested and ready for any
future persisted source facts without shape changes.

## Matching semantics

No fuzzy, ML, NLP or similarity matching anywhere. No auto-confirm.
No candidates are invented: probable duplicates/conflicts from
classification are counts only, and the workspace never promotes a
count into a match.

## Human decision boundary

No human review decisions are implemented in 5S-B. There is no stable
per-item source identity to decide on (snapshots discarded, review
items derived per run), and no decision table exists. Per the phase
STOP gate this yields `DECISION_PERSISTENCE_BLOCKED`: the workspace
is read-only (`PHASE_5S_B_PARTIAL`), with the gap documented here
instead of a silent schema. Confirm/skip flows that already exist
(preview → row decisions → import) are untouched and out of scope —
they create transactions, which reconciliation decisions must never do.

## Persistence availability

Available today: run rows, run→transaction links, canonical
transactions, asset metadata. Not available: source snapshots,
per-entry reconciliation rows, per-item decisions, audit trail for
decisions. Creating any of these requires owner authorization first.

## Auditability

Nothing to audit yet: the workspace writes nothing. If decision
persistence is ever authorized, it must record who/when/which
decision/which source-local pair on stable identities, with
idempotency and no silent overwrites.

## List/detail architecture

List (`GET /api/v1/integration-reviews`) stays bounded (limit/cursor)
with severity/portfolio/source filters applied post-derivation.
Detail (`GET /api/v1/integration-reviews/:runId`) loads the run,
one bounded link lookup, one batched transaction read and one batched
asset read — lazy, no per-item queries. The 5S-A operations center
links to the inbox (`VIEW_REVIEWS`); the inbox links each row to its
detail; the detail links back and onward to the import hub for live
re-preview.

## Pagination

List uses the existing run-id cursor; detail truncates linked
transactions at 50 with an explicit flag. No unbounded detail loads.

## Security

Portfolio ownership on every endpoint; foreign runs 404. No
provider/external IDs, credentials, certificates or raw payloads in
any response (asserted on serialized payloads).

## B3 source agnosticism

The workspace consumes the generic `IntegrationRun`/`Transaction`
abstractions. Sources (B3/CSV/MANUAL) appear only as labels and as
the `source` filter. B3 provider internals are untouched; production
B3 remains preparing.

## Read-only/mutation guarantees

Get/list/detail perform zero writes (asserted via table counts and
deterministic double GET). No mutation endpoint exists in the review
path (architecture-asserted: no POST/PUT/PATCH/DELETE, no
confirm/accept/reject/resolve verbs, no transaction writers, no
migration).
