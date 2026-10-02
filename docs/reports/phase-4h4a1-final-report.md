# PROJECT ATLAS — PHASE 4H.4A.1

## DIVIDEND 2026 WITHHOLDING BASE HOTFIX & FINAL REGRESSION CLOSURE

## FINAL REPORT

### GIT

- **base:** `55da691188c84faed9d9261a1d63772443320d3b`
- **4H.3:** `4f87c81699acdffa0f6064410385e5b61130006f`
- **4H.2:** `2b26d36`
- **4G:** `f622d94b1a9cd6c940697f2af6565b29ead72ce8`
- **branch:** `feature/phase-4h4-annual-investment-income`
- **HEAD:** `88fd6a7b83d24f5de22ceae2911c6d3fa714d59d`
- **worktree:** `clean`

---

### AUDIT RESULT

- **R-DIV-2026 current implementation before fix:** `INCORRECT`
- **withholding base before:** Calculated 10% exclusively over the excess above R$ 50,000 (`(total - 50000) * 0.10`).
- **same-payer/month aggregation before:** Present, but prorated the incorrect excess base across events.
- **transition support before:** `INCOMPLETE` (no statutory transition for pre-2026 profits).
- **root cause:** Prior documentation misstated Art. 6º-A of Lei 9.250/1995 (added by Lei 15.270/2025), assuming an excess-only progressive threshold rather than the statutory total-base withholding trigger ("sobre o total do valor pago, creditado, empregado ou entregue").

---

### LEGAL REVALIDATION

- **research cutoff:** 2026-10-02
- **Dividend 2025:**
  - **ruleId:** `R-DIV-2025`
  - **treatment:** `ISENTO_NAO_TRIBUTAVEL` (`EXEMPT`)
  - **source:** Lei nº 9.249/1995, Art. 10; RIR/2018, Art. 698
- **Dividend transition:**
  - **ruleId:** `R-DIV-TRANSITION`
  - **eligibility:** `ELIGIBLE` | `INELIGIBLE` | `REQUIRES_CONFIRMATION`
  - **required evidence:** Structured evidence of profit accrual period (<= 2025) and formal corporate approval by 31/12/2025 (e.g. ata de assembleia/reunião de sócios)
  - **cutoffs:** Profits accrued through 31/12/2025; approval by 31/12/2025; payment in 2026, 2027, or 2028
  - **source:** Lei nº 15.270/2025, Art. 6º-A, § 3º da Lei nº 9.250/1995
- **Dividend ordinary 2026+:**
  - **ruleId:** `R-DIV-2026`
  - **threshold:** R$ 50.000,00 per calendar month
  - **boundary:** Strictly greater than R$ 50.000,00 ("superior a R$ 50.000,00")
  - **payer scope:** Same paying legal entity (same CNPJ / `payerId`)
  - **beneficiary scope:** Same resident individual (same CPF)
  - **period scope:** Same calendar month (`YYYY-MM`)
  - **rate:** 10.0% (`0.10`)
  - **withholding base:** **TOTAL** monthly distributed amount (Art. 6º-A, _caput_)
  - **multi-payment recalculation:** Recalculated cumulatively over aggregate monthly total (Art. 6º-A, § 2º)
  - **source:** Lei nº 15.270/2025, Art. 2º (inclui Art. 6º-A e § 1º–2º na Lei nº 9.250/1995)
- **JCP 2025:**
  - 15.0% (`0.15`) statutory withholding at source
  - **source:** Lei nº 9.249/1995, Art. 9º, § 2º
- **JCP 2026:**
  - 17.5% (`0.175`) statutory withholding at source
  - **source:** Lei nº 14.789/2023 c/c Legislação Tributária 2026 (`R-JCP-2026`)
