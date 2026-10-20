# Atlas Ingestion Runbook (Operator)

All commands target `atlas_test:5433` unless a staging environment is
explicitly authorized. Never run ad-hoc SQL writes against owner data.
Normal user GETs never trigger repair; only explicit operator actions do.

## A. Ingestion FAILED

Diagnose: `GET /api/v1/admin/operations/jobs/health` → `recentFailures`;
open the run in `GET /api/v1/admin/ingestion/jobs/:id`; read `errorCode`.
Safe action: transient provider codes (`PROVIDER_UNAVAILABLE`, `TIMEOUT`,
`RATE_LIMITED`, HTTP 429/500/502/503/504) are already retried (3 attempts).
If the window is still missing, run a 5F backfill for the exact gap.
What NOT to do: do not edit observations directly; do not rerun broad
ranges blindly. Escalate: repeated failures become CRITICAL
(`REPEATED_PROVIDER_FAILURE`) — check provider status first.

## B. Ingestion PARTIAL

Diagnose: `partialRuns` in jobs/health; receipt shows `itemsFailed` with
per-item errors. Safe action: rerun the same single period (idempotent
upserts turn successes into UNCHANGED). If one asset/series persistently
fails, backfill the remaining gap only. What NOT to do: do not full-refresh
unrelated periods. Escalate when PARTIAL repeats daily.

## C. Stale data

Diagnose: `data-status` → source `lagPeriods`, `expectedThrough`,
`actualThrough`, `reasonCode`. Safe action: plan a 5F backfill for the
eligible window; confirm coverage improves on replan. What NOT to do: do not
treat weekend/holiday absence as stale (the status already excludes closed
days). Escalate: lag > 5 periods (FAILED) or repeated staleness.

## D. Missed schedule

Diagnose: `missedSchedules` in data-status / jobs/health. Safe action: if
the scheduler is disabled by policy, no action (DISABLED is intentional).
If enabled, check readiness (`scheduler/readiness`) and scheduler process
health. What NOT to do: do not backfill before confirming the scheduler
itself is healthy. Escalate: repeated misses while enabled.

## E. Provider rate limit

Diagnose: error `RATE_LIMITED` / HTTP 429 in job history; metrics
`providerFailuresTotal` rising. Safe action: wait for the provider window to
reset, then backfill the exact missing periods sequentially. What NOT to
do: do not retry in a tight loop; orchestrator pacing is sequential by
design. Escalate: sustained 429s over 24h.

## F. Provider outage

Diagnose: `PROVIDER_UNAVAILABLE` / HTTP 5xx across several job types.
Safe action: wait; persisted data remains servable and reads stay
zero-live-read. Backfill after recovery. What NOT to do: do not switch
providers ad hoc (no override knobs exist by design). Escalate: outage over
one business day or CRITICAL repeated-failure alert.

## G. Stale RUNNING

Diagnose: jobs/health `staleRunning` (started > 1h ago, still RUNNING).
Safe action: investigate the stuck host/process; the lease is reaped
automatically on next run (`STALE_RUN_REAPED`). What NOT to do: do not
manually flip statuses in the database. Escalate: recurring stale runs.

## H. Calendar coverage missing

Diagnose: data-status shows `CALENDAR_COVERAGE_MISSING`; backfill planner
blocks dependent observations. Safe action: run the calendar backfill for
the missing year first, then replan observations. What NOT to do: do not
backfill observations against missing calendar coverage. Escalate: current
year incomplete (FAILED, not just next-year horizon).

## I. Backfill required

Diagnose: dry-run plan lists eligible windows with estimates. Safe action:
`POST .../backfill/run` (add `confirmLargeBackfill: true` only for large
plans); verify post-coverage and replan empty. What NOT to do: do not run
unbounded ranges (hard caps reject them); do not enable daily auto-backfill.
Escalate: BACKFILL_INCOMPLETE alert after execution.

## J. Scheduler not ready

Diagnose: `scheduler/readiness` lists failing checks with reason codes.
Safe action: fix configuration (flag, allowlist, DB URL, migrations,
calendar coverage) and re-check. What NOT to do: do not start the scheduler
while NOT_READY; the lifecycle refuses automatically. Escalate: readiness
fails in an environment that must run scheduled ingestion.
