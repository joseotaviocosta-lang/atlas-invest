import type { Money } from '@atlas/domain';
import type { FiscalEvent, MonthlyTaxState, TaxCategoryMonthlyState } from '@atlas/tax-engine';

/**
 * Serializable fiscal read models. Amounts are decimal strings; internal
 * Decimal objects, Money instances and engine types never leak outside the
 * application boundary (4A §59/§60, ADR-240).
 */
export interface FiscalMoneyReadModel {
  readonly amount: string;
  readonly currency: string;
}

export interface FiscalEventReadModel {
  readonly id: string;
  readonly sourceTransactionId: string;
  readonly economicDate: string;
  readonly competence: string;
  readonly sourceTransactionType: string;
  readonly eventType: string;
  readonly relevance: string;
  readonly taxAssetCategory: string;
  readonly currency: string;
  readonly quantity: string | null;
  readonly unitPrice: FiscalMoneyReadModel | null;
  readonly proceeds: FiscalMoneyReadModel | null;
  readonly amount: FiscalMoneyReadModel | null;
  readonly costBasis: FiscalMoneyReadModel | null;
  readonly realizedResult: FiscalMoneyReadModel | null;
  readonly qualityIssues: readonly string[];
}

export interface TaxCategoryReadModel {
  readonly category: string;
  readonly currency: string;
  readonly capability: string;
  readonly eventCount: number;
  readonly salesProceeds: FiscalMoneyReadModel | null;
  readonly realizedGain: FiscalMoneyReadModel | null;
  readonly realizedLoss: FiscalMoneyReadModel | null;
  readonly income: FiscalMoneyReadModel | null;
  readonly withholding: FiscalMoneyReadModel | null;
  readonly qualityIssues: readonly string[];
}

export interface MonthlyTaxStateReadModel {
  readonly competence: string;
  readonly status: string;
  readonly eventCount: number;
  readonly currencies: readonly string[];
  readonly categories: readonly TaxCategoryReadModel[];
  readonly events: readonly FiscalEventReadModel[];
  readonly dataQuality: {
    readonly status: string;
    readonly issues: readonly string[];
    readonly issueCount: number;
  };
  readonly ruleSetVersion: string | null;
  readonly ruleSetStatus: string | null;
  readonly capabilities: {
    readonly foundationOnly: boolean;
    readonly productionRuleVerified: boolean;
    readonly withholdingSupported: boolean;
    readonly taxLiabilitySupported: boolean;
  };
  readonly projectionVersion: string;
  readonly engineVersion: string;
}

function toMoney(value?: Money): FiscalMoneyReadModel | null {
  return value ? { amount: value.amount, currency: value.currency } : null;
}

function toEvent(event: FiscalEvent): FiscalEventReadModel {
  return {
    id: String(event.id),
    sourceTransactionId: event.sourceTransactionId,
    economicDate: event.economicDate.toString(),
    competence: event.competence.value,
    sourceTransactionType: event.sourceTransactionType,
    eventType: event.eventType,
    relevance: event.relevance,
    taxAssetCategory: event.taxAssetCategory,
    currency: event.currency,
    quantity: event.quantity ? event.quantity.value : null,
    unitPrice: toMoney(event.unitPrice),
    proceeds: toMoney(event.proceeds),
    amount: toMoney(event.amount),
    costBasis: toMoney(event.costBasis),
    realizedResult: toMoney(event.realizedResult),
    qualityIssues: event.qualityIssues,
  };
}

function toCategory(category: TaxCategoryMonthlyState): TaxCategoryReadModel {
  return {
    category: category.category,
    currency: category.currency,
    capability: category.capability,
    eventCount: category.eventCount,
    salesProceeds: toMoney(category.salesProceeds),
    realizedGain: toMoney(category.realizedGain),
    realizedLoss: toMoney(category.realizedLoss),
    income: toMoney(category.income),
    withholding: toMoney(category.withholding),
    qualityIssues: category.qualityIssues,
  };
}

/** Pure mapper: MonthlyTaxState -> serializable read model. */
export function mapMonthlyTaxStateToReadModel(state: MonthlyTaxState): MonthlyTaxStateReadModel {
  const resolution = state.ruleSetResolution;
  return {
    competence: state.competence.value,
    status: state.status,
    eventCount: state.eventCount,
    currencies: state.currencies,
    categories: state.categories.map(toCategory),
    events: state.events.map(toEvent),
    dataQuality: {
      status: state.dataQuality.status,
      issues: state.dataQuality.issues,
      issueCount: state.dataQuality.issueCount,
    },
    ruleSetVersion: resolution.ok ? resolution.ruleSet.version : null,
    ruleSetStatus: resolution.ok ? resolution.ruleSet.status : null,
    capabilities: {
      foundationOnly: state.capabilities.foundationOnly,
      productionRuleVerified: state.capabilities.productionRuleVerified,
      withholdingSupported: state.capabilities.withholdingSupported,
      taxLiabilitySupported: state.capabilities.taxLiabilitySupported,
    },
    projectionVersion: state.projectionVersion,
    engineVersion: state.engineVersion,
  };
}
