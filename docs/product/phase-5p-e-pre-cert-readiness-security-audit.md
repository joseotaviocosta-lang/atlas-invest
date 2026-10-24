# Phase 5P-E — Pre-CERT Readiness & Security Audit

Status: audit complete. `ENGINEERING_READY_FOR_CERT` (technical) + `CERT_ACCESS_BLOCKED` (owner/B3 prerequisites outstanding). No live B3 calls, no credentials introduced.

Audit-first execution: this phase adds no features and no B3 integration. One P2 hardening fix was applied (worker pre-execute recheck); everything else is tests + documentation.

## Architecture map

```text
Availability (import-engine/integration-availability.ts, pure)
  → server policy defaultSchedulingPolicy (prod deny unless explicit opt-in)
Connection (import-engine/integration-connection.ts pure matrix +
  IntegrationConnectionService + integration_connections table)
  → Settings (IntegrationSettingsService read model, no writes)
  → Schedule (IntegrationScheduleService + integration_schedules, server-owned cadence/time/nextRunAt)
  → Job (scheduler tick enqueue + worker atomic claim + markSucceeded/Failed/Cancelled)
  → Executor (SourceSyncExecutorRegistry: SIMULATED registered only; unknown source/provider fail closed)
  → Provider (SimulatedB3Provider, offline fixture; B3HttpProvider dead code — test-only instantiation)
  → Transport validation (validateB3IntegrationConfig, fail-closed, no network in prod path)
  → Adapter (b3-simulated normalize) → Normalization → Classification (canonical fingerprints)
  → Preview (IntegrationRun AWAITING_REVIEW, zero ledger writes)
  → Human confirm (ConfirmPortfolioImportUseCase → CreateTransactionUseCase ONLY for CSV)
  → Ledger (TransactionRepository.create/createMany — sole table writers)
  → Reconciliation (position summaries on read) → IntegrationRun (append-mostly history)
  → Review Inbox (derived, read-only; no dismiss flags)
```

Package responsibilities: `@atlas/import-engine` pure rules; `@atlas/database` repositories; `apps/api` application + modules; `@atlas/ui` presentation copy; web/mobile read/mutate via API only.

## Trust boundaries

- USER INPUT: HTTP bodies/paths/query, CSV content, fileName. Validated by strict Zod DTOs (schedules, connection actions) or validated+stripped DTOs (CSV preview/confirm); CSV capped (2000 rows / 2–3 MB) and parsed by a custom parser (values are data, never formulas — no spreadsheet execution context exists).
- EXTERNAL UNTRUSTED DATA: B3 JSON — no live path exists. The only constructed provider is the simulated fixture; the HTTP transport is never instantiated outside `tests/b3-integration` (boundary-tested). Future CERT input must enter exclusively through `validateB3IntegrationConfig` + strict mappers (`createStrictB3Mapper`, INVALID_UPSTREAM_PAYLOAD fail-closed).
- INTERNAL TRUSTED STATE: schedules/jobs/runs/connections rows; transitions go through pure matrices; server computes nextRunAt/environment/provider.
- SECRET MATERIAL: none exists anywhere in the stack (see secret audit). There is nowhere to put it by construction: no secret columns, no secret fields in DTOs, no secret env reads in the integration path.
- DOMAIN DATA: transactions via canonical writer(s) only (see ledger safety).

## Security controls

- Strict DTOs (`.strict()`) on schedule create/update, connection actions, review queries: unknown/provider/environment/URL/token fields → 400 (E2E-proven per endpoint).
- Ownership: every integration read/mutation scopes by `findByIdAndUserId` / owned-portfolio checks; cross-user → 404 (E2E-proven for connections, settings, schedules, runs, reviews).
- Atomic claims + attempt fencing + unique (schedule, slot) + unique (portfolio, source) with P2002 recovery.
- Bounded retries everywhere (job MAX 3, B3 transport max 10 clamp, no retry on 400/401/403/schema/revoked/cert).
- CHECK constraints: environment SIMULATED-only; connection status vocabulary.

## Authz/ownership

