# PROJECT ATLAS — PHASE 4I.2 — FINAL REPORT

## HIGH-INCOME MINIMUM TAX — DETERMINISTIC CALCULATION CORE

---

## GIT

- **base (4I.1 final):** `ced2e3f39f9d0d246c90bf1439bfcda1f549ae08`
- **branch:** `feature/phase-4i2-high-income-minimum-tax-calculation-core`
- **phase commit (4I.2):** `__PHASE_COMMIT__`
- **HEAD:** tip of the branch (see git log)
- **worktree:** clean

## ANCESTRY

- 4I.1 (`ced2e3f`) → HEAD: PASS
- 4H (`be4e157`) → HEAD: PASS
- `b189c5e` / `f622d94` → HEAD: PASS

## BASELINE

- test: PASS · build: PASS · typecheck: PASS · lint: PASS · format: PASS · foundation: PASS ·
  portfolio RC: PASS

## CALCULATION MODEL

- eligibility metric: **TOTAL_ANNUAL_INCOME**
- threshold: R$ 600.000,00 · boundary: **STRICTLY GREATER** (equality → NOT_APPLICABLE)
- progressive band: > 600k and < 1.2M → linear 0%→10% (`REND/60.000 − 10`)
- maximum rate: 10% (≥ 1.2M)
- minimum-tax base: sum of items classified `INCLUDED` (post-§ 1º exclusions)
- gross formula: `gross = base × rate% / 100`, exact decimal arithmetic
- rounding: internal 40 digits; currency scale 2 (centavos); single boundary `ROUND_HALF_UP`

## CREDIT MODEL

- supported credits: `ANNUAL_ADJUSTMENT_IRPF_DUE`, `EXCLUSIVE_SOURCE_WITHHOLDING`,
  `DEFINITIVE_IRPF_PAID`, `ART_6A_ANTICIPATED_WITHHOLDING`
- unsupported credits: `FOREIGN_INCOME_IRPF_14754` (no upstream), `ART_16B_REDUTOR` (reduction,
  formula not frozen)
- credit cap: none — `net = max(0, gross − supportedCredits)`
- excess handling: classified as `creditExcess` (informational; never refunded)

## CORPORATE REDUCTION

- supported: **NO** (CONDITIONAL/PARTIAL; formula not frozen in 4I.1)
- calculated: **NO**
- blocking behavior: `INCOMPLETE_REDUCTION_DATA` /
  `CORPORATE_EFFECTIVE_TAX_REDUCTION_NOT_IMPLEMENTED`; gross emitted, net `null`

## CALCULATION STATUS

- statuses: `NOT_APPLICABLE | CALCULABLE | INCOMPLETE_CREDITS | INCOMPLETE_REDUCTION_DATA |
REQUIRES_CONFIRMATION | BLOCKED | UNSUPPORTED_YEAR | UNSUPPORTED_INPUT`
- authoritative net tax requires: supported year + applicable + resolved base + no unsupported
  input + every required credit/reduction supported and evidenced

## RESULT MODEL

- totalAnnualIncome · minimumTaxBase · rate · grossMinimumTax · credits · reductions ·
  netMinimumTax · sourceFingerprint · calculationFingerprint (all money as exact decimal strings)

## GOLDEN VECTORS

600k: PASS · 600k + 0.01: PASS · 660k: PASS · 900k: PASS · 1.14M: PASS · 1.19999999M: PASS ·
1.2M: PASS · 2M: PASS

## FIXTURES A–AJ

All **PASS** (45 calculation fixtures incl. AG2).

A: PASS · B: PASS · C: PASS · D: PASS · E: PASS · F: PASS · G: PASS · H: PASS · I: PASS · J: PASS ·
K: PASS · L: PASS · M: PASS · N: PASS · O: PASS · P: PASS · Q: PASS · R: PASS · S: PASS · T: PASS ·
U: PASS · V: PASS · W: PASS · X: PASS · Y: PASS · Z: PASS · AA: PASS · AB: PASS · AC: PASS ·
AD: PASS · AE: PASS · AF: PASS · AG: PASS (incl. AG2 conflicting duplicate) · AH: PASS · AI: PASS ·
AJ: PASS

