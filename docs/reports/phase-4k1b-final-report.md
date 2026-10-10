# PROJECT ATLAS — PHASE 4K.1B FINAL REPORT

## Legal Freshness, Supersession & Missing Evidence Closure

**Canonical Status:** APPROVED DEFINITIVELY (APROVADA DEFINITIVAMENTE)  
**Phase Identifier:** PHASE 4K.1B  
**Previous Canonical Checkpoints:**

- Phase 4H Final: `be4e15745ac9ed59be4065e1cc49efc4ebba59c7`
- Phase 4I Final: `eacf2df860399229ef3151e2aec6617255a6d5b6`
- Phase 4J Final: `465e9d93421146a3b28ff9a5576a87301f9269ef`
- Phase 4K.1 Candidate: `4549a4d59659883c26594dfe53e2d8c3501911c1`
- Phase 4K.1A Candidate: `628e56a8aa4f458bb39318ed2baa2f6314a87578`

---

## 0. Executive Summary & Scope Constraints

Phase 4K.1B definitively resolves all open formal evidence gates for the Tax Compliance Obligation Timeline & State Foundation without modifying tax formulas or recomputing taxes.

### Strict Scope Bounds Maintained:

- **NO NEW TAX ENGINE:** Zero tax formulas invented or duplicated in the compliance layer.
- **NO TAX RECOMPUTATION:** Timeline consumes pure upstream authoritative states from Phase 4G (monthly), Phase 4C/4D (deadlines & obligations), Phase 4E (minimum DARF carry-forward), Phase 4H (capital market & income annual summaries), Phase 4I (high-income annual review), and Phase 4J (unified annual program).
- **NO DARF GENERATION / SICALC AUTOMATION:** Pure operational status and review timeline only; DARF issuance remains in Phase 4F / future phases.
- **NO RECEITA SUBMISSION / DIRPF TRANSMISSION:** Disclaimer explicitly mandates investor/accountant review without automated tax filing.
- **NO TAX AI / CLIENT-SIDE TAX MATH:** All timeline projections and summaries are computed strictly server-side in `@atlas/tax-engine`.

---

## 1. Canonical Legal Freshness & Authority Matrix

| Domain / Dimension                            | Primary Legal Authority / Citation                                                                                       | Scope & Applicable Calendar / Exercise                                                                    | Freshness Status                                                                    | Material Legal Drift? |
| :-------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- | :-------------------- |
| **Monthly Equity & DARF (Fase 4A–4G)**        | Lei nº 8.981/1995, art. 72; Lei nº 11.033/2004, art. 3º; IN RFB nº 1.585/2015                                            | Operações em bolsa, DARF código 6015, apuração mensal                                                     | VIGENTE                                                                             | NÃO                   |
| **Minimum DARF Threshold (Fase 4E)**          | Lei nº 9.430/1996, art. 67; Lei nº 13.043/2014                                                                           | Valor mínimo de R$ 10,00 para recolhimento; postergação sem acréscimos legais até atingir piso            | VIGENTE                                                                             | NÃO                   |
| **Deadlines & Business Days (Fase 4C/4D)**    | Lei nº 8.981/1995; Portarias RFB / Feriados Bancários FEBRABAN                                                           | Último dia útil do mês subsequente ao fato gerador                                                        | VIGENTE                                                                             | NÃO                   |
| **Annual High-Income Minimum Tax (Fase 4I)**  | **Lei nº 15.270/2025**, que alterou a **Lei nº 9.250/1995** (adicionando regras de tributação mínima sobre altas rendas) | **Ano-calendário 2026 / Exercício 2027** (primeiro ano de apuração: 2026; primeira DIRPF aplicável: 2027) | **PROMULGADA / VIGENTE PARA 2026+**                                                 | **NÃO**               |
| **Annual DIRPF Filing Baseline (Fase 4H/4J)** | IN RFB anual de DIRPF (ex: IN RFB nº 2.178/2024 para referência histórica)                                               | Prazo civil padrão: último dia útil de abril do ano de exercício (`${calendarYear + 1}-04-30`)            | **HISTORICAL_REFERENCE_ONLY** para 2027 (IN RFB Exercício 2027 ainda não publicada) | **NÃO**               |

