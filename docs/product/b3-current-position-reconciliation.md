# B3 Current Position Reconciliation — Carteira Real

- Reference: `posicao-2026-10-29-11-46-14.xlsx` (B3 custody on ~29/10/2026)
- Evidence only: `movimentacao-2026-10-29-11-47-54.xlsx` (window 28/10/2025–28/10/2026, 710 rows)
- Cross-evidence (read-only): `relatorio-consolidado-anual-2024.xlsx`,
  `relatorio-consolidado-anual-2025.xlsx`, `negociacao-*.xlsx` (3 files)
- Method: exact decimal arithmetic only (`DecimalValue`/decimal.js, 40 digits). No floats.
- Rule: NO ledger writes, NO imports, NO cost-basis changes in this phase.

## 1. Ledger baseline (read-only, atlas_dev)

- B3 opening TRANSFER_IN (`Posição em`, annual-2024 file): **37**
- B3 source transactions total: **96** = 37 opening + 59 negotiations
- Ledger total: 124 (96 B3 + 5 CSV + 23 MANUAL)
- Replay `Carteira Real`: SUCCESS, processed 96, applied 96, **41 open positions, 2 accounts**
- Cost status: 36 positions INCOMPLETE, 4/4 realized disposals INCOMPLETE (BRL summary INCOMPLETE)

## 2. B3 current position file — sheets and semantics

Sheets found: `Acoes`, `BDR`, `Empréstimos`, `Fundo de Investimento`.

| Sheet                 | Rows (ex-header/total)                      | Content                                                               |
| --------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Acoes                 | 19 assets                                   | normal custody, all `Disponível == Quantidade`, `Indisponível == '-'` |
| BDR                   | 1 asset (ROXO34, other institution/account) | normal custody                                                        |
| Empréstimos           | 4 rows, all `Natureza = Doador`             | EZTC3 1471, HYPE3 400, MBRF3 200, VIVT3 400                           |
| Fundo de Investimento | 16 funds                                    | normal custody                                                        |

Semantics proven against the file itself:

- **Doador = economic ownership kept.** HYPE3: 0 in Acoes + 400 donor-loaned, and the
  movement file shows the full loan lifecycle (Transferência pairs + Empréstimo 400).
  Atlas (200 opening + 200 buy) = 400 = B3 economic. MATCH.
- **No double count.** Loaned tickers (EZTC3, HYPE3, MBRF3, VIVT3) appear NOWHERE in
  `Acoes`; STBP3 precedent (2024: absent from Acoes, 700 loaned) proves B3 excludes
  loaned shares from the custody sheets. Economic qty = normal + donor-loaned.
- **No Tomador rows** exist in this file, so no taker exclusion was needed.
- Unique B3 economic assets: **40** (19 + 1 + 4 + 16).

## 3. Reconciliation matrix (diff = B3 economic − Atlas, exact decimals)

