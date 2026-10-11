# Contract: Tax Payment Support & Settlement Evidence v1

## 1. Scope & Purpose

This contract defines the domain types, data models, API endpoints, export structures, and security invariants for **Phase 4K.2: DARF Payment Support & Settlement Evidence Foundation**.

Atlas provides structured guidance to assist the investor in executing manual tax payments outside the application and maintaining an immutable, revisioned audit trail of payment claims. Atlas **does not** integrate with payment gateways, banks, PIX, boleto generation, Sicalc, or Receita Federal e-CAC. All settlements are strictly `USER_REPORTED` and disclaimed as unverified by the government.

---

## 2. Domain Types & Enums

### 2.1 Enums

- **`TaxPaymentSupportStatus`**:
  - `READY`: Obligation is current, payable (`amount > 0`), and ready for payment support guidance.
  - `NOT_APPLICABLE`: Obligation is zero-amount, negative, or not payable.
  - `BLOCKED`: Pre-conditions for payment support guidance are not met.
  - `STALE`: Obligation source fingerprint is stale or invalidated.
  - `REQUIRES_REVIEW`: Obligation status requires manual review.

  _Fiscal Authority Boundary Note_: Atlas does not evaluate minimum DARF thresholds (`< 10.00`) inside the payment support engine. Obligation amounts and accumulation are strictly determined by upstream tax calculation engines.

- **`TaxPaymentReconciliationStatus`**:
  - `NO_EVIDENCE`: No user-reported settlement evidence recorded for this obligation.
  - `USER_REPORTED_MATCH`: Latest recorded evidence matches current obligation principal amount, reference period, and revenue code.
  - `USER_REPORTED_MISMATCH`: Recorded evidence diverges in amount, reference period, or revenue code.
  - `STALE_SOURCE`: Evidence was recorded against a superseded source fingerprint; source obligation has since been modified or recalculated.
  - `REQUIRES_REVIEW`: Discrepancy requires manual investor verification.

- **`TaxPaymentVerificationStatus`**:
  - `USER_REPORTED`: Payment claim was manually entered by the investor. Atlas does NOT verify execution with the tax authority.

---

## 3. Data Structures

### 3.1 `TaxPaymentSupport`

```typescript
export interface TaxPaymentSupport {
  readonly obligationKey: string;
  readonly taxSubjectId: string;
  readonly period: string;
  readonly revenueCode: string | null;
  readonly amount: string;
  readonly dueDate: string | null;
  readonly status: TaxPaymentSupportStatus;
  readonly reconciliationStatus: TaxPaymentReconciliationStatus;
  readonly sourceFingerprint: string;
  readonly title: string;
  readonly description: string;
  readonly legalBasis: string | null;
  readonly authority: string | null;
  readonly officialLink: string | null;
  readonly disclaimer: string;
  readonly latestEvidenceSummary: TaxPaymentEvidenceSummary | null;
}
```

### 3.2 `TaxPaymentEvidenceRecord`

```typescript
export interface TaxPaymentEvidenceRecord {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly evidenceFingerprint?: string;
  readonly revision: number;
  readonly paymentDate: string; // "YYYY-MM-DD"
  readonly amountReported: string; // Exact decimal string
  readonly revenueCodeReported: string | null;
  readonly referencePeriod: string; // "YYYY-MM"
  readonly externalReference: string | null;
  readonly note: string | null;
  readonly verificationStatus: TaxPaymentVerificationStatus;
  readonly createdAt: string;
}
```

### 3.3 `TaxPaymentEvidenceSummary`

```typescript
export interface TaxPaymentEvidenceSummary {
  readonly id: string;
  readonly revision: number;
  readonly sourceFingerprint?: string;
  readonly evidenceFingerprint?: string;
  readonly paymentDate: string;
  readonly amountReported: string;
  readonly revenueCodeReported: string | null;
  readonly referencePeriod: string;
  readonly externalReference: string | null;
  readonly note: string | null;
  readonly verificationStatus: TaxPaymentVerificationStatus;
  readonly createdAt: string;
}
```

---

## 4. API Specification

### 4.1 Endpoints

| Method | Path                                                                               | Description                                                                     | Response Status |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------- |
| `GET`  | `/api/v1/fiscal/compliance/:obligationKey/payment-support`                         | Retrieves payment support details, reconciliation status, and evidence summary. | `200 OK`        |
| `GET`  | `/api/v1/fiscal/compliance/:obligationKey/payment-support/export?format=json\|csv` | Exports payment support details as JSON or sanitized CSV.                       | `200 OK`        |
| `POST` | `/api/v1/fiscal/compliance/:obligationKey/payment-evidence`                        | Records user-reported payment evidence (semantically idempotent).               | `201 Created`   |
| `GET`  | `/api/v1/fiscal/compliance/:obligationKey/payment-evidence`                        | Lists historical payment evidence revisions for the obligation.                 | `200 OK`        |

### 4.2 Security & Headers

- All responses include `Cache-Control: no-store` to prevent caching of sensitive tax data.
- Cross-user accesses or non-existent obligations return `404 Not Found` (strict anti-enumeration invariant).
- CSV export applies OWASP CSV Injection Sanitization: any text starting with `=`, `+`, `-`, or `@` is prefixed with `'`.

---

## 5. Invariants & Guarantees

1. **Zero Tax Recomputation**: Payment support is a pure projection over Phase 4G and Phase 4K.1 data. It never re-evaluates tax rates, brackets, or exemptions.
2. **Fiscal Authority Boundary**: The payment support engine never calculates minimum-DARF (`< 10.00`) threshold logic. Obligation amounts and applicability are consumed directly from upstream obligations.
3. **Strict Decimal Precision**: All currency amounts (`amount`, `amountReported`) are serialized as canonical decimal strings (`Money` / `NUMERIC(38, 18)`). Floats are strictly prohibited.
4. **Append-Only Revision History & Semantic Idempotency (Migration 21)**:
   - Evidence mutations insert a new monotonic revision record (`revision = max + 1`) when distinct.
   - Exact duplicate submissions (same `taxSubjectId`, `obligationKey`, `sourceFingerprint`, and `evidenceFingerprint`) do not create new revisions or increment counters; they return the existing record idempotently via database unique constraint `tax_settlement_record_semantic_uniq`.
5. **Strictly Settled `STALE_SOURCE`**:
   - If the underlying obligation is modified or recalculated after evidence has been recorded, the reconciliation status is strictly settled as `STALE_SOURCE` (never ambiguous).
6. **Mandatory Disclaimer**: Every response and UI view must include the official non-affiliation disclaimer stating that Atlas does not perform official DARF payment or verification.
