# Annual IRPF Data Sufficiency — 2026

> Phase 4H.1. Maps every relevant annual reporting requirement to the data Atlas
> already possesses, classified as: `DERIVABLE_FROM_LEDGER`,
> `DERIVABLE_FROM_EXISTING_FISCAL_STATE`, `REQUIRES_EXTERNAL_INPUT`,
> `REQUIRES_USER_CONFIRMATION`, `NOT_SUPPORTED`, `UNKNOWN`.
>
> Source of truth principle: `Transactions/Events → Portfolio Engine → Derived
Positions → Fiscal → Annual IRPF`. The annual layer must never become a second
> portfolio engine or recompute monthly tax (Phase 4H §11/§16).

Research cutoff: 2026-10-01. Legal basis: `annual-irpf-legal-foundation-2026.md`.

---

## 1. Existing Atlas data inventory (audited)

| #   | Source                                  | What it holds                                                                                                                   | Relevant to annual IRPF                             |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| D1  | Immutable transaction ledger            | BUY/SELL/TRANSFER_IN/OUT/SPLIT/REVERSE_SPLIT/BONUS/AMORTIZATION/DIVIDEND/JCP/FII_INCOME/SUBSCRIPTION/DEPOSIT/WITHDRAWAL/FEE/TAX | yes (year-end, realized, income, corporate actions) |
| D2  | Portfolio replay (`replayPortfolio`)    | derived `PortfolioState`, per-account/asset quantity, `totalCost`, `averageCost`, `costBasisStatus`                             | yes (year-end positions/cost)                       |
| D3  | Portfolio replay — disposals            | `RealizedDisposal` per SELL (netProceeds, costBasisRemoved, realizedGainLoss, status)                                           | yes (support monthly results)                       |
| D4  | Portfolio replay — corporate actions    | `appliedCorporateActions` (SPLIT/REVERSE_SPLIT/BONUS/AMORTIZATION audit trail)                                                  | yes (quantity/cost implications)                    |
| D5  | Portfolio replay — transfers            | `appliedTransfers` (matched/mismatched legs)                                                                                    | partial (custody movement, non-taxable)             |
| D6  | Fiscal projection (4A)                  | `FiscalEvent` per transaction (SALE, INCOME, CASH_FLOW, …) + `assetTypeByAssetId`                                               | yes                                                 |
| D7  | Asset metadata                          | canonical `AssetId`, type, currency, exchange; ticker is display-only                                                           | yes (classification)                                |
| D8  | Monthly liability (4B/4B.5)             | FII category result (grossSales, realized, losses, withholding, taxDue)                                                         | yes (FII)                                           |
| D9  | Equity monthly read (4G)                | normal/day-trade results, exemption, losses, gross/net tax, IRRF, terminal states                                               | yes (core)                                          |
| D10 | `TaxCompensationElection`               | versioned exempt-loss election                                                                                                  | yes (loss recognition)                              |
| D11 | Withholding evidence (4B.3/4G.2B.0)     | canonical withholding inputs + `withholdingCategory`                                                                            | yes (IRRF provenance)                               |
| D12 | 6015 composition (4G.2C)                | composed obligation components (FII + normal + day)                                                                             | yes                                                 |
| D13 | Tax obligations (4C)                    | status, principal, due date, revision, provenance                                                                               | yes (DARF paid)                                     |
| D14 | Carry-forward (4E)                      | immutable carry entries, aggregation                                                                                            | yes (deferred amounts)                              |
| D15 | DARF readiness/handoff (4F)             | interactive handoff records (never official doc)                                                                                | yes (evidence of intent)                            |
| D16 | Federal deadline registry (4C)          | official due dates                                                                                                              | yes                                                 |
| D17 | Income events (DIVIDEND/JCP/FII_INCOME) | only if present in the ledger                                                                                                   | partial (see §3)                                    |
| D18 | Year-end snapshots                      | **none persisted** (state is derived on demand)                                                                                 | derived                                             |
| D19 | Taxpayer identity                       | masked CPF + HMAC reference                                                                                                     | yes (identity, never raw)                           |

**Note:** positions/cost are **not persisted**; they are recomputed by
deterministic replay (`asOf`). The annual layer must follow the same rule.

---

## 2. Data sufficiency matrix

