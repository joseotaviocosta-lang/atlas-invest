# Contract — High-Income Minimum Tax Calculation v1

- **Contract ID:** `high-income-minimum-tax-calculation-v1`
- **Phase:** 4I.2 (pure deterministic calculation core)
- **Status:** FROZEN
- **Legal/data upstream:** `high-income-minimum-tax-foundation-v1` (Phase 4I.1/4I.1A, immutable)
- **Legal anchor:** Lei nº 15.270/2025 (arts. 16-A e 16-B da Lei 9.250/1995)
- **Calculation version:** `high-income-minimum-tax-calculation-v1`

---

## 1. Scope

Freezes the pure, deterministic, zero-I/O calculation of the Brazilian high-income minimum tax
(IRPFM) over the immutable annual facts consumed from Phase 4I.1. It defines the input snapshot,
rate model, base composition, credit model, reduction boundary, status model, null/zero semantics,
rounding, fingerprints and determinism.

Out of scope: API, UI, database persistence, global annual adjustment, refund, DARF, payment
execution, Receita submission, Tax AI, and any client-side tax math.

## 2. Input snapshot

`calculateHighIncomeMinimumTax(input)` consumes `BuildHighIncomeTaxDataSnapshotInput` (the canonical
4I.1 snapshot input: `calendarYear`, `taxSubjectId`, `currency`, `authoritativeTotalAnnualIncome`,
`items`, `taxPaidFacts`, `evidenceStates`, `sourceFingerprints`, optional `ruleSet`). It builds the
4I.1 snapshot and applicability assessment internally — never reinterpreting 4I.1 semantics.

## 3. Rule set

The versioned `HighIncomeMinimumTaxRuleSet` is authoritative. `eligibilityThresholdMetric =
TOTAL_ANNUAL_INCOME`. Rate constants are **derived** from the rule set (`offset = maximum rate`,
`divisor = threshold / offset`) — no magic `60.000`/`10` literals.

## 4. Applicability

Threshold: **total annual income strictly greater than R$ 600.000,00** (equality is
`NOT_APPLICABLE`). The minimum-tax base (after § 1º exclusions) is a **distinct** quantity used for
the rate and the tax amount. Calendar years without a rule set (`<2026`, `>=2028`) are
`UNSUPPORTED_YEAR`.

## 5. Rate calculation

For REND = minimum-tax base:

- `REND <= 600.000,00` → `0%`.
- `600.000,00 < REND < 1.200.000,00` → `REND/60.000 − 10` (linear, 0%→10%).
- `REND >= 1.200.000,00` → `10%` (maximum).

Exact rates are computed with arbitrary-precision decimals; the serialized rate percentage is padded
to 10 decimals. No JS float is used in any financial path.

## 6. Base composition

The base is the sum of items classified `INCLUDED` by the frozen 4I.1 legal golden matrix.
`EXCLUDED` items contribute `0`; `CONDITIONAL`/`REQUIRES_CONFIRMATION`/`UNSUPPORTED` items make the
base unresolved (`null`). `TOTAL_ANNUAL_INCOME` and `MINIMUM_TAX_BASE` are never collapsed.

## 7. Credit model

Supported credits (subtractable authoritative `HighIncomeTaxPaidFact` amounts, art. 16-A §3/§5):

| Credit kind                      | Supported | Role      | Required for net when                    |
| -------------------------------- | --------- | --------- | ---------------------------------------- |
| `ANNUAL_ADJUSTMENT_IRPF_DUE`     | YES       | CREDIT    | applicable                               |
| `EXCLUSIVE_SOURCE_WITHHOLDING`   | YES       | CREDIT    | exclusive-withholding income is included |
| `DEFINITIVE_IRPF_PAID`           | YES       | CREDIT    | provided (optional)                      |
| `ART_6A_ANTICIPATED_WITHHOLDING` | YES       | CREDIT    | provided (optional)                      |
| `FOREIGN_INCOME_IRPF_14754`      | NO        | CREDIT    | — (no authoritative upstream)            |
| `ART_16B_REDUTOR`                | NO        | REDUCTION | — (formula not frozen)                   |

