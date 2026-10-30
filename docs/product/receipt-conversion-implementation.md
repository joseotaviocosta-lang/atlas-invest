# RECEIPT_CONVERSION Implementation — Infrastructure Complete, SNEL Gated

Decision: `RECEIPT_CONVERSION_MODEL_APPROVED` (conceptual). Real SNEL event
stays `REVIEW_REQUIRED` (`SNEL_CONVERSION_DATE_EVIDENCE_REQUIRED` — exact
date unknown, ordering material). No fabricated dates. No real confirmation.

## 1. Domain (PART A–D, H)

- `TRANSACTION_TYPES` += `RECEIPT_CONVERSION` (17 canonical types).
- `ReceiptConversionTransaction`: source `assetId` + `quantity`, `targetAssetId`
  - `targetQuantity`, `conversionRatio`, `conversionType` (`CONVERSION_TYPES =
['SUBSCRIPTION_RECEIPT']`). No unitPrice/proceeds/fees by construction.
- Factory invariants (`RECEIPT_CONVERSION_INVALID`): distinct assets, both
  quantities > 0, ratio > 0, known conversion kind; ratio consistency
  (`targetQty = sourceQty × ratio`, exact decimal, `CONVERSION_RATIO_MISMATCH`).
- `TransactionJSON` round-trips the four cross-asset fields; serialize emits
  no price/amount for conversions.

## 2. Storage (PART E–G, AF)

- Migration 46 (`20261030090000_add_receipt_conversion`): `target_asset_id`
  (UUID), `target_quantity` + `conversion_ratio` (NUMERIC 38,18),
  `conversion_type` (VARCHAR 50) — all nullable; CHECK
  `transactions_receipt_conversion_scope_check` enforces the PART F matrix
  (RC rows fully populated, no price/amount; all other types all-NULL);
  index on `target_asset_id`. Additive, backwards-safe.
- Verified: 134 historical rows preserved with all-NULL conversion columns;
  `atlas_dev` and `atlas_test` both at 46, `migrate status` clean.
- Mapper: `toPersistence` persists the dual reference; `toDomain` rebuilds
  via the factory (fail-closed on missing/forbidden fields, incl. TRANSFER
  rows carrying conversion columns). Round-trip + CHECK rejection covered
  by DB tests (18/18 green).

## 3. Replay (PART J–Q, X)

- `receiptConversionHandler`: structural re-validation → source long-only
  check (`ReceiptConversionInsufficientSourceError`, never negative) →
  currency agreement → proportional KNOWN carry (`average × qty`, exact) or
  INCOMPLETE propagation → source decrement (delete on full conversion) →
  target merge (PART N matrix: any INCOMPLETE side → INCOMPLETE; KNOWN+KNOWN
  sums exactly) → `AppliedCorporateAction` audit (source before/after +
  target side + ratio + converted qty) → zero disposals, zero income.
- Partial conversions keep the source average (KNOWN) or INCOMPLETE both
  sides. Cross-account impossible by construction (single `accountId`;
  account-scoped test). Currency mismatch fails closed.
- PART X proven by test: SELL interleaved before/after conversion yields
  different realized gains (100 vs non-100) — exact effective dates are
  material, justifying the EXACT-date gate.

## 4. Tax + annual (PART R–S)

- Projection: `CORPORATE_ACTION / NON_TAXABLE`, quantity-only, zero
  proceeds/gain/income, zero quality issues with known asset category.
  No DARF, no disposal, no acquisition reset. Annual positions flow from
  replay (carried or null/incomplete cost, never zero).

## 5. Import (PART T–V, AB)

- Operation supported end-to-end (template synonyms, normalizer with
  target columns + BigInt-exact ratio check + price/fee REVIEW gates).
- PART U gate at two levels: normalizer (BOUNDED/UNKNOWN → NEEDS_REVIEW with
  the pt-BR PART V message) + classify (same, defense in depth).
- Dedupe: `canonicalConversionFingerprint` (portfolio|account|both assets|
  both qtys|ratio|kind|date|currency) + ratio-insensitive probable key;
  `EXACT_DUPLICATE` blocks reconfirmation, `CONFLICT` stays explicit.
- Target resolution is DIRECT-match only (PART AD): successor fallback
  bypassed and tested (MBRF3-style alias never resolves as a target).
- Movement router emits ZERO conversion candidates (no labels exist);
  receipts/rights/Atualização stay notices. Preview UI shows origin →
  target + quantities + ratio; history shows target ticker enrichment.

## 6. UI (PART Z–AA)

- History: `Conversão de recibo` badge + `200 SNEL13 convertidos em 200
SNEL11`-style context (no sale/purchase language). Asset detail +
  operation-entry labels added. Import table: `Conversão de recibo` label,
  `—` price, origin→target line. AI timeline maps conversions to
  `OTHER_CORPORATE_ACTION` (AI scope unchanged).

## 7. SNEL real case (PART V, AC)

- 200 @ 1:1 proven analytically; exact date unobserved (zero SNEL13 rows in
  movement + negotiations; in-window SNEL11 BUYs make ordering material).
- Read-only full-pipeline preview on the real file: 0 conversion candidates,
  0 READY, 0 ledger writes. Stays REVIEW until a dated source appears.
- PART W honored: no year-end/midpoint/first-last substitution anywhere
  (gates + tests).

## 8. Regression (PART AE–AJ)

- Ledger 134 → 134. Replay 106/106, 41 positions, 2 accounts. Reconciliation
  36/40 = 90.0% with byte-identical residuals. Pre-existing failures
  untouched and unrelated (migration-count hardcodes 18/19/41/43, package
  version drift, operations-section language, one stale B3-unsupported
  message assertion — all fail identically on baseline HEAD).
- Known limitation (documented, not silently fixed): position-level TWR
  treats conversions as non-flows (like other corporate actions);
  consolidated TWR (external flows only) is unaffected.
