# Phase 5S-A — Portfolio Operations Center

Single read-only operational view per portfolio. Answers what needs
attention, which syncs/reviews diverge, which positions lack data and
what the recent activity was — aggregating existing sources, never a
new operational system.

## Purpose

Surface operational facts in one place with safe navigation. The
center repairs nothing, syncs nothing, decides nothing. Investment
quality is out of scope: operations status is never portfolio quality.

## Aggregated sources

- Integration settings (`IntegrationSettingsService.getSettings`):
  per-source connection state, schedule, last run, last successful run,
  availability, provider/environment, status. Ownership-gated.
- Recent runs (`listRecentByPortfolioIds`, bounded 10): activity feed
  and review preview window.
- Review derivation (`deriveReviewItems` over the same window):
  actionable items preview (bounded 5).
- 5R-E data-quality composition (reused `composePortfolioDataQuality`):
  positions, reconciliation summary, pending reviews, status.

No HTTP-to-HTTP composition: the application layer composes use-case
and repository reads directly.

## Status derivation

`CLEAR` (no attention items), `ATTENTION_REQUIRED` (any REVIEW/INFO
item), `BLOCKED` (any BLOCKING item — only blocking data-quality
issues block; failed runs require review but never block metrics).
Deterministic, no timestamps, no scores.

## Attention model

Items carry `{ code, domain, severity, count, facts, actions }` with
dedicated codes: `SYNC_FAILED`, `SYNC_PARTIAL` (latest run per source),
`CONNECTION_NEEDS_REAUTH`, `PENDING_REVIEWS`, `RECONCILIATION_*` (one
per problem state with counts), and one item per data-quality code
grouped across positions with affected-position counts.

Deduplication policy: one item per operational fact. AWAITING_REVIEW
latest runs are covered by the `PENDING_REVIEWS` aggregate (no double
count). Reconciliation states come from the shared summary (no second
count next to 5R-E). Portfolio-level quality reconciliation facts are
not re-emitted as data-quality attention (position-level issues only).
`MATCHED` is an aggregate count, never an item.

Ordering is deterministic: severity, domain
(SYNC, INTEGRATION, RECONCILIATION, DATA_QUALITY), code, source.
Preview returns top 5 plus the total count.

## Integration states

Factual per-source cards: provider, environment (SIMULATED), connection
state, schedule cadence (or "sem agendamento"), last run status, last
successful run date. `B3 CERT` preparing/unavailable availability is a
structural note ("Integração em preparação"), never a user failure and
never attention. Missing connections, manual schedules and clean runs
produce nothing.

## Run history

Bounded recent activity (10): source, status, trigger, date, new and
confirmed counts. No technical IDs, no synthetic events — only
persisted runs, newest first. Failed and partial latest runs generate
attention with history navigation; completed runs appear only as
activity.

## Review/reconciliation

Reconciliation summary reuses the 5R-E numbers exactly (same composer:
matched/divergent/missingLocal/missingSource/unresolved/pendingReviews
plus the 200-row truncation flag). Review preview lists up to 5
actionable items (source, status, severity, reason codes) with inbox
navigation. No resolution workflow is duplicated here.

## Data quality

5R-E status, counts and domain breakdown, reused verbatim (consistency
is structural, asserted by API tests). The card links to the full
quality surface; per-position issues are not duplicated in the center.

## Structural limitations

Issuer/sector gaps and B3 CERT preparation stay out of the attention
count. Shown separately where relevant (integration card note);
operations status never reflects them.

## Actions/navigation

v1 actions are navigation only: `VIEW_REVIEWS` (reviews inbox),
`VIEW_DATA_QUALITY` (portfolio overview), `VIEW_INTEGRATION_SETTINGS`,
`VIEW_RUN_HISTORY`, `VIEW_IMPORT` (import hub). Web maps all five to
existing routes; mobile maps the two with native routes and drops the
rest (no dead CTAs). No retry, sync, accept, reject, fix or correct
actions exist.

## B3 preparing semantics

B3 remains `ENGINEERING_READY_FOR_CERT` / `CERT_ACCESS_BLOCKED`.
The center reads existing connection/run/settings state only. A
preparing or unavailable B3 is displayed as product structure, never
as an error and never as attention.

## Read-only guarantee

Zero writes (API-asserted via table counts and deterministic double
GET). Zero migrations, zero tables, zero cached status — derived per
request from the same bounded reads every time.

## Query plan

Per request: 1 ownership read + 1 settings aggregation + 1 bounded
recent-run window (10) + the 5R-E composition (1 valuation + 1
allocation read, 1 asset batch, 1 bounded run window of 200). No
per-position loops, no per-review queries, no N+1, no additional
replays beyond what the reused composers already perform. Review
preview derives from the same 10-row window.

Replay budget: 2 portfolio replays (inside the reused valuation and
allocation use-cases), 0 position replays, 4 bounded DB reads
(settings internals excluded from the count as pre-existing
aggregation), 0 N+1 loops.

## Mobile

Compact card: status, attention count, domain-grouped preview (top 5),
integration/reconciliation/data-quality summaries, recent runs and
navigation where native routes exist (`/(app)/reviews`,
`/(app)/(tabs)/portfolio`). Read-only.

## Operations vs investment quality

The center reports whether the operations pipeline and data are
sufficient — never whether the portfolio is good, risky or
recommended. All copy is operational ("Sincronização falhou",
"Dados insuficientes", "Nenhuma pendência operacional identificada").
No scores, no ratings, no advice, no investment language anywhere
(architecture-tested).
