# B3 Post-Confirmation Reconciliation — Carteira Real after 8 R1 events

- Ledger: 124 → 132 (+8: 5 BONUS + 3 fraction SELL, zero phantoms).
- Replay: SUCCESS, processed 104, applied 104, 41 open positions (unchanged),
  2 accounts, 7 realized disposals (all INCOMPLETE), summary BRL:INCOMPLETE.
- Method: exact decimals, B3 file `posicao-2026-10-29-11-46-14.xlsx`, same
  semantics as `b3-current-position-reconciliation.md`. Read-only audit.

## 1. Confirmed rows (ledger truth)

5 BONUS (qty-only, no price): COGN3 +30 (29/12/2025), ITSA4 +23.54, SOJA3 +43.76
(22/12/2025), EZTC3 +271.56 (11/12/2025), EGIE3 +80 (28/11/2025).
3 fraction SELLs: SOJA3 0.76 @8.06 (13/03/2026), ITSA4 0.54 @14.658 (25/02/2026),
EZTC3 0.56 @15.19 (11/02/2026).
Zero movement TRANSFER_IN/OUT, zero loan/shadow writes.

## 2. Full matrix (Atlas vs B3 economic, diff = B3 − Atlas)

| Ticker | Atlas         | B3            | Diff  | Before     | After      | Reason                                   |
| ------ | ------------- | ------------- | ----- | ---------- | ---------- | ---------------------------------------- |
| B3SA3  | 400           | 400           | 0     | MATCH      | MATCH      | —                                        |
| BBAS3  | 200           | 200           | 0     | MATCH      | MATCH      | —                                        |
| BRAP4  | 200           | 200           | 0     | MATCH      | MATCH      | —                                        |
| BRCR11 | 44            | 44            | 0     | MATCH      | MATCH      | —                                        |
| COGN3  | 330           | 330           | 0     | DIFFERENCE | MATCH      | bonus +30 applied                        |
| EGIE3  | 480           | 280           | −200  | DIFFERENCE | DIFFERENCE | bonus applied; outflow still missing     |
| EZTC3  | 1471          | 1471          | 0     | DIFFERENCE | MATCH      | bonus + fraction applied                 |
| FESA4  | 1500          | 1500          | 0     | MATCH      | MATCH      | —                                        |
| FLRY3  | 315           | 315           | 0     | MATCH      | MATCH      | —                                        |
| HGLG11 | 58            | 58            | 0     | MATCH      | MATCH      | —                                        |
| HYPE3  | 400           | 400           | 0     | MATCH      | MATCH      | loan state untouched                     |
| IRBR3  | 29            | 29            | 0     | MATCH      | MATCH      | —                                        |
| IRIM11 | 99            | 99            | 0     | MATCH      | MATCH      | —                                        |
| ISAE4  | 300           | 300           | 0     | MATCH      | MATCH      | —                                        |
| ITSA4  | 984.3         | 1000          | +15.7 | DIFFERENCE | DIFFERENCE | bonus/fraction applied; residual         |
| JHSF3  | 400           | 400           | 0     | MATCH      | MATCH      | —                                        |
| KCRE11 | 220           | 300           | +80   | DIFFERENCE | DIFFERENCE | untouched (representation decision open) |
| KNRI11 | 30            | 30            | 0     | MATCH      | MATCH      | —                                        |
| MALL11 | 16            | 0 (PMLL11 16) | —     | ONLY_ATLAS | ONLY_ATLAS | rename, untouched                        |
| MBRF3  | — (MRFG3 200) | 200           | —     | ONLY_B3    | ONLY_B3    | rename, untouched                        |
| MCCI11 | 69            | 69            | 0     | MATCH      | MATCH      | —                                        |
| MRFG3  | 200           | — (MBRF3 200) | —     | ONLY_ATLAS | ONLY_ATLAS | rename, untouched                        |
| MXRF11 | 1571          | 1571          | 0     | MATCH      | MATCH      | —                                        |
| PETR4  | 200           | 200           | 0     | MATCH      | MATCH      | —                                        |
| PMLL11 | — (MALL11 16) | 16            | —     | ONLY_B3    | ONLY_B3    | rename, untouched                        |
| PRIO3  | 100           | 100           | 0     | MATCH      | MATCH      | —                                        |
| RBRP11 | 90            | 90            | 0     | MATCH      | MATCH      | —                                        |
| ROXO34 | 550           | 550           | 0     | MATCH      | MATCH      | —                                        |
| SAPR4  | 2500          | 2500          | 0     | MATCH      | MATCH      | —                                        |
| SNAG11 | 1646          | 1846          | +200  | DIFFERENCE | DIFFERENCE | untouched (needs price)                  |
| SNCI11 | 130           | 130           | 0     | MATCH      | MATCH      | —                                        |
| SNEL11 | 2540          | 2740          | +200  | DIFFERENCE | DIFFERENCE | untouched (conversion gap)               |
| SNEL13 | 200           | 0             | —     | ONLY_ATLAS | ONLY_ATLAS | receipt, untouched                       |
| SNFF11 | 100           | 100           | 0     | MATCH      | MATCH      | —                                        |
| SNFZ11 | 453           | 453           | 0     | MATCH      | MATCH      | —                                        |
| SNID11 | 310           | 310           | 0     | MATCH      | MATCH      | —                                        |
| SOJA3  | 943           | 943           | 0     | DIFFERENCE | MATCH      | bonus + fraction applied                 |
| STBP3  | 0             | 0             | 0     | MATCH      | MATCH      | 700−700, absent both                     |
| TAEE11 | 200           | 200           | 0     | MATCH      | MATCH      | —                                        |
| TUPY3  | 200           | 200           | 0     | MATCH      | MATCH      | —                                        |
| UNIP3  | 121           | 121           | 0     | MATCH      | MATCH      | —                                        |
| VGIP11 | 210           | 210           | 0     | MATCH      | MATCH      | —                                        |
| VIVT3  | 200           | 400           | +200  | DIFFERENCE | DIFFERENCE | untouched (pre-window)                   |
| WIZC3  | 1200          | 1200          | 0     | MATCH      | MATCH      | —                                        |