Covered per surface by E2E (stranger-portfolio 404s): connections (4 actions + read), settings read, schedule CRUD, run list/detail, review list/detail. ID enumeration (portfolioId/connectionId via path/source, scheduleId, runId, review cursor) resolves to 404 without existence oracle.

## Secret handling

- Frontend (web/mobile/ui): ZERO secret refs (audited: no client_secret/access_token storage/private_key/cert/B3 credential/mTLS/secret-manager/API-key headers; Bearer tokens are memory-only session tokens via HttpOnly-cookie BFF on web, expo-secure-store on mobile).
- Public config: 4 vars, all safe — NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL, EXPO_PUBLIC_API_URL (public base URLs), NEXT_PUBLIC_B3_REAL_CONNECTION_ENABLED (boolean flag, defaults to safe PREPARING).
- Database: no secret columns in any integration table (schema-guard test scans model + 5P-D migration; error columns carry static safe copy only).
- API: responses carry counts/statuses/ids only (payload-tested); error messages are static strings (exact-match locked).
- Logs: schedule id + static message on skipped ticks; tick counters; no payloads/PII/secrets.

## Network boundaries

- No request-reachable SSRF sink in the integrations surface (audited: zero HTTP clients there). The only fetch call sites repo-wide take host from server config/env with encoded path/query (Sicalc dead path with unencoded interpolation noted as INFO — unreachable, no caller).
- Provider registry: explicit allow-list (`SCHEDULABLE_SOURCES`, `CONNECTABLE_SOURCES` = B3), server-constant SIMULATED provider/environment, no dynamic imports, user strings never resolve classes.

## Fail-closed guarantees

- Availability PREPARING trumps everything, including an AUTHORIZED row + enabled schedule (tamper-tested with real repos + deny policy: tick enqueues nothing, settings reports PREPARING).
- Unknown connection statuses throw at service layer; unknown DB values additionally rejected by CHECK (both barriers tested).
- Unknown executors/sources fail closed without runs or writes.
- Revoke between enqueue→claim→execute cancels without runs/ledger/fake failures (post-claim + pre-execute double recheck).
- Invalid transitions throw; idempotent begins/revokes never duplicate or resurrect.

## Concurrency

- Duplicate ticks: unique (schedule, slot) coalesces; overlap guard skips while PENDING/RUNNING.
- Two workers: atomic single-statement claim, exactly one winner; stale RUNNING re-claim bumps attempt (never resets); fenced completions make losers fail explicitly; cancellation fenced identically.
- authorize×authorize / authorize×revoke / check×revoke / revoke×revoke races: single row, terminal state in-vocabulary, coherent timestamps (E2E-tested).
- Double confirm idempotent (existing CSV test).

## Ledger safety

- Background sync is preview-only (`ledgerWrites: 0` constant); worker/executor/scheduler contain zero ledger references (boundary-tested).
- Single canonical write path for all integration confirmations: `ConfirmPortfolioImportUseCase → CreateTransactionUseCase.executeMany`. One documented residual: `RectifyPortfolioTransactionUseCase` writes compensating entries directly via the repository (pre-existing, unrelated to integrations, append-only + idempotent) — classified INFO, no change (opportunistic refactor forbidden).
- No raw SQL touches transaction/financial tables (audited); no `prisma.transaction` outside the repository.
- Idempotency: exact/probable/conflict classification via canonical fingerprints; repeated scheduled runs dedupe (E2E); externalId conflicts → CONFLICT path (existing engine coverage).
- CSV safety: row cap, byte caps (DTO 3 MB + use-case 2 MB), custom parser, no formula execution context, no filesystem paths.

## Data minimization

- connections: status + 3 timestamps (no tokens/payloads).
- schedules: intent only (cadence/time/enabled/nextRunAt).
- jobs: execution bookkeeping (slot/status/attempt/run link/error code+static message).
- runs: counts + reconciliation summary + static error copy (no candidates persisted, no fingerprints, no externalIds, no payloads).
- links: (run, portfolio, transaction) ids only.
- No PII beyond existing account/portfolio names; no CPF anywhere in integration tables.

