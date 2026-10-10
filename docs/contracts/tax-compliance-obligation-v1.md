# Contract: Unified Tax Compliance Obligation & Timeline v1

## 1. Overview & Purpose

The **Unified Tax Compliance Timeline** (`tax-compliance-obligation-v1`) provides a single, deterministic, actionable compliance timeline for Brazilian tax subjects (individuals / investors) across all fiscal obligations.

It derives actionable obligations from:

- **Phase 4G Monthly Tax Engine**: Monthly financial liabilities (e.g. 6015 DARFs for equities, day trade, FIIs).
- **Phase 4H Annual General IRPF**: Annual capital markets summary, investment income, Bens e Direitos opening/closing positions, readiness declarations.
- **Phase 4I Annual High-Income IRPF**: Minimum effective tax reviews, corporate redutor facts, attested income.
- **Phase 4J Unified Annual IRPF**: Unified annual review packages, consistency validation, support-only exports.

---

## 2. Invariants & Non-Negotiable Rules

1. **NO TAX RECOMPUTATION**:
   - The compliance layer does NOT perform tax math, does not calculate DARF amounts, and does not alter capital gains or dividend taxes.
   - All monetary amounts and statuses are strictly derived from authoritative upstream states (4G, 4H, 4I, 4J).

2. **DETERMINISTIC TIMELINE PROJECTION**:
   - Given the same upstream states, user actions, and civil clock (`todayCivilDate`), the projection function produces an identical, deeply frozen timeline.

3. **DECIMAL STRINGS & CIVIL DATES**:
   - Amounts are exact decimal strings (e.g. `"1250.00"`) or `null` (not applicable). Zero (`"0.00"`) is never conflated with `null`.
   - Dates are civil `YYYY-MM-DD` strings, immune to time zones.

4. **USER-REPORTED COMPLETION (NO GOVERNMENT AFFILIATION)**:
   - Atlas records investor workflow tracking only.
   - User actions (e.g., `USER_REPORTED_COMPLETION`) carry explicit disclaimers that Atlas is not affiliated with Receita Federal do Brasil, Sicalc, or banking institutions, and user marking does not verify tax payment or official DIRPF transmission.

5. **CRYPTOGRAPHIC FINGERPRINTING & SUPERSESSION**:
   - Each obligation includes a `sourceFingerprint` derived from the underlying engine output.
   - If upstream inputs or transactions change, the recalculated fingerprint causes stale user actions to be marked `SUPERSEDED`, re-flagging the obligation for review without destroying historical action logs.

---

## 3. Data Schema

### 3.1 Tax Compliance Obligation (`TaxComplianceObligation`)

```typescript
export interface TaxComplianceObligation {
  readonly obligationKey: string; // Deterministic: `${taxSubjectId}:${period}:${kind}:${sourceRef}`
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly period: string; // "YYYY-MM" (monthly) or "YYYY" (annual)
  readonly kind: TaxComplianceObligationKind;
  readonly sourceModule: '4G' | '4H' | '4I' | '4J';
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly status: TaxComplianceObligationStatus;
  readonly severity: TaxComplianceObligationSeverity;
  readonly actionType: TaxComplianceActionType;
  readonly amount: string | null;
  readonly dueDate: string | null; // "YYYY-MM-DD"
  readonly title: string;
  readonly description: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly userAction: TaxComplianceUserActionSummary | null;
  readonly isOverdue: boolean;
}
```

### 3.2 Obligation Enums

- **Kind (`TaxComplianceObligationKind`)**:
  - `MONTHLY_TAX_PAYMENT`: Monthly tax due (e.g., DARF 6015).
  - `ANNUAL_REVIEW`: Annual position/income verification.
  - `ANNUAL_FILING_SUPPORT`: Annual IRPF package preparation and export.
  - `EVIDENCE_REQUIRED`: Missing informe or corporate redutor proof.
  - `CONFIRMATION_REQUIRED`: Divergent or unconfirmed trade classification / FII status.
  - `PROFESSIONAL_REVIEW_REQUIRED`: High-income minimum tax or complex tax situation requiring accountant advisory.

- **Status (`TaxComplianceObligationStatus`)**:
  - `OPEN`: Pending action/review within standard deadline.
  - `ACTION_REQUIRED`: High-priority or blocking requirement.
  - `AWAITING_CONFIRMATION`: Waiting for user confirmation.
  - `AWAITING_EVIDENCE`: Waiting for missing documents/facts.
  - `READY`: All inputs verified, ready for export or support review.
  - `COMPLETED`: User marked completed with matching source fingerprint.
  - `DISMISSED`: User dismissed advisory item.
  - `SUPERSEDED`: Upstream data changed after user action, requiring re-review.

- **Severity (`TaxComplianceObligationSeverity`)**:
  - `INFO`: Informative notice (e.g. exempt volume, zero tax due).
  - `ACTION`: Standard operational task (e.g. monthly DARF payment).
  - `WARNING`: Discrepancy, approaching deadline, or missing non-blocking item.
  - `BLOCKING`: Incomplete annual data, negative position, or critical tax blocker.

- **Action Type (`TaxComplianceActionType`)**:
  - `PAY`: Pay monthly DARF via official channels.
  - `REVIEW`: Review calculations, positions, or income.
  - `CONFIRM`: Confirm tax classification or declaration.
  - `PROVIDE_EVIDENCE`: Upload/provide corporate or income evidence.
  - `CONTACT_ACCOUNTANT`: Professional accountant review recommended.
  - `NO_ACTION`: Informational only; no user action needed.

---

## 4. API Endpoints

### 4.1 `GET /api/v1/fiscal/compliance`

- **Query Params**:
  - `calendarYear` (optional number, e.g. `2026`)
  - `status` (optional string)
  - `kind` (optional string)
  - `period` (optional string)
- **Response**:
  ```json
  {
    "data": {
      "taxSubjectId": "00000000-0000-0000-0000-000000000001",
      "calendarYear": 2026,
      "generatedAt": "2026-10-10T00:00:00.000Z",
      "summary": {
        "totalObligations": 14,
        "actionRequiredCount": 2,
        "overdueCount": 1,
        "upcomingCount": 4,
        "completedCount": 7,
        "supersededCount": 0
      },
      "obligations": [ ... ]
    }
  }
  ```
- **Headers**:
  - `Cache-Control: private, no-store`

### 4.2 `POST /api/v1/fiscal/compliance/:obligationKey/actions`

- **Request Body**:
  ```json
  {
    "actionType": "USER_REPORTED_COMPLETION",
    "note": "DARF pago pelo internet banking em 31/03/2026",
    "sourceFingerprint": "a3f5c9e..."
  }
  ```
- **Response**:
  ```json
  {
    "data": {
      "id": "...",
      "obligationKey": "...",
      "actionType": "USER_REPORTED_COMPLETION",
      "revision": 1,
      "occurredAt": "2026-10-10T00:00:00.000Z"
    }
  }
  ```
- **Tenant Isolation**: Returns `404 Not Found` if `obligationKey` or subject belongs to another user (anti-enumeration).
