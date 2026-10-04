# Contract — High-Income Corporate Effective-Tax Redutor v1

- **Contract ID:** `high-income-corporate-redutor-v1`
- **Phase:** 4I.3 (legal foundation + pure deterministic calculation)
- **Status:** FROZEN
- **Legal/data upstream:** `high-income-minimum-tax-foundation-v1` (4I.1/4I.1A, immutable);
  calculation core 4I.2 (integration target, semantics otherwise unchanged)
- **Legal anchor:** Lei nº 15.270/2025; Lei nº 9.250/1995 art. 16-B
- **Redutor version:** `high-income-corporate-redutor-v1`

---

## 1. Scope

Freezes the payer-scoped corporate effective-tax redutor of art. 16-B: applicability, payer
identity, payer types, reference rates, effective-rate inputs, evidence requirements, aggregation,
multi-payer semantics, same-payer aggregation, transition-dividend handling, rounding, caps,
blocking behaviour, fingerprints and integration with the 4I.2 core.

Out of scope: API, UI, database persistence, refund, carryforward, DARF, payment execution, Receita
submission, Tax AI, client-side tax math.

## 2. Applicability

The redutor is granted per distributing legal entity when
`corporateEffectiveRate + pfEffectiveRate > nominalCap` (art. 16-B caput).
Payer statuses:
`NOT_APPLICABLE | APPLICABLE | REQUIRES_EVIDENCE | BLOCKED | UNSUPPORTED_PAYER_TYPE |
UNSUPPORTED_YEAR`.

Only dividends **included** in the 16-A base ("lucros e dividendos" — `DIVIDEND` and
`INELIGIBLE`-transition, classification `INCLUDED`) are eligible. JCP (deductible remuneration,
not distributed profit) and transition-exempt dividends never enter the redutor.

## 3. Payer identity

The canonical `payerId` is the identity. Display names are never identity; different legal entities
with identical names never merge. Evidence is keyed by `(payerId, profitPeriodExercise)`.

## 4. Payer types and reference rates

| Payer type                           | Reference rate  | Source                   |
| ------------------------------------ | --------------- | ------------------------ |
| `STANDARD_CORPORATE`                 | 34%             | art. 16-B §1º I          |
| `INSURANCE_CAPITALIZATION_REGULATED` | 40%             | art. 16-B §1º II         |
| `FINANCIAL_INSTITUTION`              | 45%             | art. 16-B §1º III        |
| `UNKNOWN`                            | — (fail closed) | `UNSUPPORTED_PAYER_TYPE` |

No hardcoded unexplained literals: every rate carries its statutory reference.

## 5. Effective-rate inputs

- **Corporate rate:** computed by Atlas as `(irDue + csllDue + prouniTaxCredit?) ÷ accountingProfit
× 100` from explicitly provided, evidenced book figures (§3, I; §8 for Prouni). Book figures are
  never fabricated; absent figures fail closed. Strictly positive accounting profit is required
  (zero/negative → `BLOCKED`).
- **Modes:** `FULL` (lucro contábil) and `SIMPLIFIED` (certified §6 profit + revenue for audit;
  Atlas does not recompute the six §6 deductions).
- **PF rate:** single beneficiary-level rate `(Gross(Base) − Gross(Base − D)) ÷ D × 100` with the
  frozen 4I.2 rate model, before any reduction (§3, II). Identical for all payers.
- **Period:** the profit-origin exercise (`profitPeriodExercise`, §3, I). Multiple distinct profit
  periods for one payer in one year are UNSUPPORTED and fail closed (no statutory splitting rule).

## 6. Evidence requirements

Per-payer evidence carries `evidenceAuthority`
(`AUTHORITATIVE | REQUIRES_CONFIRMATION | MISSING | CONFLICTING | UNSUPPORTED`) and
`evidenceSource`. Only `AUTHORITATIVE` authority with source `PJ_FINANCIAL_STATEMENTS` or
`RFB_PREFILLED` computes. Taxpayer confirmation alone (§4 requires statements) yields at most
`REQUIRES_EVIDENCE`, never an authoritative reduction.

Duplicate identical records deduplicate; conflicting records for the same payer+period yield
`BLOCKED` (`CONFLICTING_CORPORATE_EVIDENCE`). No double count.

## 7. Aggregation

Same-payer distributions aggregate before the payer computation (annual statutory amounts).
Per-payer formula: `redutor_p = D_p × max(0, effPJ_p + effPF − cap_p)` — exact arithmetic, floored
at zero per payer. Global: `Σ redutor_p`, rounded once at the final boundary. **No cross-payer
offset**: one payer's excess never offsets another's shortfall (no statutory provision).

## 8. Multi-payer semantics

1/2/10/100/1000+ payers: independent per-payer computation, deterministic canonical ordering
(`payerId` ascending), identical aggregate regardless of input order. Mixed complete/incomplete
evidence: supported payers compute, but the global net stays non-authoritative while any required
payer is unresolved.

## 9. Transition-dividend handling

Transition-eligible (base-excluded) dividends attract no redutor. Transition-ineligible (base-
included) dividends follow the ordinary path. Unverified transition dividends fail closed upstream
and never reach the redutor.

## 10. Rounding

Internal 40-digit decimals; per-payer arithmetic exact (unrounded); single final `ROUND_HALF_UP`
to centavos on the aggregate. No payer-level premature rounding (statute is silent).

## 11. Caps

The per-payer dividend amount is the inherent multiplicand cap. The global net is clamped:
`net = max(0, gross − supportedCredits − redutor)`. No carryforward and no refund exist in the
statute; excess is informational only.

## 12. Blocking behaviour

Missing/non-authoritative evidence → `REQUIRES_EVIDENCE` (global `INCOMPLETE_REDUCTION_DATA`, net
`null`, gross preserved). Conflicting evidence or unknown payer type → `BLOCKED` (net `null`).
Unsupported years/categories follow the frozen 4I.1/4I.2 behaviour.

## 13. Fingerprints

Deterministic per-payer `sourceFingerprint` (evidence) and aggregate `sourceFingerprint` +
`calculationFingerprint` (SHA-256 over canonical content). Same input ⇒ same fingerprints; evidence
or rule-version change ⇒ changed fingerprints; payer order ⇒ no change.

## 14. Integration with 4I.2

`calculateHighIncomeMinimumTax` accepts optional `corporateEvidence`. With complete evidence the
previously blocked dividend path becomes `CALCULABLE` and emits an authoritative net; with
incomplete evidence it remains `INCOMPLETE_REDUCTION_DATA` (gross known, net `null`). All other
4I.2 semantics are unchanged. The computed reduction is appended to `reductions` as an
`ART_16B_REDUTOR` entry (`APPLIED`); the support matrix entry for paid-fact redutor claims remains
`supported: false` (engine computation is the authority, not a paid-fact claim).

## 15. No persistence / no API / no UI

The redutor is derived and recomputable; never persisted as source-of-truth. No API endpoint, no UI.
Pure engine: **0 DB queries**. No Prisma/Nest/React/network. Tax AI remains `UNSUPPORTED_TAX`
with zero provider calls.
