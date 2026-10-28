# Phase 5S-E-R1 — Semantic Integrity & Audit Fidelity Closure Report

## 1. Executive Summary

Phase 5S-E-R1 resolves semantic fidelity gaps and ensures that **every operational audit event says exactly what persisted data proves**.

The audit feed (`GET /api/v1/portfolios/:portfolioId/audit-history`) was systematically reviewed across:
1. **Import Event Semantics:** Replaced ambiguous/synthetic states with strict terminal mappings (`IMPORT_COMPLETED`, `IMPORT_PARTIAL`, `IMPORT_FAILED`). Eliminated synthetic start events (`IMPORT_STARTED` removed; in-flight runs skipped).
2. **Reconciliation Vocabulary:** Aligned domain vocabulary to strictly persisted database facts (`CONFIRM_MATCH` and `NOT_A_MATCH`), eradicating speculative nomenclature.
3. **Actor Attribution:** Enforced evidence-based attribution: "Você" strictly when principal matches authenticated user; "Sistema" strictly when proven by cron/trigger/contract; `null` ("Autor não disponível") for unprovable actors. Eliminated "Usuário" guessing or false "Sistema".
4. **Timestamp Fidelity:** Mapped timestamps strictly to completion/decision instants (`decidedAt` for rectifications and reconciliation decisions; `completedAt ?? createdAt` for integration runs; never `updatedAt`).
5. **Cursor Stability & Pagination:** Verified that event identities (`rect:${id}`, `decision:${id}`, `run:${id}`) and tie-break ordering `(occurredAt DESC, id DESC)` maintain zero duplicates and zero gaps across pages.

---

## 2. Issues Audited & Resolutions

### Issue A: Import Event Semantics
- **Discovery:** `IntegrationRun.status` supports `'STARTED' | 'AWAITING_REVIEW' | 'CONFIRMING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'`.
- **Finding:** A generic `IMPORT_STARTED` event had previously been synthesized for non-terminal runs, and in-progress/review states leaked into the activity feed.
- **Resolution:**
  - `status = 'COMPLETED'` -> `IMPORT_COMPLETED` (Title: "Importação concluída").
  - `status = 'PARTIAL'` -> `IMPORT_PARTIAL` (Title: "Importação concluída parcialmente").
  - `status = 'FAILED'` -> `IMPORT_FAILED` (Title: "Importação não concluída").
  - In-flight runs (`STARTED`, `CONFIRMING`, `AWAITING_REVIEW`) are skipped.
  - Safe error codes (`errorCode`) and sanitized error messages are surfaced without exposing internal stack traces or secrets.

### Issue B: Reconciliation Decision Vocabulary
- **Discovery:** In `schema.prisma`, `packages/database`, and `@atlas/portfolio-strategy`, `ReconciliationDecisionRecord.decision` is strictly constrained to `CONFIRM_MATCH` or `NOT_A_MATCH`.
- **Finding:** Phase 5S-E documentation narrative mistakenly referred to hypothetical terms (`LINK`, `CREATE_LOCAL`, `DISMISS`, `KEEP_SEPARATE`).
- **Resolution:**
  - Audited code confirmed the domain engine already enforced `CONFIRM_MATCH` and `NOT_A_MATCH`.
  - Updated API DTO, documentation, and UI display mappings to strictly match `CONFIRM_MATCH` ("Correspondência confirmada") and `NOT_A_MATCH` ("Marcado como não correspondente").

### Issue C: Actor Attribution Matrix
- **Matrix:**

| Source Model | Actor Field | Persisted Value | Can Map to "Você"? | Can Prove "Sistema"? | Can Prove "Operador"? | Fallback / UI Display |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TransactionRectificationRecord` | `decidedByPrincipal` | String (UUID / system / operator) | Yes (when `== currentUserId`) | Yes (when `system`, `cron`, `scheduler`) | Yes (when `operator:*`, `op_*`) | `null` -> "Autor não disponível" |
| `ReconciliationDecisionRecord` | `decidedByPrincipal` | String (UUID / system / operator) | Yes (when `== currentUserId`) | Yes (when `system`, `cron`, `scheduler`) | Yes (when `operator:*`, `op_*`) | `null` -> "Autor não disponível" |
| `IntegrationRun` | `trigger` | String? (`MANUAL` / `SCHEDULED` / null) | No (no user UUID stored) | Yes (when `trigger === 'SCHEDULED'`) | No | `null` -> "Autor não disponível" |

### Issue D: Timestamp Fidelity
- `TRANSACTION_RECTIFIED`: Uses `decidedAt` (exact instant of user/operator rectification).
- `RECONCILIATION_DECISION_RECORDED`: Uses `decidedAt` (exact instant of match review).
- `IMPORT_COMPLETED`, `IMPORT_PARTIAL`, `IMPORT_FAILED`: Uses `completedAt` (instant of execution conclusion; never `updatedAt` and never `createdAt` as conclusion time; rows lacking `completedAt` are safely omitted per Phase 5S-E-R2).

### Issue E: Pagination & Cursor Stability
- Item composite IDs are strictly derived from source record UUIDs (`rect:${id}`, `decision:${id}`, `run:${id}`).
- Because composite IDs do not embed `eventType`, fixing event taxonomy did not alter item identities.
- Pagination sort is globally deterministic: `(occurredAt DESC, compositeId DESC)`. Verified 100% stable without duplicates or omissions across multiple pages.

---

## 3. Web Surface Refinements

- Added semantic status badges in `PortfolioAuditTimeline.tsx`:
  - `IMPORT_COMPLETED`: "Concluída" (`variant="success"`).
  - `IMPORT_PARTIAL`: "Parcial" (`variant="warning"`).
  - `IMPORT_FAILED`: "Não concluída" (`variant="negative"` - negative/danger styling, never green).
- Toolbar tab `Importações` encompasses `COMPLETED`, `PARTIAL`, and `FAILED` seamlessly.
- Missing actors consistently render as `"Autor não disponível"`.

---

## 4. Verification Evidence

- **Unit Tests:** `tests/portfolio-strategy/portfolio-audit-history.test.ts` (12/12 PASS).
- **Web Tests:** `tests/web/portfolio-audit-history.test.ts` (8/8 PASS).
- **API Tests:** `tests/api/portfolio-audit-history.test.ts` (6/6 PASS).
- **Regression Suite:** 16/16 PASS across 4 files (`portfolio-operations`, `portfolio-maintenance`, `transaction-rectification`, `integration-reconciliation-decisions`).
- **Full Web Suite:** `pnpm test:web` (515/515 PASS across 73 test files).
- **Monorepo Typecheck:** `pnpm typecheck` (25/25 packages PASS).
- **Monorepo Lint:** `pnpm lint` (0 errors, 0 warnings).
- **API Build:** `pnpm --filter @atlas/api build` (Exit code 0).
- **Web Build:** `pnpm --filter @atlas/web build` (Exit code 0, 33 static/dynamic routes).
- **Git Diff Check:** `git diff --check` (Clean, exit code 0).
- **Database Migrations:** Exactly 43 migrations before and after (Delta = 0).
- **B3 Status:** Unchanged (`ENGINEERING_READY_FOR_CERT`, `CERT_ACCESS_BLOCKED`, `PREPARING`).
