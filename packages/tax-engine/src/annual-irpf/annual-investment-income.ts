import { Currency, Money } from '@atlas/domain';

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

export interface AnnualIncomeCategorySummary {
  readonly incomeType: IncomeType;
  readonly totalGrossAmount: Money;
  readonly totalWithheldTax: Money;
  readonly totalNetAmount: Money;
  readonly eventCount: number;
  readonly taxTreatmentSummary: IncomeTaxTreatment;
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
  readonly taxSubjectId: string;
  readonly currency: Currency;
  readonly isComplete: boolean;
  readonly status: IncomeCompletenessStatus;
  readonly qualityIssues: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly dividends: AnnualIncomeCategorySummary;
  readonly jcp: AnnualIncomeCategorySummary;
  readonly fiiIncome: AnnualIncomeCategorySummary;
  readonly totalGrossIncome: Money;
  readonly totalWithheldTax: Money;
  readonly payers: readonly AnnualIncomePayerSummary[];
  readonly months: readonly AnnualMonthlyIncomeSnapshot[];
  readonly events: readonly AnnualIncomeEvent[];
  readonly calculatedAt: string;
  readonly fingerprint: string;
}
