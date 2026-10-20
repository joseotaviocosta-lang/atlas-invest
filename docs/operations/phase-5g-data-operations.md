# Phase 5G — Production Data Operations & Monitoring (Implementation)

**Phase:** 5G (I1–I5, ready for human validation)
**Implementation root:** `apps/api/src/ingestion/operations`
**Status:** staging-ready foundation; production recurrence deferred.

## 1. Module map

```text
apps/api/src/ingestion/operations/
  operational-state.ts        states, reason codes, thresholds, alert types
  freshness-service.ts        calendar-aware per-source freshness (persisted-only)
  missed-schedule.ts          pure missed SCHEDULED-run detector (grace-based)
  operational-alerts.ts       alert repository (raw SQL) + dedupe/resolve detector
  operations-summary.service.ts data-status, jobs/health, metrics aggregation
  scheduler-readiness.service.ts preflight gate (fail-closed, never auto-enables)
  operations-admin.dto.ts     strict bounded filters (no provider/SQL control)
  operations-admin.controller.ts GET data-status/jobs/health/alerts/metrics/readiness
```

Frozen 5E/5F primitives are reused unchanged: 10 canonical jobs,
`targetPeriod` contract, advisory lock, bounded retry, BACKFILL trigger,
operator allowlist, scheduler default-off, coverage planner semantics.

## 2. Freshness policy

| Source | Calendar | Expected through | Stale rule |
| --- | --- | --- | --- |
| MARKET_QUOTES | B3_TRADING | latest open day before 20:00 SP cutoff | lag 0 healthy, 1–2 degraded, 3–5 stale, >5 failed |
| IBOV | B3_TRADING | same as market | same ladder |
| CDI | BANKING | latest open banking day before 20:00 SP cutoff | same ladder |
| USD_BRL / EUR_BRL | BANKING | latest open banking day before 15:00 SP cutoff | same ladder |
| IPCA | none (publication) | month-1 (month-2 before day 12) | lag 0 healthy, 1 stale, >1 failed; current month never expected |
| SELIC_TARGET | none (event-driven) | n/a | any observation healthy, none unknown (never stale by date) |
| SELIC_EFFECTIVE | BANKING | latest open banking day before 20:00 cutoff | same ladder |
| B3/BANKING calendars | self | current + next year | current incomplete failed; next missing + month ≥ 10 stale, else degraded |

Weekends and holidays never raise stale flags: expected dates derive only
from open calendar days. IPCA never expects the unpublished current month.
SELIC target never goes stale merely because no new daily row exists.

## 3. Missed schedules

Per job, using its cron hour with a 3-hour grace period: an open day whose
scheduled time + grace is past and has no SCHEDULED-trigger run is reported
with `MISSED_SCHEDULE`. Detection is active only when the scheduler is
enabled; a default-off scheduler reports DISABLED, never false alarms.
No exact second-level cron matching.

## 4. Alerts

Types: INGESTION_FAILED, INGESTION_PARTIAL, MISSED_SCHEDULE, DATA_STALE,
CALENDAR_COVERAGE_LOW, REPEATED_PROVIDER_FAILURE, STALE_RUNNING_JOB,
BACKFILL_INCOMPLETE. Severities INFO/WARNING/CRITICAL (repeated provider
failures are CRITICAL; single failures WARNING).

Dedupe key `alertType:source` with at most one ACTIVE row (code-enforced via
the existing advisory-lock port). Re-detection bumps `lastDetectedAt` +
`occurrenceCount` (no spam). Resolution flips ACTIVE → RESOLVED and preserves
history (never deleted). A later recurrence inserts a new row.

## 5. Scheduler readiness

`GET /api/v1/admin/operations/scheduler/readiness` verifies: flag explicitly
true, NODE_ENV not test, DATABASE_URL present, operator allowlist non-empty,
timezone America/Sao_Paulo, exactly 10 unique definitions, scheduler not
already running, database reachable, required tables present, current-year
calendar coverage, provider env presence (names only). NOT_READY never starts
jobs; the lifecycle gate enforces this. Production enablement stays explicit
opt-in per environment; test is forced off.

## 6. Endpoints (all operator-only, persisted-only, zero provider calls)

```http
GET /api/v1/admin/operations/data-status
GET /api/v1/admin/operations/jobs/health
GET /api/v1/admin/operations/alerts?limit=&status=
GET /api/v1/admin/operations/alerts/:id
GET /api/v1/admin/operations/metrics
GET /api/v1/admin/operations/scheduler/readiness
```

`401` unauthenticated, `403` ordinary user, `200` operator.
`GET /api/v1/admin/ingestion/jobs` additionally accepts bounded
`triggerType` / `status` / `from` / `to` filters (validated civil dates).

## 7. Metrics

Derived per read (no new persistence): 7-day window runs total, by-status,
by-trigger, provider failures (error-code match), retry attempts (attempt>1),
backfill runs, avg duration, per-source lag (filled by the status caller).
No external metrics vendor required. No caching layer (reads are cheap and
always fresh; a 0–30s cache was considered and rejected as stale-hiding).

## 8. Validation coverage

- Freshness unit (fake calendar/repos, fixed clock): ladders, weekend
  no-false-alarm, IPCA publication, SELIC event semantics, calendar horizon,
  missed-schedule grace + disabled suppression.
- Alert lifecycle (real atlas_test table): ACTIVE → bump (no dup) → resolve →
  history queryable; stale RUNNING detection.
- Admin API: 401/403/200 matrix on all six routes, zero-fetch spy on
  persisted reads, schema shape, bounded filters, unknown-id 404.
- 5E/5F regression: ingestion + backfill suites green.
- Full canonical matrix: all suites green (see implementation report).

## 9. Health contract separation

- `GET /health`: process alive (never fails because IBOV is stale).
- `GET /ready`: API + database reachable (readiness probe).
- `GET /api/v1/admin/operations/*`: data freshness and job health
  (operator-only). No separate liveness endpoint exists by design; the three
  layers above keep process, dependency and data concerns distinct.
