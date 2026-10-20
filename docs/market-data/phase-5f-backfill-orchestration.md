# Phase 5F — Historical Backfill & Coverage Orchestration (Implementation)

**Phase:** 5F (I1–I5, ready for human validation)
**Implementation root:** `apps/api/src/ingestion/backfill`
**Status:** operator-controlled, scheduler default-off; production recurrence deferred.

## 1. Module map

```text
apps/api/src/ingestion/backfill/
  backfill-types.ts          domains, plan/receipt contracts, bounds, trigger BACKFILL
  coverage-planner.ts        deterministic persisted-only planner (zero provider calls)
  backfill-orchestrator.ts   sequential execution via JobRunner (lock + history + retry)
  backfill-admin.dto.ts      strict plan/run bodies (no provider/URL/SGS/range knobs)
  backfill-admin.controller.ts  POST plan (dry-run) / POST run (execution), operator-only
```

Frozen Phase 5E primitives are reused unchanged: 10 canonical job types,
`targetPeriod` DAY/MONTH/YEAR contract, `logicalJobKey = jobType + targetPeriod`,
attempt excluded, `pg_try_advisory_xact_lock(FNV1a64)`, bounded retry (3,
30s/60s), idempotent upserts with revisions. No new job types, no migration.

## 2. Execution flow

```text
operator POST /plan { domain, from, to }
        │  persisted coverage + calendar reads only (0 provider calls, 0 writes)
        ▼
BackfillPlan { eligibleWindows, eligiblePeriods, skippedReasons, estimatedCalls, requiresConfirmation }

operator POST /run { domain, from, to, confirmLargeBackfill? }
        │  re-plans (same deterministic rules)
        ▼
BackfillOrchestrator (sequential, concurrency 1)
        │  for each eligible period:
        │    JobRunner.run({ jobType, triggerType:'BACKFILL', targetPeriod, granularity, scheduledFor: today })
        │      ├─ lock denied → SKIPPED_LOCKED (0 handler calls)
        │      └─ acquired → exact-range update use case → terminal receipt
        ▼
BackfillExecutionReceipt { parent aggregation + childRunIds + remainingGaps (post re-plan) }
```

`scheduledFor` is always the execution civil date (today); `targetPeriod` is
the backfilled business window. Retries of a failed child become `RETRY`
with the same logical key.

## 3. Environment

```env
# unchanged default-off
INGESTION_SCHEDULER_ENABLED=true   # only for ticks; backfill is always operator-triggered

# same allowlist as Phase 5E
INGESTION_OPERATOR_USER_IDS=<uuid>,<uuid>
```

`NODE_ENV=test` never auto-starts the scheduler. Empty allowlist denies all
backfill routes. Schedule timezone remains `America/Sao_Paulo`.

## 4. Domain semantics

- **Market:** per active portfolio `UpdatePortfolioMarketDataUseCase` with
  exact `[date, date]`; universe = transacted assets in range (union across
  active portfolios); B3-gated; no synthetic quotes; reruns idempotent.
- **IBOV/CDI/FX:** exact single-date update calls; B3/BANKING-gated; no
  weekend/holiday rows; PTAX `ASK` rows matched by find-first semantics.
- **IPCA:** monthly; missing published month eligible; current/future month
  `SKIPPED_NOT_PUBLISHED_YET` (never `DATA_GAP`); no interpolation.
- **SELIC_TARGET:** event-driven; exact-date fetch; empty result is a
  successful no-op, never fabricated.
- **SELIC_EFFECTIVE:** BANKING-gated daily; SGS 1178.
- **Calendars:** deterministic official generator for the requested year with
  `preserveExisting: true` (authoritative overrides retained).

## 5. Identity, locking, retry, partial, resume

- Child identity: existing `jobType:targetPeriod` (e.g.
  `CALENDAR_B3_REFRESH:2030`, `BENCHMARK_CDI_DAILY:2026-01-07`).
- Parent receipt is in-memory aggregation (not persisted); children persist
  in `ingestion_job_runs` with trigger `BACKFILL` and are visible in the
  existing admin history endpoints.
- Same-window concurrency: one executes, one `SKIPPED_LOCKED` (single
  handler invocation). Different windows/periods run independently.
- Bounded retry (3, 30s/60s) reused; permanent validation errors never retried.
- Partial: any child failure with at least one success → `PARTIAL` with exact
  failed window. Resume = re-run same range: covered periods plan empty, only
  remaining gaps execute.

## 6. Rate limiting and large-plan safety

Sequential execution (one period at a time) bounds provider load. Dry-run
estimates provider calls (`periods × universe`). Plans over 90 periods
require explicit `confirmLargeBackfill: true`; more than 40 windows or 366
periods per execution is rejected outright.

## 7. Admin API

```http
POST /api/v1/admin/ingestion/backfill/plan
POST /api/v1/admin/ingestion/backfill/run
```

- Operator-only (`401` / `403` / `200` matrix, empty-allowlist deny, no
  client role escalation).
- Bodies accept only `{ domain, from, to }` (+ optional confirmation flag);
  strict Zod rejects `provider`, `url`, `sgsId`, `from/to` ranges abuse, etc.
  (`400`). Unbounded requests impossible by construction.
- `Cache-Control: private, no-store`.

## 8. Zero-live-read boundary

Plan generation: 0 upstream provider calls (fetch-spy verified). Normal
user-facing GETs never trigger backfill (no auto-repair-on-read). Only
explicit operator `POST .../backfill/run` may call providers, through the
existing update use cases.

## 9. Validation coverage

- Planner unit (fakes): empty/full coverage, single/contiguous gaps,
  compaction, closed-day exclusion, not-published exclusion, calendar-missing
  blocking, bounds, large-plan flag.
- Orchestration integration (atlas_test): 401/403/200 matrix, strict input
  400s, dry-run zero-fetch, calendar end-to-end + resume, concurrency
  execute + SKIPPED_LOCKED, large-plan confirmation gate.
- Full API suite: 59 + 2 files, 422 + 14 tests, 0 failures.

## 10. Deferred / out of scope

Production cloud scheduler, staging deployment, alerting, centralized
observability, operator admin UI, recurring execution, archival all-history
backfill, direct IBOV/PTAX headline integrations, cross-currency historical
TWR, foreign tax, deployment. Intentional deferrals, not failures.
