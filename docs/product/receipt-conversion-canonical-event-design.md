# Canonical Receipt Conversion Event — Design (APPROVED & IMPLEMENTED as infra)

Status: DESIGN APPROVED (`RECEIPT_CONVERSION_MODEL_APPROVED`) and implemented
as infrastructure (migration 46, domain, replay, tax, import, API, UI).
Real SNEL event remains REVIEW (`SNEL_CONVERSION_DATE_EVIDENCE_REQUIRED`).
Ledger 134 → 134. Reconciliation 36/40 = 90.0% (SNEL still out).
See `receipt-conversion-implementation.md` for the build record.

Status: DESIGN ONLY. No production code, no migration, no ledger writes.
Ledger 134 → 134 during design. Reconciliation unchanged: 36/40 = 90.0%.

## 1. Frozen matrix audit (STEP 1)

The 16 canonical types (`BUY SELL DIVIDEND JCP FII_INCOME BONUS SPLIT
REVERSE_SPLIT SUBSCRIPTION AMORTIZATION TRANSFER_IN TRANSFER_OUT DEPOSIT
WITHDRAWAL FEE TAX`) are single-asset events: one `assetId`, one quantity
axis, one cost axis. None carries (sourceAsset, targetAsset, sourceQty,
targetQty, ratio, cost-carry) jointly. Proven: no existing type expresses a
cross-asset quantity+cost transformation with zero realization.

## 2. Rejected models (STEP 2)

- SELL SNEL13 + BUY SNEL11: fabricates a disposal (RealizedDisposal), a
  false acquisition price, potential fake gain/loss and a TAXABLE sale in
  the tax projection. Rejected.
- TRANSFER_OUT + TRANSFER_IN pair: the engine enforces same-asset pairing
  (`CrossAssetTransferError`); transfers carry no cross-asset cost lineage,
  so the parent would inherit nothing or poison its basis (ADR-059).
  The pairing machinery (`transferGroupId` + replay-time `carriedCost`) is
  the closest existing pattern but is asset-locked by design. Rejected.
- ±200 ADJUSTMENT rows: erase lineage (no source/target link, no ratio, no
  audit of what transformed into what). Rejected.

## 3. Proposed event (STEP 3–4)

Name: `RECEIPT_CONVERSION` (narrow; a future generic split/merge conversion
would need its own semantics review — do not overload).

Conceptual fields: `sourceAssetId`, `targetAssetId`, `sourceQuantity`,
`targetQuantity`, `conversionRatio`, `effectiveDate` (civil), `costCarryMode`
(`KNOWN_TOTAL | INCOMPLETE_SOURCE`), `conversionType =
SUBSCRIPTION_RECEIPT`, provenance (`sourceReceiptTicker`, `targetParentTicker`,
B3 file/row or derived-evidence note, confidence).

Invariants: both quantities > 0, ratio > 0, source ≠ target, same account,
same currency. No unitPrice, no proceeds, no fees-as-disposal.

## 4. Cost semantics (STEP 5–7, 11)

Engine positions are aggregate average-cost only (totalCost + quantity;
no lot history). Carry rule is therefore arithmetic on aggregates:

- KNOWN source: `carried = sourceAverage × sourceQty` (exact decimal);
  source total −= carried; target total += carried; target average
  recomputed as total/qty. Target KNOWN+KNOWN sums exactly.
- INCOMPLETE source: target contribution INCOMPLETE → target aggregate
  becomes/remains INCOMPLETE (both directions: KNOWN target + INCOMPLETE
  source = INCOMPLETE; never 0).
- Partial conversion (source 300, convert 200): proportional removal for
  KNOWN (`average × 200`, remainder keeps average); INCOMPLETE leaves both
  sides INCOMPLETE.
- Target merge (SNEL11 already holds quantity): converted qty+cost fold into
  the existing position under the same rules; ownership unchanged.

## 5. Realization / tax / replay (STEP 8–10)

- Emits 0 `RealizedDisposal`, 0 gain/loss/percentage/proceeds — always.
- Tax projection: `CORPORATE_ACTION / NON_TAXABLE` (BONUS/SPLIT family).
  No DARF, no disposal, no income, no acquisition reset; annual position
  continuity survives the instrument change.
- Replay: (1) assert source qty ≥ converted qty else replay error (never
  negative); (2) decrement source; (3) carry cost state; (4) increment
  target; (5) merge per §4; (6) conservative INCOMPLETE propagation;
  (7) emit no disposal. Full conversion (200/200) closes the source
  position to 0 (STEP 12; zero positions stay omitted from state).

