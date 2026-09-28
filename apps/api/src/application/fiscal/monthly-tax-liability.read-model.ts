import type { Money } from '@atlas/domain';
import type {
  MonthlyTaxLiability,
  TaxCalculationTraceEntry,
  TaxCategoryMonthlyResult,
} from '@atlas/tax-engine';

export interface LiabilityMoneyReadModel {
  readonly amount: string;
  readonly currency: string;
}

export interface TaxCategoryResultReadModel {
  readonly category: string;
  readonly currency: string;
  readonly status: string;
  readonly ruleVersion: string | null;
  readonly ruleSetStatus: string | null;
  readonly grossSales: LiabilityMoneyReadModel;
  readonly realizedResult: LiabilityMoneyReadModel;
  readonly taxableRealizedResult: LiabilityMoneyReadModel;
  readonly exemptionApplied: boolean;
  readonly taxableBaseBeforeLosses: LiabilityMoneyReadModel;
  readonly openingLossBalance: LiabilityMoneyReadModel;
  readonly lossApplied: LiabilityMoneyReadModel;
  readonly lossGenerated: LiabilityMoneyReadModel;
  readonly closingLossBalance: LiabilityMoneyReadModel;
  readonly taxableBaseAfterLosses: LiabilityMoneyReadModel;
  readonly ratePercentage: string | null;
  readonly taxBeforeWithholding: LiabilityMoneyReadModel;
  readonly withholdingAvailable: LiabilityMoneyReadModel;
  readonly withholdingApplied: LiabilityMoneyReadModel;
  readonly taxDue: LiabilityMoneyReadModel | null;
  readonly qualityIssues: readonly string[];
  readonly trace: readonly TaxCalculationTraceEntry[];
}

export interface MonthlyTaxLiabilityReadModel {
  readonly competence: string;
  readonly status: string;
  readonly ruleVersions: readonly string[];
  readonly categories: readonly TaxCategoryResultReadModel[];
  readonly totalTaxBeforeCredits: LiabilityMoneyReadModel | null;
  readonly creditsApplied: LiabilityMoneyReadModel | null;
  readonly taxDue: LiabilityMoneyReadModel | null;
  readonly openingLossBalances: readonly {
    category: string;
    currency: string;
    amount: LiabilityMoneyReadModel;
    provenance: string;
  }[];
  readonly closingLossBalances: readonly {
    category: string;
    currency: string;
    amount: LiabilityMoneyReadModel;
    provenance: string;
  }[];
  readonly dataQuality: { status: string; issues: readonly string[]; issueCount: number };
  readonly capabilities: {
    readonly foundationOnly: boolean;
    readonly productionRuleVerified: boolean;
    readonly withholdingSupported: boolean;
    readonly taxLiabilitySupported: boolean;
  };
  readonly calculationVersion: string;
  readonly engineVersion: string;
  readonly limitations: readonly string[];
  readonly traceSummary: readonly TaxCalculationTraceEntry[];
}

function money(value: Money | null | undefined): LiabilityMoneyReadModel | null {
  return value ? { amount: value.amount, currency: value.currency } : null;
}

function required(value: Money): LiabilityMoneyReadModel {
  return { amount: value.amount, currency: value.currency };
}

function categoryResult(result: TaxCategoryMonthlyResult): TaxCategoryResultReadModel {
  return {
    category: result.category,
    currency: result.currency,
    status: result.status,
    ruleVersion: result.ruleVersion,
    ruleSetStatus: result.ruleSetStatus,
    grossSales: required(result.grossSales),
    realizedResult: required(result.realizedResult),
    taxableRealizedResult: required(result.taxableRealizedResult),
    exemptionApplied: result.exemptionApplied,
    taxableBaseBeforeLosses: required(result.taxableBaseBeforeLosses),
    openingLossBalance: required(result.openingLossBalance),
    lossApplied: required(result.lossApplied),
    lossGenerated: required(result.lossGenerated),
    closingLossBalance: required(result.closingLossBalance),
    taxableBaseAfterLosses: required(result.taxableBaseAfterLosses),
    ratePercentage: result.ratePercentage,
    taxBeforeWithholding: required(result.taxBeforeWithholding),
    withholdingAvailable: required(result.withholdingAvailable),
    withholdingApplied: required(result.withholdingApplied),
    taxDue: money(result.taxDue),
    qualityIssues: result.qualityIssues,
    trace: result.trace,
  };
}

export function mapMonthlyTaxLiabilityToReadModel(
  liability: MonthlyTaxLiability,
): MonthlyTaxLiabilityReadModel {
  return {
    competence: liability.competence.value,
    status: liability.status,
    ruleVersions: liability.ruleVersions,
    categories: liability.categories.map(categoryResult),
    totalTaxBeforeCredits: money(liability.totalTaxBeforeCredits),
    creditsApplied: money(liability.creditsApplied),
    taxDue: money(liability.taxDue),
    openingLossBalances: liability.openingLossBalances.map((b) => ({
      category: b.category,
      currency: b.currency,
      amount: required(b.amount),
      provenance: b.provenance,
    })),
    closingLossBalances: liability.closingLossBalances.map((b) => ({
      category: b.category,
      currency: b.currency,
      amount: required(b.amount),
      provenance: b.provenance,
    })),
    dataQuality: {
      status: liability.dataQuality.status,
      issues: liability.dataQuality.issues,
      issueCount: liability.dataQuality.issueCount,
    },
    capabilities: {
      foundationOnly: liability.capabilities.foundationOnly,
      productionRuleVerified: liability.capabilities.productionRuleVerified,
      withholdingSupported: liability.capabilities.withholdingSupported,
      taxLiabilitySupported: liability.capabilities.taxLiabilitySupported,
    },
    calculationVersion: liability.calculationVersion,
    engineVersion: liability.engineVersion,
    limitations: liability.limitations,
    traceSummary: liability.calculationTrace,
  };
}
