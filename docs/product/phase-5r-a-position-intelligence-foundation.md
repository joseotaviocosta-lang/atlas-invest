# Phase 5R-A - Position Intelligence & Asset Detail Foundation (Read-Only Composition)

One integrated answer per open position, composed from canonical sources
only: replay state, valuation, allocation, ledger income and history. No
new engine, no persistence, no recommendations. Per-position performance
does not exist canonically yet — it is explicitly null with a limitation
(5R-B material).

## Position identity

- Canonical identity is `(portfolioId + assetId)` — the `AssetState` key in
  the portfolio-engine replay. No position table, no snapshot row, no new
  identity invented.
- Open = present in the replayed state (zero-quantity positions are
  evicted by the engine; there is no server-side `isOpen` flag).
- Closed/never-held assets 404 on the intelligence route: never a zeroed
  generic position. Closed history remains visible via the existing
  history endpoint (`REALIZED_DISPOSAL`).

## Canonical sources

| Field                   | Source                                                                   | Notes                     |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------- |
| quantity, costs         | `GetPortfolioStateUseCase` via valuation positions (`AssetState` replay) | exact decimals            |
| costBasisStatus         | replay `KNOWN`/`INCOMPLETE`                                              | unknown is null, never 0  |
| marketValue, unrealized | `GetPortfolioValuationUseCase` (`valuePosition`)                         | null when unpriced        |
| price, price date       | valuation quote `{price, currency, asOf}`                                | EOD classification        |
| weight                  | `GetPortfolioAllocationUseCase` native bucket + translated item          | same-currency denominator |
| income totals           | ledger scan (`DIVIDEND`/`JCP`/`FII_INCOME`), grouped per currency        | inception, exact sums     |
| recent income           | same scan, last 5                                                        | deterministic order       |
| realized disposals      | history `type=realized`, bounded 10, canonical gain/loss                 | no aggregate return       |
| recent activity         | `findByPortfolioId({assetId})`, last 10                                  | all canonical types       |
| asset meta              | `IAssetRepository.findById`                                              | ticker/name/type/currency |

## Valuation

- Reuses `PositionValuationReadModel` verbatim: `marketValue`,
  `unrealizedGainLoss(+Percent)`, `quote{price, currency, asOf}`,
  `status`, `quoteFreshness`, `quoteStatus`.
- Statuses surfaced as-is: `VALUED`, `QUOTE_UNAVAILABLE`, `QUOTE_STALE`,
  `COST_INCOMPLETE`, `CURRENCY_MISMATCH`, `UNSUPPORTED_ASSET`.
- Consistency with `/valuation` and `/allocation` is covered by API tests
  asserting identical market value, unrealized and weight values.

## Allocation

- Weight = native-bucket `allocationPercent` (denominator = same-currency
  known value, `weightDenominator` exposed).
- Translated weight + reporting market value only when the translated
  allocation is `AVAILABLE`; otherwise null (never a fabricated
  cross-currency denominator).
- Partial coverage qualifies the weight ("X% do valor conhecido da
  carteira") with `PARTIAL_PORTFOLIO_VALUATION` and the coverage percent.

## Performance availability

- No per-position performance engine exists anywhere (engine, use-cases,
  routes audited). `performance` is always null with
  `POSITION_PERFORMANCE_NOT_AVAILABLE`.
- No heuristic return is invented (no `(value - buys) / buys`).

## Cost basis availability

- Canonical `totalCost`/`averageCost` with `KNOWN`/`INCOMPLETE`.
- `INCOMPLETE` (e.g. unmatched transfer-in) → costs null, never zero,
  with `COST_BASIS_NOT_AVAILABLE` and valuation status `COST_INCOMPLETE`.

## Income

- Inception totals per currency (`dividends`, `jcp`, `fiiIncome`, `total`);
  currencies never summed. Recent 5 events with date, type label, amount.
- Zero income with no events → empty totals + `NO_INCOME_HISTORY`
  (distinct from a proven zero).

## Recent transactions

- Last 10 asset-scoped ledger rows, newest first, deterministic ties.
- Canonical types with pt-BR labels (Compra, Venda / Alienação,
  Desdobramento, Transferência de Entrada/Saída, ...). Cash movements
  carry no assetId and never appear. No lot reconstruction.

## Multi-currency

- Every money block carries its currency; BRL/USD (or EUR) are never
  summed. Translated values only from the canonical translated
  allocation. Missing FX → `NO_FX_TRANSLATION` with native values kept.

## Data quality

- `dataQuality`: valuation status, price date, quote freshness/status,
  coverage percent, partial flag. Facts and limitations only — no
  aggregate quality score (prohibited and tested).

## Closed-position boundary

- Intelligence route serves open positions only. Closed positions 404;
  their history stays available on the existing history endpoint and the
  asset page's "posição não aberta" state is unchanged.

## Read-only guarantee

- Zero writes (row-count test), deterministic output (double-GET test),
  no internal/provider/external IDs or fingerprints (serialized scan).

## Performance/query plan

- Per request: ownership (1) + valuation (1 replay) + allocation
  (1 replay) + asset meta (1) + asset ledger scan (1) + realized history
  (1 replay). Two to three replays all inside pre-existing use-cases; the
  new use-case adds no replay of its own. Bounded per-asset scope, no N+1
  (single batched link/read per entity, lazy detail only — the list never
  calls this endpoint per row).

## 5R-B boundary

- 5R-A implements no per-position TWR/XIRR, no contribution-to-return, no
  realized/unrealized aggregation engine, no benchmark-by-position.
  `performance: null` + limitation is the contract until 5R-B.

## Mobile

- Same endpoint, same facts: summary, valuation, weight, income, activity,
  limitations. Read-only; no dead CTAs; full history stays on the
  existing paginated history feed.
