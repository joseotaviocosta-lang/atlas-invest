# PROJECT ATLAS — PHASE 4I.1 — FINAL REPORT

## HIGH-INCOME MINIMUM TAX — LEGAL & DATA FOUNDATION

---

## GIT

- **base:** `be4e15745ac9ed59be4065e1cc49efc4ebba59c7`
- **branch:** `feature/phase-4i1-high-income-minimum-tax-foundation`
- **phase commit:** `1d3d1baaa13cbbf92a38605912a2c89d19746cfa`
- **HEAD:** tip of the branch (see git log)
- **worktree:** clean

Ancestry confirmed for `be4e157`, `b189c5e`, `4d70317`, `f622d94` (all exit 0).

## LEGAL RESEARCH

- **cutoff / retrieval date:** 2026-10-04
- **primary sources:** Lei nº 15.270/2025 (Planalto + DOU); Lei nº 9.250/1995 (arts. 16-A/16-B); Lei nº 9.249/1995 (art. 10 §§4º–5º, art. 10-A); IN RFB nº 2.299/2025; RFB “Perguntas e Respostas — Tributação de Altas Rendas”; RFB P&R DIRPF 2026; Ministério da Fazenda FAQ.
- **effective date:** 2026-01-01 (Lei 15.270/2025, art. 8º).
- **first calendar year:** 2026.
- **first declaration exercise:** 2027.
- **open legal questions:** OQ-1 threshold base (gross total vs §1 base); OQ-2 annual-regime operational detail (no IN as of cutoff); OQ-3 foreign income (Lei 14.754); OQ-4 Fiagro as distinct category; OQ-5 multi-payer redutor evidence; OQ-6 rural result.

## APPLICABILITY

- **taxpayer population:** resident individual whose sum of annual income is superior to R$ 600.000,00.
- **threshold:** R$ 600.000,00.
- **threshold boundary:** STRICTLY GREATER (equality is not subject).
- **progressive band:** > R$ 600.000,00 and < R$ 1.200.000,00 → linear 0%→10% (`Alíquota % = REND/60.000 − 10`).
- **maximum minimum rate:** 10% (income ≥ R$ 1.200.000,00).
- **final amount calculated:** NO.

## INCOME CLASSIFICATION

- **dividends:** INCLUDED.
- **transition dividends:** EXCLUDED (eligible) / REQUIRES_CONFIRMATION (unverified).
- **JCP:** INCLUDED.
- **FII income:** EXCLUDED (eligible listed ≥ 100 cotistas) / REQUIRES_CONFIRMATION (unverified).
- **normal equity capital gains:** INCLUDED.
- **day trade:** INCLUDED.
- **FII capital gains:** INCLUDED.
- **exclusive withholding:** INCLUDED (with deductible exclusive IRRF).
- **foreign income:** UNSUPPORTED (no authoritative upstream).
- **other:** savings/bonds/donations/indemnities EXCLUDED; rural and unknown UNSUPPORTED; exempt security of share nature CONDITIONAL.

## LEGAL GOLDEN MATRIX

Frozen in `docs/research/high-income-minimum-tax-legal-foundation-2026.md` §7 (18 categories with
source, rule version, required evidence and open questions). No category is assumed included.

## CORPORATE EFFECTIVE TAX MECHANISM

- **applicable:** CONDITIONAL (art. 16-B).
- **required data:** corporate financial statements / accounting profit; IRPJ + CSLL due; effective rates; nominal cap (34% / 40% / 45%).
- **supported by Atlas:** PARTIAL (data-requirement assessment only).
- **calculation implemented:** NO.

## DOMAIN

- **rule set:** `HighIncomeMinimumTaxRuleSet` (versioned, effective dates, official provenance).
- **applicability model:** `assessHighIncomeMinimumTaxApplicability`.
- **income classification model:** `HighIncomeIncomeClassification` + `classifyHighIncomeIncomeItem`.
- **evidence model:** `HighIncomeEvidenceRequirement` / states.
- **snapshot:** `HighIncomeTaxDataSnapshot` (`HIGH_INCOME_TAX_DATA_SNAPSHOT_V1`).
- **fingerprint:** `computeHighIncomeSnapshotFingerprint` (SHA-256, canonical, deterministic).

