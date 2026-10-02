import {
  AnnualInvestmentIncomeSummary,
  AnnualIncomeCategorySummary,
  AnnualIncomePayerSummary,
  AnnualMonthlyIncomeSnapshot,
} from '@atlas/tax-engine';

export interface AnnualIncomeCategoryReadModel {
  readonly incomeType: string;
  readonly totalGrossAmount: string;
  readonly totalWithheldTax: string;
  readonly totalNetAmount: string;
  readonly eventCount: number;
  readonly taxTreatmentSummary: string;
  readonly isComplete: boolean;
}

export interface AnnualIncomePayerReadModel {
  readonly payerId: string;
  readonly payerDisplayName: string;
  readonly dividendGross: string;
  readonly jcpGross: string;
  readonly jcpWithheld: string;
  readonly fiiIncomeGross: string;
  readonly totalGross: string;
  readonly totalWithheld: string;
  readonly isComplete: boolean;
}

export interface AnnualMonthlyIncomeReadModel {
  readonly competence: string;
  readonly month: number;
  readonly dividendsGross: string;
  readonly jcpGross: string;
  readonly jcpWithheld: string;
  readonly fiiIncomeGross: string;
  readonly totalGross: string;
  readonly totalWithheld: string;
  readonly eventCount: number;
}

export interface AnnualInvestmentIncomeSummaryReadModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly isComplete: boolean;
  readonly status: string;
  readonly currency: string;
  readonly qualityIssues: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly dividends: AnnualIncomeCategoryReadModel;
  readonly jcp: AnnualIncomeCategoryReadModel;
  readonly fiiIncome: AnnualIncomeCategoryReadModel;
  readonly totalGrossIncome: string;
  readonly totalWithheldTax: string;
  readonly payers: readonly AnnualIncomePayerReadModel[];
  readonly months: readonly AnnualMonthlyIncomeReadModel[];
  readonly fingerprint: string;
}

function mapCategory(cat: AnnualIncomeCategorySummary): AnnualIncomeCategoryReadModel {
  return {
    incomeType: cat.incomeType,
    totalGrossAmount: cat.totalGrossAmount.amount,
    totalWithheldTax: cat.totalWithheldTax.amount,
    totalNetAmount: cat.totalNetAmount.amount,
    eventCount: cat.eventCount,
    taxTreatmentSummary: cat.taxTreatmentSummary,
    isComplete: cat.isComplete,
  };
}

function mapPayer(p: AnnualIncomePayerSummary): AnnualIncomePayerReadModel {
  return {
    payerId: p.payerId,
    payerDisplayName: p.payerDisplayName,
    dividendGross: p.dividendGross.amount,
    jcpGross: p.jcpGross.amount,
    jcpWithheld: p.jcpWithheld.amount,
    fiiIncomeGross: p.fiiIncomeGross.amount,
    totalGross: p.totalGross.amount,
    totalWithheld: p.totalWithheld.amount,
    isComplete: p.isComplete,
  };
}

function mapMonth(m: AnnualMonthlyIncomeSnapshot): AnnualMonthlyIncomeReadModel {
  return {
    competence: m.competence,
    month: m.month,
    dividendsGross: m.dividendsGross.amount,
    jcpGross: m.jcpGross.amount,
    jcpWithheld: m.jcpWithheld.amount,
    fiiIncomeGross: m.fiiIncomeGross.amount,
    totalGross: m.totalGross.amount,
    totalWithheld: m.totalWithheld.amount,
    eventCount: m.eventCount,
  };
}

export function mapAnnualInvestmentIncomeSummaryToReadModel(
  domain: AnnualInvestmentIncomeSummary,
): AnnualInvestmentIncomeSummaryReadModel {
  return {
    calendarYear: domain.calendarYear,
    declarationExercise: domain.declarationExercise,
    isComplete: domain.isComplete,
    status: domain.status,
    currency: domain.currency,
    qualityIssues: domain.qualityIssues,
    blockingReasons: domain.blockingReasons,
    dividends: mapCategory(domain.dividends),
    jcp: mapCategory(domain.jcp),
    fiiIncome: mapCategory(domain.fiiIncome),
    totalGrossIncome: domain.totalGrossIncome.amount,
    totalWithheldTax: domain.totalWithheldTax.amount,
    payers: domain.payers.map(mapPayer),
    months: domain.months.map(mapMonth),
    fingerprint: domain.fingerprint,
  };
}
