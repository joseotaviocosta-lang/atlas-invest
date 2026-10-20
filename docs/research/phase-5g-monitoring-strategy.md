# Phase 5G — Monitoring Strategy (Research)

**Status:** approved for implementation.
**Scope:** staging-ready observability over frozen 5E/5F workflows. No
production deployment, no cloud spend, no new financial semantics.

## 1. What is monitored (persisted-only)

Scheduler state (enabled/running/ready), per-source data freshness with
calendar-aware expected dates, latest job runs per job type, missed
SCHEDULED runs past grace, stale RUNNING leases, retry exhaustion, partial
runs, backfill incompleteness, calendar coverage horizon, provider health
derived from recent failure codes (no synthetic pings).

## 2. What is deliberately NOT monitored by live probing

No synthetic provider pings, no auto-repair-on-read, no user-GET side
effects. Normal reads stay zero-live-read; only explicit operator
plan/run/scheduler ticks may call providers.

## 3. Alerting philosophy

Alerts are operational facts, not pages by default: WARNING for single
failures, stale lags, missed schedules and coverage gaps; CRITICAL only for
repeated provider failures and data FAILED states. Dedupe by
`alertType:source` with occurrence counting; resolution on clear with full
history. External delivery (email/Slack/PagerDuty) is explicitly deferred —
the table is the contract; any future sink reads it.

## 4. Scheduler operations

Default OFF everywhere; staging/production require explicit
`INGESTION_SCHEDULER_ENABLED=true` plus a passing readiness gate (flag,
NODE_ENV, DB URL + reachability, operator allowlist, timezone, 10
definitions, not-already-running, current-year calendar, migrations).
NOT_READY blocks registration with reason codes; nothing starts silently.
Single-scheduler assumption is documented; multi-instance safety comes from
the 5E advisory lock, with contention visible via SKIPPED_LOCKED metrics.

## 5. Runbook linkage

Every alert type maps to a runbook section (A–J): diagnose via data-status
and jobs/health, act via manual job or 5F backfill, never via direct DB
edits, wait when providers are down, escalate on CRITICAL or repeated
failure. See `docs/operations/ingestion-runbook.md`.

## 6. Staging path

`docs/operations/staging-config.md` lists every required variable with safe
defaults and no secrets. Staging enables the scheduler explicitly, runs the
readiness gate, and uses the same frozen 5E/5F code paths as development.

## 7. Deferred (intentional, not failures)

Production cloud scheduler, staging deployment execution, alerting delivery
integrations, centralized metrics platform, operator admin UI, recurring
production execution/backfill, archival all-history ingestion, automatic
production repair workflows, direct IBOV/PTAX headline integrations,
cross-currency historical TWR, foreign tax, deployment.