## DATABASE

- **new persistence:** NO
- **derived source-of-truth:** NO

## API

- **implemented:** NO (not required for the foundation)
- **endpoint:** —

## UI

- **implemented:** NO (optional read-only card deferred)
- **read-only:** N/A
- **final tax shown:** NO

## FIXTURES A–Z

All PASS (27 tests in `tests/tax-engine/high-income-minimum-tax-fixtures.test.ts`).

A: PASS · B: PASS · C: PASS · D: PASS · E: PASS · F: PASS · G: PASS · H: PASS · I: PASS · J: PASS ·
K: PASS · L: PASS · M: PASS · N: PASS · O: PASS · P: PASS · Q: PASS · R: PASS · S: PASS · T: PASS ·
U: PASS · V: PASS · W: PASS · X: PASS · Y: PASS · Z: PASS

## FUZZ

- **cases:** 10,000
- **seed:** 20261004
- **invariants:** determinism; no final tax; closed status set; pre-effective isolation; unknown ≠ zero; unsupported never silently classified; rule-version consistency; negative-amount blocking.
- **duration:** ~882 ms
- **failures:** 0

## ARCHITECTURE

- **4H mutation:** NO
- **capital-gains recomputation:** NO
- **investment-income recomputation:** NO
- **Prisma in pure domain:** NO
- **client tax math:** NO
- **mutable minimum-tax source-of-truth:** NO
- **Tax AI dependency:** NO

## SECURITY

- **raw CPF:** NO
- **client ownership trust:** NO
- **cross-user state:** NO
- **payer spoofing:** NO
- **evidence spoofing:** NO

## QUERY BUDGET

- **implemented:** NO (no application/API read path in 4I.1)
- **small / medium / large:** N/A
- **N+1:** NO

## SCALE

Synthetic deterministic datasets (observed development/test evidence, not a production SLA):

- **100 facts:** 9.7 ms
- **1,000 facts:** 13.58 ms
- **10,000 facts:** 135.53 ms
- **50,000 facts:** 725.22 ms
- **1 year:** 7.91 ms
- **5 years:** 37.28 ms
- **10 years:** 73.22 ms
- **20 years:** 145.02 ms

## REGRESSIONS

4A: PASS · 4B: PASS · 4C: PASS · 4D: PASS · 4E: PASS · 4F: PASS · 4G: PASS
4H.2: PASS · 4H.3: PASS · 4H.4: PASS · 4H.5: PASS · 4H.6: PASS
financial: PASS

## PLATFORM

api: PASS · fiscal-api: PASS · security: PASS · architecture: PASS · web: PASS · mobile: PASS ·
ui: PASS · database: PASS · web:e2e: PASS (117 tests) · tax-engine: PASS (44 files / 460 tests)

## ROOT / GOVERNANCE

pnpm test: PASS · pnpm build: PASS · pnpm typecheck: PASS · pnpm lint: PASS · pnpm format:check:
PASS · validate:foundation: PASS · validate:portfolio-engine-rc: PASS

## CONTRACTS / DOCS

- high-income-minimum-tax-foundation-v1: MATCH
- legal research: MATCH
- ADR: MATCH (ADR-305)
- AGENTS: MATCH (§73)

## SCOPE

- final minimum tax: NOT IMPLEMENTED
- global annual adjustment: NOT IMPLEMENTED
- refund: NOT IMPLEMENTED
- payment obligation: NOT IMPLEMENTED
- DARF: NOT IMPLEMENTED
- Receita submission: OUT OF SCOPE
- Tax AI: NOT ENABLED

## FINAL

LEGAL_FOUNDATION: READY
DATA_FOUNDATION: READY
CLASSIFICATION: READY
EVIDENCE_MODEL: READY
ARCHITECTURE: READY
SECURITY: READY
REGRESSIONS: READY

REAL_4I1_BLOCKERS: none.

**PHASE 4I.1: APROVADA**
**PHASE 4I: NÃO APROVADA**

FINAL CHECKPOINT: `1d3d1baaa13cbbf92a38605912a2c89d19746cfa`
