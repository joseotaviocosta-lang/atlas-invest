# Phase 5R-D — Income Intelligence by Position

Factual, historical income layer over the canonical ledger. Answers how much
income a position (and the portfolio) actually received — never what it might
pay next. Zero writes, zero migrations, zero FX invention.

## Income event semantics

Canonical income events are exactly the three `IncomeTransaction` ledger
types (domain: `DIVIDEND`, `JCP`, `FII_INCOME`). Each carries `assetId`,
`amount` (Money) and `tradeDate`. Income is bucketed by `tradeDate`, the
only canonical event date — no payment date exists on the ledger and none
is invented.

## Included events

- `DIVIDEND` → dividends bucket.
- `JCP` → JCP bucket.
- `FII_INCOME` → FII income bucket.

The three types are summed per currency but never mixed into each other:
every total exposes `dividends`, `jcp`, `fiiIncome` and `total` side by side,
and the API tests assert the type splits reconcile with the currency total.

## Excluded events

- `AMORTIZATION` — basis reduction, not income, not a flow (5R-B semantics
  preserved; never counted in any income total).
- `SELL`, `BUY`, `SUBSCRIPTION`, `BONUS`, `SPLIT`, `REVERSE_SPLIT` —
  not income.
- `TRANSFER_IN` / `TRANSFER_OUT` — carried-cost moves, not income.
- `DEPOSIT`, `WITHDRAWAL` — cash movements, not income.
- `FEE`, `TAX` — expenses, not income.

The engine (`isIncomeEventType`) accepts only the three canonical types;
everything else is skipped, never zero-filled as income.

## Position income

`GET /api/v1/portfolios/:id/positions/:assetId/income?startDate&endDate`

- Identity is `portfolioId + assetId`, same as 5R-A/5R-B.
- Requires an **open** position at period end (closed or never-held → 404,
  same gating as 5R-B).
- Lifecycle follows 5R-B exactly: inception is the first event after the
  last zero-quantity date; a close + reopen starts a fresh holding.
  A window entirely before the (re)opening returns 200 with
  `NO_POSITION_IN_PERIOD` instead of 404.
- Payload: period, lifecycle, per-currency totals by type, monthly
  timeline (every enumerated month present, zero-filled per observed
  currency), last-5 recent events, event count, and `portfolioShare`
  (shareBp per currency against known portfolio income in the same
  currency and period).
- Limitations: `NO_INCOME_IN_PERIOD`, `NO_POSITION_IN_PERIOD`,
  `MULTI_CURRENCY_INCOME`.

## Portfolio income

`GET /api/v1/portfolios/:id/income-intelligence?startDate&endDate`

- Payload: period, inception anchor (earliest income ever, for the UI
  INCEPTION preset), per-currency totals by type, monthly timeline,
  by-position ranking (within each currency, deterministic assetId
  tie-break, 1-based ranks), per-currency concentration
  (`largest` + `top3ShareBp` + `top3`, all factual), limitations.
- Closed positions stay included: their income happened, so they rank
  with `isOpen: false, hasDetail: false` (label shown, no navigation CTA).
- Rows whose asset metadata is missing are kept with `ticker: null`
  (labeled, never dropped) so `byPosition` always reconciles with the
  portfolio total.

## Period semantics

Default window is the trailing 12 months; presets reuse the 5R-B set
(1M/3M/6M/YTD/1A/INCEPTION). Explicit `startDate`/`endDate` are civil
`YYYY-MM-DD`; end may not be in the future and ranges are capped at five
years (INCEPTION resolves to the earliest income date when known).
Months are `YYYY-MM` civil buckets; the grid is bounded at 120 months.

## Currency handling

Currencies are never mixed. No historical FX exists for income events,
so no translation is attempted and current FX is never applied to past
income. Multi-currency portfolios report one block per currency
everywhere (totals, timeline months, by-position groups, concentration).

## Historical aggregation

One portfolio ledger scan plus one batched asset lookup per request;
everything else is pure aggregation (`aggregateIncomeTotals`,
`bucketIncomeByMonth`, `rankIncomeRows`, `incomeShareBp` in
`packages/portfolio-strategy/src/income.ts`). No per-position, per-month
or per-type queries. Timelines are capped at 120 months.

## Position share

`positionIncome / portfolioIncome` in the same currency and period,
expressed in exact integer basis points (`shareBp`); null when the
portfolio denominator is zero. Display copy always qualifies
("da renda conhecida da carteira"), because ledger coverage beyond the
canonical events is not asserted.

## Concentration facts

Largest income position and top-3 share per currency — neutral labels
only ("Maior participação: XPTO11 — 32%"). No diversification score,
no "best payer" ranking, no judgment.

## Closed positions

- Portfolio view: closed-position income stays in the aggregate and in
  `byPosition` (reconciliation holds by construction).
- Position view: closed positions 404, following 5R-A/5R-B; no
  closed-position archive was created in this phase.

## Completeness

The ledger is the sole source of truth; import coverage is not asserted.
Zero income renders as an explicit empty state with
`NO_INCOME_IN_PERIOD`, distinct from unavailable data. No
`INCOME_HISTORY_MAY_BE_INCOMPLETE` limitation was added: there is no
evidence that canonical income events are partial, and limitations are
only emitted for real, observed conditions.

## No forecast

No dividend forecast, projected yield, forward 12M, growth prediction,
next-payment date, annualization, income-on-cost, target income or
retirement planning. No buy/sell, no recommendations, no scores.

## No yield

Income is never divided by market value (current or cost) anywhere in
this phase. Yield-on-cost and yield-on-value are deferred to a future
phase, if ever.

## Query plan

Portfolio: 1× `findByPortfolioId` (full ledger, filtered in memory) +
1× `assets.findByIds` + 1× `replayPortfolio(asOf: end)` for the open
set. Position: 1× `findByPortfolioId` + 1× `assets.findByIds` +
1× `replayPortfolioTimeline` over (bounds + month starts + asset trade
dates) for lifecycle gating — the same grid idiom as 5R-B.

## Mobile

`MobilePortfolioIncomeSection` (overview) and
`MobilePositionIncomeSection` (asset detail) mirror web: totals by type,
textual monthly timeline, by-position list (navigation only when
`hasDetail`), concentration facts and limitations. Text only, no charts.
