# PROJECT ATLAS — PHASE 4I.3 — FINAL REPORT

## CORPORATE EFFECTIVE TAX REDUTOR — LEGAL FOUNDATION & DETERMINISTIC CALCULATION

---

## GIT

- **base (4I.2 final):** `e75e7cc730dd50cdcf7bdc5923d11f6031191220`
- **branch:** `feature/phase-4i3-corporate-effective-tax-redutor`
- **phase commit (4I.3):** `74bfa9b5974e9a53590d97522ecb702f3f9b8d96`
- **HEAD:** tip of the branch (see git log)
- **worktree:** clean

## ANCESTRY

- 4I.2 (`e75e7cc`) → HEAD: PASS
- 4I.1 (`ced2e3f`) → HEAD: PASS
- 4H (`be4e157`) → HEAD: PASS
- `f622d94` → HEAD: PASS

## LEGAL FOUNDATION

- **research cutoff:** 2026-10-04
- **primary sources:** Lei 9.250/1995 art. 16-B (Planalto); Lei 15.270/2025 (Câmara/DOU);
  PL 1087/2025 + comissão especial (interpretive support); Lei 9.249/1995 art. 10-A;
  IN RFB 2.299/2025; RFB P&R Altas Rendas; DIRPF/pre-filled guidance.
- **redutor trigger:** `effPJ + effPF > nominalCap` (art. 16-B caput)
- **payer-scoped:** YES (caput: "por cada pessoa jurídica")
- **same-payer aggregation:** aggregate annual per-payer amounts before computation
- **cross-payer offset:** NO (no statutory provision; per-payer floor at zero)
- **transition dividend interaction:** transition-exempt dividends attract no redutor
  (outside the 16-A base); ineligible follow the ordinary path; JCP never eligible
- **required evidence:** PJ financial statements (§4) / consolidated (§5) / RFB pre-filled (§7);
  taxpayer confirmation alone insufficient
- **open legal questions:** OQ-16B-1 regulation form; OQ-16B-2 multi-exercise splitting
  (UNSUPPORTED); OQ-16B-3 Prouni detail; OQ-16B-4 special-regime classification

## PAYER TYPE MATRIX

- STANDARD_CORPORATE — 34% — art. 16-B §1º I — supported: YES
- INSURANCE_CAPITALIZATION_REGULATED — 40% — art. 16-B §1º II — supported: YES
- FINANCIAL_INSTITUTION — 45% — art. 16-B §1º III — supported: YES
- UNKNOWN — fail closed (`UNSUPPORTED_PAYER_TYPE`)

## EFFECTIVE RATE

- **numerator:** IRPJ due + CSLL due (+ evidenced Prouni as tax paid)
- **denominator:** lucro contábil (resultado do exercício antes dos tributos e provisões)
- **period:** profit-origin exercise (`profitPeriodExercise`)
- **derived by Atlas:** YES for the ratios (statutory formulas); book figures provided+evidenced
- **simplified mode:** certified §6 profit consumed (Atlas does not recompute the six deductions)

## REDUTOR FORMULA

- **supported:** YES (for fully evidenced single-exercise payers)
- **formula:** `redutor_p = D_p × max(0, effPJ_p + effPF − cap_p)`; `net = max(0, gross − credits − Σredutor)`
- **caps:** per-payer dividend amount (inherent); 34/40/45 nominal caps; net floor at zero
- **rounding:** exact per-payer arithmetic; single final `ROUND_HALF_UP` to centavos

## REDUTOR STATUS

- statuses: `NOT_APPLICABLE | APPLICABLE | REQUIRES_EVIDENCE | BLOCKED |
UNSUPPORTED_PAYER_TYPE | UNSUPPORTED_YEAR`
- blocking conditions: missing/non-authoritative evidence; conflicting evidence; unknown payer
  type; non-positive accounting profit; multi-exercise profit periods

## MULTI-PAYER

- same payer multiple distributions: aggregate, one computation
- different payers: independent, summed, no offset
- mixed complete/incomplete evidence: supported payers compute; global net stays `null`
- cross-payer offset: NO

## FIXTURES A–AJ

All **PASS** (41 tests).

A: PASS · B: PASS · C: PASS · C2: PASS · D: PASS · E: PASS · F: PASS · G: PASS · H: PASS ·
I: PASS · J: PASS · K: PASS · L: PASS · M: PASS · N: PASS · O: PASS · P: PASS · Q: PASS ·
R: PASS · S: PASS · T: PASS · U: PASS · V: PASS · W: PASS · X: PASS · Y: PASS · Z: PASS ·
AA: PASS · AB: PASS · AC: PASS · AD: PASS · AE: PASS · AF: PASS · AG: PASS · AH: PASS ·
AI: PASS · AJ: PASS

## FUZZ

- cases: **25,000** · seed: **20261004** · failures: **0** · result: **PASS**

## DIFFERENTIAL

- in-fuzz cases: **1,026** · golden-matrix cases: **21** · mismatches: **0** · result: **PASS**
  (independent BigInt exact-rational reference, no production code reuse)

## PROPERTIES

