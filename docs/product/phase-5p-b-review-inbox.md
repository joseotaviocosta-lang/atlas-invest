# Phase 5P-B — Review Inbox & Integration Notifications

Status: foundation complete. External notifications (email/push/SMS/WhatsApp) explicitly out of scope. B3 CERT (5P) stays blocked.

## Purpose

Turn `AWAITING_REVIEW` runs, failures and reconciliation gaps into a single
actionable surface: which portfolio needs attention, why, and where to
resolve it. Nothing is auto-imported; the inbox only points at human
review.

## Derivation rules

```text
IntegrationRun rows (per user portfolios, newest-first)
  → deriveReviewItems (pure, import-engine)
  → IntegrationReviewItem (actionable only)
```

Actionability:

- `AWAITING_REVIEW` + ≥1 reason → actionable (`REVIEW` when only new
  records, `WARNING` otherwise).
- `AWAITING_REVIEW` with zero reasons (exact duplicates only, matched-only
  reconciliation) → not actionable.
- `FAILED` → actionable `ERROR`, unless a NEWER run for the same
  `(portfolio, source)` exists. The newest execution is the current
  situation; older failures stay in history but leave the inbox. At most
  one actionable failure per integration. Presentational correlation only.
- `COMPLETED` / `PARTIAL` / `STARTED` / `CONFIRMING` → never items.

Superseded/quiet/completed runs resolve in detail as `RESOLVED` with
`CONFIRMED` / `SUPERSEDED` / `NO_ACTION` / `IN_PROGRESS` — stale links
explain themselves instead of 404ing.

## Severity

- `REVIEW` — new records awaiting confirmation.
- `WARNING` — probable duplicates, conflicts, unsupported records, partial
  sync, reconciliation divergence/gaps.
- `ERROR` — failed execution.

Sort: severity rank desc, blocking conflict/divergence first, recency
desc, id asc. Severity is always text-labeled, never color-only.

## Actionability

Every item carries `action: { kind, runId, portfolioId }`:
`REVIEW_RUN` → "Revisar", `VIEW_RUN` → "Ver detalhes". Web resolves to
`/portfolio/import?portfolioId=&runId=` (the hub preselects the run via
the `runId` param). Both land on functional surfaces — never dead ends.

## Resolution rules

- Confirm (human) → run terminal → item disappears; list + badge refresh
  via query invalidation (no full reload).
- Failure + newer execution → failure superseded (history preserved).
- Viewing never resolves: `read` is presentation, `resolved` is situational.
- No dismiss/snooze in this phase (explicit non-goal).

## Scheduled run behavior

Scheduled runs surface like manual ones with the `Agendada` origin badge.
The item never claims frozen candidates: review flows through a fresh
preview/sync (idempotent by fingerprint), and confirmation stays human.
A stale item whose fresh preview shows no work resolves to `NO_ACTION`
once its run reaches a terminal or reason-free state.

## Fresh-preview semantics

Candidates are not persisted (5P-A decision). The CTA triggers a new
idempotent preview/sync; dedupe makes re-execution safe. Copy never says
"these exact N operations are frozen waiting".

## Failure recovery

Recovery correlation is `(portfolio, source)` + recency: any newer run
suppresses an older failure item. No invented `retryOfRunId`. Ambiguous
cases keep the failure visible; the run history is the audit trail.

## Ownership

All reads scope to the principal's portfolios (`findByUserId` → ids).
Foreign runs/portfolios/cursors → 404, never 403. Portfolio names come
from the same owned set (no cross-tenant leakage).

## Pagination, sorting, filters

Keyset cursor over raw runs (`createdAt desc, id desc`), opaque to
clients; forged cursors → 404. Fixed sort (severity → blocking →
recency). Filters: `Todas | Revisão | Avisos | Falhas` (+ portfolio
scope). Severity filters apply within the fetched window; `hasMore`
tracks raw availability.

## Pending count

`GET /count` derives from a bounded 200-row recent window (no full
scan); `truncated` flags the bound. Badge + Today card poll conservatively
(staleTime 60s, refetch on focus, invalidate after confirm) — no
aggressive polling, no WebSocket.

## Future external notifications

`IntegrationAttentionEventV1` (`version/type/portfolioId/runId/severity/
occurredAt/summaryCode`) is built purely from items so a future email/push
phase never interprets the DB directly. Nothing is sent in this phase: no
SMTP, push provider, webhook, or mobile push SDK path.

## Verification

- `pnpm test:import-engine` — derivation incl. review-inbox.test.ts (9 tests).
- `tests/database` — no new migration; schema has no inbox tables
  (architecture-guarded); existing suites unaffected.
- `tests/api/integration-reviews.test.ts` — 11 E2E (rules, severity,
  order, failure/supersede, resolved states, ownership, pagination,
  filters, count, post-confirm disappearance, safe shape, triggers).
- `pnpm test:web` — `tests/web/review-inbox.test.ts` (12 tests:
  view-model + page/header/today/import surfaces, no financial math,
  no internals leak).
- `pnpm test:mobile` — `tests/mobile/review-inbox.test.ts` (4 tests:
  read-only screen, endpoint, states, Today entry).
- `pnpm test:architecture` — review-inbox-boundaries.test.ts (5 tests:
  engine purity, no ledger/B3/fiscal/UI/math in the path, no mail/queue
  deps, no inbox tables, ownership guards).
- Regression: scheduler, run-history, CSV, B3 simulated/transport suites
  run in the standard gates.