| Ticker | Sheet       | Atlas | B3 normal | B3 loaned | B3 economic | Diff  | Status                                                      |
| ------ | ----------- | ----- | --------- | --------- | ----------- | ----- | ----------------------------------------------------------- |
| B3SA3  | Acoes       | 400   | 400       | 0         | 400         | 0     | MATCH                                                       |
| BBAS3  | Acoes       | 200   | 200       | 0         | 200         | 0     | MATCH                                                       |
| BRAP4  | Acoes       | 200   | 200       | 0         | 200         | 0     | MATCH                                                       |
| BRCR11 | FI          | 44    | 44        | 0         | 44          | 0     | MATCH                                                       |
| COGN3  | Acoes       | 300   | 330       | 0         | 330         | +30   | DIFFERENCE → EXPLAINED_BY_BONUS                             |
| EGIE3  | Acoes       | 400   | 280       | 0         | 280         | −120  | DIFFERENCE → UNEXPLAINED                                    |
| EZTC3  | Empréstimos | 1200  | 0         | 1471      | 1471        | +271  | DIFFERENCE → EXPLAINED_BY_BONUS (+loan state)               |
| FESA4  | Acoes       | 1500  | 1500      | 0         | 1500        | 0     | MATCH                                                       |
| FLRY3  | Acoes       | 315   | 315       | 0         | 315         | 0     | MATCH                                                       |
| HGLG11 | FI          | 58    | 58        | 0         | 58          | 0     | MATCH                                                       |
| HYPE3  | Empréstimos | 400   | 0         | 400       | 400         | 0     | MATCH                                                       |
| IRBR3  | Acoes       | 29    | 29        | 0         | 29          | 0     | MATCH                                                       |
| IRIM11 | FI          | 99    | 99        | 0         | 99          | 0     | MATCH                                                       |
| ISAE4  | Acoes       | 300   | 300       | 0         | 300         | 0     | MATCH                                                       |
| ITSA4  | Acoes       | 961.3 | 1000      | 0         | 1000        | +38.7 | DIFFERENCE → EXPLAINED (bonus + pre-window +15.7, see §4)   |
| JHSF3  | Acoes       | 400   | 400       | 0         | 400         | 0     | MATCH                                                       |
| KCRE11 | FI          | 220   | 300       | 0         | 300         | +80   | DIFFERENCE → EXPLAINED_BY_TRADE_COVERAGE_GAP                |
| KNRI11 | FI          | 30    | 30        | 0         | 30          | 0     | MATCH                                                       |
| MALL11 | —           | 16    | —         | —         | 0           | −16   | ONLY_IN_ATLAS → TICKER_RENAME (→ PMLL11)                    |
| MBRF3  | Empréstimos | —     | 0         | 200       | 200         | +200  | ONLY_IN_B3 → TICKER_RENAME (← MRFG3)                        |
| MCCI11 | FI          | 69    | 69        | 0         | 69          | 0     | MATCH (with §5 caveat)                                      |
| MRFG3  | —           | 200   | —         | —         | 0           | −200  | ONLY_IN_ATLAS → TICKER_RENAME (→ MBRF3)                     |
| MXRF11 | FI          | 1571  | 1571      | 0         | 1571        | 0     | MATCH                                                       |
| PETR4  | Acoes       | 200   | 200       | 0         | 200         | 0     | MATCH                                                       |
| PMLL11 | FI          | —     | 16        | 0         | 16          | +16   | ONLY_IN_B3 → TICKER_RENAME (← MALL11)                       |
| PRIO3  | Acoes       | 100   | 100       | 0         | 100         | 0     | MATCH                                                       |
| RBRP11 | FI          | 90    | 90        | 0         | 90          | 0     | MATCH                                                       |
| ROXO34 | BDR         | 550   | 550       | 0         | 550         | 0     | MATCH                                                       |
| SAPR4  | Acoes       | 2500  | 2500      | 0         | 2500        | 0     | MATCH                                                       |
| SNAG11 | FI          | 1646  | 1846      | 0         | 1846        | +200  | DIFFERENCE → EXPLAINED_BY_SUBSCRIPTION                      |
| SNCI11 | FI          | 130   | 130       | 0         | 130         | 0     | MATCH                                                       |
| SNEL11 | FI          | 2540  | 2740      | 0         | 2740        | +200  | DIFFERENCE → EXPLAINED_BY_RECEIPT_CONVERSION                |
| SNEL13 | —           | 200   | —         | —         | 0           | −200  | ONLY_IN_ATLAS → converted into SNEL11                       |
| SNFF11 | FI          | 100   | 100       | 0         | 100         | 0     | MATCH                                                       |
| SNFZ11 | FI          | 453   | 453       | 0         | 453         | 0     | MATCH                                                       |
| SNID11 | FI          | 310   | 310       | 0         | 310         | 0     | MATCH                                                       |
| SOJA3  | Acoes       | 900   | 943       | 0         | 943         | +43   | DIFFERENCE → EXPLAINED_BY_BONUS (net of fraction)           |
| TAEE11 | Acoes       | 200   | 200       | 0         | 200         | 0     | MATCH                                                       |
| TUPY3  | Acoes       | 200   | 200       | 0         | 200         | 0     | MATCH                                                       |
| UNIP3  | Acoes       | 121   | 121       | 0         | 121         | 0     | MATCH                                                       |
| VGIP11 | FI          | 210   | 210       | 0         | 210         | 0     | MATCH                                                       |
| VIVT3  | Empréstimos | 200   | 0         | 400       | 400         | +200  | DIFFERENCE → PRE-WINDOW 2025 INFLOW, class unconfirmed (§4) |
| WIZC3  | Acoes       | 1200  | 1200      | 0         | 1200        | 0     | MATCH                                                       |
| STBP3  | —           | 0     | 0         | 0         | 0           | 0     | MATCH (opening 700 − sell 700; absent both sides)           |

Counts: Atlas open assets 41, B3 economic assets 40,
**matches 30** (29 in matrix + STBP3 zero-zero), **differences 9**,
**only-in-Atlas 3, only-in-B3 2**, unresolved 1 (EGIE3).

## 4. Difference explanations (evidence-backed only)

