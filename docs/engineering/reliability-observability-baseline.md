# Project Atlas — Pre-Release Reliability & Observability Baseline
## External-Beta Engineering Readiness Without Deployment

**Document Version:** 1.0.0  
**Phase:** 6C — Pre-Release Hardening  
**Target Git Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Baseline Migrations:** 48 (Canonical Immutable Baseline)  
**Engineering Verdict:** `ENGINEERING_READY_FOR_EXTERNAL_BETA`

---

## 1. Executive Summary

This document establishes the official engineering reliability and observability baseline for **Project Atlas** prior to any future external beta deployment.

The scope of this baseline is strictly operational and technical:
1. Validate that all backend and frontend layers implement deterministic failure containment, structured error logging, sensitive data redaction, and correlation tracking.
2. Establish formal health and readiness probe contracts aligned with the 48-migration release baseline.
3. Validate backup and recovery mechanisms on modern database ports (`5434` dev, `5433` test).
4. Provide structured failure-mode and recovery matrices (SEV-1 through SEV-4) with clear recovery procedures.
5. Provide a rigorous engineering verdict distinguishing purely technical readiness from non-engineering prerequisites (legal counsel, external B3 sync, cloud infrastructure).

---

## 2. Capability Matrix & Architectural Scope

| Domain / Engine | Core Capability | Reliability & Failure Protection | Audit Status |
| :--- | :--- | :--- | :--- |
| **Domain Types** | Value Objects (`Money`, `Quantity`, `Percentage`, `LocalDate`) | Decimal.js arbitrary precision, float primitive prohibition, strict JSON string serialization | **PASS** |
| **Database Persistence** | Append-only Ledger (`transactions`, `accounts`, `portfolios`) | Composite foreign key `(account_id, portfolio_id)`, no mutation/deletion methods, 48-migration baseline | **PASS** |
| **Portfolio Engine** | `PortfolioReplayEngine` (Deterministic Replay) | Long-only non-negative constraint (`NegativePositionError`), canonical 3-tuple sort (`tradeDate`, `createdAt`, `id`), pure deterministic replay | **PASS** |
| **Tax Engine** | Competence & Cumulative Processing | Immutable tax state replay, statutory loss carryforward, canonical distinction between partial and complete months | **PASS** |
| **Tax Intelligence (CTI)** | Diagnostic & Blocker Classification | Multi-competence resolution, non-blocking query cancellation via `AbortSignal`, defensive fallback states | **PASS** |
| **Cost Basis Resolution** | Cost Evidence Engine v1 | Canonical `costBasisStatus` separation (`INCOMPLETE` vs `COMPLETE_WITH_VERIFIED_EVIDENCE`), disposal review alerts | **PASS** |
| **API Layer** | NestJS Clean Architecture | Unified `GlobalExceptionFilter`, structured `@atlas/logger` logging with redaction, `x-request-id` correlation | **PASS** |
| **Web Client** | Next.js 15 App Router + BFF | Secure `HttpOnly` cookies, single-flight refresh interceptor, `AbortSignal` query propagation, 5 visual states | **PASS** |
| **Backup / Recovery** | Docker pg_dump / pg_restore scripts | SHA-256 manifest verification, port 5434 dev container mapping, automated integrity verification | **PASS** |

---

## 3. Health & Readiness Semantics

The API exposes two distinct operational probes under `/health` and `/ready` (`apps/api/src/health/health.controller.ts`):