Coverage: 30/40 → **33/40 (82.5%)**. Remaining: 6 differences, 3 only-Atlas,
2 only-B3, 1 zero-zero match (STBP3).

## 3. Closed cases

- COGN3 300+30=330, SOJA3 900+43.76−0.76=943.00, EZTC3 1200+271.56−0.56=1471.00:
  all MATCH, arithmetic exact.
- STBP3 regression holds (absent both sides).

## 4. Remaining (unchanged semantics, new quantities where applied)

- ITSA4 984.3 vs 1000 (+15.7): UNRESOLVED_PRE_WINDOW_OR_MISSING_EVENT, not corrected.
- EGIE3 480 vs 280 (−200): UNRESOLVED_EXTERNAL_HISTORY_GAP, nothing fabricated.
- VIVT3 200 vs 400 (+200): UNRESOLVED_PRE_WINDOW_CHANGE.
- SNAG11/SNEL11/SNEL13: explained-not-persisted (price/conversion gaps).
- MALL11/PMLL11, MRFG3/MBRF3: rename pairs, no phantom duplication.
- KCRE11 +80: needs representation decision (A4 gate stands).

## 5. Cost / tax safety (read-only)

- All five bonus positions remain INCOMPLETE; no assigned cost written.
- All 7 disposals INCOMPLETE → realized summary BRL:INCOMPLETE → overview KPI
  stays "— / Cálculo incompleto" (no R$ 0,00 regression).
- No fabricated gain, average cost, or DARF. Engines untouched.

## 6. Phantom audit

Loan rows persisted: 0. Shadows persisted: 0. Unsupported persisted: 0.
Review persisted: 0. New unexpected positions: 0 (41 = 41).

## 7. Remaining-work buckets

- A (rename): MALL11→PMLL11, MRFG3→MBRF3.
- B (subscription/receipt): SNAG11 (+200 exercised, price unknown), SNEL13→SNEL11.
- C (historical): ITSA4 +15.7, VIVT3 +200 (pre-window, unconfirmed),
  KCRE11 +80 (representation decision).
- D (external gap): EGIE3 −200.

## 8. Next-phase recommendation

**1. TICKER_SUCCESSOR_MAPPING** — closes 2 pairs (→ 35/40), catalog-metadata only,
zero ledger/cost/tax effect, minimum semantic risk, unblocks MBRF3/PMLL11 mapping
UX. Afterwards: subscription model gated on exercise-price gathering (B cannot
complete honestly without prices), then external-gap investigation (D) via
owner/broker documents. Historical-window reinterpretation (C) last: near-zero
expected gain after the A4 analysis.
