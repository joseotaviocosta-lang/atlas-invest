# Pre-Baseline Unsettled-Trade Exception — Implementation

Status: READY for owner preview (`PRE_BASELINE_UNSETTLED_TRADE_EXCEPTION_READY`,
`OWNER_PREVIEW_REQUIRED`). Real confirmation NOT executed (ledger 134 → 134).

## 1. Default gate (unchanged in spirit, widened in coverage)

Pre-existing behavior: movement-sourced BUY/SELL/BONUS/SUBSCRIPTION dated
≤ an opening TRANSFER_IN → `NEEDS_REVIEW/PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT`.
This phase extracts the check into a shared pure function
(`packages/import-engine/src/pre-baseline.ts`) and applies it to
B3_NEGOTIATION previews too — previously negotiation rows bypassed the gate
entirely (silent double-count hole; the KCRE11 27/12 row would have shown
READY). Movement behavior is byte-identical (message unified; no test
asserted the old text). Negotiation previews now load full ledger history
(same justification as movement: narrow files must not blind the check).

## 2. Exception (PART B–D)

- Type: `PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT` — owner asserts documentary
  evidence proves the trade settled after the snapshot cutoff.
- Eligibility (all required): B3 negotiation source; BUY/SELL; NEEDS_REVIEW
  with the gate as the only non-resolution issue; asset+account resolved;
  duplicate NEW. The gate flags candidates (`unsettledExceptionEligible`,
  `coveringSnapshotDate`); confirm re-verifies server-side.
- Metadata: reason 1–500 chars (required) + optional declared settlement
  date (civil, provenance-only — replay ordering stays tradeDate; PART E).
  Persisted in ledger notes (existing audit trail — no new table, no
  migration; 46 → 46, PART S).
- KCRE11 mapping: 27/12 leg → eligible + covering 2024-12-31; 26/12 leg →
  covered default (no resolution applied, PART K); all other Dec-2024+
  pre-baseline rows stay gated (PART L, verified on the real file:
  MXRF11/RBRP11/MCCI11/B3SA3/SNID11 + ~100 older rows NEEDS_REVIEW).

## 3. Ledger semantics (PART F–G)

Released rows persist as canonical BUY (KCRE11 80 @ 8.45 @ 27/12/2024,
cost 676.00). No TRANSFER/ADJUSTMENT/settlement-date inventions. Opening
120 stays cost-unknown → aggregate remains INCOMPLETE (proven by projection).

## 4. Temporal basis (PART H–I)

Trade-date economics @ 31/12/2024 = 200 vs B3 settled-custody snapshot =
120 — legitimate, documented divergence (projection test pins asOf-31/12 at
200 and asOf-31/12/2025 at 300). Read models keep a single `tradeDate`
(PART I assessment: notes provenance suffices; no engine/model change).

## 5. Security (PART M)

Confirm recomputes preview server-side; forged resolutions (wrong status,
extra blockers, bad metadata, unknown type) → `error` entries, writer never
called. Covered by use-case tests. UI mirrors eligibility display-only.

## 6. Dedupe + projection (PART N–P)

Post-confirmation re-upload → EXACT_DUPLICATE via canonical fingerprint
(tested). Synthetic projection: 120 + 80 + 96 + 4 = 300, INCOMPLETE, zero
disposals. Coverage projection 36/40 → 37/40 (92.5%) on owner confirmation.

## 7. Follow-up (PART Q)

26/12 leg (120 @ 8.50) is cost evidence for covered quantity —
`OPENING_POSITION_COST_EVIDENCE` remains a future, undesigned concept.
