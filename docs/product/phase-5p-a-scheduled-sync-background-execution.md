# Phase 5P-A — Scheduled Sync & Background Execution Foundation

Status: foundation complete. B3 CERT integration (5P) stays blocked.

## Architecture

```text
IntegrationSchedule (intent: what + cadence + timezone + enabled)
        ↓ tick (planner, fake-clock driven)
IntegrationJob (one row per schedule slot, PENDING → RUNNING → SUCCEEDED|FAILED)
        ↓ atomic claim (single UPDATE…RETURNING, enabled-schedule JOIN)
IntegrationWorker (generic claim → resolve executor → run → fence completion)
        ↓ registry: "source/provider" → executor (fail-closed)
SimulatedB3SyncExecutor (B3/SIMULATED only)
        ↓ startRun(trigger=SCHEDULED) → runSimulatedB3Sync → recordPreview
IntegrationRun(AWAITING_REVIEW, partial echoed from source)
        ↓ zero ledger writes
Human review (existing preview/confirm path, unchanged)
```

Three concepts stay strictly separate: **Schedule** (future intent),
**Job** (one attempt at a scheduled occurrence) and **IntegrationRun**
(the executed result, created by 5P-PRE).

## At-least-once semantics

Delivery is at-least-once by design: the persisted pipeline underneath
(unique external ids, idempotent confirm receipts, link-table idempotency)
makes re-execution safe. No distributed exactly-once is promised.

## Lock strategy

No in-memory mutexes. Cross-instance exclusivity comes from two
database mechanisms:

1. **Atomic claim** — `claimDue` is a single `UPDATE…RETURNING` whose
   subselect and outer `WHERE` both re-check eligibility, so exactly one
   worker wins each job. The subselect JOINs `integration_schedules` and
   requires `enabled = true`: disabling a schedule cancels future
   execution atomically (PENDING rows of disabled schedules are
   unclaimable).
2. **Attempt fencing** — the claim bumps `attempt`; `markSucceeded` /
   `markFailed` complete only via guarded `updateMany` on
   `(id, portfolioId, status='RUNNING', attempt)`. A stale worker whose
   claim was superseded (crashed-process re-claim past the lease) loses
   explicitly instead of overwriting the new execution's terminal state.

(Physical columns are snake_case; the raw claim aliases them back to the
camelCase repository shape.)

## Retry strategy

Execution-level retries are distinct from HTTP request retries.
`MAX_JOB_ATTEMPTS = 3`, deterministic exponential backoff
(`60s, 120s`, capped at 15min, no jitter, no timers — pure and testable).
Backoff is stored as `notBeforeAt`; the claim skips jobs whose backoff
has not elapsed. Unknown executors (configuration errors) fail fast
without burning the retry budget.

## Stale recovery

A `RUNNING` job whose `startedAt` is older than `STALE_RUNNING_LEASE_MS`
(1h) is re-claimable by any worker (crashed-process recovery). The
re-claim bumps `attempt`, which fences the original holder out. Jobs are
never stuck forever and never double-complete.

## Missed schedules

Offline windows coalesce: the tick walks forward from the stored
`nextRunAt` while the following occurrence is still past, and enqueues
only the **latest** missed slot (`resolveDueSlot`). A three-day outage
produces one job, never three. Consumed slots advance `nextRunAt`, so
duplicate ticks never duplicate jobs (unique constraint on
`(schedule_id, scheduled_for)` is the backstop).

## Overlap policy

A schedule with a non-terminal (`PENDING`/`RUNNING`) job is skipped by
the tick (`findActiveBySchedule`) — one execution per portfolio +
integration at a time. Attempt fencing is the backstop for stale-claim
races.

## Preview-only background policy

Scheduled sync is **collect + prepare + review**. The background
executor (`SimulatedB3SyncExecutor`):

1. loads portfolio context (assets, accounts, existing ledger projection,
   replayed positions),
2. opens a run with `trigger: 'SCHEDULED'`,
3. runs the simulated B3 pipeline (pure, offline, credential-free),
4. records the preview (`AWAITING_REVIEW`, `partial` echoed),
5. writes **zero** ledger rows (`ledgerWrites: 0` by construction — the
   executor has no reference to the transaction writer).

## Human-confirm policy

