# Phase 5S-D — Portfolio Data Maintenance

## Maintenance capability matrix

Source: 5R-E closed issue vocabulary (`data-quality.ts`) + structural
limitations from the quality composer; writers audited per area
(market quotes provider-only, FX provider-only, assets create-only,
transactions append-only, rectification BUY/SELL only).

| Issue                                                                  | Source                                                              | Safe write path?                                                        | Type                                          | 5S-D           | Why                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| MISSING_PRICE                                                          | valuation QUOTE_UNAVAILABLE / CURRENCY_MISMATCH / UNSUPPORTED_ASSET | provider refresh exists (`POST market-data/update`, market page button) | ACTIONABLE / REFRESH_MARKET_DATA              | yes            | user-triggered provider refresh; manual quote deferred (no provenance/precedence) |
| STALE_PRICE                                                            | QUOTE_STALE                                                         | same                                                                    | NAVIGABLE / VIEW_MARKET_DATA                  | yes            | stale ≠ wrong; position review                                                    |
| INCOMPLETE_COST_BASIS                                                  | replay INCOMPLETE, no tx identity                                   | 5S-C rectify exists but root tx unknown from the issue                  | NAVIGABLE / VIEW_OPERATIONS                   | yes            | locate root tx in ledger; 5S-C if BUY/SELL; never direct cost edit                |
| NO_FX_TRANSLATION                                                      | FX gap                                                              | provider FX update exists (`POST fx/.../update`)                        | ACTIONABLE / REFRESH_FX_DATA                  | yes            | provider-only; never current-FX fix for historical gaps                           |
| MIXED_CURRENCIES_WITHOUT_TRANSLATION                                   | multi-currency, no translation                                      | same                                                                    | NAVIGABLE / VIEW_OPERATIONS                   | yes            | review operations + market data                                                   |
| RECONCILIATION_DIVERGENT / MISSING_LOCAL / MISSING_SOURCE / UNRESOLVED | 200-row run window                                                  | 5S-B workspace                                                          | NAVIGABLE / REVIEW_RECONCILIATION             | yes            | human decision; history never rewritten                                           |
| PENDING_INTEGRATION_REVIEW                                             | pending runs                                                        | 5S-B inbox                                                              | NAVIGABLE / VIEW_REVIEWS                      | yes            | nothing automatic                                                                 |
| ISSUER/CLASSIFICATION_NOT_AVAILABLE                                    | no canonical source                                                 | none                                                                    | STRUCTURAL / NONE                             | yes (explicit) | limitation copy, never inferred                                                   |
| PARTIAL_PORTFOLIO_VALUATION / NO_ACTIVITY                              | composition limitation / empty state                                | —                                                                       | not issues (excluded by `isDataQualityIssue`) | n/a            | surfaced where they originate                                                     |

Deferred, not implemented: MANUAL_MARKET_DATA
(`MANUAL_MARKET_DATA_DEFERRED` — `MANUAL` exists as a market-data
source value but no write path supplies it, uniqueness is per
(asset, date, provider), and no precedence rule distinguishes
manual/provider quotes); non-BUY/SELL rectification extension
(income/deposit/transfer semantics unproven); asset metadata edit
(identity immutable); manual FX (no source model support).

## Actionability policy

Pure function `deriveMaintenanceAction(code)` in
`packages/portfolio-strategy/src/maintenance.ts`: deterministic,
zero I/O, same input → same status everywhere (portfolio
maintenance, position quality, operations preview). Statuses
ACTIONABLE / NAVIGABLE / UNSUPPORTED / STRUCTURAL; unknown codes
→ UNSUPPORTED (never silently actionable). No scores, no fix-all,
no auto-fix. `RECTIFY_TRANSACTION` is not in v1 vocabulary: 5R-E
issues carry no transaction identity, so no issue can name its
root transaction (fabricating one is prohibited).

## Actionable vs navigable vs unsupported vs structural

- ACTIONABLE (v1: MISSING_PRICE, NO_FX_TRANSLATION): a real safe
  path the user may trigger (provider refresh). The maintenance
  GET never triggers it.
- NAVIGABLE: points to an existing workflow (ledger, position,
  market data, review workspace).
- UNSUPPORTED: identified limitation with no safe flow (explicit
  copy, no dead CTA).
- STRUCTURAL (v1: issuer/sector): no canonical source exists;
  reported once at portfolio level, never per position.

## Market data maintenance

No manual quote in v1. `MISSING_PRICE` → refresh via the existing
market surface (`/market`); `STALE_PRICE` → position review. The
manual-quote branch (STEPS 57–70) was not taken: provenance and
precedence cannot be distinguished safely with the current engine,
so it is recorded as `MANUAL_MARKET_DATA_DEFERRED` and the issues
stay actionable/navigable through provider paths.

## Cost-basis maintenance

Direct override prohibited (statically guarded): no
`averageCost`/`costBasis` writer exists and none was created. If
the root cause is an incorrect BUY/SELL, the safe path is the 5S-C
rectification from the transaction detail — the maintenance item
explains this and routes to the ledger. TRANSFER_IN unknown cost
and BONUS without cost are `TRANSFER_COST_UNSUPPORTED` /
`BONUS_COST_UNSUPPORTED` in effect: the issue stays navigable
because the replay drops root-cause origin and no canonical
replacement semantics were proven (no extension attempted).

## Rectification integration

Reuses 5S-C as-is (BUY/SELL only, append-only, atomic link,
409 + effective id). No semantics change, no new transaction
types. The policy never emits `RECTIFY_TRANSACTION` because the
diagnosis never identifies the root transaction.

## Reconciliation integration

Reuses 5S-B: `REVIEW_RECONCILIATION` routes to `/reviews`;
decisions and run links are never touched by maintenance
(statically guarded, regression suites green).

## FX

No manual FX. `NO_FX_TRANSLATION` is actionable only through the
existing provider update endpoint; historical gaps are never
patched with current rates (safety note on the item).

## Classification

Issuer/sector remain structural: reported as structural items,
never inferred, never actionable.

## Unsupported cases

Unknown codes → UNSUPPORTED with the explicit copy. Manual price,
non-BUY/SELL rectification, metadata edit, direct overrides are
documented as deferred/out-of-scope rather than half-implemented.

## Safety boundaries

`MAINTENANCE != ARBITRARY DATA OVERRIDE` (architecture test):
no cost-basis, P&L, performance, allocation or status setters;
no auto-fix; no generic fix-all; no bulk mutations. GET endpoints
never write (read-only test asserts counts unchanged).

## Query plan

One 5R-E composition per maintenance request (same replay budget
as data quality — no recompute, no per-issue replay). Policy
mapping is in-memory over the issue list. Operations preview
reuses the same composition + policy (counts only). No N+1:
no per-position transaction reads anywhere.

## Mobile

Read-only summary in the operations section (counts + "Ver
revisões" where a route exists). No mutation form, no dead CTA.
