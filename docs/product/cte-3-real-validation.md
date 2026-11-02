# CTE-3 — Read-Only Real Validation (Evidence Enrichment)

Isolated validation of the CTE-2 enrichment path against the real owner
portfolio. Live API stayed `TAX_COST_EVIDENCE_ENRICHMENT_ENABLED=false`
throughout; the flag was ON only inside one-off local harnesses (removed
after use — synthetic unit matrix remains the committed coverage).
No writes, no activation.

## Method and isolation

- One-off `tsx` harnesses instantiating `GetMonthlyTaxLiabilityUseCase` with
  real Prisma repositories (dev DB, SELECT-only) + `computeWithEquity` per
  competence, flag toggled in-process. Live server process untouched.
- Direct `resolveTaxCost` projection over real KCRE11 ledger lots + real v3
  evidence row; independent integer-cent recomputation (exact, no floats).
- Before/after row counts asserted around every run.

## Before snapshot

ledger 137 (Carteira Real 109: 56 BUY, 7 SELL, 37 TRANSFER_IN, 5 BONUS,
1 SPLIT, 1 REVERSE_SPLIT, 2 SUBSCRIPTION); evidence 3 rows
(v1 DRAFT → v2 REVIEW_REQUIRED → v3 VERIFIED, one fingerprint);
replay 109/109 SUCCESS, 41 positions, 7 disposals; migrations 48.
KCRE11: 300, INCOMPLETE, total/average null. Real evidence v3 verified:
120 @ 8.50, 26/12/2024, BRL, fingerprint `4ca710de481f…`, owner-confirmed.

## Resolver — KCRE11 (real inputs)

`COMPLETE_WITH_VERIFIED_EVIDENCE`, covered 300/300, cost `2494.96`
(676.00 + 767.04 + 31.92 + 1020.00), average `8.31653…` (40 digits).
Independent integer-cent sum: 249496 == adapter `2494.96`; average prefix
matches. Moving-average equivalence holds at position level (PART O).

## Full-portfolio projection (flag ON, isolated)

- 11 disposals traced: 4 `CANONICAL_LEDGER:COMPLETE_LEDGER_ONLY`
  (other-owner-portfolio KNOWN sales), 7 `UNKNOWN:PARTIAL` (real INCOMPLETE
  sales incl. both ITSA4 legs) — **zero `VERIFIED_EVIDENCE` enrichments**.
- Reason: KCRE11 (the sole evidence-covered asset) has **zero disposals**;
  ITSA4/EGIE3/SNEL have no evidence. Scope is provably narrow (PART K).
- OFF vs ON byte-identical liability AND equity in all 5 competences
  (2025-09, 2026-02, 2026-03, 2026-10 BLOCKED; 2026-01 NO_ACTIVITY).
- Writes: 137/137 transactions, 3/3 evidence rows.

## Gates N / O / P (disposal-level)

Vacuous on real data by construction (no eligible disposal exists), and that
vacuity is itself verified (trace enumerates every disposal; none eligible).
Position-level equivalence proven above; per-disposal logic proven by the
24-case synthetic matrix (temporal exclusion, pre-sale replay, no double-use
by average semantics). PART N STOP not triggered — nothing to prove per
disposal because nothing was enriched.

## Trace audit

Every real disposal traced; v1/v2 absent everywhere (only current v3 read,
and it contributed nowhere for lack of disposals); transactionIds,
quantities, costs and verifier metadata paths exercised synthetically.
No provenance gaps in the exercised paths.

## After snapshot

Identical to before (137 / 3 / 109-109 / 38-40 frozen reference / 48).
Live API flag: absent (OFF). Owner tax behavior unchanged.

## Activation decision

**READY_FOR_CTE_4_OWNER_ACTIVATION** — with the load-bearing caveat that
activation is provably inert on current data (ON==OFF byte-identical):
it can only take effect on a future disposal of an evidence-covered
position. CTE-4 must include a post-activation audit of the first such
disposal. No blockers found; no scope expansion observed.
