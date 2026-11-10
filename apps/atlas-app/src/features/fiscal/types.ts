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
  declaredQuantity?: string;
  declaredCost?: string;
  quantityCovered?: string;
  unitCost?: string | null;
  totalCost?: string | null;
  currency?: string;
  status: 'DRAFT' | 'REVIEW_REQUIRED' | 'VERIFIED' | 'REJECTED' | 'PENDING';
  source: string;
  evidenceType?: string;
  documentType?: string;
  acquisitionDate?: string;
  evidenceDate?: string | null;
  sourceReference?: string;
  notes?: string | null;
  version?: number;
  supersedesId?: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
}

export interface CostEvidenceRowDto extends CostEvidenceDto {
  version: number;
  supersedesId: string | null;
  quantityCovered: string;
  evidenceType: string;
  acquisitionDate: string;
  sourceReference: string;
}

export interface CostAssessmentDto {
  status: 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE' | 'BLOCKED' | string;
  isComplete?: boolean;
  positionQuantity: string;
  ledgerKnownQuantity: string;
  evidenceCoveredQuantity: string;
  totalCoveredQuantity: string;
  uncoveredQuantity: string;
  coveragePercent: string;
  verifiedKnownCost: Array<{ amount: string; currency: string }>;
  averageKnownCostForCoveredQuantity?: { amount: string; currency: string } | null;
  appliedEvidenceIds: string[];
  issues?: Array<{ code: string; message: string }>;
  taxCost?: {
    enrichmentEnabled: boolean;
    status: string | null;
    resolvedCost: { amount: string; currency: string } | null;
    ledgerKnownQuantity: string;
    evidenceKnownQuantity: string;
  } | null;
}

export interface CostEvidencePreviewDto {
  status: string;
  positionQuantity: string;
  ledgerKnownQuantity: string;
  evidenceCoveredQuantity: string;
  totalCoveredQuantity: string;
  uncoveredQuantity: string;
  coveragePercent: string;
  verifiedKnownCost: Array<{ amount: string; currency: string }>;
  alreadyCoveredWarning: string | null;
  hypotheticalCoveredQuantity: string;
}

export interface CostEvidenceCreatePayload {
  accountId: string;
  assetId: string;
  evidenceType: string;
  quantityCovered: string;
  unitCost?: string;
  totalCost?: string;
  currency: string;
  acquisitionDate: string;
  evidenceDate?: string;
  sourceReference: string;
  notes?: string;
  status?: 'DRAFT' | 'REVIEW_REQUIRED';
}

export interface CostEvidenceRevisePayload {
  accountId?: string;
  assetId?: string;
  evidenceType?: string;
  quantityCovered?: string;
  unitCost?: string;
  totalCost?: string;
  currency?: string;
  acquisitionDate?: string;
  evidenceDate?: string;
  sourceReference?: string;
  notes?: string;
}

export interface PortfolioAccountDto {
  id: string;
  portfolioId: string;
  institutionId?: string;
  name: string;
  currency: string;
  status?: string;
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