No auto-confirm exists in this phase. Runs end in `AWAITING_REVIEW`;
confirmation stays on the existing human preview/confirm path. The UI
distinguishes origins (`Agendada` vs `Manual`) and tells the investor
explicitly that nothing was written without review.

## Partial / failed mapping

- Source partial → `job = SUCCEEDED`, `run = AWAITING_REVIEW` with
  `partial = true` (still reviewable and confirmable; partiality is
  informational, never a second terminal state).
- Source/transport failure → `run = FAILED` with a safe code, `job`
  retries with backoff, then `FAILED`.
- Precondition failure before a run opens (missing portfolio/accounts)
  → no run, `job` retries with backoff (history stays clean).

## Timezones

Schedules carry an explicit IANA timezone (default
`America/Sao_Paulo`); economic dates travel as civil `YYYY-MM-DD`.
Wall-clock math uses `Intl` conversions with an injected clock — unit
tests never touch the real clock. `WEEKDAYS` means Monday–Friday and
deliberately does **not** claim B3 trading-calendar equivalence (no
holiday calendar in this phase).

## Persistence

One additive migration (`20261022140000_add_integration_schedules_jobs`):

- `integration_runs.trigger` (`MANUAL` | `SCHEDULED`, nullable for
  pre-existing rows);
- `integration_schedules` — one row per `(portfolio, source)`; environment
  CHECK-locked to `SIMULATED` (enabling CERT/PROD requires a deliberate
  future migration, never an API call or row edit);
- `integration_jobs` — one row per `(schedule, slot)`; terminal states
  `SUCCEEDED`/`FAILED`/`CANCELLED`.

No existing migration was edited; no destructive change.

## Failure recovery & restart

Tick and worker are stateless: all intent lives in the two tables, so a
restart resumes by re-reading them. In-process portfolio locks from the
interactive confirm path are untouched (different layer).

## Environment safety

- Provider/environment are server constants (`SIMULATED`); the schedule
  DTOs are strict (extra fields rejected with 400).
- New schedules default to disabled; the tick is default-off
  (`INTEGRATION_SCHEDULER_ENABLED=true` + non-test env).
- Enabling a simulated schedule in production is rejected unless the
  deployment explicitly opts in (`ATLAS_ALLOW_SIMULATED_SCHEDULES=true`).
- B3 availability stays `PREPARING` by default; the web UI communicates
  "Disponível quando a integração B3 for ativada." Simulated controls
  render only under the explicit dev opt-in.
- Schedulable sources are an allow-list (`B3` only); the executor
  registry resolves `B3/SIMULATED` and fails closed otherwise.

## Freshness hook

`ScheduledSyncResult.freshness` (`FRESH` | `NO_NEW_DATA`) is plumbed
through the executor contract for the future CERT path (unchanged
`sourceAsOf` can skip expensive product calls). The simulated executor
always reports `FRESH`.

## Future B3 CERT integration point

`B3/CERT → B3CertSyncExecutor` registers in `SourceSyncExecutorRegistry`
without touching the planner, worker, claim, retry or API layers. 5P
stays blocked on owner authorization, real CERT access, credentials,
certificates and official contracts — zero live B3 calls in this phase.

## Verification

- `pnpm test:import-engine` — pure planner (cadence, timezone, missed
  coalescing, backoff) incl. schedule.test.ts (9 tests).
- `tests/database/integration-scheduling-persistence.test.ts` — 8 tests:
  defaults, uniqueness, idempotent ensure, concurrent-claim race (2
  workers → exactly 1 winner), disable-cancels-claim, stale recovery +
  superseded-claim fencing, bounded retry + portfolio scoping, due lists.
- `tests/api/integration-scheduled-sync.test.ts` — 10 E2E: CRUD, strict
  DTO, tick + background B3 flow with zero ledger writes,
  review-stays-human + repeat dedupe, bounded failure, missed coalescing
  - overlap skip, stale recovery, unknown-executor + ownership isolation,
    disable cancels, MANUAL trigger regression.
- `tests/api/integration-schedule-policy.test.ts` — 3 unit tests:
  disabled-by-default, production guard, fail-closed validation.
- `tests/architecture/scheduled-sync-boundaries.test.ts` — 4 tests:
  engine purity, no ledger writer / live transport / financial math in
  the worker path, node-cron confinement, no secrets in policy.
- `pnpm test:web` — `tests/web/import-run-history.test.ts` (+3 tests):
  trigger presentation, schedule copy, schedule surface honesty.