Credits never create negative tax: `net = max(0, gross − appliedCredits)`. Any excess is classified
as `creditExcess` (informational only — **not** refunded; refunds are out of scope).

## 8. Corporate reduction support boundary

The art. 16-B corporate effective-tax reduction is **CONDITIONAL / PARTIAL** and its formula is not
frozen in 4I.1. Therefore 4I.2 **does not** implement it. Whenever the mechanism is potentially
applicable (an included dividend exists and the taxpayer is applicable), the calculator emits GROSS
tax and blocks the net with status `INCOMPLETE_REDUCTION_DATA` /
`CORPORATE_EFFECTIVE_TAX_REDUCTION_NOT_IMPLEMENTED`. It never silently ignores the reduction.

## 9. Status model

`NOT_APPLICABLE | CALCULABLE | INCOMPLETE_CREDITS | INCOMPLETE_REDUCTION_DATA |
REQUIRES_CONFIRMATION | BLOCKED | UNSUPPORTED_YEAR | UNSUPPORTED_INPUT`.

Precedence (fail-closed): unknown year → `UNSUPPORTED_YEAR`; hard integrity failure → `BLOCKED`;
conflicting duplicate source item → `BLOCKED`; unsupported input → `UNSUPPORTED_INPUT`; unresolved
base / missing payer → `REQUIRES_CONFIRMATION`; below threshold → `NOT_APPLICABLE`; corporate
reduction pending → `INCOMPLETE_REDUCTION_DATA`; missing required credit → `INCOMPLETE_CREDITS`;
otherwise `CALCULABLE`.

## 10. Null / zero semantics

`unknown ≠ zero`. A genuinely known-zero base yields `minimumTaxBase = "0"` and `gross = "0"`
(`CALCULABLE`). An unresolved base yields `minimumTaxBase = null`, `gross = null`, `net = null`.
`NOT_APPLICABLE` yields `null` rate/gross/net — never a computed zero. Missing required credits
yield `net = null` while `gross` may be known.

## 11. Rounding

- **Internal precision:** 40-digit decimal (`Money`/DecimalValue, `ROUND_HALF_UP`).
- **Currency scale:** 2 decimals (centavos).
- **Rounding point:** once, at the final monetary boundary (gross and net), `ROUND_HALF_UP`.
- **No multiple rounding stages:** the base is aggregated exactly, multiplied exactly, and only the
  final monetary outputs are rounded. `roundHalfUp` is pure string/BigInt arithmetic.

## 12. Fingerprint

`sourceFingerprint` is the deterministic 4I.1 snapshot SHA-256. `calculationFingerprint` is a
SHA-256 over canonical, key-sorted calculation content (version, `ruleVersion`, `sourceFingerprint`,
year, exercise, subject, currency, status, amounts, credits/reductions, net, blocking reasons).
Same canonical input ⇒ same fingerprint; source revision or `ruleVersion` change ⇒ different
fingerprint; item order does not affect the fingerprint (inputs are canonically sorted).

## 13. Unsupported behaviour

`FOREIGN_INCOME`, `RURAL_ACTIVITY`, unknown categories and foreign-currency items make
`status = UNSUPPORTED_INPUT`; they are never silently included, excluded or zeroed.

## 14. Determinism

Same canonical input ⇒ same status, amounts and fingerprint. Item order independence. Duplicate
source identity is deduplicated; conflicting duplicates fail closed (`BLOCKED`). Payer identity is
the canonical `payerId` (display name is never identity).

## 15. No persistence / no API / no UI

The calculation is derived and recomputable; it is never persisted as source-of-truth. 4I.2 adds no
API endpoint and no UI. It performs **0 DB queries**, has no Prisma/Nest/React/network dependency,
and Tax AI remains `UNSUPPORTED_TAX` with zero provider calls.
