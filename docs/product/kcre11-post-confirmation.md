# KCRE11 Post-Confirmation Audit — Unsettled-Trade Exception Verified

Owner receipt: "Importação concluída parcialmente — 1 evento importado com
sucesso, 129 itens permanecem pendentes de revisão, nenhum erro técnico".
Ledger 134 → 135. Audit read-only (135 → 135). Migrations 46 → 46.

## 1. New transaction (STEP 2–3)

Exactly one: BUY KCRE11, tradeDate 2024-12-27, qty 80, unitPrice 8.45
(gross 676.00), provider B3, row 61 of the full negotiation file.
Provenance notes carry the full chain: source file + row + market +
`Resolução PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT` + owner reason +
`(snapshot 2024-12-31; liquidação declarada 2025-01-02)`. Canonical
tradeDate untouched. No second new row.

## 2. Exclusivity (STEP 4–5)

26/12 BUY 120 NOT persisted (opening TRANSFER_IN remains the sole
representation). Zero unexpected pre-baseline imports: read-only re-preview
of the full file shows 0 READY pre-baseline rows; 27/12 now
EXACT_DUPLICATE; 26/12 NEEDS_REVIEW/NEW (still covered by default).

## 3. Replay + quantity + cost (STEP 6–9)

SUCCESS — processed 107, applied 107, 41 open positions (unchanged), 2
accounts, 7 disposals (unchanged). KCRE11: 220 → 300 = B3 300, MATCH,
delta 0. Cost stays INCOMPLETE (total/average undefined): opening 120
unknown dominates the known lots (80 @ 8.45 = 676.00; 96 @ 7.99; 4 @ 7.98).
No fabricated totals. No realization, no gain/loss, no DARF, no income —
plain acquisition (STEP 10–11).

## 4. Temporal basis (STEP 12–13)

asOf-2024-12-31 replays 200 vs B3 custody snapshot 120:
`EXPECTED_TEMPORAL_BASIS_DIVERGENCE` (trade-date entitlement vs
cutoff-based custody), not a reconstruction error. asOf-2025-12-31 = 300;
convergence holds at every later date.

## 5. Reconciliation (STEP 14–15)

36/40 (90.0%) → 37/40 (92.5%). Newly closed: KCRE11. Remaining diffs
byte-identical otherwise: EGIE3 −200, ITSA4 +15.7, SNEL11 +200, VIVT3 +200;
ONLY_IN_ATLAS = [SNEL13].

## 6. Next phase (STEP 21, decided by available evidence)

- **ITSA4 (+15.7) — recommended first.** Fractional residue with the
  bonus→fraction mechanism already proven in-file (23.54 bonificada +
  0.54 leiloada, both in ledger). A similar earlier residue likely explains
  +15.7; annual-report bridge + full-file bonus scan can confirm locally.
- **VIVT3 (+200) — second.** No negotiation rows at all; movement shows
  only loan rolls, settlement shadows and a 2026 capital restitution.
  Pre-window change needs broker/external documents.
- **EGIE3 (−200) — last.** Sole negotiation row is a 2021 BUY 200; the
  −200 outflow is invisible in every local file (external history gap).
- **SNEL — blocked** on official conversion-date evidence (unchanged).
