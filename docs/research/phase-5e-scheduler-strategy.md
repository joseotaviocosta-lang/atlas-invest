# Phase 5E — Ingestion Scheduler Strategy (R3)

**Status:** controlled rebuild complete; ready for human validation.
**Scope:** scheduling, execution locking, retry, failure semantics and operator controls for persisted market data ingestion.

## 1. Design principles

1. **The ledger and the persisted market/benchmark/FX/macro/calendar data stay authoritative.** Schedulers only invoke the existing application use cases; they never implement provider or repository logic.
2. **Exactly one executor per logical job window.** Exclusivity is enforced in PostgreSQL, not in process memory and not by assuming a single scheduler instance.
3. **Default-off.** The scheduler is inert unless `INGESTION_SCHEDULER_ENABLED=true`; `NODE_ENV=test` never auto-starts it.
4. **User reads never trigger providers.** GET endpoints serve persisted data only. Ingestion is the only path that contacts external providers.
5. **Fail closed and honest.** Unknown dates, closed markets, unpublished macro data and provider outages are explicit statuses, never synthetic zeroes.

## 2. Job catalogue (10)

| Job type                   | Cadence (America/Sao_Paulo) | Calendar gate             | Existing use case                           |
| -------------------------- | --------------------------- | ------------------------- | ------------------------------------------- |
| `MARKET_QUOTES_DAILY`      | `0 19 * * 1-5`              | `B3_TRADING`              | `UpdatePortfolioMarketDataUseCase`          |
| `BENCHMARK_IBOV_DAILY`     | `0 19 * * 1-5`              | `B3_TRADING`              | `UpdateBenchmarkDataUseCase` (IBOV)         |
| `BENCHMARK_CDI_DAILY`      | `0 19 * * 1-5`              | `BANKING`                 | `UpdateBenchmarkDataUseCase` (CDI / SGS 12) |
| `FX_USD_BRL_DAILY`         | `0 14 * * 1-5`              | `BANKING`                 | `UpdateFxDataUseCase` (BCB PTAX)            |
| `FX_EUR_BRL_DAILY`         | `0 14 * * 1-5`              | `BANKING`                 | `UpdateFxDataUseCase` (BCB PTAX)            |
| `MACRO_IPCA`               | `0 10 8-12 * *`             | publication gate          | `UpdateMacroDataUseCase` (SGS 433)          |
| `MACRO_SELIC_TARGET`       | `0 10 * * 1-5`              | event-driven / idempotent | `UpdateMacroDataUseCase` (SGS 432)          |
| `MACRO_SELIC_EFFECTIVE`    | `0 19 * * 1-5`              | `BANKING`                 | `UpdateMacroDataUseCase` (SGS 1178)         |
| `CALENDAR_B3_REFRESH`      | `0 6 1 1 *`                 | none                      | `UpdateCalendarDataUseCase`                 |
| `CALENDAR_BANKING_REFRESH` | `0 6 1 1 *`                 | none                      | `UpdateCalendarDataUseCase`                 |

`MACRO_SELIC_TARGET` performs a bounded daily **check**. It does not create daily observations; zero new rows is a successful no-op.

`MACRO_IPCA` looks for the previous reference month. If the provider has no row yet, the result is `SKIPPED_NOT_PUBLISHED_YET`, not a data gap and not a failure.

Calendar refresh always requests the current and next civil year and runs with `preserveExisting: true`, so existing rows (including exceptional overrides) are never overwritten.

## 3. Timezone and civil dates

- All business schedules use `America/Sao_Paulo`.
- Scheduled civil dates are resolved with `Intl.DateTimeFormat(..., { timeZone: 'America/Sao_Paulo' })`; server-local time is never used.
- Timestamps (`started_at`, `finished_at`, `created_at`) remain UTC `timestamptz`, matching the repository convention.
- `scheduledFor` period shape is job-specific: `YYYY-MM-DD` (daily), `YYYY-MM` (IPCA), `YYYY` (calendar).

## 4. Logical identity

```text
logicalJobKey = `${jobType}:${period}`
```

Examples:

```text
MARKET_QUOTES_DAILY:2026-10-19
BENCHMARK_IBOV_DAILY:2026-10-19
FX_USD_BRL_DAILY:2026-10-19
MACRO_IPCA:2026-09
CALENDAR_B3_REFRESH:2027
```

The attempt number is **never** part of the logical key. A retry of the same window reuses the same key and increments `attempt`.

## 5. Atomic multi-instance locking

`PrismaJobLock` derives a 64-bit lock key from the logical key with FNV-1a over UTF-8 bytes and calls:

```sql
SELECT pg_try_advisory_xact_lock(<64-bit key>);
```

The call runs inside an interactive Prisma transaction that stays open for the whole handler execution.

