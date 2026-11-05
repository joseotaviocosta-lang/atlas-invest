import type {
  RawFiscalMonthlyState,
  FiscalMonthlyViewModel,
  RawMonthlyTaxLiability,
  MonthlyTaxLiabilityViewModel,
  LiabilityCategoryVM,
  TaxLossBalanceVM,
  RawTaxInputReadiness,
  TaxInputReadinessViewModel,
  RawAnnualPositionReport,
  AnnualPositionReportViewModel,
  AnnualPositionViewModel,
  RawAnnualCapitalMarketFiscalSummary,
  AnnualCapitalMarketViewModel,
  RawAnnualInvestmentIncomeSummary,
  AnnualInvestmentIncomeViewModel,
  RawAnnualTaxReportingPackage,
  AnnualTaxReportingViewModel,
} from '@atlas/ui';

export type {
  RawFiscalMonthlyState,
  FiscalMonthlyViewModel,
  RawMonthlyTaxLiability,
  MonthlyTaxLiabilityViewModel,
  LiabilityCategoryVM,
  TaxLossBalanceVM,
  RawTaxInputReadiness,
  TaxInputReadinessViewModel,
  RawAnnualPositionReport,
  AnnualPositionReportViewModel,
  AnnualPositionViewModel,
  RawAnnualCapitalMarketFiscalSummary,
  AnnualCapitalMarketViewModel,
  RawAnnualInvestmentIncomeSummary,
  AnnualInvestmentIncomeViewModel,
  RawAnnualTaxReportingPackage,
  AnnualTaxReportingViewModel,
};

export interface CostEvidenceDto {
  id: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  ticker?: string;
  declaredQuantity: string;
  declaredCost: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  source: string;
  documentType: string;
  notes?: string;
  createdAt: string;
}

export interface CostAssessmentDto {
  accountId: string;
  assetId: string;
  ticker: string;
  totalQuantity: string;
  coveredQuantity: string;
  uncoveredQuantity: string;
  coverageRatio: string;
  isComplete: boolean;
  status: 'COMPLETE' | 'PARTIAL' | 'MISSING';
}

export interface ComplianceObligationItem {
  id: string;
  competence: string;
  type: string;
  description: string;
  dueDate: string;
  status: 'PENDING' | 'OVERDUE' | 'COMPLETED' | 'EXEMPT';
  amount?: string;
  code?: string;
}

export interface IncomeIntelligenceDto {
  portfolioId: string;
  totalIncomeBrl: string;
  monthlyBuckets: Array<{
    month: string;
    totalAmount: string;
    dividends: string;
    jcp: string;
    fiiIncome: string;
  }>;
  byAsset: Array<{
    assetId: string;
    ticker: string;
    totalAmount: string;
    percentage: string;
  }>;
}