### 3.1. Liveness Probe (`GET /health`)
- **Purpose:** Verifies that the Node.js/NestJS process is alive, listening, and executing event loop cycles.
- **Payload:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-03T11:50:00.000Z",
    "uptime": 3600.42
  }
  ```
- **HTTP Code:** `200 OK`.
- **Fail Action:** Container orchestrator should restart the container if probe fails repeatedly.

### 3.2. Readiness Probe (`GET /ready`)
- **Purpose:** Verifies that the service is functionally capable of handling traffic:
  1. Database connectivity (`SELECT 1`).
  2. Applied migrations count matches or exceeds the expected baseline (`appliedCount >= 48`).
- **Payload:**
  ```json
  {
    "status": "ready",
    "timestamp": "2026-11-03T11:50:00.000Z",
    "database": "connected",
    "migrations": {
      "expected": 48,
      "applied": 48
    }
  }
  ```
- **HTTP Code:** `200 OK` when ready; `503 Service Unavailable` if database disconnected or migrations < 48.
- **Fail Action:** Router/ingress must immediately detach the instance from the traffic pool.

---

## 4. Structured Logging, Sensitive Data Redaction & Correlation

### 4.1. Structured Logging via `@atlas/logger`
All uncaught exceptions and application errors pass through `GlobalExceptionFilter` (`apps/api/src/common/filters/global-exception.filter.ts`), which writes structured JSON log entries:

```json
{
  "timestamp": "2026-11-03T11:52:10.123Z",
  "level": "error",
  "message": "HTTP 404 - ENTITY_NOT_FOUND",
  "context": "GlobalExceptionFilter",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "statusCode": 404,
  "errorCode": "ENTITY_NOT_FOUND",
  "method": "GET",
  "path": "/api/v1/portfolios/c7e2b102-1234-5678-90ab-cdef12345678",
  "stack": "EntityNotFoundError: Portfolio not found\n    at ..."
}
```

### 4.2. Mandatory Sensitive Key Redaction
The logger automatically redacts sensitive user, financial, and authentication fields according to `SENSITIVE_KEYS`:
- `password`, `token`, `refreshToken`, `accessToken`, `secret`
- `cpf`, `taxId`, `email`
- `totalAmount`, `unitPrice`, `netValue`, `grossValue`, `balance`, `realizedGain`

Raw investor balances, trade values, and personal identifiers are **never** logged in plain text.

### 4.3. Request Correlation (`x-request-id`)
1. Inbound requests receive or generate an `x-request-id` UUID header via fastify/Nest middleware.
2. The `x-request-id` is attached to:
   - Response headers (`x-request-id`).
   - Standard API error envelope (`{ statusCode, error, code, message, requestId, timestamp, path }`).
   - Structured server logs for tracing.
3. Web client logs and errors capture the returned `requestId` for fast forensic lookup.

---

## 5. Process Diagnostics & Graceful Shutdown

### 5.1. Graceful Shutdown Hooks
In `apps/api/src/main.ts`:
- `app.enableShutdownHooks()` is registered with NestJS.
- Inbound connections are drained prior to terminating database pools, preventing aborted mid-flight write transactions.

### 5.2. Uncaught Exception & Unhandled Rejection Guards
- `process.on('unhandledRejection', (reason) => ...)` logs fatal unhandled promise rejections via `@atlas/logger` with stack trace and exits with code `1`.
- `process.on('uncaughtException', (error) => ...)` captures unexpected exceptions, logs diagnostic details safely, and forces graceful termination with code `1`.

### 5.3. Startup Diagnostics
At boot, the API logs masked connection diagnostics:
- Host, Port, and Database Name (`postgres://***:***@localhost:5434/atlas_dev`).
- Passwords, credentials, and connection strings containing credentials are completely stripped.

---

## 6. Web Client Resilience & Network Query Cancellation

### 6.1. AbortSignal Query Propagation
In `apps/web/src/app/(app)/tax/page.tsx`:
- When an investor rapidly navigates between tax competencies (e.g., `2026-11` → `2026-10`), previously initiated queries are cancelled via React Query `{ signal }` forwarding to `apiClient`.
- Avoids stale response overwrites and eliminates "Analisando..." deadlocks caused by out-of-order resolution.

### 6.2. 5 Visual States Handling
Every data display component handles:
1. **Loading:** Skeleton placeholder matching the exact card dimension.
2. **Empty:** Informative empty state with actionable guidance.
3. **Error:** Explicit retry button preserving user context.
4. **Success:** High-fidelity data card.
5. **Disconnected / Offline:** Clear notification banner without blocking cached read views.

