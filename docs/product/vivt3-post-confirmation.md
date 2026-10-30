# VIVT3 Post-Confirmation Audit — Grouped Split Pair Verified

Owner confirmed the grouped pair via the manual corporate-action flow.
Ledger 135 → 137. Audit read-only (137 → 137). Migrations 46 → 46.

## 1. New rows (STEP 2–4)

Exactly two, same tradeDate 2025-04-15, provider/source MANUAL,
deterministic `MANUAL-CA|…` externalIds, createdAt 1ms apart (584/585 —
staged order preserved):

- REVERSE_SPLIT factor 40 (200 → 5), notes "200 → 5".
- SPLIT factor 80 (5 → 400), notes "5 → 400".
  Canonical types only (no BUY/SELL/TRANSFER/ADJUSTMENT). Census delta vs
  135 baseline is exactly these two rows.

## 2. Provenance note (STEP 3, honest grading)

Source/manual/grouping evidence present (MANUAL source, deterministic
externalIds, same-date pair). The free-text notes are minimal quantity
arrows, not the suggested Telefônica evidence paragraph. Valid under the
implemented contract (non-empty required), but future confirmations should
use the shared evidence tag convention. Non-blocking.

## 3. Replay + quantity (STEP 5–7)

SUCCESS — processed 109, applied 109, 41 open positions (unchanged), 2
accounts, 7 disposals (unchanged). Audit trail: 200 → 5 (RS, INCOMPLETE)
→ 400 (S, INCOMPLETE). VIVT3 = 400 = B3 economic 400 → MATCH, delta 0.

## 4. Cost / tax / fractions / loans (STEP 9–14)

INCOMPLETE preserved end-to-end (totals undefined, never zero). Zero new
disposals, zero gain, zero DARF (CORPORATE_ACTION/NON_TAXABLE). Zero
fractions (exact multiples). Donor-loan rows untouched and neutral; the
200 → 400 comes from the split audit trail, no double-count.

## 5. Read model + dedupe (STEP 15–16, 18)

History emits both CORPORATE_ACTION items (RS 200→5, S 5→400, null costs,
INCOMPLETE) → UI Grupamento/Desdobramento (existing tested mapping, no
trade wording). Read-only re-preview: both EXACT_DUPLICATE, ready 0 —
no second write possible. No other pre-baseline state disturbed.

## 6. Reconciliation (STEP 17–18)

37/40 (92.5%) → 38/40 (95.0%). Newly closed: VIVT3. Remaining: EGIE3 −200,
ITSA4 +15.7 (evidence-blocked), SNEL11 +200 (date-blocked).

## 7. UX note (STEP 21)

Entries visible post-confirm via query invalidation; no explicit success
toast on the grouped confirm. Classified UX_POLISH (non-blocking) —
persistence and entries confirmed visible by owner + audit.

## 8. Next (STEP 22)

EGIE3 OUTFLOW INVESTIGATION (sole remaining internally-investigable gap).
