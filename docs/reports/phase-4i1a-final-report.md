# PROJECT ATLAS — PHASE 4I.1A — FINAL REPORT

## THRESHOLD LEGAL RECONCILIATION & FINAL EVIDENCE CLOSURE

---

## GIT

- **base (4I.1 candidate):** `c1c5f4093b2612ad75e34b3ec6000916e16c96b8`
- **phase commit (4I.1):** `1d3d1baaa13cbbf92a38605912a2c89d19746cfa`
- **branch:** `feature/phase-4i1-high-income-minimum-tax-foundation`
- **phase commit (4I.1A):** `__PHASE_COMMIT__`
- **HEAD:** tip of the branch (see git log)
- **worktree:** clean

## PROVENANCE

- `1d3d1ba → HEAD`: PASS (ancestor)
- `be4e157 → HEAD`: PASS (ancestor)
- `b189c5e`, `4d70317`, `f622d94 → HEAD`: PASS (ancestors)
- **changes between phase commit `1d3d1ba` and prior HEAD `c1c5f40`:** only
  `docs/reports/phase-4i1-final-report.md` (2 placeholder `__PHASE_COMMIT__` substitutions).
- **classification:** REPORT (documentation-only; no domain/legal/test change).

## OQ-1

- **question:** Does the R$ 600.000,00 threshold use total annual income (A) or the reduced
  minimum-tax base after § 1º exclusions (B)?
- **source hierarchy:** (1) enacted statute; (2) regulation/IN; (3) official Receita interpretation;
  (4) official FAQ/Ministry material.
- **statutory text:** art. 16-A _caput_ — threshold on the “soma de todos os rendimentos recebidos
  no ano-calendário”; § 1º defines the base (income minus exclusions I–XII); § 2º fixes the **rate**
  on “rendimentos apurados nos termos do § 1º”.
- **legislative/regulatory text:** Senate committee report (Parecer 2025) — the floor test is broad
  (all income received); the result **after deductions** determines the rate. IN RFB nº 2.299/2025
  implements the monthly regime and tables; it does not narrow the annual § 1º base.
- **Receita interpretation:** RFB “Perguntas e Respostas — Tributação de Altas Rendas”, item 4 —
  “total de rendimentos auferidos no ano”.
- **FAQ interpretation:** Ministry of Finance — sum all income first; exclusions applied “na hora de
  calcular o valor do imposto”.
- **conclusion:** **RESOLVED_TO_TOTAL_INCOME**
- **canonical threshold metric:** `TOTAL_ANNUAL_INCOME`
- **confidence:** HIGH
- **remaining ambiguity:** none material for the threshold metric (OQ-2 operational detail remains
  open and out of scope).

## ENGINE BEHAVIOR

- **before:** threshold already evaluated on `totalAnnualIncome`, but the metric was not frozen
  explicitly (documented as ambiguous OQ-1); `minimumTaxBase` exposed separately.
- **after:** `HighIncomeMinimumTaxRuleSet.eligibilityThresholdMetric = TOTAL_ANNUAL_INCOME` and the
  assessment exposes `eligibilityThresholdMetric`, `minimumTaxBaseAboveThreshold` and
  `thresholdDivergenceDetected`; the resolved total-income metric controls.
- **authoritative when divergence exists:** YES (legal conclusion resolved).

## THRESHOLD FIXTURES

- 600k exact: PASS (AA)
- 600k + 0.01: PASS (AB)
- below 600k: PASS (AC)
- below 1.2M: PASS (AD)
- 1.2M exact: PASS (AE)
- above 1.2M: PASS (AF)
- divergent threshold bases: PASS (AG — APPLICABLE on total; divergence flagged)
- pre-effective: PASS (AH)
- 2026: PASS (AI)
- > =2028 unsupported: PASS (AJ)
- A–Z: PASS (39 fixture tests total)

## FUZZ

- **cases:** 10,000
- **seed:** 20261004
- **duration:** ~1,353 ms
- **failures:** 0
- **result:** PASS

## FINGERPRINT

- **same input same fingerprint:** PASS
- **ruleVersion change reflected:** PASS

## ARCHITECTURE

- 4H mutation: NO
- capital-gains recomputation: NO
- investment-income recomputation: NO
- final tax calculation: NO
- Prisma in pure domain: NO
- client tax math: NO
- Tax AI: NO

## SECURITY

- raw CPF: NO
- client ownership trust: NO
- cross-user state: NO
- payer spoofing: NO
- evidence spoofing: NO

## 4A–4G

- 4A: PASS
- 4B: PASS
- 4C: PASS
- 4D: PASS
- 4E: PASS
- 4F: PASS
- 4G: PASS

## 4H

- 4H.2: PASS
- 4H.3: PASS
- 4H.4: PASS
- 4H.5: PASS
- 4H.6: PASS

## FINANCIAL MATRIX

- portfolio-engine: PASS
- valuation: PASS
- performance: PASS
- performance-series: PASS
- risk: PASS
- risk-adjusted: PASS
- relative-risk: PASS
- active-performance: PASS
- rolling: PASS
- tail: PASS
- scenario: PASS
- benchmark: PASS
- rate-benchmark: PASS
- historical/market-data: PASS
- portfolio-intelligence: PASS
- domain: PASS

## PLATFORM

- api: PASS
- fiscal-api: PASS
- security: PASS
- architecture: PASS
- web: PASS
- mobile: PASS
- ui: PASS
- database: PASS
- web:e2e: PASS (117 tests)
- tax-engine: PASS (44 files / 472 tests)

## ROOT / GOVERNANCE

- pnpm test: PASS
- pnpm build: PASS
- pnpm typecheck: PASS
- pnpm lint: PASS
- pnpm format:check: PASS
- validate:foundation: PASS
- validate:portfolio-engine-rc: PASS

## CONTRACTS / DOCS

- high-income-minimum-tax-foundation-v1: MATCH
- legal research: MATCH
- ADR-305: MATCH
- AGENTS §73: MATCH

## SCOPE

- final minimum tax: NOT IMPLEMENTED
- global annual adjustment: NOT IMPLEMENTED
- refund: NOT IMPLEMENTED
- payment obligation: NOT IMPLEMENTED
- DARF: NOT IMPLEMENTED
- Receita submission: OUT OF SCOPE
- Tax AI: NOT ENABLED

## FINAL

- THRESHOLD_LEGAL_FOUNDATION: READY
- REGRESSION_EVIDENCE: READY
- PROVENANCE: READY

REAL_4I1_BLOCKERS: none.

**PHASE 4I.1A: APROVADA**

**PHASE 4I.1: APROVADA DEFINITIVAMENTE**

**PHASE 4I: NÃO APROVADA**

FINAL CHECKPOINT: `__PHASE_COMMIT__`
