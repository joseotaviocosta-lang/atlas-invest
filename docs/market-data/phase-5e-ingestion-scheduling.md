# Phase 5E — Automated Ingestion Scheduling (Implementation)

**Phase:** 5E-R3 (controlled rebuild)
**Implementation root:** `apps/api/src/ingestion`
**Status:** ready for human validation; scheduler default-off

## 1. Module map

```text
apps/api/src/ingestion/
  job-types.ts                  canonical job/trigger/status contracts, logical key, lock key, retry policy
  job-lock.ts                   PostgreSQL advisory lock (pg_try_advisory_xact_lock)
  job-repository.ts             Prisma run-history repository (port + implementation)
  job-runner.ts                 lock -> run record -> handler -> terminal status -> unlock
  ingestion-job.service.ts      shared scheduler/admin entry point
  jobs/
    job-handler.ts              handler contract and result helpers
    job-registry.ts             exactly-once registration of the ten jobs
    portfolio-directory.ts      narrow system read port for active portfolios
    market-quotes-daily.job.ts
    benchmark-daily.job.ts      IBOV + CDI
    fx-daily.job.ts             USD/BRL + EUR/BRL
    macro.job.ts                IPCA + SELIC target + SELIC effective
    calendar-refresh.job.ts     B3 + BANKING
  scheduler/
    ingestion-scheduler.ts      vendor-neutral interface, cron table, São Paulo civil date
    node-cron-ingestion.scheduler.ts
    ingestion-scheduler.lifecycle.ts
  admin/
    ingestion-operator.guard.ts
    ingestion-admin.dto.ts
    ingestion-admin.controller.ts
```

The only file that imports `node-cron` is the local adapter. The core module and job handlers are vendor-neutral.

## 2. Execution flow

```text
scheduler tick / operator POST
        │
        ▼
IngestionJobService.run(jobType, trigger, civilDate)
        │  resolves period (YYYY-MM-DD | YYYY-MM | YYYY)
        ▼
JobRunner
        │
        ├─ acquire pg_try_advisory_xact_lock(FNV1a64(logicalKey))
        │     ├─ denied → SKIPPED_LOCKED (0 handler calls)
        │     └─ acquired
        │           ├─ reap stale RUNNING rows > 1h
        │           ├─ INSERT ingestion_job_runs (RUNNING, attempt = max+1)
        │           ├─ handler.execute(ctx)
        │           ├─ UPDATE terminal status/counters
        │           └─ release transaction lock
        │
        └─ transient FAILED and attempt < 3 → sleep 30s/60s → retry same logical key
```

## 3. Environment

```env
# default: false
INGESTION_SCHEDULER_ENABLED=true

# comma-separated authenticated user IDs allowed to use the admin API
INGESTION_OPERATOR_USER_IDS=<uuid>,<uuid>
```

Rules:

- `INGESTION_SCHEDULER_ENABLED` absent/false ⇒ scheduler does not start.
- `NODE_ENV=test` ⇒ scheduler never auto-starts, even if the flag is true.
- Empty operator allowlist ⇒ all admin routes return `403`.
- Schedule timezone is always `America/Sao_Paulo`.

## 4. Job semantics

### Market quotes

- Gate: `B3_TRADING.isTradingDay(scheduledFor)`.
- Closed ⇒ `SKIPPED_MARKET_CLOSED`, zero provider calls, zero portfolio scans.
- Open ⇒ existing `UpdatePortfolioMarketDataUseCase` for each active portfolio.
- Provider/repository logic is not duplicated.
- Aggregates asset counts and failures; any success + any failure ⇒ `PARTIAL`.

### Benchmarks

- IBOV: `B3_TRADING` gate; `PRICE_INDEX`.
- CDI: `BANKING` gate; `RATE_SERIES` SGS 12.
- Both reuse `UpdateBenchmarkDataUseCase` over a bounded 7-day window to tolerate publication timing.
- No synthetic rows on closed days.

### FX

- `BANKING` gate for USD/BRL and EUR/BRL.
- Reuses `UpdateFxDataUseCase` (BCB/PTAX).
- No weekend rows, no identity rate, no UI live read.
- Bounded 7-day window for recent publication.

### Macro

- IPCA: previous reference month; zero rows ⇒ `SKIPPED_NOT_PUBLISHED_YET` (never `DATA_GAP`).
- SELIC target: event-driven, bounded daily check; zero rows is `SUCCESS` (idempotent no-op).
- SELIC effective: `BANKING` gate, SGS 1178, bounded 7-day window.
- Provider failures map to `FAILED` + transient code, enabling bounded retry.

### Calendars

- `CALENDAR_B3_REFRESH` and `CALENDAR_BANKING_REFRESH`.
- Each run ensures current year + next year.
- `preserveExisting: true` in `UpdateCalendarDataUseCase`: only missing dates are inserted. Existing rows, including exceptional overrides, are retained.

## 5. Logical identity and locking