## CERT readiness matrix

| AREA           | VERDICT | WHY                                                                           |
| -------------- | ------- | ----------------------------------------------------------------------------- |
| domain         | READY   | pure matrices, eligibility, fingerprints, dedupe                              |
| adapters       | READY   | simulated offline; real adapter = future B3 work                              |
| transport      | BLOCKED | B3HttpProvider exists but dead code (test-only); no endpoint/creds configured |
| auth           | BLOCKED | no OAuth/client credentials                                                   |
| certificates   | BLOCKED | none                                                                          |
| consent        | BLOCKED | simulated lifecycle only; real grant = B3                                     |
| persistence    | READY   | connections table, no secrets, cascade verified                               |
| scheduler      | READY   | gated, bounded, overlap-safe, tested incl. tampering                          |
| reconciliation | READY   | existing, unchanged                                                           |
| security       | READY   | P0/P1 zero; P2 fixed; audit guards in suite                                   |
| observability  | READY   | ids/counts/static messages only                                               |
| UX             | READY   | simulated flows honestly labeled; no fake production                          |
| commercial     | BLOCKED | owner/B3 prerequisites outstanding                                            |

## Findings

P0: none.
P1: none (no CERT/PROD bypass, no auth bypass, no cross-user access, no secret exposure found).
P2:

- P2-1 worker revoke window: eligibility was checked once after claim, leaving a revoke→execute window. FIXED: second recheck immediately before `executor.execute` (same cancel semantics). No test-only change could close it; defense in depth.
  P3:
- P3-1 5P-C architecture boundary asserted a fully read-only integrations controller; 5P-D intentionally added 4 POST connection actions. Updated assertion to pin exactly-4 POSTs + strict DTO (test maintenance).
  INFO:
- I-1 rectify bypasses CreateTransactionUseCase (pre-existing, unrelated, append-only + idempotent).
- I-2 CSV preview/confirm DTOs strip (not reject) unknown fields — safe: no server-owned/secret fields accepted, all consumed fields validated.
- I-3 B3 transport has page-count caps but no per-page byte cap; transport unwired in prod.
- I-4 Sicalc provider interpolates path segments unencoded — dead code, no callers.
- I-5 `BRAPI_API_KEY` user-facing copy references a backend env name (no value).

## Fixes applied

- Worker pre-execute eligibility recheck (P2-1) + existing cancel-path tests keep passing.
- Migration-count living guards 34→35 (production-readiness ×2, security-runtime ×1) for the deliberate 5P-D migration.
- 5P-C architecture boundary updated for the intentional POST surface (P3-1).

## Residual risks

- Frozen evidence suites (15 DB files, operations-alerts) remain red pre-existing — unrelated to integrations, not touched per standing rule.
- Real-provider failure modes (timeouts against live B3, cert expiry rotation, upstream schema drift) cannot be proven until CERT access exists; transport unit tests use mocks.
- Confirm path for B3 scheduled runs is read-only review today (no B3 confirm endpoint); confirmation flows through CSV/manual with dedupe — product decision for a future phase, not a security gap (no auto-write exists).

## Owner/B3 blockers

1. contratar/licenciar a integração B3;
2. obter acesso ao ambiente CERT;
3. receber o Pacote de Acesso;
4. receber credenciais e certificados oficiais;
5. disponibilizar contratos/swagger oficiais da B3;
6. autorização explícita do owner para a fase 5P.
   None iniciado automaticamente.

## Verification

- import-engine full: 130/130.
- database full: 154 pass + 30 pre-existing frozen-evidence fails (same 15 files); new persistence 7/7.
- api full: 581/582 (1 pre-existing operations-alerts isolation failure).
- web full: 377/377. mobile full: 121/121. arch full: 258/258.
- typecheck/lint/format clean; full build PASS; migrations +1 (35, status clean).
- New 5P-E tests: tampering (5), races/retention/review-after-revoke/canary (4 added to connections E2E), cascade (1), pre-execute recheck covered by existing cancel tests.
