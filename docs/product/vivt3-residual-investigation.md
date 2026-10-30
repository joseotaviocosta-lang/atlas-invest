# VIVT3 Residual Investigation — 2025 Split Found (CASE B)

Decision: **CASE B — OFFICIAL_EXTERNAL_EVENT_FOUND**. The +200 is the
April-2025 Telefônica Brasil grouping/split (net ×2 on multiples of 40).
No writes (135 → 135), migrations 46 → 46. Coverage stays 37/40 pending
owner confirmation.

## 1. Anchors

- Atlas: single TRANSFER_IN 200 @ 31/12/2024, sourced EXCLUSIVELY from the
  2024 Empréstimos donor row (notes say so; no normal-custody VIVT3 row
  exists in annual 2024). Economic ownership at baseline: 200.
- Annual 2025: 400 ON normal. Current B3: 400 economic (position file shows
  ONLY a 400 donor row, 21/10/2026→23/11/2026; normal absent → 0 + 400).
- Ledger trades: ZERO VIVT3 BUY/SELL ever (only a 2020 VIVT4 PN buy, see §5).
- Movement: loan rolls (400 post-Apr-2025, 200 before), settlement shadows,
  cash-only (JCP/reembolso/juros), one capital restitution (14/07/2026,
  value-only). Nothing quantity-adding.

## 2. Loan analysis (STEP 8, 16–17)

Every donor roll nets zero economically (paired débito/crédito, mirrored
Transferência legs, all gated UNSUPPORTED/neutral). Donor retains ownership
(same semantics as MRFG3 precedent). Current arithmetic: normal 0 + donor
400 = 400 economic, counted once (no double-count: matrix adds normal +
donor; normal row absent). The delta is REAL (400 vs 200), not a
classification bug → not CASE C.

## 3. The event (STEP 13–14, official)

- Telefônica Brasil RI (official FAQ) + company comunicado 14/04/2025:
  grouping 40:1 then split 1:80, ex-grupamento/ex-desdobramento trading
  from Tuesday 15/04/2025. Net factor for multiples of 40: ×2.
- Math: 200 / 40 = 5 → 5 × 80 = 400. Exact, no fractions for this holder
  (200 is a multiple of 40; others' fractions auctioned separately).
- Corroboration: loan quantities step 200 → 400 across April 2025;
  2026 income rows on 400; annual 2025 = 400.
- Effective date for replay: 2025-04-15 (both legs; reverse-split first by
  canonical ordering).

## 4. Bridge

2024: 200 → 15/04/2025 split ×2 → 400 → annual 2025: 400 → 2026: no qty
events → current 400. First unexplained point resolved: April 2025.

## 5. VIVT4 note (opening origin, hypothesis)

2020 VIVT4 PN 200 buy has no VIVT4 position anywhere; Vivo concluded the
PN→ON conversion 23/11/2020 (Nov-2020 press). The 200 VIVT3 baseline is
consistent with converted ex-VIVT4 shares (no separate booking needed;
pre-window, correctly absent). Not required for the residual.

## 6. Cost / tax / model (STEP 20–22)

- Cost: source INCOMPLETE → stays INCOMPLETE (split preserves totalCost by
  invariant; nothing to preserve here). Zero fabrication.
- Tax: non-taxable corporate action (SPLIT family); no DARF, no disposal.
- Model: READY_WITH_EXISTING_MODEL — REVERSE_SPLIT factor 40 +
  SPLIT factor 80, both native, no gate blocks post-baseline splits.
  Movement file correctly has no rows (pre-coverage).

## 7. Projection

200 → 400 = MATCH; 37/40 → 38/40 (95.0%) on owner confirmation of the two
split legs @ 15/04/2025. Standing debt untouched.