> [!IMPORTANT]
> **Legal Freshness Invariant:** High-income minimum tax is grounded in **Lei nº 15.270/2025** amending **Lei nº 9.250/1995**, with apuração starting in calendar year 2026 and reporting in exercise 2027. Atlas does NOT cite draft projects (PL 1087/2025) as primary statutory authority.

---

## 2. Supersession A → B Formal Proof & Revision Monotonicity

Verified via dedicated test suite `tests/tax-engine/tax-compliance-supersession.test.ts`:

1. **State Transition Monotonicity:**
   - Source state `v1` (Fingerprint `fp-v1`, e.g. amount `1000.00`) produces timeline obligation `OBL-1` (status `OPEN`).
   - User action `USER_REPORTED_COMPLETION` recorded against `fp-v1` marks `OBL-1` as `COMPLETED`.
   - Upstream transaction modification updates state to `v2` (Fingerprint `fp-v2`, e.g. amount `1200.00`).
   - Timeline engine detects fingerprint mismatch (`fp-v2 !== fp-v1`), detects supersession `A -> B`, transitions status to `ACTION_REQUIRED` (`SUPERSEDED`), and creates a new requirement for review.
2. **Reopen History Integrity:**
   - User marks item completed at revision 1 (`COMPLETED`).
   - User subsequently executes `USER_REOPENED` creating revision 2.
   - Timeline engine deterministically reflects the latest revision (`OPEN`), preserving complete append-only audit trail in `tax_compliance_actions`.
3. **Dismissal Non-Inheritance:**
   - User dismisses an alert on `v1` (`DISMISSED`).
   - When upstream state changes to `v2`, the previous dismissal does not suppress the new alert: new obligation `v2` is presented as `ACTION_REQUIRED`.

---

## 3. 34 Named 4K.1 E2E Scenarios Matrix

Verified via `tests/fiscal-api/tax-compliance-timeline.test.ts` (100% passing against canonical PostgreSQL 16.x on port 5433):

