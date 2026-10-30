# B3 Real-Data Reconciliation Baseline — 95% Evidence-Backed (FROZEN)

Frozen state: ledger 137 · replay 109/109 SUCCESS · 38/40 = 95.0% ·
migrations 46. No silent fabrication anywhere. Closed cases stay closed
absent new contradictory evidence.

## 1. Reconciliation matrix (40 B3 economic keys + STBP3 zero-zero)

37 key MATCHes (full table in audit output; representative):
B3SA3 400 · BBAS3 200 · BRAP4 200 · BRCR11 44 · COGN3 330 · EZTC3 1471 ·
FESA4 1500 · FLRY3 315 · HGLG11 58 · HYPE3 400 · IRBR3 29 · IRIM11 99 ·
ISAE4 300 · JHSF3 400 · KCRE11 300 · KNRI11 30 · MALL11/PMLL11 16 ·
MCCI11 69 · MRFG3/MBRF3 200 · MXRF11 1571 · PETR4 200 · PRIO3 100 ·
RBRP11 90 · ROXO34 550 · SAPR4 2500 · SNAG11 1846 · SNCI11 130 ·
SNFF11 100 · SNFZ11 453 · SNID11 310 · SOJA3 943 · TAEE11 200 · TUPY3 200 ·
UNIP3 121 · VGIP11 210 · VIVT3 400 · WIZC3 1200 — plus STBP3 0 = 0.

3 denominator mismatches (all EVIDENCE_BLOCKED, see §3):
EGIE3 280 vs 480 (−200) · ITSA4 1000 vs 984.3 (+15.7) ·
SNEL11 2740 vs 2540 (+200).

Raw Atlas open positions = 41 vs 40 B3 keys: the extra raw position is
SNEL13:200, a distinct receipt instrument (not a duplicate, not in the B3
denominator since B3 lists no SNEL13 line). No other Atlas-only keys.

## 2. Ledger baseline (137 global; Carteira Real replay scope = 109)

By canonical type (Carteira Real): BUY 56 · TRANSFER_IN 37 (opening
snapshots) · SELL 7 · BONUS 5 · SUBSCRIPTION 2 · REVERSE_SPLIT 1 ·
SPLIT 1. By source evidence: negotiation files 60 · movement file 10
(5 bonus + 3 fraction sells + 2 subscriptions) · annual reports 37 ·
MANUAL corporate actions 2 (VIVT3 pair) · + KCRE11 pre-baseline exception
BUY (negotiation-sourced, owner-resolved). Providers: B3 107, MANUAL 2.

## 3. Replay / cost / tax baselines

Replay SUCCESS: processed 109, applied 109, 41 open, 2 accounts, 7
realized disposals, summary BRL:INCOMPLETE. Cost: 5 KNOWN / 36 INCOMPLETE;
all of SNAG11, KCRE11, VIVT3, ITSA4, EGIE3, SNEL11, SNEL13 INCOMPLETE —
zero fabricated totals/averages. Tax: no fake disposals/gains/DARFs;
BONUS/SPLIT/REVERSE_SPLIT NON_TAXABLE; RECEIPT_CONVERSION infra idle
(no rows) with correct semantics tested.

## 4. Closed cases (frozen)

- Bonus/fraction (COGN3/SOJA3/EZTC3/ITSA4-partial/EGIE3): quantity-only
  BONUS (INCOMPLETE) + fraction-auction SELLs.
- SNAG11 subscription: 2× SUBSCRIPTION 100 @ 10.50 (focal price evidence).
- Ticker successors: MALL11→PMLL11, MRFG3→MBRF3 (frozen registry, no
  ledger events, no phantoms).
- KCRE11 pre-baseline exception: BUY 80 @ 8.45 @ 27/12/2024 with typed
  owner resolution (settled 02/01/2025); gate intact for the general case.
- VIVT3 split: REVERSE_SPLIT 40 + SPLIT 80 @ 15/04/2025 via grouped atomic
  manual flow (200→5→400).
- STBP3 zero-zero match proving baseline arithmetic.

## 5. Blocker register (machine-readable twin:

`b3-reconciliation-blockers.json`)

| asset | delta | proven                                                     | unknown               | unsafe because                                     | needs                                                | next             |
| ----- | ----- | ---------------------------------------------------------- | --------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------- |
| EGIE3 | −200  | bonus-base 200 ⇒ outflow pre-26/11/2025; full-file silence | type/date/channel     | sale-vs-transfer undecidable                       | XP Jan–Nov/2025 statements, portability records      | owner docs       |
| ITSA4 | +15.7 | bridge exact except +15.7 pre-bonus-record                 | qty/date of event     | subscription hypothesis unconfirmed (15.987≠15.70) | XP subscription/ITSA2 records, 2025 holder statement | owner docs       |
| SNEL  | +200  | receipt→parent 1:1 lifecycle                               | exact conversion date | bounded dates unbookable                           | official B3/Suno/admin conversion notice             | monitor channels |

Classifications: EGIE3 EXTERNAL_ACCOUNT_OR_BROKERAGE_GAP ·
ITSA4 HOLDER_LEVEL_SUBSCRIPTION_EVIDENCE_REQUIRED ·
SNEL SNEL_CONVERSION_DATE_EVIDENCE_REQUIRED.
Confidence: occurrence HIGH for all three; channel/type/date LOW.

## 6. Temporal basis register

KCRE11: Atlas trade-date economics @ 31/12/2024 = 200 vs B3 settled
custody = 120 → EXPECTED_TEMPORAL_BASIS_DIVERGENCE (settlement 02/01/2025
proven). Never mislabel as quantity error in future jobs.

## 7. Source coverage register

- Negotiation full file (2019–2026): comprehensive but PROVEN incomplete
  (EGIE3 R706 unmatched inflow; KCRE11 27/12 needed exception path).
- Movement file: starts 28/10/2025 (pre-window blind).
- Annual reports: year-end snapshots only (no event dates).
- Eventos file: income/proventos only, no custody history.
- Current position: present custody snapshot (normal + donor).

## 8. Future evidence intake contract

- EGIE3 proof of SELL → SELL (INCOMPLETE result); proof of custody move →
  TRANSFER_OUT (no disposal). Never preselect.
- ITSA4 proof (qty+date+price) → SUBSCRIPTION READY path (existing model).
- SNEL official date → RECEIPT_CONVERSION READY path (existing model).

## 9. Owner evidence checklist

- EGIE3: XP Jan–Nov/2025 statements; EGIE3 brokerage notes; portability
  records; other-broker statements if any.
- ITSA4: XP subscription/rights history Mar–May/2025; ITSA2 exercise info;
  2025 holder/income statement.
- SNEL: official SNEL13→SNEL11 conversion/credit notice with exact date.

## 10. Roadmap gate

NO further reconstruction code warranted: blockers are document
availability, not engine/model defects. YES resume product development
with this register preserved. Data is 95% proven — never "100% complete".

## 11. Standing regression debt (untouched, pre-existing)

Migration-count hardcodes (18/19/41/43 vs 46), package version drift,
operations-section wording, fiscal/API throttle flakes, corporate-action
success-toast UX_POLISH. All fail identically on baseline where sampled.
