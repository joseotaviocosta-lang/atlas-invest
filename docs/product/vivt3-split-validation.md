# VIVT3 Split Validation — April-2025 Grouping/Split (SAFE_TO_CONFIRM)

Verdict: **SAFE_TO_CONFIRM** for this holder. No ordering gap, no atomicity
blocker for the VIVT3 instance. Ledger 135 → 135, migrations 46 → 46, zero
production code changes (tests + doc only).

## 1. Domain semantics (STEP 1–2)

- REVERSE_SPLIT stores the divisor as `factor`: 200 / 40 = 5.
- SPLIT stores the multiplier as `factor`: 5 × 80 = 400.
- Both are same-asset quantity transforms: no proceeds, no disposal, total
  cost invariant (KNOWN) or status preserved (INCOMPLETE). Factor 1 and
  non-positive factors rejected; empty positions rejected.

## 2. Same-day ordering (STEP 3–4, 19)

Canonical replay order is (tradeDate, createdAt, id) — deterministic for any
fixed row set (permutation-invariant). Both legs share tradeDate 2025-04-15;
creation order decides sequence. Proven by test that BOTH sequences yield
identical results for exact multiples (200→5→400 vs 200→16000→400 converge
to 400 with equal cost state, zero disposals either way). No
CORPORATE_ACTION_ORDERING_GAP for this holder. General hardening idea
(explicit 1ms-separated createdAt, rectification precedent) documented but
not required here — no schema/code change made.

## 3. Cost / tax / fractions (STEP 5–6, 8)

- INCOMPLETE (actual VIVT3 state) preserved end-to-end, tested.
- KNOWN invariant tested: 200 @ 10.00 → 5 @ 400.00 → 400 @ 5.00
  (total 2000.00 untouched). No reset, no zero, no fabrication.
- Tax: CORPORATE_ACTION / NON_TAXABLE, proceeds and realizedResult
  undefined, tested. Zero DARF.
- Fractions: none possible (200/40 = 5 exact; 5×80 = 400 exact); no
  fraction sale, no cash compensation for this holder.

## 4. Loans (STEP 9)

Loan rolls are custody-availability only (economic effect 0, tested composed
with a matched transfer pair + split → 400). Split derived from the
official corporate action, never from loan debit/credit rows.

## 5. Entry path + atomicity (STEP 10–11, 20)

- No movement rows exist (pre-coverage); CSV maps splits to DEFERRED; manual
  UI entry supports trades/income only. Safest existing path: two direct
  POST /transactions (REVERSE_SPLIT 40, then SPLIT 80, both @ 15/04/2025)
  with shared provenance tag `VIVT3_2025_04_15_GROUP_SPLIT`, then verify.
- Atomicity: each POST is transactional; the pair is not. Accepted for this
  holder: any intermediate state (5 shares, INCOMPLETE, no realization) is
  harmless and converges on the second leg. No ATOMICITY_GAP block;
  grouped-import support remains future work.
- Dedupe: legs differ by type in the canonical fingerprint (tested);
  re-entry yields exact duplicates.

## 6. Preview labels (STEP 14)

History surfaces `Grupamento` / `Desdobramento` (existing, tested) with
before/after quantities; no purchase/sale terminology. Import preview has
no split rows to show (nothing staged).

## 7. Projection (STEP 7, 17–18)

200 → 400 = MATCH; 37/40 → 38/40 (95.0%) on confirmation. Remaining:
EGIE3 −200, ITSA4 +15.7 (evidence-blocked), SNEL +200 (date-blocked).

## 8. Quality

domain 66 · portfolio 290 · tax 815 · import 228 · web 602 · typecheck
25/25 · lint 0 · api/web builds 0 · diff clean. Pre-existing failures
untouched (migration-count hardcodes, version drift, stale message test —
all fail identically on baseline).