## 6. Identity boundary (STEP 13)

SNEL13→SNEL11 is NOT a ticker successor: receipt and parent coexisted as
distinct instruments (2024 report lists both: SNEL11 400 cotas + SNEL13 200
recibo). Successor mapping is symbol rename; conversion is an economic
corporate action. Separate mechanisms, never conflated.

## 7. Storage (STEP 14–15)

Current `transactions` table: single nullable `assetId`, single quantity —
two-asset reference impossible. Verdict: `RECEIPT_CONVERSION_STORAGE_GAP`.
Minimal proposal (NOT executed): `target_asset_id UUID nullable` +
`conversion_ratio NUMERIC(38,18) nullable` + `conversion_type VARCHAR(50)
nullable` on `transactions`, with CHECK constraints scoping them to
`type='RECEIPT_CONVERSION'`; or a side table
`receipt_conversions(transaction_id PK/FK, target_asset_id, ratio, type)`.
Impact map if approved: domain entity + union member + factory validation;
Prisma model + mapper (both directions, canonical-decimal strings);
portfolio-engine dispatcher handler + error class; tax projection row;
import-engine candidate operation + movement router branch + gates;
API DTO + confirm branch; read-model/history CORPORATE_ACTION detail;
UI labels ("Conversão de recibo"); fingerprint includes both assets + ratio.

## 8. Dedupe + provenance (STEP 16–18)

Fingerprint: `portfolio | account | RECEIPT_CONVERSION | effectiveDate |
sourceAsset | targetAsset | sourceQty | targetQty | ratio | currency`
(+ provider/externalId when B3-sourced). Reupload → EXACT_DUPLICATE.
Provenance preserves both tickers, file/row or derived-evidence note, and
DATE CONFIDENCE: `EXACT_DATE` (dated B3 row) vs `BOUNDED_DATE` (inferred
window) vs `UNKNOWN_DATE`. Bounded/unknown dates are REVIEW-only and must
never be silently pinned to a calendar day.

## 9. SNEL evidence + ordering (STEP 19–21)

Facts: source SNEL13 200 (2024 report, "Recibo", 8.53 ref price — position
statement, not cost proof); target effect +200 (2025 report SNEL11 900 =
400 + 200 receipt + 100 + 200 dated BUYs); ratio 1:1; movement file has
ZERO SNEL13 rows; negotiations have ZERO SNEL13 rows; exact conversion date
unobserved — window (2024-12-31, 2025-12-31]. Dated SNEL11 BUYs exist INSIDE
the window (12/09/2025 200 @ 8.59; 29/10/2025 100 @ 8.48), so exact ordering
is material in general (KNOWN-cost conversions do not commute with
interleaved disposals). The SNEL instance itself is order-invariant
(INCOMPLETE→INCOMPLETE regardless of sequence), but bounded dates are not
safely replayable as policy. Verdict: B (semantics proven, date missing) →
`SNEL_CONVERSION_DATE_EVIDENCE_REQUIRED`. The 8.53/8.55 report figures are
position-statement values, never exercise/cost evidence.

## 10. Projection + test plan (STEP 23–26)

On safe conversion: SNEL13 −200 (closes), SNEL11 +200 → 36/40 → 37/40 =
92.5%. Remaining: ITSA4 +15.7, EGIE3 −200, VIVT3 +200, KCRE11 +80.
Future tests: known 1:1 carry exact; incomplete propagation both directions;
partial conversion + remainder average; pre-existing target merge; exact
close-out; insufficient-source replay error; zero disposals; zero DARF;
decimal-exact preservation; dedupe idempotence; effective-date ordering;
successor registry untouched; SELL+BUY/TRANSFER construction impossible
at the type level.

## 11. Decisions (STEP 22, 25)

- Source sufficiency: B (`CONVERSION_SEMANTICS_PROVEN_DATE_MISSING`).
- `NEW_CANONICAL_EVENT_REQUIRED = YES` (`RECEIPT_CONVERSION`).
- `SCHEMA_MIGRATION_REQUIRED = YES` (two-asset reference; proposal above,
  not executed).
- Implementation readiness: NOT READY — needs (a) model approval,
  (b) migration, (c) engine handler + tests, (d) exact effective date for
  the SNEL instance (or an explicit bounded-date replay policy decision).
  SNEL stays REVIEW; ledger untouched.
