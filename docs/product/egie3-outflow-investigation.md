# EGIE3 Outflow Investigation — Off-File −200 (CASE E)

Decision: **CASE E — EXTERNAL_ACCOUNT_OR_BROKERAGE_GAP**. A −200 outflow
before 26/11/2025 is arithmetically proven, but no outflow event exists in
any local file. No writes (137 → 137), migrations 46 → 46. Coverage stays
38/40.

## 1. Anchors (re-verified)

- Opening 31/12/2024: 200 normal + 200 donor = 400 (Atlas: single 400
  TRANSFER_IN). Full-file negotiations: sole row is a 2021 BUY 200 @ 40.50.
- Current: 280 normal, no loan row → economic 280 (donor rows counted once;
  no double-count).
- Atlas: 400 + 80 bonus = 480. Delta −200.

## 2. The bonus-base proof (official Engie RI)

- Fato Relevante + Aviso 05/11/2025: 40% bonus (1 per 2.5), data-base
  26/11/2025, ex 27/11, credit 01/12/2025, fraction window 02–31/12/2025.
- Credited +80 ⇒ eligible base EXACTLY 200 (80/0.40). Therefore total
  economic ownership at 26/11/2025 was 200, not 400.
- Conclusion: **−200 outflow in (31/12/2024, 26/11/2025]**, mostly outside
  movement coverage (starts 28/10/2025).

## 3. Exhaustive local silence

- Negotiations (both files, 2019–2026): zero EGIE3 sells; sole row is the
  2021 buy. No 2025 outflow trade exists on-file.
- Movement: no priced outflow (all débitos are zero-price loan mirrors);
  no 200-sized transfer-out; sole bonus +80 (R661); loan rolls neutral.
- Corporate actions: only the +80 bonus (no split/reverse/reduction).
- Annual 2025: (0 normal, 280 donor) — confirms the outflow, explains
  nothing about its channel.

## 4. File-incompleteness flag (R706)

03/11/2025: crédito Transferência-Liquidação +200 @ 40.00, with NO matching
negotiation BUY anywhere — the negotiation export is PROVEN incomplete for
EGIE3 custody-affecting events. A symmetric off-file outflow (sale via
another channel, portability to another broker/account, pre-window event
absent from the export) is therefore plausible and unprovable locally.

## 5. Ruled out

- A (local sell): reconfirmed absent. C (qty-reducing corporate action):
  none exists. D (loan misclassification): rolls neutral, current outright.
- Composition micro-puzzles (dividend qty 200 vs loan balances) are
  record-date/renewal noise, second-order to the proven −200.

## 6. Cost / tax / importability

- Type unknown (sale vs transfer) → NO realization asserted, no DARF,
  position stays INCOMPLETE. Nothing booked (MODEL_GAP evidentiary).
- If later proven a sale with unknown cost: INCOMPLETE realized result
  (never zero). If transfer-out: non-taxable custody move.

## 7. Next action

Owner pulls: (a) XP 2025 pre-October brokerage movement for EGIE3,
(b) any second-broker/account statements, (c) portability
(transferência de custódia) records. Target: the −200 outflow in 2025
before 26/11. Projection on proof: 480 → 280 = MATCH, 38/40 → 39/40.
