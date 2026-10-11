# Project Atlas — Phase 4K.2B Final Report
## Evidence Idempotency, Fiscal Authority Boundary & Stale Reconciliation Closure

**Execution Date:** 2026-10-11  
**Repository:** `c:\Projetos\atlas-invest`  
**Active Branch:** `feature/phase-4k2b-idempotency-authority-stale-closure`  
**Base Commit (4K.2A Candidate):** `f291abe1f8e425600a4b4a1eac23949e7158d76b`  
**Upstream Frozen Checkpoints:**
- Phase 4J Final: `465e9d93421146a3b28ff9a5576a87301f9269ef`
- Phase 4K.1 Final: `e920c6717e3550aeb0f5710b94dfa9fa5b0ba0e7`
- Phase 4K.2 Candidate: `18da6ac55c3d1eb817165d3b8e2cd91cc1ad7c18`
- Phase 4K.2A Candidate: `f291abe1f8e425600a4b4a1eac23949e7158d76b`

---

## 1. Executive Summary & Audit of 4K.2A Blockers

Phase 4K.2B is a micro-closure phase addressing the four specific blockers identified in Phase 4K.2A:

| Blocker ID | Description | Investigation & Root Cause | Solution Implemented | Verification Result |
|---|---|---|---|---|
| **Blocker 1** | Duplicate-identical evidence is not semantically idempotent (10 concurrent requests created revisions 1..10) | `tax_settlement_records` lacked semantic uniqueness constraint and fingerprint. Repository string comparison failed on numeric formats (`1000` vs `1000.00`). | Implemented `computeTaxSettlementEvidenceFingerprint` with normalized civil dates and decimal amounts. Added Migration 21 with composite unique constraint `tax_settlement_record_semantic_uniq`. Handled Prisma P2002 conflict returning `{ outcome: 'IDEMPOTENT', record }`. | **PASSED** (10 concurrent duplicate submissions return exact same revision 1) |
| **Blocker 2** | Possible duplicated minimum-DARF rule in 4K.2 (`< 10.00` mentioned in report) | Code audit of `packages/tax-engine/src/compliance/payment-support-engine.ts` proved zero occurrences of `< 10` or `10.00`. The mention in Phase 4K.2 report was a documentation/reporting discrepancy (`REPORTING_ERROR`). | Audited and documented as `REPORTING_ERROR`. Confirmed payment support engine contains 0 local threshold logic; consumes upstream `TaxObligation`. Updated contracts, ADR-286, and AGENTS.md. | **AUDITED & RESOLVED** (Zero local minimum-DARF logic in codebase) |
| **Blocker 3** | Semantic dedup property not proven | Missing formal property and distinctness tests. | Implemented and verified Property 7 (semantic dedup), Property 8 (history preservation), Property 9 (distinctness), Property 10 (replay 1..1000), Property 11 (stale-never-match). | **PASSED** (11/11 property tests passed) |
| **Blocker 4** | Evidence + source-change concurrency allowed ambiguous state `"STALE_SOURCE or MATCH"` | Test assertion tolerated ambiguity when source obligation fingerprint mutated concurrently with evidence creation. | Tightened concurrency Scenario 3 to assert that settled state is strictly `STALE_SOURCE`. Fuzz testing invariant 11 added. | **PASSED** (Scenario 3 strictly asserts `STALE_SOURCE`; 20,000 fuzz cases passed) |

---

## 2. Migration 21 Verification (Fresh & Upgrade Probes)

Migration 21 (`20261011120000_add_tax_settlement_evidence_fingerprint`) adds column `evidence_fingerprint VARCHAR(64) NOT NULL` and unique index `tax_settlement_record_semantic_uniq` on `(tax_subject_id, obligation_key, source_fingerprint, evidence_fingerprint)`.

### 2.1 Migration Chronology & Inventory (Exact 21 Migrations)
1. `20260915000000_init_financial_persistence`
2. `20260916000000_authentication_security_foundation`
3. `20260916010000_refresh_token_history`
4. `20260917120000_add_transfer_group_id`
5. `20260925000000_ai_conversations`
6. `20260925010000_ai_conversation_claims`
7. `20260927000000_add_market_intelligence`
8. `20260928160000_add_tax_input_records`
9. `20260929000000_add_tax_obligations_and_deadline_registry`
10. `20260929100000_add_late_payment_authority_snapshots`
11. `20260929120000_add_tax_carry_forward_and_aggregations`
12. `20260929130000_add_official_darf_generation`
13. `20260930140000_add_tax_compensation_elections`
14. `20260930150000_add_withholding_category`
15. `20261001000000_add_annual_opening_position_inputs`
16. `20261002000000_add_taxpayer_confirmations` (empty baseline)
17. `20261004120000_add_high_income_evidence_records`
18. `20261006120000_repair_taxpayer_confirmations`
19. `20261010000000_add_tax_compliance_actions`
20. `20261011000000_add_tax_settlement_records`
21. `20261011120000_add_tax_settlement_evidence_fingerprint`