| Annual requirement                                   | Classification                                       | Primary source                       | Gap / notes                                              |
| ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| Year-end quantity per asset (31/12)                  | DERIVABLE_FROM_LEDGER                                | replay `asOf 12-31` (D2)             | none                                                     |
| Year-end historical cost per asset                   | DERIVABLE_FROM_LEDGER                                | replay `totalCost` (D2)              | BLOCKED when `costBasisStatus = INCOMPLETE` (never zero) |
| Asset classification / type                          | DERIVABLE_FROM_LEDGER                                | asset metadata (D7)                  | BLOCKED when `UNKNOWN`                                   |
| Monthly normal result                                | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G equity read (D9)                  | none                                                     |
| Monthly day-trade result                             | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G equity read (D9)                  | none                                                     |
| Monthly FII result                                   | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4B read (D8)                         | none                                                     |
| Monthly exemption status                             | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G (D9)                              | none                                                     |
| Realized gains (taxable/exempt)                      | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G (D9)                              | none                                                     |
| Loss carry (normal/day/FII)                          | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G closing loss (D9), 4B (D8)        | annual display semantics PARTIAL                         |
| IRRF opening/current/used/closing                    | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G IRRF (D9) + D11                   | none                                                     |
| Normal IRRF annual state                             | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G terminal state (D9)               | none                                                     |
| Day-trade IRRF restitution state                     | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4G terminal state (D9)               | none                                                     |
| 6015 obligation + payment state                      | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | 4C/4E/4F (D12–D15)                   | none                                                     |
| Exempt-loss election                                 | DERIVABLE_FROM_EXISTING_FISCAL_STATE                 | D10                                  | none                                                     |
| Dividends (ação)                                     | REQUIRES_EXTERNAL_INPUT                              | ledger income events (D17)           | only if DIVIDEND imported; else user/broker import       |
| JCP                                                  | REQUIRES_EXTERNAL_INPUT                              | ledger income events (D17)           | JCP support exists; ingestion external; 17,5% from 2026  |
| FII rendimentos                                      | REQUIRES_EXTERNAL_INPUT + REQUIRES_USER_CONFIRMATION | ledger income + fund condition facts | conditional exemption needs fund facts                   |
| Corporate actions (split/reverse/bonus/amortization) | DERIVABLE_FROM_LEDGER                                | D4 audit trail                       | mergers/spin-offs NOT_SUPPORTED                          |
| Corporate actions (merger/incorporation/spin-off)    | NOT_SUPPORTED                                        | —                                    | legal treatment PARTIAL/UNRESOLVED                       |
| Custody transfers between brokers                    | DERIVABLE_FROM_LEDGER                                | D5                                   | non-taxable; informational                               |
| Opening position (pre-Atlas history)                 | REQUIRES_USER_CONFIRMATION                           | —                                    | no silent inference                                      |
| Opening cost basis (pre-Atlas)                       | REQUIRES_USER_CONFIRMATION                           | —                                    | never fabricate                                          |
| Foreign assets                                       | NOT_SUPPORTED                                        | —                                    | beyond BRL listed scope                                  |
| Cash balances                                        | NOT_SUPPORTED / partial                              | DEPOSIT/WITHDRAWAL events (D1)       | only if user records                                     |
| Liabilities                                          | NOT_SUPPORTED                                        | —                                    | out of scope                                             |
| Minimum annual tax (Lei 15.270/2025)                 | REQUIRES_EXTERNAL_INPUT                              | non-Atlas income                     | needs user-confirmed total income                        |
| DIRPF obligation thresholds (L1/L2)                  | DERIVABLE_FROM_LEDGER + FISCAL                       | D1–D15                               | compute volume + year-end cost                           |
| Bens e Direitos form group/code                      | REQUIRES_EXTERNAL_INPUT (mapping)                    | legal research                       | numeric codes PARTIAL                                    |
| Annual form field identifiers                        | UNKNOWN                                              | —                                    | not frozen until confirmed                               |

---

## 3. Income ingestion gap (important)

`DIVIDEND`, `JCP` and `FII_INCOME` are canonical transaction types and are
processed by the portfolio/tax engines **when present in the ledger**. However,
Atlas's current ledger is populated from transactions the user/broker provides;
there is no automatic broker/income feed evidenced in the repository. Therefore:

- If the user records income events → annual income is DERIVABLE.
- If not → annual income is REQUIRES_EXTERNAL_INPUT and the annual report must
  show it as MISSING (never zero).

This is a data-completeness matter, not a legal gap.

---

## 4. Failure-closed conditions (annual)

Annual numbers must be BLOCKED / REQUIRES_CONFIRMATION when any of:

- unknown cost basis (`costBasisStatus = INCOMPLETE`);
- missing pre-Atlas opening history;
- unknown asset classification;
- missing corporate-action data required for quantity/cost continuity;
- inconsistent quantity (replay failure);
- missing currency conversion (multi-currency without explicit FX);
- unsupported asset class;
- missing income event where legally required.

`unknown ≠ zero ≠ not applicable ≠ missing` (Phase 4H §40).

---

## 5. Query-budget design (future)

To avoid N+1 in the annual layer:

- one ledger range load per subject (not per asset/month);
- one asset-metadata bulk load;
- one monthly-fiscal-state bulk load for the calendar year;
- one withholding bulk load;
- one obligation/carry bulk load;
- no per-transaction, per-asset or per-month query where a range/bulk load exists.

---

## 6. Scale estimate (design, not SLA)

| Horizon  | Transactions | Notes                                           |
| -------- | ------------ | ----------------------------------------------- |
| 1 year   | 100          | trivial                                         |
| 5 years  | 1.000        | linear replay                                   |
| 10 years | 10.000       | linear replay, `O(N log N)`                     |
| 20 years | 100.000      | replay + annual aggregation; bulk-load critical |

Deterministic replay of 50.000 transactions was already benchmarked sub-second in
the portfolio engine (ADR-061); the annual layer adds only bounded aggregation.
