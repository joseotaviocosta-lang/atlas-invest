# Contract — High-Income Minimum Tax Foundation v1

- **Contract ID:** `high-income-minimum-tax-foundation-v1`
- **Phase:** 4I.1 (foundation only)
- **Status:** FROZEN
- **Upstream baseline:** Phase 4H final (`be4e15745ac9ed59be4065e1cc49efc4ebba59c7`)
- **Legal anchor:** Lei nº 15.270/2025 (arts. 16-A e 16-B da Lei 9.250/1995); retrieval 2026-10-04

---

## 1. Scope

This contract freezes the **legal and data foundation** of the Brazilian high-income minimum tax
(IRPFM) inside `@atlas/tax-engine`. It defines canonical types, statuses, classification and evidence
models, a deterministic snapshot and fingerprint, upstream dependencies, and the explicit boundary
that **no final payable tax is computed in 4I.1**.

Out of scope (explicitly): final minimum-tax amount, final effective rate, global annual adjustment,
refund, payment obligation, DARF generation, Receita submission, Tax AI, persistence of derived
state, and any client-side tax math.

## 2. Effective dates, calendar year and declaration exercise

- The regime produces effects from **2026-01-01** (Lei 15.270/2025, art. 8º).
- `calendarYear` = economic year of the income; `declarationExercise` = year of filing
  (`calendarYear + 1` under the ordinary rule).
- First applicable `calendarYear` = **2026**; first `declarationExercise` = **2027**.
- Years without a modeled rule set resolve to `UNSUPPORTED_YEAR` (fail closed).
- `calendarYear` **is not** `declarationExercise`; they are distinct concepts and must never be
  collapsed.

## 3. Terminology (canonical)

`HighIncomeMinimumTax`, `MinimumTaxBase`, `MinimumEffectiveRate` (rate band), `TaxCredit` /
deductions, `AnticipatedWithholding`, `ExcludedIncome`, `Reduction` /
`CorporateEffectiveTaxAdjustment`, `TransitionIncome`. See the legal research doc §4.

## 4. Applicability statuses

`HighIncomeMinimumTaxApplicabilityStatus`:
`APPLICABLE | NOT_APPLICABLE | REQUIRES_CONFIRMATION | BLOCKED | UNSUPPORTED_YEAR`.

Precedence (fail-closed):

1. No modeled rule set → `UNSUPPORTED_YEAR`.
2. No activity (no facts, no authoritative total) → `NOT_APPLICABLE`.
3. Hard integrity failure (e.g. negative amount, authoritative currency mismatch) → `BLOCKED`.
4. Unresolved classification (`CONDITIONAL` / `REQUIRES_CONFIRMATION` / `UNSUPPORTED`) or any
   blocking evidence requirement → `REQUIRES_CONFIRMATION`.
5. Total income **strictly greater than R$ 600.000,00** → `APPLICABLE`.
6. Otherwise → `NOT_APPLICABLE`.

Data completeness reuses Phase 4H.5 semantics:
`READY | PARTIAL | REQUIRES_CONFIRMATION | BLOCKED | NO_ACTIVITY` (no conflicting vocabulary).

## 5. Income classification model

`HighIncomeIncomeClassification`: `INCLUDED | EXCLUDED | CONDITIONAL | REQUIRES_CONFIRMATION |
UNSUPPORTED`.

Canonical categories and mappings are frozen in the legal golden matrix (research doc §7) and the
rule registry. Governing invariants:

- **Unknown category is never silently included or excluded** → `UNSUPPORTED`.
- **CONDITIONAL** entries must declare condition, legal source, required evidence and fail-closed
  behaviour.
- Ordinary dividends and JCP are `INCLUDED`; eligible transition dividends and eligible FII income
  are `EXCLUDED`; exchange net-gain capital gains are `INCLUDED`; non-exchange capital gains are
  `EXCLUDED`; foreign income and rural result are `UNSUPPORTED` (no authoritative upstream).

## 6. Evidence model

`HighIncomeEvidenceRequirementCode`:
`ANNUAL_INCOME_TOTAL | DIVIDEND_SOURCE_CLASSIFICATION | TRANSITION_ELIGIBILITY | FII_ELIGIBILITY |
CORPORATE_EFFECTIVE_TAX_EVIDENCE | FOREIGN_TAX_CREDIT_EVIDENCE | WITHHOLDING_EVIDENCE |
ANNUAL_ADJUSTMENT_TAX_DUE`.

Each requirement carries `requirementId`, `subjectId`, `status`
(`SATISFIED | PENDING | WAIVED`), `legalReference`, `blockingReason` and `sourceFingerprint`.
**Missing evidence is never negative evidence**: pending requirements downgrade applicability to
`REQUIRES_CONFIRMATION` where legally required, and are never coerced to zero.

## 7. Snapshot model

`HighIncomeTaxDataSnapshot` (`HIGH_INCOME_TAX_DATA_SNAPSHOT_V1`) is immutable and contains:
`calendarYear`, `declarationExercise`, `taxSubjectId`, `currency`, `ruleVersion`,
`items` (classified, canonically ordered by `paymentDate`, `category`, `itemId`),
`taxPaidFacts`, `payerIdentities`, `evidenceStates`, `sourceFingerprints`, `completenessStatus`,
`limitations` and `fingerprint`. It contains **no** non-deterministic timestamp.

## 8. Fingerprint

`computeHighIncomeSnapshotFingerprint` produces a SHA-256 over a canonical, key-sorted
serialization of the snapshot content. Same canonical input ⇒ same fingerprint; changed
authoritative input (amount, payer, year, subject, evidence, source) ⇒ different fingerprint.

## 9. Upstream dependencies (Phase 4H — immutable)

- 4H.3 capital-market annual state (equity/day-trade/FII net gains).
- 4H.4 dividend / JCP / FII-income records (transition and FII-eligibility evidence preserved).
- 4H.5 readiness/evidence and confirmations.
- Phase 4H is consumed **as-is**; 4I never reinterprets, recomputes or mutates 4H facts.

## 10. Unsupported data policy

Categories without authoritative upstream support (`FOREIGN_INCOME`, `RURAL_ACTIVITY`, Fiagro,
unknown) are marked `UNSUPPORTED` / `UNSUPPORTED_UPSTREAM_DATA`. They are never fabricated,
zero-filled, or silently classified.

## 11. Unknown / null semantics

`unknown amount ≠ zero`; `unknown tax credit ≠ zero`; `missing corporate evidence ≠ zero`;
`missing foreign evidence ≠ zero`. Unresolved classifications produce `minimumTaxBase = null`
(never `"0"`).

## 12. No-final-calculation boundary

4I.1 exposes `finalTaxAmount: null` and `minimumEffectiveRatePercentage: null`, and the explicit
marker `calculationBoundary = 'NO_FINAL_TAX_CALCULATION'`. Calculating the final payable minimum
tax, refunds, annual adjustment or payment obligations requires a later phase (4I.2) and is
prohibited here. Tax AI remains `UNSUPPORTED_TAX` with zero provider calls.

## 13. Compliance

- No Prisma/Nest/React/HTTP/DB inside the pure 4I domain.
- No floating point for monetary values (only `Money`/decimal strings).
- No payer display name as identity.
- No persistence of derived minimum-tax results as source of truth.
