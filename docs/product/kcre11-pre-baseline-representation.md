# KCRE11 Pre-Baseline Trade vs Opening Snapshot — Representation Decision

Decision: **CASE B — TRADE_SETTLED_AFTER_OPENING_SNAPSHOT**.
The 27/12/2024 +80 leg is genuinely missing from Atlas (not double-covered).
Safe representation exists with true trade-date semantics + owner decision.
No writes in this phase (134 → 134, 46 → 46).

## 1. Complete evidence (STEP 2–3, 7–10)

Full negotiation file (`negociacao-2026-10-29-18-20-59.xlsx`) — all KCRE11
rows ever (no sells anywhere):

| date                | side   | qty                  | price | value   |
| ------------------- | ------ | -------------------- | ----- | ------- |
| 26/12/2024 (R62)    | Compra | 120                  | 8.50  | 1020.00 |
| 27/12/2024 (R61)    | Compra | 80                   | 8.45  | 676.00  |
| 24/01/2025 (R58/59) | Compra | 96 @ 7.99 + 4 @ 7.98 | —     | —       |

Ledger: opening TRANSFER_IN 120 @ 31/12/2024 (annual-2024 R13) + the two
24/01/2025 BUYs = 220. No other KCRE11 rows exist in any source.
Annual 2024: 120 cotas (Itaú custodian, close 8.40). Annual 2025: 300.
Current B3: 300. Movement file: rendimentos only (300 since 11/2025),
range 2025-10-28… → `SOURCE_COVERAGE_GAP` for settlement legs.

## 2. Prior holding X = 0 (proven)

No KCRE11 trade before 26/12/2024 exists in the full 2019–2026 file, and no
sale exists at any date. The 26/12 +120 is the first-ever economic event.

## 3. Settlement calendar (STEP 5–6, external)

Brazilian spot equities settled D+2 in Dec 2024. B3 year-end 2024 schedule:
last trading session Mon 30/12; 31/12 open for agro/Cetip back-office ONLY
(no equity trading, no equity clearing); banks' last day 30/12; 01/01
holiday (sources: B3 year-end notice via Nord Research 11/12/2024).

- 26/12 (Thu) +80…: D+1 Fri 27/12, D+2 Mon 30/12 → **settled 30/12/2024**,
  in year-end custody. Matches snapshot 120 with X = 0. Clean.
- 27/12 (Fri) +80: D+1 Mon 30/12, D+2 falls on non-settlement 31/12 →
  **settled 02/01/2025**, after the snapshot. NOT in the 120.

## 4. Snapshot semantics (STEP 4, 8)

Annual "Posição em 31/12/2024" is settled-custody-per-B3-cutoff (120 = the
settled 26/12 leg only), not trade-date economics (which were already 200
from 27/12). Proven by contradiction: inclusion of the 27/12 leg would
require either snapshot 200 (observed 120) or prior holding −80
(impossible). **27/12 leg included: NO.**

## 5. Equation (STEP 11–12)

120 (opening = 26/12 leg) + 80 (27/12 leg, settled 02/01/2025) + 96 + 4
(Jan 2025) − 0 sells = **300** = annual 2025 = current B3. Zero
contradictions. Model A (included) is dead (200 ≠ 120).
Double-count note: booking BUY@27/12 makes asOf-31/12 replay read 200 vs
report 120 — that is the truthful trade-date position (entitlement from
27/12) against a custody-cutoff report, documented here, converging to
exact match at every later asOf (300 at 2025 report and today).

## 6. Atlas semantics (STEP 13–14)

Replay orders canonically by (tradeDate, createdAt, id); `settlementDate`
is carried metadata, not an ordering axis. Atlas models the ECONOMIC trade
date — which is also Brazil's tax acquisition timing. Booking at a
settlement date would falsify both replay order and tax history (PART W
logic applies to dates as it did to SNEL). Correct representation: BUY with
TRUE tradeDate 27/12/2024, price 8.45, provenance citing this document.

## 7. Gate posture (STEP 18)

`PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT` fired correctly as a review
forcing function (inclusion was unprovable then). It stays for the general
case. This instance is an evidence-backed exception, NOT a gate removal:
persistence path is an explicit owner-confirmed POST (or future
evidence-override), never silent import. Negotiation re-imports will dedupe
via identical canonical fingerprint (no externalId on negotiation rows).

## 8. Cost (STEP 15–17)

KCRE11 is INCOMPLETE (220 units: 120 unknown + 100 known). The +80 @ 8.45
folds in the SNAG pattern (qty +80, stays INCOMPLETE, no zero). Separately,
the 26/12 leg (120 @ 8.50) is quantity-covered but cost-unknown — the
concrete use case for a future `OPENING_POSITION_COST_EVIDENCE` mechanism
(not designed here; no new type in this phase).

## 9. Projection (STEP 21)

On owner-confirmed BUY 80 @ 8.45 @ 27/12/2024: 220 → 300 = MATCH,
36/40 → 37/40 (92.5%). Others untouched (ITSA4, VIVT3, EGIE3, SNEL).

## 10. Standing debt

Count-hardcode/version/wording/throttle flakes — pre-existing, out of scope.
