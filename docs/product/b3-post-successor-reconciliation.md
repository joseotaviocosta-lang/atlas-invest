# B3 Post-Successor Reconciliation — Canonical State After Ticker Mapping

- Ledger: 132 (delta 0 in this audit; all scripts read-only, temp files removed).
- Replay Carteira Real: SUCCESS, processed 104, applied 104, 41 open positions,
  2 accounts, 7 realized disposals (all INCOMPLETE), summary BRL:INCOMPLETE.
- B3 source: `posicao-2026-10-29-11-46-14.xlsx`, economic qty = normal + donor.
- Canonical keys via `resolveCanonicalTicker` (successor folds to predecessor).
- Exact decimals only (DecimalValue, 40 digits). No floats.

## 1. Successor identity audit (STEP 4)

| pair | historical assetId | historical ticker | current display | canonical key | relation      | effective  | ratio |
| ---- | ------------------ | ----------------- | --------------- | ------------- | ------------- | ---------- | ----- |
| 1    | (MALL11 row)       | MALL11            | PMLL11          | MALL11        | TICKER_RENAME | 2025-11-14 | 1     |
| 2    | (MRFG3 row)        | MRFG3             | MBRF3           | MRFG3         | TICKER_RENAME | 2025-11-28 | 1     |

Ledger rows keep old tickers (verified in transaction notes/provenance);
reconciliation and display resolve the successor. No rename events exist in
the ledger (0 TRANSFER/BUY/SELL attributable to mapping). No phantom assets
were auto-provisioned (catalog has no PMLL11/MBRF3 rows; resolution targets
predecessor rows).

## 2. Canonical matrix (Atlas vs B3, diff = B3 − Atlas)

MATCH (34 of 40 B3 keys + STBP3 zero-zero = 35/40 = 87.5%):
B3SA3, BBAS3, BRAP4, BRCR11, COGN3, EZTC3, FESA4, FLRY3, HGLG11, HYPE3, IRBR3,
IRIM11, ISAE4, JHSF3, KNRI11, MALL11/PMLL11 16=16, MCCI11, MRFG3/MBRF3 200=200
(loaned), MXRF11, PETR4, PRIO3, RBRP11, ROXO34, SAPR4, SNCI11, SNFF11, SNFZ11,
SNID11, SOJA3, TAEE11, TUPY3, UNIP3, VGIP11, WIZC3 — plus STBP3 0=0.

ONLY_IN_ATLAS: SNEL13 200 (receipt instrument, no B3 counterpart).
ONLY_IN_B3: none. MALL11/MRFG3 and PMLL11/MBRF3 pairs no longer appear as
divergences under canonical keys.

DIFFERENCE (6):

- ITSA4: Atlas 984.3 vs B3 1000, diff +15.7 → UNRESOLVED_PRE_WINDOW_OR_MISSING_EVENT.
- EGIE3: Atlas 480 vs B3 280, diff −200 → UNRESOLVED_EXTERNAL_HISTORY_GAP.
- VIVT3: Atlas 200 vs B3 400, diff +200 → UNRESOLVED_PRE_WINDOW_CHANGE.
- KCRE11: Atlas 220 vs B3 300, diff +80 → REPRESENTATION_DECISION_REQUIRED (§5).
- SNAG11: Atlas 1646 vs B3 1846, diff +200 → EXPLAINED_NOT_PERSISTED (§6).
- SNEL11: Atlas 2540 vs B3 2740, diff +200 → EXPLAINED_NOT_PERSISTED (§7).

## 3. KCRE11 representation analysis (STEP 18)

Facts: opening 31/12/2024 = 120 (includes the 26/12 buy); 27/12/2024 +80 trade
exists only in the full negotiation file; 2025 report = 300 = 120 + 80 + 100.
The +80 settled after the baseline (T+2 over year-end). Canonical replay orders
by tradeDate, so persisting a BUY dated 27/12/2024 yields 120 + 80 = 200 at
31/12/2024 ≠ 120 reported — a double-count. Honest options: (a) book with
settlement/custody date in 2025 plus provenance citing the 27/12 trade
(owner decision required; tradeDate field must not be falsified silently);
(b) leave documented and unexplained in-ledger. No unequivocal representation
exists today → **REPRESENTATION_DECISION_REQUIRED**. Do NOT auto-import.

