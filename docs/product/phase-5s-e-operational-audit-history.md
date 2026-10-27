# Phase 5S-E — Operational Audit Trail & Change History

## 1. Executive Summary

Phase 5S-E introduces an auditable, read-only operational activity feed (`GET /api/v1/portfolios/:portfolioId/audit-history`) and an interactive timeline in the Web interface (`/portfolio/history?view=activity` and `PortfolioOperationsSection` activity preview).

It solves the user and operator challenge of understanding **what happened, when, to what, why, and by whom** regarding operational changes (imports, reconciliation decisions, transaction rectifications) without mixing or polluting the immutable financial transaction ledger.

---

## 2. Invariants & Fundamental Principles

### 2.1 Separation of Concerns: Operational History vs. Ledger History
- **Ledger History (`/portfolio/history?view=ledger` / `GET /api/v1/portfolios/:portfolioId/operations`):**
  - Contains strictly economic and financial events: `BUY`, `SELL`, `DIVIDEND`, `SPLIT`, `TRANSFER_IN`, etc.
  - Represents the single source of truth for portfolio quantities, positions, cash flows, and tax basis.
- **Operational Audit History (`/portfolio/history?view=activity` / `GET /api/v1/portfolios/:portfolioId/audit-history`):**
  - Contains administrative and operational lifecycle events: `TRANSACTION_RECTIFIED`, `RECONCILIATION_DECISION_RECORDED`, and `IMPORT_COMPLETED`.
  - Derived on-the-fly across persisted operational tables without mutating or polluting the financial ledger.

### 2.2 Strict Zero Synthetic Data & No Inferred Facts Policy
- If an operational event does not possess an actor, reason, timestamp, or source persisted reliably in the database, the system outputs `null` and the UI renders `"Autor não disponível"` or `"Sem justificativa informada"`.
- Missing historical facts are never synthesized, guessed, or backfilled artificially.
- Connection state transitions are not retroactively fabricated since no event log table exists for integration connections.

### 2.3 Privacy & Attribution Sanitization
- Raw principal IDs (`User.id`, session tokens) are strictly stripped and never leaked in API payloads or UI components.
- When an actor's `principalId` matches the authenticated user, it is presented as `"Você"`. System-driven actions are rendered as `"Sistema"`. In other cases, `"Operador"` or `null` is returned.

### 2.4 Zero Schema Changes & Zero Migrations (Delta = 0)
- Baseline migration count: **43**.
- Post-implementation migration count: **43** (Delta: **0**).
- No new tables, triggers, columns, or Prisma schema changes were introduced.

---

## 3. Architecture & Data Flow

```text
Browser Web Client (/portfolio/history?view=activity)
  │
  ├─► HTTP GET /api/v1/portfolios/:portfolioId/audit-history?limit=20&cursor=...
  │     │
  │     ▼
  │   PortfolioAuditHistoryController
  │     │
  │     ▼
  │   GetPortfolioAuditHistoryUseCase (Ownership & Tenant Guard)
  │     │
  │     ▼
  │   composePortfolioAuditHistory
  │     │
  │     ├─► Concurrent Bounded Fetch (limit + 1 per source):
  │     │     ├─► TransactionRectificationRepository.listByPortfolio(portfolioId, cursorTimestamp, take)
  │     │     ├─► ReconciliationDecisionRepository.listByPortfolio(portfolioId, cursorTimestamp, take)
  │     │     └─► IntegrationRunRepository.listForAudit(portfolioId, cursorTimestamp, take)
  │     │
  │     ├─► Batch Resolution (Zero N+1):
  │     │     ├─► TransactionRepository.findByIds(affectedTxIds)
  │     │     └─► AssetRepository.findByIds(assetIds) -> Asset Tickers
  │     │
  │     ├─► Cursor Filter & Global Deterministic Sort:
  │     │     └─ (occurredAt DESC, compositeId DESC)
  │     │
  │     └─► Page Slice & Pagination Meta:
  │           └─ items (<= limit), nextCursor (base64url), hasMore
```

---

## 4. Multi-Source Event Taxonomy

