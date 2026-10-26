# Phase 5R-B - Position Performance & Contribution Analysis (Read-Only)

Position-level TWR, P&L components and monthly attribution against the
portfolio's own returns — composed from canonical sources only. No new
performance engine: the shared `calculateTWR` is reused verbatim. No
persistence, no recommendations, no scores, no forecasts.

## Performance definitions

- **Realized P&L** (per currency): sum of canonical per-disposal
  `realizedGainLoss` for KNOWN disposals in the period. Any INCOMPLETE
  disposal poisons its currency bucket to null (ADR-045/ADR-046 mirror) —
  never a partial sum, never an average of returns.
- **Unrealized P&L**: period-end market value minus snapshot cost basis
  (exact decimal). Null when cost is INCOMPLETE — never zero.
- **Income**: in-period DIVIDEND/JCP/FII_INCOME sums per currency.
  Income is NOT a TWR flow (identical to the portfolio engine, which only
  counts DEPOSIT/WITHDRAWAL).
- **Total economic P&L** (per currency): realized + unrealized + income,
  only when every component is known. Otherwise the total is null while
  the known components still show.
- **Return (TWR)**: chained subperiod returns from the shared engine.
  **Contribution**: monthly beginning-weight share of the portfolio's own
  monthly return, chained (Brinson-style). Never current-weight x return.

## TWR methodology

- Observations: quantity x price per date (exact decimals), start and end
  inclusive. Subperiods between consecutive observation dates.
- End-of-subperiod flow timing, exactly like the portfolio engine: a flow
  on the start date belongs to no subperiod; a flow on the end date
  belongs to the closing subperiod.
- A missing price drops the date (no interpolation, ever). Missing start
  or end is reported explicitly (`actualStartDate`/`actualEndDate` differ
  from the requested period) with `MISSING_START_PRICE` /
  `MISSING_END_PRICE`. Fewer than two observations: `INSUFFICIENT_DATA`.
- A stale end price (previous close within 7 days of a current end date)
  carries `STALE_END_PRICE` instead of being called current.
- <2 observations, invalid input: fail closed, never 0%.

## Cash-flow classification

- INFLOW: BUY (gross cost incl. attributable fees/taxes), SUBSCRIPTION
  (acquisition cost), TRANSFER_IN (carried cost).
- OUTFLOW: SELL (net proceeds, net of fees/taxes), TRANSFER_OUT
  (carried cost).
- NOT flows: income events, corporate actions, standalone fees/taxes,
  amortizations, cash movements (identical to the portfolio engine).
- A transfer without knowable carried cost nulls the return with
  `INCOMPLETE_COST_BASIS` instead of inventing a flow.

## Realized P&L

- Source: canonical `realizedDisposals` from the replayed ledger,
  filtered to the effective period and grouped per currency.
- Partial disposals aggregate naturally (gain per disposal summed).
- INCOMPLETE disposals poison their currency bucket (documented above).
- No re-derivation of sell math: the use-case reuses the engine's
  disposal records.

## Unrealized P&L

- Source: end-of-period snapshot cost basis + end market value.
- Consistency: identical formula to the valuation engine
  (`marketValue - totalCost`); API-tested equal to `/valuation`.
- Percent = gain / cost basis, null when the basis is zero.
- Null whenever cost is INCOMPLETE.

## Income

- Source: canonical in-period DIVIDEND/JCP/FII_INCOME ledger rows,
  aggregated with the 5R-A helper (no second income engine).
- Consistency: API-tested equal to the 5R-A intelligence income totals.
- Never a TWR flow; shown as its own P&L component.

## Economic P&L

- Available per currency exactly when realized + unrealized + income are
  all known for that currency (zero is a valid known value; null poisons).
- Cross-currency totals are never summed.

## Contribution methodology

- Monthly grid: month starts strictly inside the window plus both ends.
- Each month, every same-currency position gets a TWR on its own
  observations (start, own flow dates, month end) and start-of-month
  values for weights.
- Positions unvalued in a month are excluded and weights renormalize over
  the valued universe; the month is flagged (`PARTIAL_PORTFOLIO_VALUATION`
  on the response when any month is partial).
- Contribution chains with the portfolio's own monthly returns on the
  same grid, so the sum of contributions equals the chained portfolio
  return exactly (invariant unit- and API-tested).
- `currentWeight x return` never appears (architecture-guarded).

## Corporate actions

- Splits / reverse splits / bonuses: quantity-only, no flows; value is
  continuous so no artificial return is created.
- A bonus without assigned cost flips the position to INCOMPLETE: return
  still computes (cost-independent), cost metrics go null.
- Amortization: basis reduction per the engine; not a TWR flow, not
  income — consistent with portfolio treatment.

## Transfers

- Matched transfers move capital at carried cost in both directions (net
  zero same-day), creating no return.
- Unmatched transfers carry no knowable cost: performance nulls with
  `INCOMPLETE_COST_BASIS` instead of fabricating a flow.

## Cost-basis limitations

- INCOMPLETE basis nulls unrealized, economic total and any transfer flow
  that needs carried cost — but never the TWR itself when the return
  inputs are complete. No metric is ever zero-filled.

## Multi-currency

- Everything is per-currency; BRL and foreign money are never summed.
- Contribution universes are per-currency; a position contributes to the
  portfolio return of its own currency only.

## Data quality

- `MISSING_START_PRICE`, `MISSING_END_PRICE`, `MISSING_FLOW_PRICE` (flow
  date without price: return null, no silent drop), `STALE_END_PRICE`,
  `INSUFFICIENT_HISTORY`, `POSITION_CONTRIBUTION_NOT_AVAILABLE`,
  `NO_POSITION_IN_PERIOD`, plus the 5R-A cost/income codes where relevant.
- No scores, no aggregate quality number — facts and limitations only.

## Period semantics

- Explicit `startDate`/`endDate` (validated; future end and >5y ranges
  rejected). Default: trailing 12 civil months ending today.
- Effective start = max(requested start, position inception). Inception =
  first event after the last zero-quantity date (a close + reopen starts
  a fresh holding, mirroring engine eviction).
- A window entirely before inception returns null performance with
  `NO_POSITION_IN_PERIOD` ( HTTP 200, not 404 — the position exists).

## Query/replay strategy

- Per request: ownership (1) + full asset-scoped... full-portfolio ledger
  scan (1) + one incremental timeline replay over grid dates + memoized
  price lookups per (asset, date).
- No per-month replays, no per-plan reads, no N+1 query loops.
- Bounds: months <= 120 (range capped at 5 years); price/grid work scales
  with positions x months + own flow dates.

## Advice boundary

- No ranking, no "best/worst", no recommendations, no buy/sell calls, no
  ratings, no scores, no forecasts, no expected returns. Copy is factual:
  signed numbers, explicit labels, neutral limitations.