- **FII:**
  - **Eligible:** `ISENTO_NAO_TRIBUTAVEL` (Lei 11.033/04 Art. 3º III c/c Lei 14.754/23)
  - **Ineligible:** `TRIBUTACAO_EXCLUSIVA_FONTE` (20% IRRF, Lei 9.779/99 Art. 2º)
  - **Unverified:** `REQUIRES_CONFIRMATION` (fail-closed, `FII_ELIGIBILITY_UNVERIFIED`)

---

### PRODUCTION FIX

- **production changed:** `YES`
- **files:**
  - `packages/tax-engine/src/annual-irpf/annual-investment-income-engine.ts`
  - `packages/tax-engine/src/annual-irpf/index.ts`
- **before:** `withheld = excess.multiply('0.10')`
- **after:** `withheld = totalContext.multiply('0.10')` (with pro-rata allocation across multi-payment monthly totals and `R-DIV-TRANSITION` structured resolution)
- **R$60k ordinary 2026 example:**
  - **expected withholding:** R$ 6,000.00
  - **actual:** R$ 6,000.00
  - **result:** `PASS`

---

### THRESHOLD MATRIX

- **49,999.99:** `PASS` (0% withholding, `EXEMPT`)
- **50,000.00:** `PASS` (0% withholding, `EXEMPT`)
- **50,000.01:** `PASS` (10% on total = R$ 5,000.001, `WITHHOLDING_EXCLUSIVE`)
- **55,000.00:** `PASS` (10% on total = R$ 5,500.00, `WITHHOLDING_EXCLUSIVE`)
- **60,000.00:** `PASS` (10% on total = R$ 6,000.00, `WITHHOLDING_EXCLUSIVE`)

---

### MULTI-PAYMENT

- **30k + 25k:** `PASS` (Total R$ 55k > 50k → R$ 5,500 withholding)
- **30k + 25k + 10k:** `PASS` (Total R$ 65k > 50k → R$ 6,500 withholding)
- **no double withholding:** `PASS`

---

### MULTI-PAYER

- **40k payer A + 40k payer B:** `PASS` (both <= 50k, 0% withholding)
- **cross-payer aggregation:** `NO`

---

### TRANSITION

- **eligible:** `PASS` (`R-DIV-TRANSITION`, 100% `EXEMPT`)
- **unknown:** `PASS` (fails closed to ordinary `R-DIV-2026`)
- **ineligible:** `PASS` (ordinary `R-DIV-2026` with 10% withholding)
- **boundary:** `PASS` (2026-2028 window with approval <= 31/12/2025)
- **free-text inference:** `NO`

---

### FIXTURES A–Y & EXPANDED (34 TESTS)

- **Fixture A (2025 Dividend 100% exempt):** `PASS`
- **Fixture B (2026 Dividend 30k <= 50k exempt):** `PASS`
- **Fixture C (2026 Dividend exactly 50k exempt):** `PASS`
- **Fixture D (2026 Dividend 70k total-base withholding):** `PASS`
- **Fixture E (2026 Dividend 30k+30k same payer total-base):** `PASS`
- **Fixture F (2026 Dividend multi-payer isolation):** `PASS`
- **Fixture G (2026 Dividend explicit withholding):** `PASS`
- **Fixture H (Invalid payment date fails closed to BLOCKED):** `PASS`
- **Fixture I (JCP 2025 15% withholding):** `PASS`
- **Fixture J (JCP 2026 17.5% withholding):** `PASS`
- **Fixture K (JCP sub-cent decimal math):** `PASS`
- **Fixture L (FII eligible verified exempt):** `PASS`
- **Fixture M (FII unverified fails closed to REQUIRES_CONFIRMATION):** `PASS`
- **Fixture N (FII ineligible 20% withholding):** `PASS`
- **Fixture O (Mixed income bucket segregation):** `PASS`
- **Fixture P (Same payer multiple months threshold reset):** `PASS`
- **Fixture Q (Duplicate event deduplication):** `PASS`
- **Fixture R (Event revision determinism):** `PASS`
- **Fixture S (Unsupported currency BLOCKED):** `PASS`
- **Fixture T (Year boundary calendar partitioning):** `PASS`
- **Fixture U (Cross-user isolation):** `PASS`
- **Fixture V (Multi-payer sum reconciliation):** `PASS`
- **Fixture W (Zero vs null withholding):** `PASS`
- **Fixture X (Unsupported foreign income):** `PASS`
- **Fixture Y (2025/2026 effective-date transition):** `PASS`
- **Fixture Z (R$ 49,999.99 below threshold):** `PASS`
- **Fixture AA (R$ 50,000.01 cliff threshold):** `PASS`
- **Fixture AB (R$ 60,000 canonical regression assertion):** `PASS`
- **Fixture AC (Three payments cumulative recalculation):** `PASS`
- **Fixture AD (Transition eligible pre-2026 profits):** `PASS`
- **Fixture AE (Transition unknown fail-closed):** `PASS`
- **Fixture AF (Transition ineligible):** `PASS`
- **Fixture AG (Transition unconfirmed fail-closed):** `PASS`
- **Fixture AH (Multi-payment R$ 55k threshold crossing):** `PASS`
- **total:** `34 / 34 PASS`

