# Phase 5V — Notification System Enhancement: Grounded Investor Notification Center

## Executive Summary

Phase 5V introduces a unified, factual, and cross-product Notification Center layer for Project Atlas. Operating strictly as a derived read-model over verified system facts, it aggregates actionable deadlines, pending human reviews, synchronization statuses, operational maintenance alerts, and contribution goals.

Zero spam, zero speculative alerts, zero marketing push, zero AI hallucinations, and zero unverified events.

---

## Architecture Principles

1. **Derived Read-Model (Zero Extra Migrations):**
   - The notification feed is computed live and on-demand from canonical source-of-truth tables (`TaxObligationRecord`, `TaxCompliancePeriodCloseRecord`, `IntegrationRun`, `OperationalAlertEventRecord`, `PortfolioContributionGoal`).
   - No separate duplicate notification storage table was added. Total database migrations remain strictly at 44.
2. **Deterministic Priority Model:**
   - `URGENT`: Overdue fiscal obligations (DARF overdue), blocked tax periods, critical operational engine failures.
   - `ACTION_REQUIRED`: Pending DARFs approaching due date, integration runs awaiting human review (`AWAITING_REVIEW`).
   - `IMPORTANT`: Partial or failed synchronization runs, warnings/drift in portfolio state.
   - `INFO`: Informational reminders such as open contribution goals approaching month-end.
3. **Strict Multi-Tenant Security & Anti-Enumeration Invariant:**
   - Notifications are scoped to the authenticated user (`@CurrentPrincipal()`).
   - Querying a specific `portfolioId` owned by another investor returns strictly `404 Not Found` (`PERSISTENCE.ENTITY_NOT_FOUND`), preventing investor asset or account enumeration.
4. **Clean Presentation & Web UX:**
   - Header popover (`NotificationCenterPopover`) seamlessly integrates into `AppLayout` alongside existing review items.
   - Dynamic badges indicate active action-required and urgent counts.
   - Direct routing to canonical product surfaces (`/tax`, `/reviews/[runId]`, `/portfolio/import`, `/portfolio/maintenance`).
   - Full keyboard accessibility (ESC to close, outside-click listener, standard WAI-ARIA attributes).

---

## Canonical Taxonomy

| Category | Source Engine | Triggers / Events | Priority | Action Target |
| :--- | :--- | :--- | :--- | :--- |
| `FISCAL` | Tax Engine (`@atlas/tax-engine`) | Pending/Overdue DARF obligations, Blocked close period | `URGENT` / `ACTION_REQUIRED` | `/tax` |
| `REVIEW` | Import Engine (`@atlas/import-engine`) | Synchronization run awaiting human review (`AWAITING_REVIEW`) | `ACTION_REQUIRED` | `/reviews/${runId}` |
| `IMPORT` | Integration Runner | Failed or partial run (`FAILED`, `PARTIAL`) | `IMPORTANT` | `/portfolio/import` |
| `RECOVERY` | Operational Alert Registry | Active operational alerts (`status === 'ACTIVE'`) | `URGENT` / `IMPORTANT` | `/portfolio/maintenance` |
| `CONTRIBUTION` | Contribution Planner | Active monthly goal near month-end | `INFO` | `/portfolio/cash-flow` |

---

## Verification & Test Evidence

- **API Integration Tests:** `tests/api/notifications-feed.test.ts` (7 tests, passing)
- **UI View-Model Tests:** `tests/ui/notification-center.view-model.test.ts` (4 tests, passing)
- **Web Surface Tests:** `tests/web/notification-center.test.ts` (5 tests, passing)
- **Web Regression Suite:** `pnpm test:web` (77 test files, 539 tests, passing)
- **AI Explanation Suite:** `pnpm test:ai-explanation` (3 test files, 41 tests, passing)
- **Monorepo Typecheck:** `pnpm typecheck` (25/25 packages successful)
- **Monorepo Linting:** `pnpm lint` (0 errors)
- **API Production Build:** `pnpm --filter @atlas/api build` (0 errors)
- **Web Production Build:** `pnpm --filter @atlas/web build` (0 errors)
