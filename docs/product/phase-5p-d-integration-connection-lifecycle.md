# Phase 5P-D — Integration Connection Lifecycle & Consent Persistence

Status: implementation complete, awaiting owner review/push. B3 CERT (5P) stays blocked.

## Why connection is separate

5P-C derived `AUTHORIZED` implicitly from `provider = SIMULATED` and
`NOT_CONNECTED` for anything else — a presentational guess with no
persistence, no restart durability, and no way to represent revoke or
re-auth. Schedules cannot carry it either: a schedule is user _preference_
(cadence, time, enabled), and deleting or rewriting preference on revoke
would destroy user intent. Runs cannot carry it: a run is execution
_history_, append-mostly and immutable once terminal. So the missing
invariant was: **no (portfolio, source) row survives restart saying
"this portfolio may execute against this source"** — and the scheduler had
nothing to consult before executing.

## State machine

Persisted `IntegrationConnection.status` (pure matrix in
`integration-connection.ts`, fail-closed):

```text
NOT_CONNECTED --BEGIN--> AWAITING_AUTHORIZATION --COMPLETE--> AUTHORIZED
AWAITING_AUTHORIZATION --REVOKE--> REVOKED
AUTHORIZED --REQUIRE_REAUTHORIZATION--> REQUIRES_REAUTHORIZATION
AUTHORIZED --REVOKE--> REVOKED
REQUIRES_REAUTHORIZATION --BEGIN--> AWAITING_AUTHORIZATION
REVOKED --BEGIN--> AWAITING_AUTHORIZATION
```

Idempotent: BEGIN from AWAITING/AUTHORIZED, REVOKE from REVOKED.
Invalid (throws `IMPORT.INVALID_CONNECTION`): REVOKED→COMPLETE,
REQUIRES_REAUTHORIZATION→COMPLETE, *→COMPLETE from NOT_CONNECTED,
NOT_CONNECTED→REVOKE, and all unlisted pairs.

Execution states (SYNCING/SYNCED/PARTIAL/ERROR) never live on the
connection row — they belong to jobs/runs (STEP 3). A technical check
failure (provider ERROR) only moves `lastCheckedAt` and never revokes
(STEP 46).

## Persistence model

One table, additive migration `20261022150000_add_integration_connections`:

```text
integration_connections (
  id, portfolio_id → portfolios ON DELETE CASCADE,
  source, provider DEFAULT SIMULATED, environment DEFAULT SIMULATED,
  status, authorized_at, revoked_at, last_checked_at,
  created_at, updated_at,
  UNIQUE (portfolio_id, source), INDEX (portfolio_id),
  CHECK (environment = 'SIMULATED'),
  CHECK (status IN (...5 lifecycle states...))
)
```

Identity: `@@unique([portfolioId, source])` — provider is a server
constant, so source-level uniqueness is the explicit choice (STEP 6).
Fields kept minimal: no token/secret/cert/CPF/payload columns exist by
design (guarded by `integration-connection-persistence.test.ts`, STEP 21).
History = current row + three timestamps; no consent event-sourcing
(STEP 18 — a future compliance phase can add it).

## Availability vs connection vs schedule vs run

```text
AVAILABLE + AUTHORIZED + schedule disabled   → valid, paused, nothing runs
AVAILABLE + REVOKED + schedule still enabled → schedule keeps preference,
  execution blocked, UI shows re-auth (NEEDS_REAUTH)
```

`B3 = PREPARING` (production) trumps everything: simulated flows are
rejected server-side unless the deployment opts in.

## Scheduler eligibility

Pure `canExecuteIntegration({ availability, connectionStatus })`: true
only for `AVAILABLE + AUTHORIZED`; null rows fail closed.

- `IntegrationSchedulerService.tick` skips ineligible schedules
  (`skippedIneligible` counter) — no job is enqueued, preference and
  `nextRunAt` are untouched.
- `IntegrationWorkerService.executeNext` re-checks after claiming (revoke
  between enqueue and claim): ineligible jobs are `markCancelled` —
  terminal, no run opens, no ledger write, no fake failure, schedule
  untouched.

## Revocation semantics

`AUTHORIZED → REVOKED` (also from AWAITING/REQUIRES_REAUTH): history,
ledger, runs and the schedule row are preserved; only future execution
stops. Settings show `NEEDS_REAUTH` with an "Acesso revogado" card:
"Seus dados já importados e o histórico permanecem no Atlas. Novas
sincronizações param até nova autorização."

## Reauthorization

`REVOKED → BEGIN → AWAITING_AUTHORIZATION → COMPLETE → AUTHORIZED` on the
_same_ row (timestamps updated, never a second row). A provider check
reporting `REQUIRES_REAUTHORIZATION` moves AUTHORIZED accordingly;
reporting AUTHORIZED heals REQUIRES_REAUTHORIZATION/REVOKED back (external
provider is source of truth, STEP 45).

## Simulation boundary

The whole flow is local: no OAuth, no B3 URL, no callback, no mTLS, no
token. `complete-authorization` and the mutating actions exist only where
simulated connections are allowed (production PREPARING rejects them).
`check` reconciles against the simulated provider truth (default
AUTHORIZED); tests inject other provider states to prove transitions.
No fake production-looking URL is ever generated (STEP 11).

## Security

Ownership on every action (`findByIdAndUserId`, 404 anti-enumeration);
strict empty-body DTOs (any injected provider/environment/URL/token field
→ 400); server-owned source/provider/environment; concurrency-safe
`ensure` (unique constraint + P2002 recovery, single row guaranteed).

## CERT handoff

Unknowns pending official B3 access: real grant/refresh semantics,
`authorizationExpiresAt` (deliberately omitted — expiry semantics unknown
until the CERT contract), external reference shape, Atlas-disconnect vs
B3-consent-revocation distinction (today revoke == local disconnect +
execution block, documented, never claimed as external revocation).

## Verification

- `tests/import-engine/integration-connection.test.ts` — 10 (transitions,
  invalid pairs, eligibility, vocabularies).
- `tests/api/integration-connection-policy.test.ts` — 10 (lifecycle,
  idempotency, gates, check reconciliation, eligibility).
- `tests/api/integration-connections.test.ts` — 14 E2E (HTTP lifecycle,
  scheduler/worker gates, settings integration, ownership, injection,
  concurrency, no-secret payloads).
- `tests/database/integration-connection-persistence.test.ts` — 6
  (CRUD scoping, uniqueness, concurrency, cancel support, no-secret
  schema guard).
- `tests/web/integration-connection.test.ts` — 4 (connection copy/action
  contract, card, revoked copy, no production path).
- `tests/mobile/integration-settings.test.ts` — extended (awaiting copy,
  connection contract fallback).
- `tests/architecture/integration-connection-boundaries.test.ts` — 7
  (engine purity, no ledger/B3/fiscal in path, strict DTOs, no scheduler/
  DB/B3 in web, eligibility wiring, no notification transport, mapped
  presentation).
- Regression: import-engine, settings, scheduler, review inbox, run
  history, B3 simulated/transport, CSV/manual, database, API, web,
  mobile, architecture, typecheck, lint, format, full build.