- Acquisition is atomic: exactly one caller receives `true`.
- A concurrent instance receives `false` immediately and returns `SKIPPED_LOCKED` with **zero** handler/provider invocations.
- Commit/rollback releases the lock.
- A crashed process loses its connection; PostgreSQL releases the transaction lock automatically.
- No `SELECT ... FOR UPDATE`, no `SELECT`-then-`INSERT`, no in-memory mutex, no scheduler-process uniqueness assumption.

A lock denied is not persisted as a run row; it returns a synthetic `SKIPPED_LOCKED` receipt. Genuine executions are persisted with incrementing attempts.

Stale `RUNNING` rows are reaped after one hour while the new holder owns the advisory lock. The reaped row becomes `FAILED` with `STALE_RUN_REAPED`.

## 6. Persistence

Migration `20261019120000_add_ingestion_job_runs` creates `ingestion_job_runs`:

`id`, `logical_job_key`, `job_type`, `trigger_type`, `scheduled_for`, `started_at`, `finished_at`, `status`, `attempt`, `items_requested`, `items_fetched`, `items_inserted`, `items_revised`, `items_unchanged`, `items_failed`, `error_code`, `error_message`, `metadata`, `created_at`.

Constraints/indexes: unique `(logical_job_key, attempt)`, plus indexes on logical key, `(job_type, scheduled_for)`, status and `started_at`.

No migration 30 was required. Phase 5E does not alter any Phase 5D financial/tax semantics.

## 7. Retry and failure policy

- Maximum attempts: **3**.
- Backoff: **30s → 60s → 120s** (bounded exponential, `base × 2^(n−1)`).
- Tests inject a fake `sleep`; no real waiting in automated tests.
- Transient: HTTP 429/500/502/503/504, timeouts, provider unavailable/rate limited.
- Permanent: validation errors, unsupported series, invalid configuration, malformed permanent responses.
- Permanent failures are not retried.
- Unsupported jobs return `FAILED` with an explicit error code; no silent discard.

Partial success is explicit:

- multi-item job: 10 requested, 8 persisted, 2 failed → `PARTIAL`, `itemsFailed = 2`.
- a provider outage with existing persisted data leaves that data untouched; the run is `FAILED`.
- rerunning the same logical window is idempotent at the business layer: repository upserts return `UNCHANGED`/`REVISED`; no duplicate observations are created.

## 8. Admin authorization

There is no pre-existing RBAC table. The minimal safe mechanism is a server-side allowlist:

```env
INGESTION_OPERATOR_USER_IDS=<uuid>[,<uuid>...]
```

- Empty/unset ⇒ every privileged request is denied.
- The principal comes exclusively from the validated JWT (`request.user.userId`); headers/body values are never trusted.
- Unauthenticated: `401`. Ordinary authenticated user: `403`. Allowlisted operator: `2xx`.
- Routes:
  - `POST /api/v1/admin/ingestion/jobs/:jobType/run`
  - `GET /api/v1/admin/ingestion/jobs`
  - `GET /api/v1/admin/ingestion/jobs/:id`
- Manual input accepts only an optional `scheduledFor` (`YYYY-MM-DD`, real civil date, not future). There is no provider, URL, SGS, range or free-form parameter field, so SSRF/custom-provider injection is structurally impossible.
- Admin history has no live provider reads.

## 9. Security and observability

- Admin responses set `Cache-Control: private, no-store`.
- Logs contain only job type and error message metadata; never financial payloads.
- No secrets, tokens or provider credentials are persisted in job rows.
- Provider adapter types remain inside their adapters; jobs only consume application use cases.

## 10. Test isolation

- Automated DB-writing tests target **atlas_test on port 5433 only**.
- The owner DB (`atlas_dev`, port 5434) is never used by tests.
- Owner financial counts and the five V2 fingerprints are audited before and after the full matrix.
- The fail-closed guard rejects any non-test URL with `TEST_DATABASE_SAFETY_VIOLATION`.

## 11. Migration traceability (forensic outcome)

- At the Phase 5D baseline (`5274022`) and at `b05e806`, **no** tracked migration for `ingestion_job_runs` existed.
- The owner database contained **28** applied migrations and no `ingestion_job_runs` table.
- The test database had an out-of-band 29th entry with a divergent checksum. The original SQL bytes were unrecoverable, so the untracked draft was not accepted as an applied-migration edit.
- The canonical migration 29 is now tracked in Git, was applied to a freshly rebuilt `atlas_test` via `prisma migrate reset` + `migrate deploy`, and is verified as migration 29 of 29.
- The owner database remains untouched (28 migrations, no table, financial data and fingerprints unchanged). Owner deployment of migration 29 is deliberately deferred to human validation.

## 12. Production scheduler deferred

The local `node-cron` adapter is a development/validation mechanism. Production deployment, distributed scheduling, cloud queues and alerting are **out of scope** for Phase 5E. The core scheduler contract is vendor-neutral; replacing the adapter does not affect locking or job semantics.