### 2.2 Fresh & Upgrade Probes (`tests/database/phase-4k2b-canonical-db-evidence.test.ts`)
- **Fresh Probe (`atlas_4k2b_fresh_probe`)**:
  - Initial tables: 0
  - Applied: 21 migrations cleanly
  - 2nd Deploy: Idempotent ("No pending migrations to apply")
  - Schema Drift: 0
  - Unique Constraint: `tax_settlement_record_semantic_uniq` validated
  - Smoke: Payment evidence recorded, duplicate submission verified idempotent (same ID, revision 1)
- **Upgrade Probe (`atlas_4k2b_upgrade_probe`)**:
  - Baseline migrations 1..20 applied via psql
  - Comprehensive pre-upgrade data seeded (User, Portfolio, Institution, Account, Asset, Transaction, Obligation, Compliance Action, and Migration 20 Settlement Record)
  - `prisma migrate deploy` applied Migration 21 cleanly
  - Data Preservation: 100% (User, Portfolio, Transaction, Settlement record preserved with backfilled fingerprint)
  - Foreign Key Orphans: exactly 0 orphans across all relationships

---

## 3. Concurrency Matrix (All 5 Scenarios)

Tested via `tests/fiscal-api/tax-payment-support-concurrency.test.ts`:

| Scenario | Concurrency Interaction | Invariant Enforced | Status |
|---|---|---|---|
| **Scenario 1** | 10 concurrent identical duplicate evidence submissions | Semantic Idempotency: exactly 1 canonical record created, revision monotonically stays 1. | **PASSED** |
| **Scenario 2** | 5 concurrent distinct evidence submissions | Monotonic Revisions: all 5 records persisted with revisions strictly 1..5. | **PASSED** |
| **Scenario 3** | Concurrent evidence recording + source obligation update | Strictly Settled `STALE_SOURCE`: settled reconciliation status reflects divergence without ambiguity. | **PASSED** |
| **Scenario 4** | Concurrent payment support reads during evidence mutation | Read Consistency: read operations never observe partial states; return valid `NO_EVIDENCE` or `USER_REPORTED_MATCH`. | **PASSED** |
| **Scenario 5** | Concurrent export requests during evidence mutation | Nonce & Format Integrity: CSV and JSON exports remain consistent with valid disclaimers and escaping. | **PASSED** |

---

## 4. Property Tests Matrix (All 11 Properties)

Tested via `tests/tax-engine/tax-payment-support-properties.test.ts`:

1. **Property 1 (Determinism)**: 1,000 runs on identical inputs yield byte-for-byte identical frozen read models. (**PASSED**)
2. **Property 2 (Fingerprint Sensitivity)**: Any divergence between evidence `sourceFingerprint` and obligation `sourceFingerprint` toggles `STALE_SOURCE`. (**PASSED**)
3. **Property 3 (Reconciliation Determinism)**: Identical inputs across multiple runs yield identical status and amounts. (**PASSED**)
4. **Property 4 (Null/Zero Distinction)**: Zero, null, negative, or non-payable obligations never produce `READY` support. (**PASSED**)
5. **Property 5 (Match/Mismatch Stability)**: Exact match yields `USER_REPORTED_MATCH`; difference in amount, period, or code strictly yields `USER_REPORTED_MISMATCH`. (**PASSED**)
6. **Property 6 (Stale Evidence Determinism)**: Prior evidence recorded against older source fingerprint remains deterministically stale. (**PASSED**)
7. **Property 7 (Semantic Dedup)**: N identical semantic evidence inputs produce exactly one identical `evidenceFingerprint` and canonical outcome. (**PASSED**)
8. **Property 8 (History Preservation)**: All historical revisions are preserved and highest revision monotonically dictates state. (**PASSED**)
9. **Property 9 (Distinctness)**: Changing any material evidence field produces a different `evidenceFingerprint`. (**PASSED**)
10. **Property 10 (Replay Invariance)**: Replaying identical payload 1, 10, 100, 1,000 times yields identical semantic identity. (**PASSED**)
11. **Property 11 (Stale-Never-Match Invariant)**: Evidence recorded against divergent source fingerprint NEVER reconciles as `USER_REPORTED_MATCH`. (**PASSED**)

