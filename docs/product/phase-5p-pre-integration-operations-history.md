# Phase 5P-PRE — Integration Operations & Sync History

Status: implemented. Operational run history for CSV imports and simulated
B3 syncs. 1 additive migration, 0 destructive changes, no secrets, no raw
payloads, no B3 network, UX stays `PREPARING`.

Related: 5M (pipeline), 5N (product surface), 5O-A (income), 5O-B
(transport foundation, still CERT-blocked).

## Why

Transaction provenance (`source`, `provider`, `externalId`, fingerprints)
answers _which source event_ a row came from — not _which execution_
imported it, what was previewed, what was skipped, or whether the run
completed. Two runs can reference the same source event (run 1 imports,
run 2 dedupes); CSV rows often lack external ids entirely, making
post-hoc reconstruction unreliable. The run is the missing operational
invariant; the ledger stays the only financial truth.

STEP 7 linkage decision: a nullable `integration_run_id` ledger column was
evaluated and rejected — touching the hot ledger table would break frozen
historical-database probes. Linkage lives in a dedicated
`integration_run_transactions(run_id, portfolio_id, transaction_id)`
link table instead: the `transactions` table stays byte-identical while
"which rows did this run confirm" remains exactly answerable (idempotent
`skipDuplicates` backstop).

## Model

`IntegrationRun` (`integration_runs`, 1 row per execution):

- identity: id, portfolioId (FK cascade), source (`B3`/`CSV`/`MANUAL`),
  provider, environment (`SIMULATED`/`CERT`/`PROD`, nullable), fileName,
  sourceAsOf.
- lifecycle: `STARTED` → `AWAITING_REVIEW` → `CONFIRMING` → `COMPLETED` |
  `PARTIAL` | `FAILED`. Terminal states immutable (repository + use-case
  guards, `IMPORT.INVALID_RUN_TRANSITION` on violation).
- counts: fetched, normalized, new, exact/probable/conflict duplicates,
  unsupported, invalid, confirmed, ignored (split, never collapsed).
- reconciliation summary (nullable; CSV has no source snapshot):
  matched/divergent/missingLocal/missingSource/unresolved.
- `partial` flag; safe error `{code, message}` (≤500 chars, no stacks).
- startedAt/completedAt/createdAt/updatedAt.

Per-item table deliberately omitted: detail reconstructs from the ledger
(provider/externalId/fingerprint) plus read models.

## Lifecycle

```text
START (run created)
→ PREVIEW (counts recorded, zero ledger writes)
→ REVIEW (human decision; abandonment leaves AWAITING_REVIEW history)
→ CONFIRM (writes stamped with run id; counts from the actual receipt)
→ COMPLETE (terminal, immutable)
```

Failed previews never open runs (validation happens first); confirm
failures record `IMPORT.CONFIRM_FAILED` before surfacing. `runId` is
optional on confirm (legacy unlink preserved); spent/foreign run ids fail
closed (400/404, zero writes).

## B3 example

startRun (SIMULATED) → orchestrator → recordPreview (5 new, asOf D-1) →
executeMany with `integrationRunId` → recordConfirmation (COMPLETED,
confirmed 5, reconcile 3 matched) → run detail + stamped rows. Repeat sync
opens a new run (5 exact duplicates, 0 writes, confirmed 0).

## CSV example

preview → run AWAITING_REVIEW (2 new) → confirm with runId → COMPLETED
(confirmed 2, ignored 0). Rows carry the run id; list/detail expose counts.

## Partial/failure semantics

Partial (e.g. capped pagination upstream) records `PARTIAL` + partial:true —
never relabeled complete. Failures record safe code/message and stay
visible; terminal runs reject every mutation.

## Security boundary

Persisted: counts, statuses, safe error codes, source/file labels.
Never persisted: tokens, secrets, certificates, keys, raw payloads,
stacks, CPF/CNPJ, fingerprints, external ids. Logs stay redacted counts.

## Persistence

Migration `20261022120000_add_integration_runs` (runs table) followed by
`20261022130000_add_integration_run_links`: the provisional
`integration_run_id` column was superseded before any production use, so
the ledger table is byte-identical to baseline and linkage lives in
`integration_run_transactions` (FK → runs, cascade). Forward-only,
additive; no data migration. Portfolio deletion cascades runs (scoped
evidence); no individual run delete endpoint (documented future retention).

## Retention future

No dashboard, no scheduler, no auto-cleanup in this phase. Metrics-ready
(counts per run enable success/duplicate/review/failure rates later).

## CERT compatibility

`environment` records SIMULATED today; CERT/PROD reuse the same model with
validated config (5O-B). No credential material touches runs.

## Verification

- `pnpm test:import-engine` — 8 files / 85 tests green, incl. 2 run-contract tests.
- `tests/database/integration-run-persistence.test.ts` — 8/8 (lifecycle,
  immutability, links + idempotent retry, scoping, pagination, disclosure).
- `tests/api/integration-runs.test.ts` — 10/10 (CSV + B3 lifecycles,
  failure, partial, idempotency, ownership, pagination, disclosure).
- `pnpm test:api` — full suite green (incl. the 2 closure count pins bumped
  31 → 33 for the two new migrations, per repo convention).
- `pnpm test:web` — green, incl. 6 run-history UX tests; manual/CSV flows green.
- `pnpm test:architecture` — green, incl. new database-direction boundary.
- Full build (turbo, 23 packages) + typecheck + repo lint + format clean.
- `pnpm test:database`: all functional suites green, incl. the new 8-test
  persistence suite; 15 files fail on pre-existing frozen phase-evidence
  pins (hardcoded historical migration counts, subset-probe DBs, port
  expectations) — verified identical at baseline via isolated worktree
  (only the total differs); frozen files intentionally untouched.
