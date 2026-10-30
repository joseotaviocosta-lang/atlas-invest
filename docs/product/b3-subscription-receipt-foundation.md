# B3 Subscription + Receipt Conversion Foundation — Cost-Safe Model

- Ledger before/after development: 132 → 132 (delta 0; no confirm executed).
- Migrations: 45 → 45 (no schema change).
- Reconciliation entry: 35/40 = 87.5%.

## 1. Domain audit (PART A)

Canonical `TRANSACTION_TYPES` already contain `SUBSCRIPTION`. Engine
`subscriptionHandler` requires quantity > 0 and unitPrice > 0, folds
`unitPrice × quantity` into the position, keeps INCOMPLETE positions
INCOMPLETE, and never emits disposal/income. Tax projection maps
`SUBSCRIPTION` to `PURCHASE / INFORMATIONAL` (no gain, no DARF).
Database mapper round-trips `SUBSCRIPTION` with quantity + unitPrice.
Conclusion: subscription exercise is fully representable — zero model gap.

Receipt conversion (`SNEL13 → SNEL11`, `SNAG13/SNAG14 → SNAG11`) has NO
canonical representation: the 16-type matrix is frozen (1H), TRANSFER pairs
would poison the parent's cost basis per ADR-059, and SELL+BUY would fabricate
realization. Conclusion: `SUBSCRIPTION_RECEIPT_MODEL_GAP` for the conversion
leg — documented, never improvised, no migration created for it.

## 2. Source evidence (PART B–D, real files read-only)

Movement file `movimentacao-2026-10-29-11-47-54.xlsx`:

| row     | date       | movement                          | instrument | qty                 | price | value |
| ------- | ---------- | --------------------------------- | ---------- | ------------------- | ----- | ----- |
| 397     | 27/03/2026 | Direitos de Subscrição - Exercido | SNAG12     | 100 (débito)        | 10.50 | 1050  |
| 379     | 13/04/2026 | Direitos de Subscrição - Exercido | SNAG12     | 100 (débito)        | 10.50 | 1050  |
| 394     | 30/03/2026 | Recibo de Subscrição              | SNAG13     | 100 (crédito)       | —     | —     |
| 372     | 14/04/2026 | Recibo de Subscrição              | SNAG14     | 100 (crédito)       | —     | —     |
| 282/283 | 25/05/2026 | Atualização                       | SNAG11     | 100 + 100 (crédito) | —     | —     |

Lifecycle: right grant (05/03: 1416) → partial exercise (2× 100 @ 10.50) →
receipts (SNAG13/SNAG14) → parent custody +200 via Atualização rows.
`PRICE_EVIDENCE_FOUND` for both SNAG11 lots (exact decimals, same price).

SNEL: all SNEL12 rights rows are cessions (2740 ceded, 0 exercised); no
exercise row and no price exist anywhere in the movement/negotiation/annual
files. The SNEL13 200 receipt predates the window (2024 annual report).
`PRICE_EVIDENCE_MISSING` + unknown cost lineage → stays REVIEW.

## 3. Cost rules (PART I–L)

- Exercise books `SUBSCRIPTION` on the PARENT ticker (SNAG12 → SNAG11) with
  the factual price. Receipts stay informational notices; the Atualização
  parent-mirror rows stay informational (the SUBSCRIPTION booking is the
  single economic effect — never double).
- `INCOMPLETE` positions stay `INCOMPLETE` on subscription (engine-guaranteed).
- Prohibited by construction: `BUY price=0`, `SELL receipt + BUY parent`,
  inferred prices (market/average/proportional), TRANSFER-pair conversion.

## 4. Conversion rules (PART F–H, gap)

Desired semantics (qty −200 receipt / +200 parent, cost carried, no gain)
cannot be expressed with the frozen 16 types. The SNAG case needs no
conversion booking (receipts were never ledger positions). The SNEL13 opening
position (200, cost unknown) cannot be converted honestly today → remains an
Atlas-only raw position with the gap documented, never zeroed.

## 5. Parser routing (PART M–O)

- `Direitos de Subscrição - Exercido` (débito, FII-derivable parent,
  qty > 0, price > 0) → `SUBSCRIPTION` candidate on parent, READY.
- Same label without price / zero price → `REVIEW_REQUIRED /
SUBSCRIPTION_WITHOUT_PRICE` with the pt-BR cost-evidence message.
- Underivable parent (HYPE1-style) → `SUBSCRIPTION_PARENT_UNRESOLVED`.
- Crédito-direction exercise → `SUBSCRIPTION_UNEXPECTED_DIRECTION`.
- Receipts, sobras, solicitações, cessões, expiries → lifecycle notices
  (rights group); ceded/expired rights never touch the parent.
- Parent derivation: `<BASE>1[234]` → `<BASE>11` only; anything else → review.

## 6. Real-file preview, PART Z (parse-only, NOT confirmed)

`movimentacao-2026-10-29-11-47-54.xlsx`: 710 rows → 182 candidates, 525 notices.
New READY subscription events: exactly 2 (SNAG11 100 @ 10.50 on 2026-03-27
and 2026-04-13, both post-baseline). Still REVIEW: 41 lifecycle notices
(incl. SNAG13/SNAG14 receipts, sobras, cessions). SNEL: 0 exercise rows.
Confirmation: NOT EXECUTED (owner decision required).

## 7. Expected results on owner confirmation

- SNAG11: 1646 + 200 = 1846 = B3 → MATCH (cost stays INCOMPLETE).
- SNEL11/SNEL13: unchanged (conversion gap) → still REVIEW.
- Projected coverage: 35/40 → 36/40 = 90.0% (not 37/40: SNEL needs the
  conversion model, honestly deferred).
- Raw open positions: 41 → 41 (no receipt position closes; subscriptions add
  to an existing position).

## 8. Remaining gaps (untouched)

ITSA4 +15.7, EGIE3 −200, VIVT3 +200, KCRE11 representation decision,
SNEL13→SNEL11 conversion model.

## 9. Decision

- Subscription exercise leg: CASE A — `SUBSCRIPTION_RECEIPT_MODEL_READY`,
  `OWNER_PREVIEW_REQUIRED` (2 READY events awaiting explicit confirmation).
- Receipt conversion leg: CASE C — `SUBSCRIPTION_RECEIPT_MODEL_GAP`
  (frozen 16-type matrix; no new canonical event created in this phase).
