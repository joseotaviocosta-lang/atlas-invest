# Contract: `annual-investment-income-v1`

**Phase:** 4H.4 / 4H.4A — Annual Investment Income Summary  
**Status:** Frozen  
**Governing Domain:** `@atlas/tax-engine`  
**API Resource:** `GET /api/v1/fiscal/annual/:calendarYear/income`

---

## 1. Domain Types & Data Contracts

```typescript
export type IncomeType = 'DIVIDEND' | 'JCP' | 'FII_INCOME';

export type IncomeTaxTreatment =
  | 'EXEMPT'
  | 'WITHHOLDING_EXCLUSIVE'
  | 'WITHHOLDING_CREDITABLE'
  | 'CONDITIONALLY_EXEMPT'
  | 'TAXABLE_ANNUAL'
  | 'REQUIRES_CONFIRMATION'
  | 'BLOCKED';

export type IncomeCompletenessStatus = 'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'REQUIRES_CONFIRMATION';

export interface AnnualIncomeEvent {
  readonly incomeEventId: string;
  readonly incomeType: IncomeType;
  readonly assetId: string;
  readonly payerId: string;
  readonly payerDisplayName: string;
  readonly paymentDate: string; // YYYY-MM-DD
  readonly competence: string; // YYYY-MM
  readonly calendarYear: number;
  readonly grossAmount: Money;
  readonly withheldTaxAmount: Money | null;
  readonly netAmount: Money;
  readonly currency: Currency;
  readonly taxTreatment: IncomeTaxTreatment;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly completenessStatus: IncomeCompletenessStatus;
  readonly blockingReasons: readonly string[];
  readonly source: string;
  readonly sourceFingerprint: string;
}

export interface AnnualIncomeCategorySummary {
  readonly incomeType: IncomeType;
  readonly totalGrossAmount: Money;
  readonly totalWithheldTax: Money;
  readonly totalNetAmount: Money;
  readonly eventCount: number;
  readonly taxTreatmentSummary: string;
  readonly isComplete: boolean;
}

export interface AnnualIncomePayerSummary {
  readonly payerId: string;
  readonly payerDisplayName: string;
  readonly dividendGross: Money;
  readonly jcpGross: Money;
  readonly jcpWithheld: Money;
  readonly fiiIncomeGross: Money;
  readonly totalGross: Money;
  readonly totalWithheld: Money;
  readonly isComplete: boolean;
}

export interface AnnualMonthlyIncomeSnapshot {
  readonly competence: string;
  readonly month: number;
  readonly dividendsGross: Money;
  readonly jcpGross: Money;
  readonly jcpWithheld: Money;
  readonly fiiIncomeGross: Money;
  readonly totalGross: Money;
  readonly totalWithheld: Money;
  readonly eventCount: number;
}

export interface AnnualInvestmentIncomeSummary {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly isComplete: boolean;
  readonly status: IncomeCompletenessStatus;
  readonly currency: Currency;
  readonly qualityIssues: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly dividends: AnnualIncomeCategorySummary;
  readonly jcp: AnnualIncomeCategorySummary;
  readonly fiiIncome: AnnualIncomeCategorySummary;
  readonly totalGrossIncome: Money;
  readonly totalWithheldTax: Money;
  readonly payers: readonly AnnualIncomePayerSummary[];
  readonly months: readonly AnnualMonthlyIncomeSnapshot[];
  readonly fingerprint: string;
}
```

---

## 2. Invariant Rules

1. **JCP Withholding Transition:**
   - Events with `paymentDate < '2026-01-01'` use 15.0% (`0.15`) statutory rate (`R-JCP-2025`).
   - Events with `paymentDate >= '2026-01-01'` use 17.5% (`0.175`) statutory rate (`R-JCP-2026`).
2. **Dividend Exemption Threshold (2026, per Lei 15.270/2025 Art. 6º-A):**
   - Events with `paymentDate < '2026-01-01'` are 100% exempt (`R-DIV-2025`).
   - Events with `paymentDate >= '2026-01-01'` and qualifying transition evidence (`R-DIV-TRANSITION`) are exempt.
   - Events with `paymentDate >= '2026-01-01'` without transition eligibility evaluate monthly total per payer:
     - Total <= R$ 50,000.00: 0% withholding (`EXEMPT`).
     - Total > R$ 50,000.00: 10% withholding on the **TOTAL** monthly amount (`WITHHOLDING_EXCLUSIVE`).
3. **FII Exemption Fail-Closed:**
   - Requires verification of exchange listing, >= 100 cotistas, and < 10% ownership.
   - Missing evidence produces `REQUIRES_CONFIRMATION` with `FII_ELIGIBILITY_UNVERIFIED`.
4. **Conservation & Reconciled Sums:**
   - `totalGrossIncome === dividends.gross + jcp.gross + fiiIncome.gross`.
   - `totalGrossIncome === sum(payers.totalGross) === sum(months.totalGross)`.
   - `totalWithheldTax === dividends.withheld + jcp.withheld + fiiIncome.withheld`.
5. **No Cross-User Leaks:**
   - All queries filter strictly by authenticated `taxSubjectId`. Cross-user access returns 404.