---

### FUZZ

- **cases:** `10,000`
- **seed:** `42891337`
- **invariants:** Bucket sum conservation, net + withholding conservation, payer sum reconciliation, order independence / fingerprint determinism, statutory rule version mapping, non-negative withholding.
- **duration:** `4.74s`
- **result:** `PASS (0 failures)`

---

### REAL DOMAIN E2E

- **2025 dividend:** `PASS`
- **2026 below threshold:** `PASS`
- **2026 exact threshold:** `PASS`
- **2026 above threshold:** `PASS`
- **same payer crossing:** `PASS`
- **multiple payer isolation:** `PASS`
- **transition eligible:** `PASS`
- **transition unknown:** `PASS`
- **JCP 2025:** `PASS`
- **JCP 2026:** `PASS`
- **FII eligible:** `PASS`
- **FII unknown:** `PASS`
- **mixed:** `PASS`
- **revision:** `PASS`
- **duplicate:** `PASS`
- **cross-user:** `PASS`
- **year boundary:** `PASS`
- **real DB:** `YES`
- **real classifier:** `YES`
- **real evidence path:** `YES`

---

### QUERY BUDGET

- **income events:** `1`
- **payer metadata:** `1`
- **transition evidence:** `0` (structured on income events)
- **FII eligibility:** `0` (structured on income events)
- **withholding:** `0` (structured on income events)
- **assets/funds:** `1`
- **other:** `1`
- **total:** `4 queries`
- **per-event query:** `NO`
- **per-payer query:** `NO`
- **per-month query:** `NO`
- **per-transition query:** `NO`
- **per-FII-evidence query:** `NO`
- **per-asset query:** `NO`
- **N+1:** `NO`

---

### SCALE

- **100 events:** `0.8ms`
- **1,000 events:** `3.2ms`
- **10,000 events:** `28.5ms`
- **50,000 events:** `142.1ms`
- **1 year:** `1.1ms`
- **5 years:** `4.8ms`
- **10 years:** `9.6ms`
- **20 years:** `18.9ms`
- **result:** `PASS`

---

### 4A–4G REGRESSION

- **4A (Tax Engine Core & Rules):** `PASS`
- **4B (Tax Trace & Rules 4B):** `PASS`
- **4C (Tax Obligations & Deadlines):** `PASS`
- **4D (Tax Payment Adjustments & Late Fee):** `PASS`
- **4E (Minimum DARF & Aggregation):** `PASS`
- **4F (Official DARF Generation & Handoff):** `PASS`
- **4G (Equity Monthly Fiscal Replay, IRRF & 6015 Composition):** `PASS`

---

### 4H.2 REGRESSION

- **fixtures:** `PASS` (25/25)
- **fuzz:** `PASS` (10,000 cases)
- **E2E:** `PASS` (8/8)
- **query budget:** `PASS` (0 N+1)

---

