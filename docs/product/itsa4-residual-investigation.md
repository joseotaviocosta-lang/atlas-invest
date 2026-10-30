# ITSA4 Residual Investigation — +15.70 Unexplained (CASE E)

Decision: **CASE E — EVIDENCE_INSUFFICIENT** with a named, unconfirmed
hypothesis (Feb-2025 capital-increase subscription). No writes (135 → 135),
no imports, migrations 46 → 46. Coverage stays 37/40.

## 1. Anchors (all re-verified against real files)

- Opening 31/12/2024: 1161.3 (normal custody, no loans).
- Dec-2025 bonus: +23.54 @ 2% on eligible 1177.00 (23.54/0.02 exact),
  record 18/12/2025, credit 23/12/2025 (official Itaúsa RI).
- Fraction: −0.54 auctioned 25/02/2026 @ 14.658 (in ledger).
- 08/10/2026 SELL −200 @ 16.10 (in ledger).
- Annual 2025: 1200.54 (= 1177 + 23.54). Current B3: 1000.
- Atlas: 1161.3 + 23.54 − 0.54 − 200 = 984.3 ✓ (components sum exactly).
- Bridge identity: 1200.54 − 200.54 − 1161.3 = **+15.70**, arriving in
  (31/12/2024, 19/12/2025] (first 1177 sighting: 19/12 dividendo row).
- No ITSA3 cross-class events; loans economic-neutral; cash rows separated.

## 2. Ratio forensics

- Bonus: 23.54/1177 = 2.0000% exact → eligible 1177.00 corroborated by
  three independent 1177 income-qty rows. Residual 15.70 exact.
- Candidate rate 15.70/1161.3 = 1.3519% matches no known corporate table.

## 3. The only official window event: Feb-2025 chamada de capital

- Itaúsa RI (official): ratio 1.3766678% on 17/02/2025 position, price
  R$ 6.70, preference 10/03–10/04/2025, sobras 05–09/05, auction 20/05,
  homologation 26/05, credit 29/05/2025. Rights ITSA2; partial exercise
  allowed (integer shares).
- Full entitlement on proven base: 1161.3 × 1.3766678% = **15.9872**.
- 15.9872 ≠ 15.70 (Δ 0.287). Fractional subscriptions do not exist, and no
  local exercise/credit row exists (movement starts 28/10/2025; negotiation
  file silent). Amount identity FAILS → not CASE B.
- Display-rounding caveat (for future investigators): if B3 qty fields
  truncate, true eligible ∈ [1177.00, 1177.50) admits 15.987 — compatible
  but unprovable either way. Not a basis for booking.

## 4. Ruled out

- A (missing local event): exhaustive sweep — none in any file.
- C (KCRE11-style settlement exception): no pre-baseline ITSA4 trade exists
  (only 2020 buys + 2026 sell).
- D (rounding): exact-decimal bridge leaves a real 15.70, not dust.
- F (conflict): sources agree everywhere.

## 5. Cost / tax / importability

- IF confirmed as subscription: price R$ 6.70 is factual (official), but
  quantity AND exercise date are unattributable → SUBSCRIPTION cannot be
  constructed (existing model sufficient, evidence insufficient).
- Aggregate stays INCOMPLETE regardless. No tax event to classify.
- MODEL_GAP (evidentiary, not structural): needs holder-level proof.

## 6. Next action

Owner pulls ONE of: XP subscription statement (ITSA2 exercise, Mar–May
2025), 2025 Informe de Rendimentos (chamada credit), or brokerage note.
With exact qty/date: SUBSCRIPTION ... @ 6.70 → READY path (no new model).
Projection then: 984.3 → 1000 = MATCH, 37/40 → 38/40 (95.0%).