## FUZZ

- cases: **25,000** · seed: **20261004** · failures: **0** · result: **PASS**

## DIFFERENTIAL

- cases: **1,942** · mismatches: **0** · result: **PASS** (independent BigInt rational reference)

## PROPERTIES

determinism: PASS · shuffle invariance: PASS · rate monotonicity: PASS · rate cap: PASS ·
unknown != zero: PASS · unsupported fail-closed: PASS · net ≥ 0: PASS · no double count: PASS ·
source revision fingerprint: PASS · rule version fingerprint: PASS

## SCALE

- 100: 18.51 ms · 1k: 16.48 ms · 10k: 161 ms · 50k: 761.79 ms · 100k: 1576.65 ms
- 1 payer: 60.88 ms · 100 payers: 61.09 ms · 1k payers: 63.71 ms
- memory: 1.42 / 7.43 / 41.65 / 76.42 / 42.71 MB (100 → 100k items)
- DB queries: **0**

## ARCHITECTURE

4H mutation: NO · 4I.1 rewrite: NO · capital-gains recomputation: NO · investment-income
recomputation: NO · Prisma: NO · Nest: NO · React: NO · client tax math: NO · mutable
source-of-truth: NO · Tax AI: NO

## SECURITY

raw CPF: NO · credential dependency: NO · token dependency: NO · network dependency: NO

## 4I.1 REGRESSION

foundation fixtures: PASS · threshold fixtures: PASS · fuzz: PASS · fingerprint: PASS

## 4A–4G

4A: PASS · 4B: PASS · 4C: PASS · 4D: PASS · 4E: PASS · 4F: PASS · 4G: PASS

## 4H

4H.2: PASS · 4H.3: PASS · 4H.4: PASS · 4H.5: PASS · 4H.6: PASS

## FINANCIAL

portfolio-engine: PASS · valuation: PASS · performance: PASS · performance-series: PASS · risk:
PASS · risk-adjusted: PASS · relative-risk: PASS · active-performance: PASS · rolling: PASS · tail:
PASS · scenario: PASS · benchmark: PASS · rate-benchmark: PASS · historical/market-data: PASS ·
portfolio-intelligence: PASS · domain: PASS

## PLATFORM

api: PASS · fiscal-api: PASS · security: PASS · architecture: PASS · web: PASS · mobile: PASS ·
ui: PASS · database: PASS · web:e2e: PASS (117) · tax-engine: PASS (46 files / 526 tests)

## ROOT / GOVERNANCE

pnpm test: PASS · pnpm build: PASS · pnpm typecheck: PASS · pnpm lint: PASS · pnpm format:check:
PASS · validate:foundation: PASS · validate:portfolio-engine-rc: PASS

## CONTRACTS / DOCS

high-income-minimum-tax-foundation-v1: MATCH · high-income-minimum-tax-calculation-v1: MATCH ·
ADR-306: MATCH · AGENTS §74: MATCH

## SCOPE

pure calculation: **IMPLEMENTED** · API: NOT IMPLEMENTED · UI: NOT IMPLEMENTED · persistence: NOT
IMPLEMENTED · global annual adjustment: NOT IMPLEMENTED · refund: NOT IMPLEMENTED · DARF: NOT
IMPLEMENTED · Receita submission: OUT OF SCOPE · Tax AI: NOT ENABLED

## FINAL

CALCULATION_CORE: READY · DETERMINISM: READY · BASE_COMPOSITION: READY · CREDITS: READY ·
REDUCTION_BOUNDARY: READY · ARCHITECTURE: READY · REGRESSIONS: READY

REAL_4I2_BLOCKERS: none.

**PHASE 4I.2: APROVADA**
**PHASE 4I: NÃO APROVADA**

FINAL CHECKPOINT: `__PHASE_COMMIT__`
