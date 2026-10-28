# Phase 5S-E — Operational Audit History & Activity Trail

## 1. Executive Summary

Phase 5S-E introduces an auditable, read-only operational activity history (`GET /api/v1/portfolios/:portfolioId/audit-history`) and an interactive timeline in the Web interface (`/portfolio/history?view=activity` and `PortfolioOperationsSection` activity preview).

It solves the user and operator challenge of understanding **what happened, when, to what, why, and by whom** regarding operational actions (imports, reconciliation decisions, transaction rectifications) without mixing or polluting the immutable financial transaction ledger.

> [!NOTE]
> This capability provides an operational activity history over persisted auditable actions; it does not claim to be a retroactive, universal event sourcing layer or complete audit trail of non-persisted system states.

---

## 2. Invariants & Fundamental Principles

### 2.1 Separation of Concerns: Operational History vs. Ledger History
- **Ledger History (`/portfolio/history?view=operations` / `GET /api/v1/portfolios/:portfolioId/operations`):**
  - Contains strictly economic and financial events: `BUY`, `SELL`, `DIVIDEND`, `SPLIT`, `TRANSFER_IN`, etc.
  - Represents the single source of truth for portfolio quantities, positions, cash flows, and tax basis.
- **Operational Audit History (`/portfolio/history?view=activity` / `GET /api/v1/portfolios/:portfolioId/audit-history`):**
  - Contains administrative and operational lifecycle events: `TRANSACTION_RECTIFIED`, `RECONCILIATION_DECISION_RECORDED`, `IMPORT_COMPLETED`, `IMPORT_PARTIAL`, and `IMPORT_FAILED`.
  - Derived on-the-fly across persisted operational tables without mutating or polluting the financial ledger.

### 2.2 Strict Zero Synthetic Data & Terminal Timestamp Fidelity
- Every terminal event MUST have a factual timestamp:
  - `TRANSACTION_RECTIFIED`: `decidedAt`
  - `RECONCILIATION_DECISION_RECORDED`: `decidedAt`
  - `IMPORT_*`: strictly `completedAt` (never `createdAt` as conclusion time; `updatedAt` prohibited)
- If an operational event does not possess an actor, reason, timestamp, or source persisted reliably in the database, the system outputs `null` and the UI renders `"Autor não disponível"` or `"Sem justificativa informada"`.
- If a legacy terminal integration run lacks `completedAt`, it is safely omitted from the chronological feed (never fabricating a terminal timestamp).
- In-flight runs (`STARTED`, `CONFIRMING`, `AWAITING_REVIEW`) are not transformed into synthetic start events (`IMPORT_STARTED` is rejected).
- Connection state transitions are not retroactively fabricated since no event log table exists for integration connections.

### 2.3 Privacy & Attribution Sanitization
- Raw principal IDs (`User.id`, session tokens) are strictly stripped and never leaked in API payloads or UI components.
- When an actor's `principalId` matches the authenticated user, it is presented as `"Você"`. System-driven actions are rendered as `"Sistema"`. Dedicated operators are presented as `"Operador"`. In all unproven or unpersisted cases, `null` is returned (rendered as `"Autor não disponível"`).

### 2.4 Zero Schema Changes & Zero Migrations (Delta = 0)
- Baseline migration count: **43**.
- Post-implementation migration count: **43** (Delta: **0**).
- No new tables, triggers, columns, or Prisma schema changes were introduced.

---

## 3. Architecture & Data Flow

```text
Browser Web Client (/portfolio/history?view=activity)
  │
  ├─► HTTP GET /api/v1/portfolios/:portfolioId/audit-history?limit=25&cursor=...
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

## 4. Multi-Source Event Taxonomy (R2 Aligned)

| Event Type | Category | Source Persistence Model | Target Type | Persisted Values / Metadata | Source Timestamp | User Display Copy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TRANSACTION_RECTIFIED` | `RECTIFICATIONS` | `TransactionRectificationRecord` | `TRANSACTION` | `mode`: `RECTIFY` \| `CANCEL`<br>`reason`: persisted reason string<br>`targetTxId`: replacement or original | `decidedAt` | Title: "Operação retificada" / "Operação cancelada"<br>Motivo: string exata do banco |
| `RECONCILIATION_DECISION_RECORDED` | `RECONCILIATIONS` | `ReconciliationDecisionRecord` | `REVIEW` | `decision`: `CONFIRM_MATCH` \| `NOT_A_MATCH`<br>`source`: provider source<br>`integrationRunId`: run UUID | `decidedAt` | Title: "Reconciliação revisada"<br>Motivo: "Correspondência confirmada" / "Marcado como não correspondente" |
| `IMPORT_COMPLETED` | `IMPORTS` | `IntegrationRun` (`status = 'COMPLETED'`) | `INTEGRATION_RUN` | `source`, `provider`, `recordsFetched`, `confirmed` | `completedAt` (required) | Title: "Importação concluída"<br>Badge: "Concluída" (success) |
| `IMPORT_PARTIAL` | `IMPORTS` | `IntegrationRun` (`status = 'PARTIAL'`) | `INTEGRATION_RUN` | `source`, `confirmed`, `errorCode` | `completedAt` (required) | Title: "Importação concluída parcialmente"<br>Badge: "Parcial" (warning) |
| `IMPORT_FAILED` | `IMPORTS` | `IntegrationRun` (`status = 'FAILED'`) | `INTEGRATION_RUN` | `source`, `errorCode`, `errorMessage` (sanitized) | `completedAt` (required) | Title: "Importação não concluída"<br>Badge: "Não concluída" (negative) |