| Event Type | Category | Source Persistence Model | Target Type | Details Captured |
| :--- | :--- | :--- | :--- | :--- |
| `TRANSACTION_RECTIFIED` | `CORRECTION` | `TransactionRectificationRecord` | `TRANSACTION` | Mode (`AMEND` / `VOID`), reason, original tx ID, replacement tx ID, asset ticker |
| `RECONCILIATION_DECISION_RECORDED` | `RECONCILIATION` | `ReconciliationDecisionRecord` | `RECONCILIATION_ITEM` | Decision (`LINK` / `CREATE_LOCAL` / `DISMISS` / `KEEP_SEPARATE`), source provider, run ID, transaction link |
| `IMPORT_COMPLETED` | `IMPORT` | `IntegrationRun` | `INTEGRATION_RUN` | Status (`COMPLETED` / `PARTIAL` / `FAILED`), provider, confirmed count, trigger, error code |

---

## 5. Deterministic Pagination & Tie-Breaking

- **Cursor Structure:** `base64url(occurredAt + ":" + id)`
- **Comparison Rule (`isAfterCursor`):**
  1. An item is strictly older if `occurredAt < cursor.occurredAt`.
  2. If timestamps are identical (`occurredAt === cursor.occurredAt`), strict lexicographical tie-break is applied: `id.localeCompare(cursor.id) < 0`.
- **Repository Bound:**
  - Repositories query records with `timestamp <= cursor.occurredAt` with `take: limit + 1`.
  - Exact candidate elimination is performed in memory by the composer, ensuring no duplicates or skipped rows across mixed sources.

---

## 6. User Interface Components

1. **Sub-Tab Switcher (`apps/web/src/app/(app)/portfolio/history/page.tsx`):**
   - Introduces URL-synchronized sub-tabs:
     - `Operações` (`?view=operations` / default) -> `PortfolioOperationsSection`
     - `Atividade` (`?view=activity`) -> `PortfolioAuditTimeline`
2. **Interactive Timeline (`apps/web/src/components/portfolio/PortfolioAuditTimeline.tsx`):**
   - Category filters: `Todos`, `Importações`, `Conciliações`, `Correções`.
   - Distinct category badges with semantic token styling.
   - Transparent metadata cards displaying exact economic impact, target links, and actor attribution.
   - Integrated cursor pagination ("Carregar mais").
3. **Activity Preview (`PortfolioOperationsSection.tsx`):**
   - Compact preview block displaying up to 5 recent operational activities directly within the Operations section.
   - Quick action link navigating directly to `/portfolio/history?view=activity`.

---

## 7. Verification & Test Evidence

### 7.1 Automated Test Execution Summary
- **Unit & Strategy Tests:**
  - `tests/portfolio-strategy/portfolio-audit-history.test.ts`: **8/8 PASS** (empty sources, multi-source merging, deterministic ordering, cursor pagination, actor masking, reason preservation, category filtering, zero N+1 efficiency).
- **Web Interface Tests:**
  - `tests/web/portfolio-audit-history.test.ts`: **7/7 PASS** (rendering events, category badge filters, actor sanitization, empty state, pagination trigger, operations preview).
- **API Integration Tests:**
  - `tests/api/portfolio-audit-history.test.ts`: **5/5 PASS** (401 unauthenticated, 404 cross-portfolio isolation, deterministic multi-source feed, cursor pagination, operations preview integration).
- **Regression Suite:**
  - `tests/api/portfolio-operations.test.ts`: **3/3 PASS**
  - `tests/api/portfolio-maintenance.test.ts`: **4/4 PASS**
  - `tests/api/transaction-rectification.test.ts`: **5/5 PASS**
  - `tests/api/integration-reconciliation-decisions.test.ts`: **4/4 PASS**
  - `tests/tax-engine/equity-monthly-tax-core.test.ts`: **14/14 PASS**
  - Total Full Web Suite (`pnpm test:web`): **514/514 PASS** (73 test suites).

### 7.2 Static Analysis & Builds
- **Monorepo Typecheck:** `pnpm typecheck` -> **25/25 packages PASS** (0 errors).
- **Monorepo Lint:** `pnpm lint` -> **PASS** (0 warnings, 0 errors).
- **API Production Build:** `pnpm --filter @atlas/api build` -> **Exit Code 0**.
- **Web Production Build:** `pnpm --filter @atlas/web build` -> **Exit Code 0** (33 routes static/dynamic).
- **Database Migrations Delta:** **0** (remains at exactly 43 migrations).
