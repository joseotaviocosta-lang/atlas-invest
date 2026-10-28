# Phase 5S-E-R2 — Terminal Timestamp Fidelity Closure Report

## 1. Executive Summary

Phase 5S-E-R2 delivers the definitive closure on **terminal timestamp fidelity** for the operational audit history (`GET /api/v1/portfolios/:portfolioId/audit-history`).

It addresses the fundamental question:
> **Does every terminal IntegrationRun have a reliable `completedAt` timestamp?**

The audit of schema contracts, database writers, and existing records established **CASE A (`TERMINAL_RUN_REQUIRES_COMPLETED_AT`)**:
- All current terminal writers (`recordConfirmation`, `recordFailure`) persist `status` and `completedAt: new Date()` atomically in the same SQL statement.
- The audit composer was updated to strictly require `run.completedAt` for all terminal import events (`IMPORT_COMPLETED`, `IMPORT_PARTIAL`, `IMPORT_FAILED`).
- The fallback `completedAt ?? createdAt` was completely eliminated: `createdAt` is never transformed or presented as if it were a completion timestamp.
- In-flight or corrupt/legacy rows lacking `completedAt` are safely omitted from the chronological activity feed without fabricating synthetic conclusion timestamps.

---

## 2. Schema Contract & Semantics

| Field | Prisma Type | Lifecycle Semantics | Permitted as Terminal Event Timestamp? |
| :--- | :--- | :--- | :--- |
| `createdAt` | `DateTime @default(now())` | System audit timestamp of initial row creation | **NO** (creation is not conclusion) |
| `startedAt` | `DateTime @default(now())` | Timestamp when ingestion processing was started | **NO** (start is not conclusion) |
| `completedAt` | `DateTime?` | Set strictly upon transition to `COMPLETED`, `PARTIAL`, or `FAILED` | **YES** (truthful conclusion instant) |
| `updatedAt` | `DateTime @updatedAt` | Technical record update audit timestamp | **NO** (prohibited approximation) |

---

## 3. Terminal Writers Audit

Every code path writing a terminal status was audited:

| Status | Writer Method | File Location | Atomically Sets `completedAt`? | Can `completedAt` Be Null? |
| :--- | :--- | :--- | :--- | :--- |
| `COMPLETED` | `IntegrationRunRepository.recordConfirmation` | `packages/database/src/repositories/integration-run.repository.ts:190` | **YES** (`completedAt: new Date()`) | No |
| `PARTIAL` | `IntegrationRunRepository.recordConfirmation` | `packages/database/src/repositories/integration-run.repository.ts:190` | **YES** (`completedAt: new Date()`) | No |
| `FAILED` | `IntegrationRunRepository.recordFailure` | `packages/database/src/repositories/integration-run.repository.ts:217` | **YES** (`completedAt: new Date()`) | No |

All terminal status updates occur through these repository methods, ensuring atomic persistence with `completedAt`.

---

## 4. Database Reality Audit

Querying the local dev PostgreSQL database (`atlas_dev`) in read-only mode yielded:

```json
{
  "COMPLETED": {
    "total": 0,
    "completedAtNull": 0
  },
  "PARTIAL": {
    "total": 0,
    "completedAtNull": 0
  },
  "FAILED": {
    "total": 0,
    "completedAtNull": 0
  },
  "OTHER": {}
}
```

Zero terminal records exist in the database with `completedAt = null`.

---

## 5. Contract Classification & Design Decisions

### Classification: CASE A (`TERMINAL_RUN_REQUIRES_COMPLETED_AT`)
- **Old Behavior:** `const occurredAtDate = run.completedAt ?? run.createdAt;` (potentially fabricating a conclusion timestamp from `createdAt`).
- **Final Behavior:**
  - `occurredAt = run.completedAt.toISOString()`.
  - If `!run.completedAt`, the run is safely omitted from the chronological feed (`continue;`).
  - Repository `listForAudit` filters `completedAt: { not: null }` and orders strictly by `completedAt: 'desc'`.
  - Cursor pagination operates directly on `completedAt`.

---

## 6. Pagination & Cursor Stability

- Composite IDs remain `run:${run.id}`.
- Global ordering across sources: `(occurredAt DESC, id DESC)`.
- Tie-breaking: strict lexicographical `id.localeCompare()`.
- Repository ordering aligned with audit ordering: `orderBy: [{ completedAt: 'desc' }, { id: 'desc' }]`.
- Multi-page pagination tests confirm zero duplicates and zero gaps.

---

## 7. Known Limitations Documented

1. **Legacy Terminal Runs:** Legacy rows lacking a persisted terminal timestamp (`completedAt = null`) are not represented in the chronological operational activity feed.
2. **In-Flight Runs:** Active runs (`STARTED`, `CONFIRMING`, `AWAITING_REVIEW`) are excluded until they reach a terminal conclusion.

---

## 8. Verification & Test Evidence

### 8.1 Automated Test Execution Summary
- **Unit & Strategy Tests:** `tests/portfolio-strategy/portfolio-audit-history.test.ts` (16/16 PASS)
  - Step 16: `COMPLETED` strictly uses `completedAt` (T2), not `createdAt` (T1)
  - Step 17: `PARTIAL` strictly uses `completedAt` (T2), not `createdAt` (T1)
  - Step 18: `FAILED` strictly uses `completedAt` (T2), not `createdAt` (T1)
  - Step 19: Terminal run lacking `completedAt` is omitted from feed
- **API Integration Tests:** `tests/api/portfolio-audit-history.test.ts` (7/7 PASS)
  - Omission of terminal runs lacking `completedAt` verified against live database.
- **Web Interface Tests:** `tests/web/portfolio-audit-history.test.ts` (8/8 PASS)
- **Lifecycle & Persistence Tests:**
  - `tests/api/integration-runs.test.ts`: 10/10 PASS
  - `tests/api/portfolio-operations.test.ts`: 3/3 PASS
  - `tests/api/portfolio-maintenance.test.ts`: 4/4 PASS
  - `tests/api/transaction-rectification.test.ts`: 5/5 PASS
  - `tests/api/integration-reconciliation-decisions.test.ts`: 4/4 PASS
- **Full Web Suite:** `pnpm test:web`: 515/515 PASS (73/73 test files).

### 8.2 Static Analysis & Quality Gates
- **Monorepo Typecheck:** `pnpm typecheck` -> **25/25 packages PASS** (0 errors).
- **Monorepo Lint:** `pnpm lint` -> **PASS** (0 warnings, 0 errors).
- **API Build:** `pnpm --filter @atlas/api build` -> **Exit Code 0**.
- **Web Build:** `pnpm --filter @atlas/web build` -> **Exit Code 0** (33 routes static/dynamic).
- **Database Migrations Delta:** **0** (baseline 43 migrations preserved).
- **B3 Status:** Unchanged (`ENGINEERING_READY_FOR_CERT`, `CERT_ACCESS_BLOCKED`, `PREPARING`).