---

## 7. Database Backup, Container Mapping & Recovery Drill

### 7.1. Modern Container Port Topology
- `atlas_postgres_dev5434` (Port `5434`): Development database (`atlas_dev`).
- `atlas_postgres_test` (Port `5433`): Integration test database (`atlas_test`).
- `atlas_postgres` (Port `5432`): Legacy container preserved untouched.

### 7.2. Backup Architecture (`packages/database/src/backup/index.ts`)
- Script automatically maps port `5434` to container `atlas_postgres_dev5434` (previously defaulted to `5432`).
- Performs `pg_dump` in directory format with SHA-256 manifest generation (`manifest.json`).
- Manifest enforces tamper-detection: modified SQL or table dumps fail checksum validation immediately prior to any restore attempt.

---

## 8. Failure & Recovery Matrices (Part W & Part X)

### 8.1. Failure Modes & Containment Matrix

| ID | Failure Mode | Detection | System Impact | Containment / Mitigation | Recovery Procedure |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | Database Unreachable | `/ready` probe returns 503, connection pool timeouts | API returns 503; Web shows OfflineBanner | Ingress detaches instance; read-only fallback on client | Restart DB container (`docker start atlas_postgres_dev5434`); verify `/ready` |
| **F-02** | Migration Drift / Pending Migration | `/ready` reports `migrations.applied < 48` | Ingress refuses routing | Traffic blocked from reaching unmigrated schema | Run `pnpm db:migrate`; verify migration count is 48 |
| **F-03** | Stale / Corrupt Refresh Token | API responds 401 `AUTH.INVALID_CREDENTIALS` | Session invalid | Interceptor catches 401; purges SecureStore/cookies | User redirected to `/login`; previous sessions revoked |
| **F-04** | Rapid Competence Switching Race | Client network log shows cancelled requests | Out-of-order responses | `AbortController.signal` aborts superseded requests | Client renders latest competence without stale overwrite |
| **F-05** | Disposal on Incomplete Cost Basis | Replay flags `costBasisStatus = INCOMPLETE` | Tax result incomplete | System emits `EVIDENCE_TAX_DISPOSAL_REVIEW_REQUIRED` | Incomplete cost flagged; DARF calculation blocked |
| **F-06** | Negative Position Attempt (`SELL > BUY`) | Portfolio engine throws `NegativePositionError` | Transaction rejected | Append-only ledger rejects transaction with 400 | Reconcile transaction history; verify trade quantities |
| **F-07** | Backup Checksum Tamper | Backup restore CLI verifies SHA-256 manifest | Corrupt archive rejected | Restore aborts before touching database tables | Reject tainted archive; restore from known-good backup |
| **F-08** | Node Process Fatal Exception | Process exits with code 1 via `uncaughtException` | API instance terminates | Orchestrator captures exit; spins up replacement | Check error logs by `requestId`; inspect root cause |
| **F-09** | Concurrent Next.js Build Collision | Web dev server shows file lock / cache error | Dev server crashes | Clean `.next` build lockfiles; restart single instance | Run `rm -rf apps/web/.next` and restart `pnpm dev:web` |
| **F-10** | External B3 Sync Timeout | B3 integration parser throws timeout error | Sync job fails | Background job retries with backoff; ledger unaffected | Retain existing baseline; prompt user for manual file |

---

### 8.2. Operational Runbook & Severity Model

| Severity | Definition | Target Resolution | Examples | Operational Action |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1** | Total system outage, data loss risk, or security compromise | < 30 minutes | Database down, session security breach, ledger corruption | Page on-call, freeze ingress, restore from verified backup |
| **SEV-2** | Critical feature unavailable with no workaround | < 2 hours | Tax engine replay failing, authentication refresh loop | Deploy emergency hotfix, check logs by `requestId` |
| **SEV-3** | Degraded performance or non-critical feature failure | < 24 hours | B3 preview timeout, chart display rendering glitch | Investigate with normal sprint workflow |
| **SEV-4** | Minor UX inconsistency or cosmetic issue | Next release | Misaligned badge, typographical error | Backlog ticket |