---

## 5. Deterministic Pagination & Tie-Breaking

- **Cursor Structure:** `base64url(JSON({ at: occurredAt, id: compositeId }))`
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
   - Category filter `Importações` unifies `IMPORT_COMPLETED`, `IMPORT_PARTIAL`, and `IMPORT_FAILED` without fragmentation.
   - Non-gamified semantic status badges: `IMPORT_FAILED` renders with negative/danger styling, never success green.
   - Transparent metadata cards displaying exact economic impact, target links, and actor attribution.
   - Integrated cursor pagination ("Carregar mais atividades").
3. **Activity Preview (`PortfolioOperationsSection.tsx`):**
   - Compact preview block displaying up to 5 recent operational activities directly within the Operations section.
   - Quick action link navigating directly to `/portfolio/history?portfolioId=${portfolioId}&view=activity`.

---

## 7. Known Architectural Limitations

| Action / Entity | Persisted History Available? | Current Audit Status | Future Roadmap Phase |
| :--- | :--- | :--- | :--- |
| **Legacy Terminal Runs without `completedAt`** | `completedAt = null` | Omitted from chronological activity feed (zero timestamp fabrication) | Phase 5S-F |
| **Integration Connection State Changes** | No (only `authorizedAt`, `revokedAt`, `lastCheckedAt` on current row) | Omitted from audit feed (no event log table) | Phase 5S-F (Operational Reliability) |
| **Portfolio Settings Changes** | No (only `updatedAt` on `portfolios` row) | Omitted from audit feed | Future Settings Audit Trail |
| **Account Creation / Archival** | No (only `status` on `accounts` row) | Omitted from audit feed | Future Accounts History |
| **Background Cron Job Executions** | Only terminal `IntegrationRun` rows | In-flight / running states omitted | Phase 5S-F |

---

## 8. Verification & Test Evidence

### 8.1 Automated Test Execution Summary
- **Unit & Strategy Tests:**
  - `tests/portfolio-strategy/portfolio-audit-history.test.ts`: **16/16 PASS**
    - Multi-source composition & global sorting
    - Step 16: `COMPLETED` strictly uses `completedAt` (T2), not `createdAt` (T1)
    - Step 17: `PARTIAL` strictly uses `completedAt` (T2), not `createdAt` (T1)
    - Step 18: `FAILED` strictly uses `completedAt` (T2), not `createdAt` (T1)
    - Step 19: Terminal run lacking `completedAt` is omitted from feed
    - Non-terminal runs skipped (zero synthetic start)
    - Reconciliation enum fidelity (`CONFIRM_MATCH` / `NOT_A_MATCH`)
    - Actor fidelity ("Você", `null`, never false system)
    - Zero raw principal IDs leaked
    - Timestamp ordering & deterministic tie-break
    - Pagination across sources (zero duplicates, zero gaps)
    - Category filter `IMPORTS` covering all 3 run states
    - Operations preview limit <= 5
- **Web Interface Tests:**
  - `tests/web/portfolio-audit-history.test.ts`: **8/8 PASS** (navigation sub-tabs, react query endpoint consumption, category filters, empty state, actor sanitization, reason note box, operations preview, semantic status badges).
- **API Integration Tests:**
  - `tests/api/portfolio-audit-history.test.ts`: **7/7 PASS** (unauthenticated 401, foreign portfolio 404, unified multi-source feed, stable cursor pagination, category filtering, factual partial/failed handling, omission of runs lacking completedAt).
- **Regression Suite:**
  - `tests/api/integration-runs.test.ts`: **10/10 PASS**
  - `tests/api/portfolio-operations.test.ts`: **3/3 PASS**
  - `tests/api/portfolio-maintenance.test.ts`: **4/4 PASS**
  - `tests/api/transaction-rectification.test.ts`: **5/5 PASS**
  - `tests/api/integration-reconciliation-decisions.test.ts`: **4/4 PASS**
  - Total Web Suite (`pnpm test:web`): **515/515 PASS** (73 test files).

### 8.2 Static Analysis & Builds
- **Monorepo Typecheck:** `pnpm typecheck` -> **25/25 packages PASS** (0 errors).
- **Monorepo Lint:** `pnpm lint` -> **PASS** (0 warnings, 0 errors).
- **API Production Build:** `pnpm --filter @atlas/api build` -> **Exit Code 0**.
- **Web Production Build:** `pnpm --filter @atlas/web build` -> **Exit Code 0** (33 routes static/dynamic).
- **Database Migrations Delta:** **0** (remains at exactly 43 migrations).
