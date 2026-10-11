# Contract: Tax Payment Support & Settlement Evidence v1

## 1. Scope & Purpose

This contract defines the domain types, data models, API endpoints, export structures, and security invariants for **Phase 4K.2: DARF Payment Support & Settlement Evidence Foundation**.

Atlas provides structured guidance to assist the investor in executing manual tax payments outside the application and maintaining an immutable, revisioned audit trail of payment claims. Atlas **does not** integrate with payment gateways, banks, PIX, boleto generation, Sicalc, or Receita Federal e-CAC. All settlements are strictly `USER_REPORTED` and disclaimed as unverified by the government.

---

## 2. Domain Types & Enums

### 2.1 Enums

- **`TaxPaymentSupportStatus`**:
  - `READY_TO_PAY`: Obligation is current and payable (`totalPayable > 0`).
  - `NO_PAYMENT_REQUIRED`: Obligation balance is zero or not payable.
  - `BELOW_MINIMUM_THRESHOLD`: Obligation is below minimum collection threshold (accumulates to future period).
  - `OVERDUE_ADVISORY`: Obligation due date is past; investor is advised of late settlement (without calculating interest/penalties).
  - `EXTERNAL_SETTLEMENT_RECORDED`: One or more external payment claims have been recorded by the user.

- **`TaxPaymentReconciliationStatus`**:
  - `NONE`: No payment claims recorded.
  - `MATCHED`: Total recorded payment amount exactly matches `totalPayable`.
  - `OVERPAID`: Total recorded payment amount exceeds `totalPayable`.
  - `UNDERPAID`: Total recorded payment amount is less than `totalPayable`.
  - `SUPERSEDED`: Underlying obligation fingerprint or amount has changed since payment evidence was recorded.

- **`TaxPaymentVerificationStatus`**:
  - `USER_REPORTED`: Payment claim was manually entered by the investor. Atlas does NOT verify execution with the tax authority.

---

## 3. Data Structures

### 3.1 `TaxPaymentSupport`

```typescript
export interface TaxPaymentSupport {
  obligationKey: string;
  taxSubjectId: string;
  competence: string;
  revenueCode: string | null;
  principalAmount: string;
  totalPayable: string;
  dueDate: string | null;
  status: TaxPaymentSupportStatus;
  reconciliationStatus: TaxPaymentReconciliationStatus;
  sourceFingerprint: string;
  legalBasis: string[];
  disclaimer: string;
  evidenceSummary: TaxPaymentEvidenceSummary;
  manualPaymentInstructions: {
    system: string;
    steps: string[];
    warning: string;
  };
}
```

### 3.2 `TaxPaymentEvidenceRecord`

```typescript
export interface TaxPaymentEvidenceRecord {
  id: string;
  taxSubjectId: string;
  obligationKey: string;
  revision: number;
  paidAmount: string;
  paidAtDate: string;
  paymentMethod: 'PIX' | 'BOLETO' | 'DEBIT' | 'OTHER';
  bankOrChannel?: string;
  authCodeOrProtocol?: string;
  documentRef?: string;
  notes?: string;
  verificationStatus: TaxPaymentVerificationStatus;
  sourceFingerprint: string;
  createdAt: string;
}
```

### 3.3 `TaxPaymentEvidenceSummary`

```typescript
export interface TaxPaymentEvidenceSummary {
  recordCount: number;
  totalPaidAmount: string;
  latestPaidAtDate: string | null;
  latestRevision: number;
  records: TaxPaymentEvidenceRecord[];
}
```

---

## 4. API Specification

### 4.1 Endpoints

| Method | Path                                                                               | Description                                                                     | Response Status |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------- |
| `GET`  | `/api/v1/fiscal/compliance/:obligationKey/payment-support`                         | Retrieves payment support details, reconciliation status, and evidence summary. | `200 OK`        |
| `GET`  | `/api/v1/fiscal/compliance/:obligationKey/payment-support/export?format=json\|csv` | Exports payment support details as JSON or sanitized CSV.                       | `200 OK`        |
| `POST` | `/api/v1/fiscal/compliance/:obligationKey/payment-evidence`                        | Records a new revision of external payment evidence.                            | `201 Created`   |
| `GET`  | `/api/v1/fiscal/compliance/:obligationKey/payment-evidence`                        | Lists historical payment evidence revisions for the obligation.                 | `200 OK`        |

### 4.2 Security & Headers

- All responses include `Cache-Control: no-store` to prevent caching of sensitive tax data.
- Cross-user accesses or non-existent obligations return `404 Not Found` (strict anti-enumeration invariant).
- CSV export applies OWASP CSV Injection Sanitization: any text starting with `=`, `+`, `-`, or `@` is prefixed with `'`.

---

## 5. Invariants & Guarantees

1. **Zero Tax Recomputation**: Payment support is a pure projection over Phase 4G and Phase 4K.1 data. It never re-evaluates tax rates, brackets, or exemptions.
2. **Strict Decimal Precision**: All currency amounts (`principalAmount`, `totalPayable`, `paidAmount`) are serialized as canonical decimal strings (`Money` / `NUMERIC(38, 18)`). Floats are strictly prohibited.
3. **Append-Only Revision History**: Evidence mutations always insert a new monotonic revision record (`revision = max + 1`) into `tax_settlement_records`. Existing rows are never updated or deleted.
4. **Mandatory Disclaimer**: Every response and UI view must include the official non-affiliation disclaimer stating that Atlas does not perform official DARF payment or verification.