## 4. SNAG11 (STEP 19)

Lifecycle evidenced (Direito 1416 → Exercício 100 + 100 → Recibos SNAG13/SNAG14
→ converted, no receipt lines current). Parent effect +200 exact.
Status stays **EXPLAINED_NOT_PERSISTED**. Missing evidence: per-lot exercise
price (absent from the movement file; SUBSCRIPTION requires unitPrice > 0).
With prices: bookable as subscriptions (INCOMPLETE-aware). Without: any
booking fabricates cost.

## 5. SNEL11/SNEL13 (STEP 20)

SNEL13 200 pre-conversion (2024 report receipt line) → +200 parent effect
(2025 report SNEL11 900 = 400 + 200 + 100 + 200 converted) → current B3 has no
SNEL13 line and SNEL11 2740 = Atlas 2540 + 200 receipt. Conversion proven
analytically. Not persisted (no conversion ledger type; TRANSFER pairing would
poison the parent's cost basis per ADR-059).

## 6. Cost / tax safety (STEP 21–22)

All bonus-touched and divergent positions read INCOMPLETE (matrix column);
realized summary BRL:INCOMPLETE (UI stays "— / Cálculo incompleto"). No
acquisition, disposal, gain, average-cost or DARF effect from mapping (identity
continuity, zero events). Engines, schema and fiscal paths untouched.

## 7. Counts (STEP 23)

Raw Atlas open positions: 41. Canonical economic positions (Atlas side): 41
(no Atlas-side duplicates exist; SNEL13 is a distinct receipt instrument).
B3 current economic assets: 40. The 41-vs-40 gap is exactly SNEL13 (Atlas-only)
with zero B3-only keys remaining; STBP3 is zero-zero (in neither list).

## 8. Movement resolution re-check (STEP 7–9)

MBRF3 rows resolve RESOLVED to the MRFG3 asset via successor (no catalog
writes) and stay gated (LOAN_CUSTODY_STATE / review, never READY) — covered by
`import-successor-resolution` tests. PMLL11 has no movement rows; same fallback
applies by construction. Auto-provision safety holds (inferB3Asset returns null
for both successors; verified by test + catalog read).

## 9. Market data & UI behavior (STEP 10–11, code-verified)

Quote lookup maps predecessor rows to current symbols (MRFG3 row → MBRF3.SA);
no external fetch executed in this audit. Position surfaces render current
symbol + "(anteriormente X)"; historical snapshots keep epoch tickers; history
feeds untouched. No duplicated cards (one row per assetId).

## 10. Next-phase scoring (STEP 24)

| candidate                                              | gain               | certainty                                                         | tax/cost risk                                                                                       | schema | evidence                           |
| ------------------------------------------------------ | ------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| A. SUBSCRIPTION_RECEIPT_MODEL (SNAG11, SNEL13→SNEL11)  | +2 (→37/40, 92.5%) | medium-high IF exercise prices obtained; lifecycle already proven | medium, contained (existing SUBSCRIPTION type, INCOMPLETE-aware; conversion needs cost-safe design) | none   | lifecycle complete, prices pending |
| B. HISTORICAL_COVERAGE (KCRE11 decision, ITSA4, VIVT3) | 0–1                | low-medium (no sources in any file)                               | medium-high (double-count mechanics)                                                                | none   | weak/pre-window                    |
| C. EXTERNAL_GAP (EGIE3, VIVT3 corroboration)           | +1–2               | external-dependent (broker docs)                                  | zero code risk                                                                                      | none   | unavailable internally             |

Recommendation: **A. SUBSCRIPTION_RECEIPT_MODEL**, conditional on gathering
exercise prices (subscription bulletins/brokerage notes for SNAG11 lots and the
SNEL receipt conversion). If prices prove unobtainable, A degrades to
documentation-only and the recommendation flips to C (external documents first),
since B has no source evidence to work with. No production code changes in this
audit (doc only); no new functional blockers found.