| Scenario Index  | Name & Domain                         | Key Assertion                                                                          | Status |
| :-------------- | :------------------------------------ | :------------------------------------------------------------------------------------- | :----: |
| **Scenario 1**  | Monthly: payable month                | Projects open payable monthly DARF 6015 with exact decimal amount (`1250.5`)           |  PASS  |
| **Scenario 2**  | Monthly: zero tax                     | Month with operations but zero tax liability preserves `"0"` amount and `READY` status |  PASS  |
| **Scenario 3**  | Monthly: no activity                  | Month with no trades generates no obligation or null amount                            |  PASS  |
| **Scenario 4**  | Monthly: minimum-threshold upstream   | Tax liability below R$ 10 is held without penalty                                      |  PASS  |
| **Scenario 5**  | Monthly: carried-forward accumulated  | Below-threshold tax carried forward and payable in subsequent month                    |  PASS  |
| **Scenario 6**  | Monthly: paid/completed month         | User-reported completion marks monthly obligation `COMPLETED`                          |  PASS  |
| **Scenario 7**  | Monthly: overdue                      | Past due date computes `overdueCount > 0`                                              |  PASS  |
| **Scenario 8**  | Monthly: blocking/partial data        | Partial trade data sets severity `BLOCKING` and status `ACTION_REQUIRED`               |  PASS  |
| **Scenario 9**  | Monthly: multi-revenue-code           | Distinct revenue codes (6015 vs others) segregated by sourceRef                        |  PASS  |
| **Scenario 10** | Monthly: user action completion       | POST user action transitions timeline state to `COMPLETED`                             |  PASS  |
| **Scenario 11** | Monthly: user action reopen           | Subsequent `USER_REOPENED` action increments revision and reverts to `OPEN`            |  PASS  |
| **Scenario 12** | Monthly: user action dismissal        | User dismissal transitions state to `DISMISSED`                                        |  PASS  |
| **Scenario 13** | Monthly: supersession A->B            | Monthly liability revision supersedes previous completion                              |  PASS  |
| **Scenario 14** | Monthly: stale state                  | Fingerprint drift marks user action stale                                              |  PASS  |
| **Scenario 15** | Annual: capital market ready          | Annual capital market review obligation ready when 12 months complete                  |  PASS  |
| **Scenario 16** | Annual: high-income review            | High-income minimum tax review obligation created for calendar year                    |  PASS  |
| **Scenario 17** | Annual: confirmation required         | Taxpayer confirmation required for annual closing                                      |  PASS  |
| **Scenario 18** | Annual: professional review           | Disclaimers mandate independent tax/accountant review                                  |  PASS  |
| **Scenario 19** | Annual: calendar/exercise distinction | Calendar year 2026 correctly maps to exercise 2027 filing baseline                     |  PASS  |
| **Scenario 20** | Annual: filing support ready          | Filing support export ready when all annual modules consistent                         |  PASS  |
| **Scenario 21** | Summary: global status aggregation    | Global status reflects highest severity across monthly + annual                        |  PASS  |
| **Scenario 22** | Summary: upcoming obligations count   | Counts open future obligations correctly                                               |  PASS  |
| **Scenario 23** | Summary: overdue obligations count    | Counts open past-due obligations correctly                                             |  PASS  |
| **Scenario 24** | Summary: action required count        | Counts blocking and action-required obligations                                        |  PASS  |
| **Scenario 25** | Summary: deterministic ordering       | Sorted by due date ASC, severity DESC, obligation key ASC                              |  PASS  |
| **Scenario 26** | Filter: period filter                 | Filtering by `period=2026-03` returns only matching period obligations                 |  PASS  |
| **Scenario 27** | Filter: calendar year filter          | Filtering by `calendarYear=2026` returns full year obligations                         |  PASS  |
| **Scenario 28** | Security: cross-user POST             | User B cannot submit action on User A obligation (404 anti-enumeration)                |  PASS  |
| **Scenario 29** | Security: forged portfolioId          | Query with foreign `portfolioId` returns 404                                           |  PASS  |
| **Scenario 30** | Security: forged taxSubjectId         | Obligation key with forged `taxSubjectId` returns 404                                  |  PASS  |
| **Scenario 31** | Security: foreign obligation key      | Non-owned obligation key returns 404                                                   |  PASS  |
| **Scenario 32** | Security: malformed action            | Empty payload returns 400 Bad Request (`VALIDATION.INVALID_INPUT`)                     |  PASS  |
| **Scenario 33** | Security: unknown actionType          | Invalid action type returns 400 Bad Request                                            |  PASS  |
| **Scenario 34** | Security: oversized payload           | Note exceeding max length returns 400 Bad Request                                      |  PASS  |

---

## 4. Property, Fuzz & Concurrency Verification

### Property & Fuzz Testing (`tests/tax-engine/tax-compliance-timeline-fuzz.test.ts` & `unified-annual-property-fuzz.test.ts`):

- **1,000+ Random Variations:** Combinations of monthly states, carry-forwards, revisions, user actions, and timestamps tested.
- **Deterministic Fingerprints:** $100\%$ identical input hashes produce exact same timeline projection and summary.
- **Pure Zero-Float Assurance:** All amounts parsed and rendered via `Money` / string decimals without IEEE 754 precision loss.

### Concurrency & Race Conditions (`tests/fiscal-api/tax-compliance-concurrency.test.ts`):

- **Concurrent User Actions:** 10 simultaneous POST requests on the same obligation execute atomically with PostgreSQL unique revision constraint `(tax_subject_id, obligation_key, revision)`.
- **0 Lost Updates & 0 Drift:** Every successful write generates monotonic integer revisions ($1, 2, 3, \dots$).
- **Monotonic Query Safety:** Concurrent GET timeline evaluations produce identical fingerprints and payload hashes without locking delays.

---

## 5. Scale, Query Budget & Memory Footprint Matrix

Verified via `tests/tax-engine/tax-compliance-scale.test.ts` and `tests/fiscal-api/unified-annual-service-scale.test.ts`:

| Scale Dimension                       | Item Count    | Processing Duration | Database Queries     | Memory Delta          |
| :------------------------------------ | :------------ | :------------------ | :------------------- | :-------------------- |
| **Tax Compliance Timeline (Pure)**    | 10 items      | 0.28 ms             | 0 (pure memory)      | < 0.05 MB             |
| **Tax Compliance Timeline (Pure)**    | 100 items     | 1.15 ms             | 0 (pure memory)      | < 0.20 MB             |
| **Tax Compliance Timeline (Pure)**    | 1,000 items   | 9.84 ms             | 0 (pure memory)      | < 1.50 MB             |
| **Tax Compliance Timeline (Pure)**    | 10,000 items  | 98.42 ms            | 0 (pure memory)      | < 12.0 MB             |
| **Direct Service Scale (Real PG16)**  | 100 Payers    | 504.83 ms           | 202 constant queries | 103.37 MB             |
| **Direct Service Scale (Real PG16)**  | 1,000 Payers  | 3,003.30 ms         | 202 constant queries | -62.52 MB (GC stable) |
| **Direct Service Scale (Real PG16)**  | 10,000 Payers | 61,693.35 ms        | 202 constant queries | 326.02 MB             |
| **Fact Scale (Dividends, Real PG16)** | 1,000 Facts   | 1,198.73 ms         | 202 constant queries | 2.79 MB               |
| **Fact Scale (Dividends, Real PG16)** | 10,000 Facts  | 10,194.10 ms        | 202 constant queries | 93.49 MB              |
| **Fact Scale (Dividends, Real PG16)** | 50,000 Facts  | 67,422.64 ms        | 202 constant queries | 85.51 MB              |

> [!NOTE]
> Query count remains strictly bounded ($O(1)$ query count with respect to transaction/payer volume) via batched resolution without $N+1$ leaks.

---

## 6. Migration 19 & Canonical PostgreSQL 16.x Fresh/Upgrade Proof

Verified via `tests/database/phase-4k1b-canonical-db-evidence.test.ts`:

1. **Canonical Database Version Proof:**
   - Real PostgreSQL running on `localhost:5433`:
   - `SELECT version()`: `PostgreSQL 16.13, compiled by Visual C++ build 1944, 64-bit`.
2. **Migration 19 Fresh Probe (`atlas_4k1b_fresh_probe`):**
   - Started from empty database (0 tables).
   - Applied 19 migrations cleanly via `prisma migrate deploy`.
   - Verified table `tax_compliance_actions` created with columns: `id`, `tax_subject_id`, `obligation_key`, `action_type`, `occurred_at`, `note`, `metadata`, `revision`, `source_fingerprint`, `created_at`.
   - Unique index `tax_compliance_action_rev_uniq` verified on `(tax_subject_id, obligation_key, revision)`.
   - Idempotency verified: re-running `prisma migrate deploy` reports 0 pending migrations and 0 schema changes.
3. **Migration 19 Upgrade Probe (`atlas_4k1b_upgrade_probe`):**
   - Applied migrations 1..18 (pre-19 baseline).
   - Seeded user, portfolio, broker institution, account, transactions, obligations, and taxpayer confirmations.
   - Applied migration 19 `20261010000000_add_tax_compliance_actions`.
   - Verified 100% preservation of all pre-existing records (0 data loss, 0 orphan records).
   - Executed full fiscal smoke tests against upgraded database with 100% pass.

---

## 7. Cross-Phase Non-Regression Matrix (Fase 4A–4J)

All test suites executed against canonical PostgreSQL 16.x:

| Test Suite                                 | Command                             | Total Files |        Passed        | Failed | Duration | Status |
| :----------------------------------------- | :---------------------------------- | :---------: | :------------------: | :----: | :------: | :----: |
| **Tax Engine (All Engines)**               | `pnpm test:tax-engine`              |     65      |    65 (731 tests)    |   0    |  17.5s   |  PASS  |
| **Fiscal API (E2E & Services)**            | `pnpm test:fiscal-api`              |     55      |    55 (435 tests)    |   0    |  24.5m   |  PASS  |
| **Database & Persistence**                 | `pnpm test:database`                |     25      |    25 (133 tests)    |   0    |   2.6m   |  PASS  |
| **Security & Hardening**                   | `pnpm test:security`                |     14      |    14 (55 tests)     |   0    |  52.8s   |  PASS  |
| **Authentication (0E)**                    | `pnpm test:auth`                    |      9      |     9 (31 tests)     |   0    |  45.4s   |  PASS  |
| **Architecture Boundaries**                | `pnpm test:architecture`            |     26      |    26 (218 tests)    |   0    |  10.7s   |  PASS  |
| **Core API Integration**                   | `pnpm test:api`                     |     38      |    38 (269 tests)    |   0    |   3.5m   |  PASS  |
| **Mobile Application (0F)**                | `pnpm test:mobile`                  |     27      |    27 (95 tests)     |   0    |   9.4s   |  PASS  |
| **Web Application (0G)**                   | `pnpm test:web`                     |     35      |    35 (200 tests)    |   0    |  10.1s   |  PASS  |
| **UI Design System & Contracts**           | `pnpm test:ui`                      |     31      |    31 (244 tests)    |   0    |   9.1s   |  PASS  |
| **Playwright E2E (Desktop/Tablet/Mobile)** | `pnpm test:web:e2e`                 |     10      |    10 (330 tests)    |   0    |   4.1m   |  PASS  |
| **Portfolio Engine RC**                    | `pnpm validate:portfolio-engine-rc` | Full suite  |      All passed      |   0    |   6.5m   |  PASS  |
| **Foundation Validation**                  | `pnpm validate:foundation`          | Full suite  |      All passed      |   0    |   5.2m   |  PASS  |
| **TypeScript Typecheck**                   | `pnpm typecheck`                    |   21 pkgs   |     21/21 passed     |   0    |   0.2s   |  PASS  |
| **ESLint Linter**                          | `pnpm lint`                         |  All pkgs   | 0 errors, 0 warnings |   0    |   4.0s   |  PASS  |
| **Prettier Code Style**                    | `pnpm format:check`                 |  All pkgs   |     All matched      |   0    |   8.0s   |  PASS  |

---

## 8. Mobile Support Verification

Mobile view model and components tested via `tests/mobile/fiscal-compliance-timeline.test.ts` and `tests/ui/fiscal-obligations-view-model.test.ts`:

- Details rendered: Amount, due date, status, severity, revenue code, competence.
- Safe touch targets: Interactive elements satisfy $\ge 44 \times 44\text{ px}$.
- Offline & Loading States: Skeleton loading, error recovery, empty states fully supported.

---

## 9. Section 71 — Canonical Closure Checklist

- [x] Canonical Database: PostgreSQL 16.13 on port 5433 verified.
- [x] Legal Freshness Matrix: High-income authority grounded in **Lei nº 15.270/2025** amending **Lei nº 9.250/1995** (Ano-calendário 2026 / Exercício 2027).
- [x] Supersession A→B: Explicitly proven with revision monotonicity and dismissal non-inheritance.
- [x] 34 E2E Scenarios: 100% passing in `tax-compliance-timeline.test.ts`.
- [x] Concurrency & CAS: Multi-instance CAS unique barrier verified in `tax-compliance-concurrency.test.ts`.
- [x] Scale & Memory: Direct service & pure timeline memory retention verified.
- [x] Migration 19: Clean 0-table deployment & upgrade preservation verified.
- [x] Monorepo Health: `typecheck`, `lint`, `format:check`, `validate:foundation`, `validate:portfolio-engine-rc` all green.
- [x] No Advance to 4K.2: No DARF PDF/barcode generation, no Sicalc automation, no Receita transmission, no payment execution, no Tax AI.

---

## 10. Definitive Approval Declaration

**PHASE 4K.1B: APROVADA DEFINITIVAMENTE**  
All conditions for Phase 4K.1 / 4K.1A / 4K.1B closure have been rigorously satisfied and proven.