- **COGN3 +30** — `29/12/2025 Bonificação em Ativos 30`. 300 + 30 = 330. EXPLAINED_BY_BONUS.
- **SOJA3 +43** — `22/12/2025 Bonificação 43.76` − `27/01/2026 Fração em Ativos 0.76`
  (auctioned `13/03/2026 Leilão de Fração 0.76`, cash-only). 900 + 43.76 − 0.76 = 943. EXPLAINED.
- **EZTC3 +271** — `11/12/2025 Bonificação 271.56` − `15/01/2026 Fração 0.56`
  (auctioned `11/02/2026`). 1200 + 271.56 − 0.56 = 1471. EXPLAINED_BY_BONUS.
  Custody note: B3 holds all 1471 as donor-loaned; Atlas models 1200 in normal
  custody (loan state not modeled) — economic agreement after bonus.
- **ITSA4 +38.7** — three-part: (a) `22/12/2025 Bonificação 23.54`;
  (b) `27/01/2026 Fração 0.54` (auctioned `25/02/2026`, cash-only);
  (c) **+15.7 residual already present at 31/12/2025** (2025 report: 1200.54
  vs 1161.3 + 23.54 = 1184.84; opening verified exact at 1161.3 in 2024 report).
  2026 check: 1200.54 − 200 (08/10 sale, in ledger) − 0.54 = 1000.00 exact.
  The +15.7 arose Jan–Sep 2025 (pre-movement-window); exact event class unconfirmed
  (fraction/bonus residual or subscription sobras — not asserted).
  JCP reference quantities corroborate: 1177 = pre-bonus (ex-date), 1200 post-bonus.
  EXPLAINED except the pre-window +15.7 class.
- **SNAG11 +200** — subscription: `Direito de Subscrição SNAG12` → exercised 100
  (27/03/2026) + exercised 100 (13/04/2026) → `Recibo SNAG13 100` + `Recibo SNAG14 100`
  → converted to SNAG11 by Oct 2026 (no receipt lines in current file).
  1646 + 200 = 1846. EXPLAINED_BY_SUBSCRIPTION. (The two `Atualização 100` rows of
  25/05/2026 are informational markers — every other `Atualização` row in the file
  equals current custody exactly — not credits.)
- **SNEL11 +200 / SNEL13** — receipt conversion: 2024 report held SNEL13 200 (Recibo);
  2025 report holds SNEL11 900 (= 400 + 200 + 100 + 200 converted) with no SNEL13 line;
  2026 ledger buys sum 1840 → 900 + 1840 = 2740 = B3; Atlas 2540 + 200 receipt = 2740.
  EXPLAINED_BY_SUBSCRIPTION_RECEIPT_CONVERSION (conversion dated Oct–Dec 2025).
- **MALL11 16 / PMLL11 16** — ticker rename MALL11→PMLL11 (2024 report: MALL11 16;
  2025 report: PMLL11 16; proventos list both across years). EXPLAINED_BY_TICKER_RENAME.
- **MRFG3 200 / MBRF3 200** — ticker rename MRFG3→MBRF3 (2024: MRFG3 200; 2025: MBRF3 200;
  loan-income still references legacy MRFG3). B3 holds as donor-loaned.
  EXPLAINED_BY_TICKER_RENAME (+ loan state). With-price `Transferência - Liquidação`
  rows (e.g. 200 @~19–20) do NOT accumulate in B3 custody (position stays 200) —
  they are loan-roll mirrors, never standalone buys (BBAS3 proves the pattern).
- **KCRE11 +80** — trade coverage gap: `27/12/2024 Compra 80 @8.45` exists ONLY in the
  full negotiation file (`negociacao-2026-10-29-18-20-59.xlsx`, 189 rows, 2019–2026);
  the imported file (`...-11-47-35.xlsx`, 59 rows) starts 15/01/2025. 120 + 80 + 100 = 300.
  EXPLAINED_BY_TRADE_COVERAGE_GAP. (The 26/12/2024 120-buy is inside the 120 opening.)
- **VIVT3 +200** — timing pinned to 2025 (2024 report: 200 loaned only; 2025 report:
  400 normal, no loan rows), but NO record in the movement window (starts 28/10/2025)
  nor in any of the 3 negotiation files. PRE_WINDOW_2025 inflow, exact class unconfirmed.
  (`Restituição de Capital` 14/07/2026 is an amortization cash leg — qty-neutral.)