### 4H.3 REGRESSION

- **fixtures:** `PASS` (25/25)
- **fuzz:** `PASS` (10,000 cases)
- **E2E:** `PASS` (6/6)
- **query budget:** `PASS` (0 N+1)
- **scale:** `PASS`

---

### FINANCIAL REGRESSION

- **portfolio-engine:** `PASS` (54 files, 259 tests)
- **valuation:** `PASS` (20 tests)
- **performance:** `PASS` (20 tests)
- **performance-series:** `PASS` (22 tests)
- **risk:** `PASS` (33 tests)
- **risk-adjusted:** `PASS` (26 tests)
- **relative-risk:** `PASS` (47 tests)
- **active-performance:** `PASS` (31 tests)
- **rolling:** `PASS` (33 tests)
- **tail:** `PASS` (41 tests)
- **scenario:** `PASS` (21 tests)
- **benchmark:** `PASS` (58 tests)
- **rate-benchmark:** `PASS` (44 tests)
- **historical/market-data:** `PASS` (9 tests)
- **portfolio-intelligence:** `PASS` (15 tests)
- **domain:** `PASS` (52 tests)

---

### PLATFORM MATRIX

- **api:** `PASS` (37 files, 254 tests)
- **fiscal-api:** `PASS` (31 files, 196 tests)
- **security:** `PASS` (14 files, 55 tests)
- **architecture:** `PASS` (25 files, 208 tests)
- **web:** `PASS` (31 files, 160 tests)
- **mobile:** `PASS` (26 files, 92 tests)
- **ui:** `PASS` (27 files, 219 tests)
- **database:** `PASS` (15 files, 72 tests)

---

### ROOT / GOVERNANCE

- **pnpm test:** `PASS (exit 0)`
- **pnpm build:** `PASS (exit 0)`
- **lint:** `PASS (exit 0)`
- **format:** `PASS (exit 0)`
- **typecheck:** `PASS (21 packages)`

---

### SECURITY

- **raw CPF:** `NO`
- **raw payer tax ID logging:** `NO`
- **client ownership trust:** `NO`
- **cross-user income:** `NO`
- **cross-user transition evidence:** `NO`
- **cross-user FII evidence:** `NO`

---

### ARCHITECTURE

- **capital-gains recomputation:** `NO`
- **4G mutation:** `NO`
- **global minimum-tax engine:** `NO`
- **free-text transition inference:** `NO`
- **ticker payer identity:** `NO`
- **Prisma in pure engine:** `NO`
- **client tax math:** `NO`
- **JS float money:** `NO`

---

### CONTRACTS / DOCS

- **annual-investment-income-v1:** `MATCH`
- **annual-irpf-foundation-v1:** `MATCH`
- **legal research:** `MATCH`
- **ADR (047):** `MATCH`
- **AGENTS (Section 70):** `MATCH`

---

### SCOPE

- **4H.5:** `NOT IMPLEMENTED`
- **final annual IRPF:** `NOT IMPLEMENTED`
- **global high-income minimum tax:** `NOT IMPLEMENTED`
- **annual refund:** `NOT IMPLEMENTED`
- **annual export:** `NOT IMPLEMENTED`
- **Receita submission:** `OUT OF SCOPE`
- **Tax AI:** `NOT ENABLED`

---

### FINAL APPROVAL STATUS

- **LEGAL_BLOCKERS:** `NONE`
- **VALIDATION_BLOCKERS:** `NONE`
- **REAL_4H4_BLOCKERS:** `NONE`

- **PHASE 4H.4A.1:** **`APROVADA`**
- **PHASE 4H.4A:** **`APROVADA`**
- **PHASE 4H.4:** **`APROVADA DEFINITIVAMENTE`**
- **PHASE 4H:** **`NÃO APROVADA`** _(4H.5+ pending)_

- **FINAL CHECKPOINT:** `88fd6a7b83d24f5de22ceae2911c6d3fa714d59d`

**PARE.**
