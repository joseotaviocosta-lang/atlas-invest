# Phase 5R-C - Portfolio Composition Intelligence (Read-Only)

A consolidated, canonical-only view of how the portfolio is composed:
asset, asset class, currency and exchange breakdowns over one known
denominator, with unvalued positions and unknown classifications shown
explicitly. Issuer and sector dimensions are unavailable: no canonical
source exists, and nothing is inferred.

## Available dimensions

| Dimension   | Source                                      | Status    |
| ----------- | ------------------------------------------- | --------- |
| ASSET       | allocation byAsset (ticker, assetId)        | available |
| ASSET_CLASS | allocation byAssetClass (STOCK…CASH, OTHER) | available |
| CURRENCY    | allocation buckets + native holdings        | available |
| EXCHANGE    | `Asset.exchange` (unique with ticker)       | available |

## Unavailable dimensions

- ISSUER: no issuer table, column, DTO field or taxonomy anywhere
  (audited domain, Prisma schema, mappers, repository, validation, API).
- SECTOR / SUBSECTOR: same — absent everywhere except a prose comment
  stating they do not exist.
- COUNTRY / REGION: only `Institution.country` exists (broker domicile),
  which is not an asset attribute and is never used as one.
- No scraper, no inference (`ticker.startsWith`, `currency == BRL ⇒
Brazil`, exchange ⇒ country are all prohibited and architecture-tested).

## Classification sources

- Asset class: canonical `STRATEGY_CATEGORIES` vocabulary; display labels
  via the shared `scenarioCategoryLabel` (same strings as 5Q-C).
- Exchange: canonical `Asset.exchange` (uppercased, part of the
  `@@unique([ticker, exchange])` identity).
- Currency: position/reporting currency from valuation.
- No external taxonomy, no manual mapping table, no new persistence.

## Composition basis

One basis per response, derived from the same allocation read model:

- `REPORTING_CURRENCY` when the translated allocation is AVAILABLE
  (values converted with the canonical FX observation).
- `SINGLE_CURRENCY` when there is exactly one currency bucket.
- `PER_CURRENCY` otherwise: native-currency totals per bucket with NO
  cross-currency weights (fail-closed, never mixed).
- The denominator is always the known total; unvalued positions are
  excluded from it and listed separately (never zero-filled).

## Valuation coverage

`valuationCoveragePercent` is passed through from the allocation engine;
`partialCoverage` is true when status ≠ COMPLETE or any position lacks a
quote. The UI states the known-share explicitly ("X% do valor conhecido").

## Unknown classification

Buckets keyed by missing values merge into an explicit UNCLASSIFIED
bucket (counts + value + weight). Coverage (`classified / known`) is
reported per dimension. Nothing is silently dropped or renormalized away.

## Currency semantics

- Single currency: weights vs the bucket total.
- Translated multi-currency: weights vs the translated total (converted
  values); native totals shown per bucket.
- Untranslatable multi-currency: native totals only, `weightBp: null`,
  `MIXED_CURRENCIES_WITHOUT_TRANSLATION`.
- BRL and USD (or any pair) are never summed without translation.

## Issuer semantics

- No issuer dimension exists. `ISSUER_CLASSIFICATION_NOT_AVAILABLE` is
  always reported. No grouping by name fragment, no counterparty reuse.

## Sector semantics

- No sector dimension exists. `SECTOR_CLASSIFICATION_NOT_AVAILABLE` is
  always reported. No GICS-like vocabulary is invented.

## Weight math

- Integer basis points, exact decimal arithmetic
  (`round(value / denominator * 10000)`, half-up), no floats.
- Rounding is display-only: bucket weights may sum to 9999/10001 and are
  never forced to 10000.
- Deterministic ordering: weight desc, key asc.

## No renormalization hiding unknowns

- `classified + unclassified = 100%` of the known value, always shown.
- The UNCLASSIFIED bucket (when present) is rendered last with an explicit
  "(sem classificação)" marker.

## No heuristic classification

- Symbol, name and exchange are used as-is (identity/display only).
- No `startsWith`, `includes`, case-mapping or currency→country rules
  anywhere in the path (architecture-tested).

## No data-quality score

- NaN-prone aggregates are prohibited; only facts and limitations.

## Advice boundary

- Concentration facts are neutral ("Maior posição: X (28,4%)").
- No "diversificado", no "concentrado", no score, no recommendation,
  no buy/sell, no rebalancing language (copy-scanned in tests).

## Query plan

- One allocation read (single replay inside) + one batched asset lookup.
- Pure in-memory aggregation; no per-dimension, per-asset or per-month
  queries (no N+1).
- Bounded by open positions; top-N lists capped at 5.

## Mobile

- Same endpoint, same facts: summary, selector, tables, coverage,
  unclassified handling, top positions with asset navigation.
- No charts; no dead CTAs; asset rows open the 5R-A detail.
