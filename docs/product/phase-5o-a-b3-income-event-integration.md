# Phase 5O-A — B3 Income & Event Integration

Status: implemented. No live B3 integration, no secrets, no network, no
migrations (count stays 31), no domain or engine changes — the B3 flow
adapts to the existing canonical model, never the reverse.

Related: `docs/product/phase-5m-simulated-b3-sync.md` (pipeline),
`docs/product/phase-5n-b3-connection-ux.md` (product surface).

## Supported

| B3 nature     | Canonical event | Identity                                                              | Writer                                              |
| ------------- | --------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `DIVIDENDO`   | `DIVIDEND`      | value-only fingerprint (asset, account, type, date, amount, currency) | `TransactionFactory.createIncome` via `executeMany` |
| `JCP`         | `JCP`           | same as above                                                         | same as above                                       |
| `RENDIMENTO*` | `FII_INCOME`    | same as above                                                         | same as above                                       |

## Unsupported (explicit, fail-closed)

`SPLIT`, `REVERSE_SPLIT`, `BONUS`, `SUBSCRIPTION`, `AMORTIZATION`, `DEPOSIT`,
`WITHDRAWAL`, `FEE`, `TAX`, unknown natures. Corporate actions stay deferred
(they reprice cost basis — out of scope); `AMORTIZACAO` with an amount never
becomes income. Unknown natures are `INVALID`, never invented trades.

## Amount semantics

The simulated `amount` (e.g. `87.30`, `42.10`) is the **gross credited value
on the economic date**. The ledger stores it as `IncomeTransaction.amount`
(positive `Money`, exact decimal string, `NUMERIC(38,18)`); the portfolio
engine records it as both `amount` and `grossAmount` with status `KNOWN`.
No net amount, no per-unit price, no quantity is derived or stored.

## Date semantics

`tradeDate` is the economic/payment date; `settlementDate` passes through
when present. The domain has no `exDate`/`recordDate` fields — they are not
invented and not mapped. The tax projection reads `tradeDate` as
`paymentDate`.

## Provisioned vs paid policy

The ledger has **no provisioned-vs-paid distinction**. Records explicitly
marked with a non-payable lifecycle (`PROVISIONED`, etc.) stay in
`NEEDS_REVIEW` (`PROVISIONED_INCOME_NEEDS_REVIEW`) and never post cash.
Payable markers (`PAID`, `CREDITED`, `LIQUIDADO`, `PAGO`) — or an absent
lifecycle on the simulated contract — flow normally. Ambiguity never posts
paid cash.

## JCP tax/withholding policy

The canonical income event carries **no withholding representation**. The
JCP value is preserved as the known credited amount; no IRRF is estimated,
no 15%/17.5% is applied, no `taxes` field is set. Downstream tax rules
(`R-JCP-*`, annual investment income with `withheldTaxAmount: null`) consume
the gross value under their own authority.

## Dedupe behavior

- Source identity (`B3|<movementId>`) + value-only canonical SHA-256
  fingerprint: same payout from B3 twice → `EXACT_DUPLICATE`, zero writes.
- Shares-held figures are informational and excluded from identity: the same
  payout reported with different quantities still collides (no split income).
- Corrected values on the same occasion → `PROBABLE_DUPLICATE`, human review.
- Same external id with divergent values → `CONFLICT`, explicit decision.
- Manual/CSV income (no external id) dedupes by the same value fingerprint
  against B3 rows — cross-source, source-agnostic, no double income.

## Read models affected

- `GET /state`: `incomeSummaries` (`totalDividends`, `totalJcp`,
  `totalFiiIncome`) now include B3-confirmed income; positions, cost basis
  and realized summaries unchanged (income never touches custody).
- `GET /history`: confirmed income appears as `INCOME` items.
- Tax 4H.4/4H.6/reporting/high-income: consume the new ledger rows through
  the unchanged projection (`tradeDate` → `paymentDate`, `amount` → `gross`).
- Valuation, performance (TWR/XIRR are valuation-driven; income events are
  internal, never external flows), AI grounding (INCOME facts): unchanged
  code, new facts flow automatically.

## Known gaps

- No `exDate`/`recordDate`/lifecycle persistence (domain has no fields).
- No withholding capture at the ledger level (by design — see JCP policy).
- CSV income rows stay `UNSUPPORTED` (the template has no amount column);
  only sources carrying an exact amount produce importable income.
- Dividend tax-transition evidence (pre-2026 profits) is a taxpayer
  confirmation concern, unchanged by this phase.

## Verification

- `pnpm test:import-engine` — 83 passed (incl. value-only identity,
  cross-source income dedupe, provisioned/malformed/missing fail-closed).
- API B3 suites — 9 passed (real writer, real `/state` income summaries,
  real `/history`, real confirm use-case incl. amountless-income rejection).
- `pnpm test:api` import suites — CSV regression green.
- `pnpm test:web` — green, incl. income operation labels.
- `pnpm test:architecture` — green (no new cross-package imports).
- `typecheck` / `lint` / `format` / `build` — clean; 0 migrations.
