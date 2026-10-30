# SNAG11 Post-Confirmation Audit — Subscription Exercise Verified

- Owner receipt: "Importação concluída parcialmente — 2 eventos importados
  com sucesso, 45 pendentes de revisão, 127 não suportados ignorados
  automaticamente, nenhum erro técnico". Matches the dry-run counters exactly
  (READY=2, NEEDS_REVIEW=45, UNSUPPORTED=127, DUPLICATE=8 at confirm time).
- Audit mode: read-only (SELECT only). Ledger 134 → 134 during audit.
- Migrations: 45 → 45.

## 1. Ledger delta (STEP 1–2)

132 → 134. Exactly 2 new rows, both `SUBSCRIPTION` on asset `481ac249`
(SNAG11), same account `7b882be3`, currency BRL, provider B3, fees null:

| tradeDate  | qty | unitPrice | economic cost | movement row        |
| ---------- | --- | --------- | ------------- | ------------------- |
| 2026-03-27 | 100 | 10.5      | 1050.00       | 397 (SNAG12 débito) |
| 2026-04-13 | 100 | 10.5      | 1050.00       | 379 (SNAG12 débito) |

Total: 200 units, R$ 2.100,00 known acquisition cost. Zero unexpected rows.

## 2. Provenance (STEP 3)

`externalId = B3MOV|<file>|<row>|<date>|Direitos de Subscrição - Exercido|
SNAG12|100|DEBITO|PARENT:SNAG11`. Notes preserve file, row, rights ticker
and exercise price. No SNAG12/SNAG13/SNAG14 economic position was created
(zero receipt assets in catalog, zero ledger rows on receipt identities).

## 3. Replay (STEP 4)

SUCCESS — processed 106 (104 + 2), applied 106, 41 open positions, 2 accounts,
7 realized disposals. No NegativePositionError, no inconsistency.

## 4. SNAG11 quantity + cost (STEP 5–6)

1646 + 100 + 100 = 1846 = B3 SNAG11 1846 → delta 0, MATCH.
`costBasisStatus = INCOMPLETE`, `totalCost = undefined`,
`averageCost = undefined`. The R$ 2.100 of known lot cost does not — and
must not — render the 1.846-unit aggregate as KNOWN.

## 5. Realized / tax (STEP 7–8)

New disposals: 0 (7 pre-existing INCOMPLETE disposals unchanged;
summary BRL:INCOMPLETE). No gain, no loss, no income event, no DARF.
Subscription is acquisition (tax projection INFORMATIONAL, unchanged code).

## 6. Receipt + duplication safety (STEP 9–10)

0 new receipt/right/conversion rows. Read-only re-preview of the same file:
READY=0, both SNAG11 lots now EXACT_DUPLICATE (DUPLICATE=10 = 8 prior + 2).
Reconfirmation is structurally impossible without fingerprint tampering.

## 7. Reconciliation (STEP 11–13)

35/40 (87.5%) → 36/40 (90.0%; 35 key matches + STBP3 zero-zero).
Newly closed: SNAG11. Remaining diffs byte-identical to pre-confirmation:
EGIE3 −200, ITSA4 +15.7, KCRE11 +80, SNEL11 +200, VIVT3 +200;
ONLY_IN_ATLAS = [SNEL13]. Open positions 41 → 41 (existing position grew).

## 8. Next-phase decision (STEP 16)

Next structural case: SNEL13 → SNEL11. Required canonical semantics —
receipt decreases, parent increases, ownership unchanged, cost lineage
preserved, no realized gain — fit no frozen type (TRANSFER pair poisons cost
per ADR-059; SELL+BUY fabricates realization; BONUS misstates economics).
Verdict: `RECEIPT_CONVERSION_CANONICAL_EVENT_REQUIRED`. Do not implement
until a canonical event + cost-carry design is approved; SNEL stays REVIEW.