- Logical key examples: `MARKET_QUOTES_DAILY:2026-10-19`, `MACRO_IPCA:2026-09`, `CALENDAR_B3_REFRESH:2027`.
- Attempt is history metadata, never identity.
- Lock key: 64-bit FNV-1a of the UTF-8 logical key, passed to `pg_try_advisory_xact_lock(bigint)`.
- The lock lives inside an interactive transaction for the entire handler; release is commit/rollback/connection loss.
- Two concurrent `JobRunner` instances for the same key: one `SUCCESS`, one `SKIPPED_LOCKED`; handler invocation count = 1.
- Distinct keys run independently.

## 6. Persistence and receipts

Table `ingestion_job_runs` (migration 29) stores:

- identity: `logical_job_key`, `job_type`, `trigger_type`, `scheduled_for`, `attempt`
- timing: `started_at`, `finished_at`, `created_at` (UTC timestamps)
- outcome: `status`, `error_code`, `error_message`, `metadata`
- counters: `items_requested`, `items_fetched`, `items_inserted`, `items_revised`, `items_unchanged`, `items_failed`

Receipts returned by the runner/API include the same fields plus `durationMs` and `logicalJobKey`.

## 7. Retry and partial success

- Max attempts: 3.
- Backoff: 30s, 60s, 120s (fake delay in tests).
- Retries reuse the same logical key and increment `attempt`.
- Transient: provider timeout/unavailable/rate limit, HTTP 429/500/502/503/504.
- Permanent: validation/unsupported/malformed configuration; no retry.
- Partial success is a first-class terminal status; failures are counted, never hidden.
- Provider outage leaves previously persisted observations untouched.
- Reruns are idempotent at the business repository (UNCHANGED/REVISED semantics preserved).

## 8. Admin API

```http
POST /api/v1/admin/ingestion/jobs/:jobType/run
GET  /api/v1/admin/ingestion/jobs?jobType=&limit=&cursor=
GET  /api/v1/admin/ingestion/jobs/:id
```

- Server-side operator allowlist only.
- `401` unauthenticated, `403` ordinary user, `200` operator.
- Manual body: `{ "scheduledFor": "YYYY-MM-DD" }` only (optional, real civil date, not future).
- Strict Zod schemas reject unknown keys: `provider`, `url`, `sgsId`, `from`, `to`, etc. ⇒ `400`.
- `limit` 1–200; unknown query keys ⇒ `400`.
- Unknown job run UUID ⇒ `404 INGESTION.JOB_NOT_FOUND`.
- `Cache-Control: private, no-store`.

## 9. Zero-live-read boundary

GET endpoints remain persisted-data readers:

- valuation / allocation: 0 fetches
- benchmark coverage: 0 fetches
- FX coverage: 0 fetches
- macro context/coverage: 0 fetches
- calendar coverage: 0 fetches
- admin job history: 0 fetches

Only scheduler ticks and explicit operator `POST .../run` call ingestion use cases, which may call providers.

## 10. Migration notes

- Canonical migration: `packages/database/prisma/migrations/20261019120000_add_ingestion_job_runs`.
- Applied and verified on `atlas_test` (29/29).
- Owner DB `atlas_dev` intentionally remains at 28 migrations and has no `ingestion_job_runs` table. Existing financial data and the five V2 fingerprints are unchanged.
- Owner deployment of migration 29 is part of human validation, not automated tests.
- No migration 30 exists; no `prisma db push` was used.

## 11. Validation coverage

- R3-A: logical key/attempt exclusion, stable lock key, concurrency, release after success/failure/throw, retry, stale reap.
- R3-B: ten jobs registered once, cron/timezone table, default-off, test no-auto-start, closed-day zero provider calls, IPCA pre-publication, calendar current+next year.
- R3-C: 401/403/200 matrix, empty allowlist denial, strict input/SSRF rejection, unknown id 404.
- R3-D: bounded retry/backoff, permanent no-retry, 10/8/2 partial success, provider-failure data preservation, idempotent rerun, revision preservation, zero-live-read matrix.
- Full API suite: 58 files / 414 tests, 0 failures.

## 12. Deferred / out of scope

- Production distributed scheduler, cloud queues, alerting.
- Owner DB migration application (human validation step).
- New provider integrations or changes to Phase 5D semantics.
- Phase 5F.

## 13. Safe human-validation procedure

Do **not** enable the scheduler against the owner database during validation.

1. Use `atlas_test` (port 5433) or a dedicated scratch database, never `atlas_dev`.
2. Apply the canonical schema with `prisma migrate deploy` (migration 29 included).
3. Keep `INGESTION_SCHEDULER_ENABLED=false` for the first checks.
4. Set `INGESTION_OPERATOR_USER_IDS` to a disposable test user only.
5. Trigger one closed-day job (for example `FX_USD_BRL_DAILY` with a Sunday `scheduledFor`) through the admin API. Expected: `200`, `SKIPPED_BANKING_CLOSED`, zero provider calls.
6. Trigger one controlled open-day job with test/in-memory provider configuration. Expected: a persisted receipt and a visible row in `GET /api/v1/admin/ingestion/jobs`.
7. For a scheduler tick, use only a scratch environment with `INGESTION_SCHEDULER_ENABLED=true`; observe one tick, then set it back to `false`.
8. Re-run the owner count snapshot and the five V2 fingerprints. Financial counts must be identical and all five hashes must match the baseline.