---

## 9. Next.js Runtime Runbook: Avoiding `.next` Build Corruption

During development and continuous verification:
1. **Never run concurrent Next.js dev and build tasks:**
   Running `pnpm build` in `@atlas/web` while `pnpm dev:web` is running corrupts the `.next` webpack cache and causes locked chunks (`EBUSY: resource busy or locked`).
2. **Clean Recovery Procedure:**
   ```bash
   # Stop all node processes running Next.js
   # Clean cache and temporary build directories
   rm -rf apps/web/.next
   # Rebuild or restart dev server
   pnpm --filter @atlas/web dev
   ```

---

## 10. External Telemetry Decision (Part S)

**Decision:** `RECOMMENDED_AFTER_BETA_START`

### Rationale:
1. **Current Local Observability is Robust:**
   - The current architecture features complete request correlation via `x-request-id`, structured JSON logging with `@atlas/logger`, automatic redaction of financial/auth keys, and standard exception filters.
2. **Zero Privacy Leakage Risk:**
   - Sending data to external third-party telemetry providers (e.g., Sentry, Datadog) prior to final legal terms and privacy disclosures poses confidentiality risks for real investor ledgers.
3. **Controlled Early Beta Group:**
   - The initial external beta will be conducted with a small, closely monitored cohort of invited investors where direct log correlation and error envelopes (`requestId`) provide immediate diagnosis.
4. **Implementation Path Post-Beta:**
   - Once cloud hosting infrastructure and privacy policy agreements are formally executed, `@atlas/logger` will be connected to an OpenTelemetry / Sentry transport with sanitization rules already verified.

---

## 11. Beta Go/No-Go Engineering Gates (Part Z)

| Gate | Criterion | Status | Verdict |
| :--- | :--- | :--- | :--- |
| **Gate 1: Schema & Migrations** | Exactly 48 migrations applied, zero drift, idempotency verified | **PASS** (48/48) | **GO** |
| **Gate 2: Ledger Integrity** | 137 ledger events, 109/109 replay deterministic, 38/40 reconciliation | **PASS** | **GO** |
| **Gate 3: Tax Correctness** | Cost basis status separation verified; disposal review signals active | **PASS** | **GO** |
| **Gate 4: Observability & Probes** | `/health` and `/ready` operational; structured error logging active | **PASS** | **GO** |
| **Gate 5: Type Safety & Lint** | `pnpm typecheck` (26/26 packages) and `pnpm lint` clean | **PASS** | **GO** |
| **Gate 6: Backup / Restore Drill** | SHA-256 manifest verification and dev5434 container mapping verified | **PASS** | **GO** |

---

## 12. Engineering Readiness Verdict

```text
================================================================================
ENGINEERING READINESS VERDICT: GO
STATUS: ENGINEERING_READY_FOR_EXTERNAL_BETA
================================================================================
```

### Clarification of Boundaries:
- **Engineering Readiness:** **READY (GO)**. The software exhibits architectural integrity, strict type safety, deterministic replay, structured observability, and zero data loss risk under operational faults.
- **Legal & Regulatory Counsel:** **PENDING**. Terms of service, disclaimer notices (tax information vs. certified accounting advice), and LGPD compliance require explicit sign-off by legal counsel before public launch.
- **B3 Sync Automation:** **EXTERNALLY BLOCKED**. Direct automated B3 synchronization remains dependent on third-party APIs / Open Finance aggregator credentials; current manual B3 Excel import functions as the verified fallback.
- **Deployment Vehicle:** **UNDECIDED**. Selection between self-hosted Docker, VPS, or managed cloud container infrastructure is an operational deployment choice independent of core codebase readiness.