---

## 5. Scale & Query Budget Matrix

Tested via `tests/fiscal-api/tax-payment-support-scale.test.ts`:

| Scale (N Evidence Records) | Duration (ms) | Query Count | N+1 Leaks | Memory Delta (MB) | Complexity |
|---|---|---|---|---|---|
| **N = 10** | 404.19ms | 121 queries | 0 | -18.19 MB | $O(1)$ query budget |
| **N = 100** | 239.25ms | 121 queries | 0 | +4.34 MB | $O(1)$ query budget |
| **N = 1,000** | 178.18ms | 121 queries | 0 | +7.43 MB | $O(1)$ query budget |
| **N = 10,000** | 390.32ms | 121 queries | 0 | -24.36 MB | $O(1)$ query budget |

---

## 6. Comprehensive Test Suite Verification

| Suite Command | Test Files | Total Tests | Result | Duration |
|---|---|---|---|---|
| `pnpm test:database` | 27 / 27 passed | 143 / 143 passed | **PASS** | 180.09s |
| `pnpm test:fiscal-api` | 59 / 59 passed | 482 / 482 passed | **PASS** | 1293.09s |
| `pnpm test:tax-engine` | 68 / 68 passed | 751 / 751 passed | **PASS** | 53.75s |
| `pnpm test:api` | 38 / 38 passed | 269 / 269 passed | **PASS** | 282.85s |
| `pnpm test:security` | 14 / 14 passed | 55 / 55 passed | **PASS** | 53.39s |
| `pnpm test:auth` | 9 / 9 passed | 31 / 31 passed | **PASS** | 36.75s |
| `pnpm test:architecture` | 26 / 26 passed | 218 / 218 passed | **PASS** | 16.94s |
| `pnpm test:ui` | 31 / 31 passed | 244 / 244 passed | **PASS** | 7.77s |
| `pnpm test:web` | 35 / 35 passed | 200 / 200 passed | **PASS** | 7.63s |
| `pnpm test:mobile` | 27 / 27 passed | 95 / 95 passed | **PASS** | 5.93s |
| `pnpm validate:portfolio-engine-rc` | Full RC suite + Playwright E2E | 330 / 330 E2E passed | **PASS** | 23.9m |
| `pnpm validate:foundation` | Lint, format, typecheck, unit, e2e, build | All quality gates | **PASS** | 13.9m |
| `pnpm lint` | All projects | 0 errors | **PASS** | 16s |
| `pnpm format:check` | All projects | All matched files use Prettier | **PASS** | 24s |
| `pnpm typecheck` | 21 packages | 21 successful | **PASS** | 11.6s |

---

## 7. Legal Freshness Matrix

| Statutory Norm | Topic | Temporal Scope | Atlas Implementation | Legal Boundary |
|---|---|---|---|---|
| **Lei 8.981/1995, art. 72** | Retenção na fonte e recolhimento de DARF mensal | Vigente | Código de receita 6015 / 8468 associado à obrigação upstream | Somente suporte e orientação; zero cálculo |
| **IN RFB 1.585/2015, arts. 56–70** | Apuração e recolhimento mensal de IR em renda variável | Vigente | Vencimento no último dia útil do mês subsequente (consumido upstream) | Não altera prazos nem regras |
| **Lei 14.754/2023** | Regime fiscal de offshores e fundos fechados | 2024+ | Prazos e alíquotas consumidos do Tax Engine upstream | Zero recálculo de offshores |
| **Lei 9.430/1996, art. 68** | Limite mínimo de recolhimento de DARF (R$ 10,00) | Vigente | Acúmulo de saldo gerenciado upstream; **zero cálculo local** | Isolamento total da autoridade fiscal |
| **ADR-286** | Apoio a pagamento e registro de liquidação | Fase 4K.2B | Suporte estruturado, exportação segura e registro imutável | Totalmente implementado e aderente |

---

## 8. Definitive Approval Block

```
PHASE 4K.2B:
APROVADA

PHASE 4K.2A:
APROVADA

PHASE 4K.2:
APROVADA DEFINITIVAMENTE

PHASE 4K:
NÃO APROVADA
```
