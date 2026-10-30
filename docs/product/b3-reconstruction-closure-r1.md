# B3 Reconstruction Closure R1 — Verified Custody Events

Phase scope: parser + preview + canonical mapping for proven B3 custody events.
**No owner confirmation executed here; no ledger writes in this phase.**
Real B3 files were read locally only, never committed, never copied to fixtures.

## 1. Entry state (from `b3-current-position-reconciliation.md`)

- 37 opening positions @ 31/12/2024; 59 imported negotiations; 96 B3 ledger rows.
- Replay SUCCESS; 41 Atlas open vs 40 B3 economic assets; 30/40 direct MATCH.
- Decision CASE C (EGIE3 −200 unexplained; VIVT3 +200 and ITSA4 +15.7 pre-window,
  class unconfirmed).

## 2. Negotiation coverage (PART A)

- Full file `negociacao-2026-10-29-18-20-59.xlsx`: **189 rows, 2019-11-28..2026-10-08**.
- Imported file `...-11-47-35.xlsx`: **59 rows, 2025-01-15..2026-10-08**.
- Dec-2024-only trades (in full file, outside imported window): KCRE11 +80 (27/12),
  KCRE11 +120 (26/12, inside opening 120), MXRF11 +40, RBRP11 +20, MCCI11 +10,
  B3SA3 +200, SNID11 +20 (all 26/12 or earlier → settled 2024, inside openings).
- **A4 chronology gate (critical):** a trade dated ≤ the opening snapshot must NOT
  persist into a baselined portfolio — canonical replay orders by tradeDate ahead
  of the snapshot and would double-count. Pre-baseline BUY/SELL/BONUS candidates
  are classified `PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT` (NEEDS_REVIEW, never
  READY). KCRE11's 27/12/2024 +80 is the proved edge case: the 2024 report (120)
  excludes it while the 2025 report (300 = 120 + 80 + 100) includes it, i.e. it
  settled after the baseline. Confirming it with tradeDate 27/12 would corrupt the
  snapshot (120 + 80 = 200 ≠ 120 report); the correct representation (settlement-date
  booking with provenance, or opening re-derivation) requires explicit owner
  decision — implemented as REVIEW, never silent import.

## 3. Movement classification (PART O) — real-file drill results

File `movimentacao-2026-10-29-11-47-54.xlsx` (710 rows, window
28/10/2025..28/10/2026) through the R1 preview pipeline (read-only drill,
`executeWithOverrides`, zero writes):

- Total rows routed: **707** (3 blank/total rows skipped).
- Candidates: **180** — READY **8**, NEEDS_REVIEW **45**, UNSUPPORTED **127**,
  duplicates 0, invalid 0.
- Notices (display-only, confirm ignores structurally): **527** — INFORMATIONAL
  132, CASH_ONLY 352, REVIEW_REQUIRED 43.
- READY (exact, all dup=NEW, asset+account RESOLVED):
  BONUS COGN3 30, BONUS ITSA4 23.54, BONUS SOJA3 43.76, BONUS EZTC3 271.56,
  BONUS EGIE3 80, SELL SOJA3 0.76 @8.06, SELL ITSA4 0.54 @14.658,
  SELL EZTC3 0.56 @15.19.
- UNSUPPORTED breakdown: settlement shadows matched to ledger trades,
  loan-roll débito+crédito pairs (LOAN_CUSTODY_STATE), priced-transfer review
  blocks. NEEDS_REVIEW: unmatched priced settlements (VIVT3 400s, MBRF3 rows
  also flagged UNKNOWN_ASSET, BBAS3/B3SA3/PETR4 loan mirrors) — missing-trade
  signals, never auto-imported.

## 4. Supported event classes (PART B–J)

- **BONUS** — quantity-only, no assignedCost, no price, no fees. Engine keeps
  costBasisStatus INCOMPLETE (ADR-049; unknown never zero). Priced bonus rows →
  NEEDS_REVIEW (`BONUS_WITH_PRICE`), never auto-convert.
- **BONUS_FRACTION_CASHOUT** — paired `Fração em Ativos` débito + `Leilão de
  Fração` crédito (ticker + exact qty) yield ONE fraction SELL at auction price
  (notes cite both rows). Unpaired débito → REVIEW; unpaired auction → SELL +
  REVIEW flag. Auction cash is the sell proceeds — no separate cash event, never
  a market BUY/SELL pair.
- **SUBSCRIPTION_EXERCISE** — parsed and explained, NOT persistable: movement
  rows carry no exercise price and SUBSCRIPTION requires unitPrice > 0; rights
  sold/ceded or unexercised have NO_PARENT_QUANTITY_EFFECT (proven by
  HYPE1/MXRF12/HGLG11/SNFZ12/PMLL12/IRIM12 rows). Status REVIEW_REQUIRED with
  `SUBSCRIPTION_LIFECYCLE_MANUAL`.
- **RECEIPT_CONVERSION** (SNEL13 → SNEL11) — **CORPORATE_ACTION_PERSISTENCE_GAP**:
  the domain has no conversion type, and a TRANSFER_IN/OUT pair would poison the
  parent's KNOWN cost basis to INCOMPLETE (ADR-059). STOP for persistence;
  REVIEW_REQUIRED with gap reason. Reconciliation stays analytical (§7).