determinism: PASS · payer-order invariance: PASS · no negative reduction: PASS ·
no negative net: PASS · missing evidence fail-closed: PASS · no cross-payer leak: PASS ·
no duplicate double count: PASS · source fingerprint: PASS · rule fingerprint: PASS ·
monotonicity: PASS · evidence-removal degradation: PASS · metamorphic: PASS ·
rounding-order documented: PASS

## SCALE

- 1 payer: 15.04 ms · 10: 1.1 ms · 100: 26.31 ms · 1k: 75.7 ms · 10k: 426.81 ms
- 100 distributions: 1.6 ms · 1k: 11.67 ms · 10k: 85.87 ms · 50k: 448.03 ms
- memory: 0.34 / 0.67 / 2.14 / 2.79 / 62.38 MB
- DB queries: **0**

## 4I.2 INTEGRATION

- complete corporate evidence: PASS (CALCULABLE, authoritative net)
- incomplete corporate evidence: PASS (INCOMPLETE_REDUCTION_DATA, net null)
- gross preserved: PASS
- net null when incomplete: PASS
- net available when complete: PASS

## ARCHITECTURE

4H mutation: NO · 4I.1 rewrite: NO · 4I.2 semantic rewrite: NO (scoped anticipated unlocking only) ·
Prisma: NO · Nest: NO · React: NO · client tax math: NO · mutable redutor source-of-truth: NO ·
Tax AI: NO

## SECURITY

raw CPF: NO · credential dependency: NO · token dependency: NO · network dependency: NO ·
payer spoofing: NO · evidence spoofing: NO

## 4I.2 REGRESSION

fixtures: PASS · fuzz: PASS · differential: PASS · properties: PASS

## 4I.1 REGRESSION

foundation: PASS · threshold: PASS · fuzz: PASS · fingerprint: PASS

## 4A–4G

4A: PASS · 4B: PASS · 4C: PASS · 4D: PASS · 4E: PASS · 4F: PASS · 4G: PASS

## 4H

4H.2: PASS · 4H.3: PASS · 4H.4: PASS · 4H.5: PASS · 4H.6: PASS

## FINANCIAL

portfolio-engine: PASS · valuation: PASS · performance: PASS · performance-series: PASS ·
risk: PASS · risk-adjusted: PASS · relative-risk: PASS · active-performance: PASS ·
rolling: PASS · tail: PASS · scenario: PASS · benchmark: PASS · rate-benchmark: PASS ·
historical/market-data: PASS · portfolio-intelligence: PASS · domain: PASS

## PLATFORM

api: PASS · fiscal-api: PASS · security: PASS · architecture: PASS · web: PASS · mobile: PASS ·
ui: PASS · database: PASS · web:e2e: PASS (117) · tax-engine: PASS with one pre-existing
environmental exception (see below)

## ROOT / GOVERNANCE

pnpm test: PASS · pnpm build: PASS · pnpm typecheck: PASS · pnpm lint: PASS ·
pnpm format:check: PASS · validate:foundation: PASS · validate:portfolio-engine-rc: PASS

## CONTRACTS / DOCS

high-income-minimum-tax-foundation-v1: MATCH · high-income-minimum-tax-calculation-v1: MATCH
(file unchanged; §8 redutor boundary superseded for supported cases by the 4I.3 contract) ·
high-income-corporate-redutor-v1: MATCH · legal research: MATCH · ADR-307: MATCH · AGENTS §75: MATCH

## SCOPE

legal redutor foundation: IMPLEMENTED · pure redutor calculation: IMPLEMENTED (supported cases) ·
integration with 4I.2: IMPLEMENTED · API: NOT IMPLEMENTED · UI: NOT IMPLEMENTED ·
persistence: NOT IMPLEMENTED · refund: NOT IMPLEMENTED · DARF: NOT IMPLEMENTED ·
Receita submission: OUT OF SCOPE · Tax AI: NOT ENABLED

## KNOWN PRE-EXISTING EXCEPTION (NOT A 4I.3 REGRESSION)

- `tests/tax-engine/annual-tax-readiness-scale.test.ts` → "Stress: 10,000 confirmations …
  under 1,500ms": wall-clock assertion (`Date.now()` delta) this environment cannot meet
  (observed ~1900–2300ms). Reproduces identically on the pristine 4I.2 baseline with 4I.3
  changes stashed. File untouched by 4I.3 (4H.5 timing assertion; no semantic failure —
  all correctness assertions in that file pass). Per policy the test was NOT modified.

## FINAL

LEGAL_FOUNDATION: READY · PAYER_MODEL: READY · EVIDENCE_MODEL: READY · REDUTOR_CORE: READY ·
MULTI_PAYER: READY · 4I2_INTEGRATION: READY · REGRESSIONS: READY (modulo the pre-existing
environmental timing exception above, unrelated to 4I.3)

REAL_4I3_BLOCKERS: none.

**PHASE 4I.3: APROVADA**
**PHASE 4I: NÃO APROVADA**

FINAL CHECKPOINT: `74bfa9b5974e9a53590d97522ecb702f3f9b8d96`
