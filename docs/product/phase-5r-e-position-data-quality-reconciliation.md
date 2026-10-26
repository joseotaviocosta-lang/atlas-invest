# Phase 5R-E — Position Data Quality & Reconciliation

Operational diagnostics consolidating facts the read models already
produce. Answers which positions have incomplete data, what is missing,
which metrics are affected and where to look — without inventing
problems, scores or repairs.

## Data quality domains

Closed vocabulary (facts only, never inferred):

- `MARKET_DATA` — price availability and freshness from canonical quotes.
- `COST_BASIS` — replay cost-basis states.
- `FX` — reporting-currency translation state.
- `RECONCILIATION` — import-run reconciliation summaries and pending reviews.

`INCOME` needs no domain (zero income is a normal state; 5R-D found no
evidence of incomplete income history). `PERFORMANCE` needs no domain
(window-specific TWR caveats stay in 5R-B). Classification gaps are
structural (below), never per-position issues: the only supported
classifications are asset, asset-class, currency and exchange, and the
asset `exchange` column is non-nullable, so no per-position
classification issue can fire in v1.

## Issue vs limitation

A limitation is not automatically a problem. Explicit closed-world
eligibility (`isDataQualityIssue`): only `MISSING_PRICE`, `STALE_PRICE`,
`INCOMPLETE_COST_BASIS`, `NO_FX_TRANSLATION`,
`MIXED_CURRENCIES_WITHOUT_TRANSLATION`, `RECONCILIATION_DIVERGENT`,
`RECONCILIATION_MISSING_LOCAL`, `RECONCILIATION_MISSING_SOURCE`,
`RECONCILIATION_UNRESOLVED` and `PENDING_INTEGRATION_REVIEW` are issues.

Normal states that never become issues: `NO_INCOME_IN_PERIOD`,
`NO_POSITION_IN_PERIOD`, `NO_ACTIVITY`, `NO_INCOME_HISTORY`,
`POSITION_PERFORMANCE_NOT_AVAILABLE`, performance window caveats and
structural classification gaps.

## Severity

Operational priority only, deterministic per code — never investment
quality:

- `BLOCKING` — a metric cannot be computed (`MISSING_PRICE`,
  `INCOMPLETE_COST_BASIS`).
- `REVIEW` — data exists but is degraded or needs a look (`STALE_PRICE`,
  `NO_FX_TRANSLATION`, mixed currencies, all reconciliation states,
  pending reviews).
- `INFO` — reserved for future qualified diagnostics; v1 never emits it.

Overall status derives from explicit rules: any `BLOCKING` → `BLOCKED`,
else any `REVIEW` → `REVIEW_REQUIRED`, else any `INFO` → `LIMITED`,
else `COMPLETE`. Position rows follow the same rules.

## Market data

`MISSING_PRICE` (valuation statuses `QUOTE_UNAVAILABLE`,
`CURRENCY_MISMATCH`, `UNSUPPORTED_ASSET` — any status without a usable
price blocks valuation the same way) and `STALE_PRICE` (status
`QUOTE_STALE`, with factual `asOf` from the quote). No new quote logic:
the composer reuses the valuation read model, which already batches
persisted EOD quotes with `classifyEodQuoteFreshness`.

## FX

`NO_FX_TRANSLATION` per position when its currency differs from the
reporting currency without a translated value (same rule as 5R-A;
native values stay valid). `MIXED_CURRENCIES_WITHOUT_TRANSLATION` once
at portfolio level when several buckets exist without translation
(same rule as 5R-C). Never invents conversion.

## Cost basis

`INCOMPLETE_COST_BASIS` when the replay state is `INCOMPLETE`. Affected:
average cost, realized, unrealized and economic P&L (never zeroed,
reported unavailable). Cost is never fabricated; the action navigates
to the position operations. Root-cause tracing (bonus/transfer origin)
is not attempted: audit records exist in the replay but per-asset
causes are not persisted, and 5R-E invents no new heuristics.

## Classification

Structural only. No canonical issuer/sector/country/region source
exists anywhere (5R-C discovery), so the portfolio response always
carries `ISSUER_CLASSIFICATION_NOT_AVAILABLE` and
`SECTOR_CLASSIFICATION_NOT_AVAILABLE` once — never one issue per
position, never inferred from ticker/name/currency/exchange.

## Reconciliation

Canonical statuses (`MATCHED`, `DIVERGENT`, `MISSING_LOCAL`,
`MISSING_SOURCE`, `UNRESOLVED`) come from the import engine and are
persisted only as summary counts on `IntegrationRun` rows. The composer
sums one bounded 200-row recent window (same semantics as the portfolio
review) and reports `MATCHED` as an aggregate count only — never as
individual issues. Problem states become one portfolio-level issue each
with the summed count as fact. Per-asset entries are never persisted,
so no issue is ever attributed to a position (documented, never faked);
the position response carries no reconciliation block. Pending reviews
reuse `deriveReviewItems` over the same window; `VIEW_REVIEWS`
navigates to the existing review inbox (no workflow duplicated, no
accept/reject added).

## Structural limitations

Issuer/sector unavailability plus `NO_ACTIVITY` for empty portfolios.
Listed separately from issues; they do not affect status.

## Affected capabilities

Explicit per-issue vocabulary: `VALUATION`, `ALLOCATION`,
`UNREALIZED_PNL`, `REALIZED_PNL`, `ECONOMIC_PNL`, `PERFORMANCE`,
`COMPOSITION`, `REPORTING_VALUE`, `PORTFOLIO_WEIGHT`,
`RECONCILIATION`. One issue per root cause carries all affected
capabilities (e.g. `MISSING_PRICE` affects valuation, allocation,
unrealized P&L, performance and composition) — never five duplicate
issues. Position and portfolio responses expose the union.

## Actions/navigation

v1 actions are navigation only: `VIEW_POSITION` (per-position issues)
and `VIEW_REVIEWS` (portfolio reconciliation issues). No fix, accept,
overwrite, auto-correct or manual price editor.

## Read-only guarantees

Zero writes (API-asserted via transaction row counts and deterministic
double GET). Zero migrations, zero new tables, zero snapshots.

## Query/replay strategy

Per portfolio request: 1 ownership read + 1 valuation read + 1
allocation read (each with its own single internal replay, like 5R-A) +
1 batched asset lookup (tickers only) + 1 bounded integration-run
window (200 rows). The position endpoint reuses the same portfolio
composition filtered to one open asset — never one replay per position.
No per-position, per-month or per-type queries.

Replay budget: 2 portfolio replays, 0 position replays, 2 batched
metadata reads (assets, runs), 0 N+1 loops.

## Advice boundary

No quality score, no health score, no investment score, no asset
rating, no risk language, no recommendations, no buy/sell, no automatic
anything. Copy states facts ("Dados insuficientes", "Revisar", "Sem
pendências") with affected metrics and where to look.