- **EGIE3 −120** — UNEXPLAINED. Arithmetic is airtight: 2024 economic 400
  (200 normal + 200 donor-loaned, both B3-official) + 28/11/2025 bonus 80 = 480;
  2025 report economic 280 (0 normal + 280 loaned); current 280.
  The −200 (exactly the 2024 normal-custody balance) has NO record: all 44 in-window
  EGIE3 rows are 280-sized loan rolls, the bonus, dividends (cash), or loan interest;
  no EGIE3 sale exists in any of the 3 negotiation files. The 03/11/2025
  `Transferência - Liquidação 200 @40` (crédito) mirrors the 31/10/2025 loan-200
  registration (same BBAS3 loan-mirror pattern), not a buy.

## 5. Match-quality caveats (current MATCH stands, archaeology noted)

- **MCCI11 (69=69):** the `19/12/2024 Compra 10` (full negotiation file only) has no
  +10 in B3's 2025 flow (position already 69 by 11/2025 including the imported Feb-2025
  +9 buy). Either the Dec trade never settled (primary hypothesis — it is also absent
  from the 31/12/2024 custody where T+2 would place it) or an offsetting −10 is
  invisible pre-window. No current impact.
- With-price `Transferência - Liquidação` créditos are settlement/loan mirrors, never
  standalone buys — proven by BBAS3 (known buys already counted; position would double
  otherwise) and MBRF3 (position constant at 200 across five such rows).

## 6. Settlement-shadow safety (applied, no persistence)

Shadows identified by ticker+qty+direction+institution+date-window and excluded from
buy/sell candidacy: ITSA4 200 débito 13/10/2026 (settles the 08/10 sale in ledger);
SNAG11 80/150, SNEL11 760/110/500/120/350/100/630/130, HYPE3 200×2, EZTC3 200,
VIVT3 400s, EGIE3 280s/200, MBRF3 200s, BBAS3 200 — all pair to ledger trades or loan
rolls. Stock-loan pairs (`Transferência` débito+crédito + `Empréstimo` crédito, qty-0
interest rows) change custody location only.

## 7. Cash-only events (never custody explanations)

Dividendo, Juros Sobre Capital Próprio, Rendimento, Reembolso (loan interest),
Restituição de Capital (amortization cash leg), Leilão/Fração cash legs,
Empréstimo qty-0 rows. CASH_ONLY.

## 8. Key assets (STEP 14–15)

- STBP3: opening 700 − sell 700 = 0; B3 0; no movement rows. **MATCH** — baseline fix proven.
- SAPR4 2500, JHSF3 400, BBAS3 200, HYPE3 400, SNCI11 130, ROXO34 550: **MATCH**.
- ITSA4: explained three-part (§4, +15.7 pre-window class unconfirmed).
- SNAG11/SNEL11: explained by subscription mechanics (§4).
- No other divergences.

## 9. Coverage

- Matched assets: 30/40 B3 economic assets = **75%** (denominator explicit).
- Explained differences: 8/9 diff rows + 5/5 only-in-X rows fully explained;
  ITSA4/VIVT3 timing-pinned with unconfirmed class; EGIE3 unexplained.
- Explained quantity rows: all except EGIE3's −200.

## 10. Movement import scope proposal (for a later phase — NOT implemented)

Required for custody reconciliation: Bonus (BONUS + fraction auction pair),
Subscription lifecycle (Direito → Solicitação/Exercício → Recibo → conversion;
Cessão doesn’t touch parent qty), Ticker rename corporate action (MRFG3→MBRF3,
MALL11→PMLL11 pattern), Wider negotiation window (Dec-2024+ trades; dedupe by
externalId — importer already skips duplicates), Stock-loan custody-state
representation (economic-neutral), Transferência - Liquidação shadow matcher
(ticker+qty+direction+institution+date window).
Not required for quantities: Dividendo, JCP, Rendimento, Reembolso, Restituição
de Capital (cash legs), Atualização markers, Direitos Não Exercidos/Cedidos.

## 11. Decision

**CASE C — SOME_DIFFERENCES_REMAIN_UNEXPLAINED** (EGIE3 −200 outflow Nov–Dec 2025
invisible in all available files; VIVT3 +200 and ITSA4 +15.7 timing-pinned to 2025
with unconfirmed event classes).

## 12. Files used (READ LOCAL ONLY — never committed, never copied to fixtures)

Downloads: posicao-2026-10-29-11-46-14.xlsx, movimentacao-2026-10-29-11-47-54.xlsx,
relatorio-consolidado-anual-2024.xlsx, relatorio-consolidado-anual-2025.xlsx,
negociacao-2026-10-29-11-47-35.xlsx, negociacao-2026-10-29-11-44-55.xlsx,
negociacao-2026-10-29-18-20-59.xlsx, eventos-2026-10-29-11-45-31.xlsx (receivables only).
No real file was committed or copied into the repo.