- **TICKER_RENAME** (MALL11→PMLL11, MRFG3→MBRF3) — NOT a ledger event
  (ticker ≠ identity, AGENTS.md §1.7). Requires catalog successor mapping
  (future phase); renamed tickers surface as NOT_FOUND/NEEDS_MAPPING, never as
  SELL+BUY. No phantom assets auto-created (reference catalog has no entry).
- **STOCK_LOAN** (`Empréstimo - Registro/Liquidação - Doador`) — custody
  availability/loaned state only, economic-neutral (HYPE3/VIVT3/EZTC3/MBRF3
  proven). Notices INFORMATIONAL; paired transfer legs UNSUPPORTED.
- **SETTLEMENT_SHADOW** — conservative matcher (ticker + qty + price +
  direction + institution/account + ±5d window + known provenance). Match →
  UNSUPPORTED (`SETTLEMENT_SHADOW_OF_TRADE`, cites the trade). Ambiguous →
  REVIEW_REQUIRED (`UNMATCHED_PRICED_SETTLEMENT` / `TRANSFER_NEEDS_COUNTERPARTY`).
  No-price sale-settlement legs surface as REVIEW (explicit, not silent).
- **CASH_ONLY** — DIVIDENDO, JCP, RENDIMENTO, REEMBOLSO, RESTITUIÇÃO DE CAPITAL,
  loan-interest qty-0 rows, fraction cash legs. Never quantity explanations;
  future cashflow/income phase material only.

## 5. Cost basis & tax safety (PART T–U)

- No event transforms INCOMPLETE into known cost. All five bonus positions are
  already INCOMPLETE; confirmation keeps them INCOMPLETE with quantity added.
- Fraction SELLs on INCOMPLETE positions yield INCOMPLETE disposals: no fabricated
  acquisition cost, no fabricated realized gain, no fabricated tax.
- Preview warns when a bonus would touch a KNOWN-cost position (ADR-049 flips it
  to INCOMPLETE) — owner-visible before any confirmation.
- Fiscal regressions executed in quality gates (tax-engine suite green).

## 6. Deduplication (PART V)

- externalId `B3MOV|<file>|<row>|<date>|<label>|<ticker>|<qty>|<dir>` — stable
  across re-parses (tested); source-identity EXACT_DUPLICATE on reupload (tested
  via classifyOne); canonical fingerprint catches cross-file duplicates.
- Reupload of the movement file: 0 duplicated economic effects (only NEW rows
  could ever become READY; all current READY rows would flip to DUPLICATE once
  confirmed — same machinery as negotiations).

## 7. Reconciliation after preview (PART Q/S) — projected, nothing applied

Assuming only the 8 READY events confirmed (owner action, NOT executed):

| Ticker | Before | +READY | Projected | B3 | Result |
|---|---|---|---|---|---|
| COGN3 | 300 | +30 | 330 | 330 | MATCH |
| SOJA3 | 900 | +43.76 −0.76 | 943.00 | 943 | MATCH |
| EZTC3 | 1200 | +271.56 −0.56 | 1471.00 | 1471 | MATCH |
| ITSA4 | 961.3 | +23.54 −0.54 | 984.30 | 1000 | residual **15.7 explicitly visible** (PART L) |
| EGIE3 | 400 | +80 | 480 | 280 | still UNRESOLVED (PART K) |
| KCRE11 | 220 | — (gated) | 220 | 300 | explained, pending owner representation decision |
| SNAG11 | 1646 | — (manual) | 1646 | 1846 | explained-not-applied (subscription, no price) |
| SNEL11 | 2540 | — (gap) | 2540 | 2740 | explained-not-applied (receipt conversion gap) |
| MALL11/MRFG3 | held | — (catalog) | held | renamed | explained-not-applied (successor mapping) |
| VIVT3 | 200 | — | 200 | 400 | UNRESOLVED_PRE_WINDOW_CHANGE (PART M) |
| STBP3 | 0 | — | 0 | 0 | MATCH (PART R regression holds) |

Projected coverage: direct matches 30 → **33/40 (82.5%)**; explained-not-applied 5
rows; unresolved 2 (EGIE3 outflow, VIVT3 inflow) + ITSA4 residual visible.

## 8. Unresolved (PART K–M)

- **EGIE3 = UNRESOLVED_EXTERNAL_HISTORY_GAP.** No SELL/TRANSFER_OUT/ADJUSTMENT
  fabricated. The missing −200 (2024 normal custody) has no record in any file.
- **ITSA4 residual +15.7** stays visible; no silent correction.
- **VIVT3 +200 = UNRESOLVED_PRE_WINDOW_CHANGE** (2025, pre-28/10 window).

## 9. Database & ledger

- Migrations 45 → 45, delta 0. No schema change; corporate-action persistence uses
  existing BONUS/SELL ledger types only.
- Ledger delta 0 in this phase (preview + notices only; verified by count
  before/after). No TRANSFER_IN/BUY/SELL/INCOME/CORPORATE_ACTION persisted.

## 10. Human validation

- Preview: executable today via Import Hub (`B3_MOVEMENT_XLSX`) — 8 READY rows,
  45 REVIEW, 127 UNSUPPORTED, 527 notices; drill output above is the exact
  expected content.
- Confirmation: NOT EXECUTED (owner decision per PART X; KCRE11-style and
  KNOWN-cost warnings must be read first).
