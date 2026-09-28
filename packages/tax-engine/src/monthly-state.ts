import { LocalDate, Money } from '@atlas/domain';
import {
  fiscalCompetenceRange,
  fiscalCompetenceFromString,
  isWithinCompetence,
} from './competence';
import type { FiscalCompetence } from './competence';
import { resolveTaxRuleSet } from './rules';
import { isTaxCategorySupportedInPhase4A } from './asset-classification';
import {
  DEFAULT_TAX_JURISDICTION,
  FISCAL_PROJECTION_VERSION,
  SUPPORTED_FISCAL_CURRENCIES,
  TAX_ENGINE_VERSION,
} from './version';
import type {
  FiscalDataQualityIssue,
  FiscalEvent,
  FiscalStateStatus,
  MonthlyTaxCapabilities,
  MonthlyTaxState,
  TaxAssetCategory,
  TaxCategoryCapability,
  TaxCategoryMonthlyState,
  TaxRuleSet,
} from './types';

export interface BuildMonthlyTaxStateInput {
  readonly competence: string | FiscalCompetence;
  readonly events: readonly FiscalEvent[];
  readonly ruleSets: readonly TaxRuleSet[];
  readonly jurisdiction?: string;
  readonly taxSubjectId?: string;
  readonly supportedCurrencies?: readonly string[];
  /** Date used to resolve the effective rule set; defaults to the competence end. */
  readonly asOfRuleDate?: string | LocalDate;
}

interface MutableCategoryAccumulator {
  category: TaxAssetCategory;
  currency: string;
  eventCount: number;
  salesProceeds?: Money;
  income?: Money;
  realizedGain?: Money;
  realizedLoss?: Money;
  allSalesHaveCanonicalResult: boolean;
  salesCount: number;
  issues: Set<FiscalDataQualityIssue>;
}

/**
 * Builds the deterministic Monthly Tax State for one competence.
 *
 * This is a normalized fiscal-facts projection — NOT a tax liability. Phase 4A
 * never computes payable tax (ADR-235, ADR-239, ADR-240).
 */
export function buildMonthlyTaxState(input: BuildMonthlyTaxStateInput): MonthlyTaxState {
  const competence =
    typeof input.competence === 'string'
      ? fiscalCompetenceFromString(input.competence)
      : input.competence;
  const jurisdiction = input.jurisdiction ?? DEFAULT_TAX_JURISDICTION;
  const supportedCurrencies = input.supportedCurrencies ?? SUPPORTED_FISCAL_CURRENCIES;

  // Temporal isolation: only events of this competence participate (ADR-237 / §42).
  const events = input.events
    .filter((event) => isWithinCompetence(event.economicDate, competence))
    .slice();

  const { end } = fiscalCompetenceRange(competence);
  const resolutionDate =
    input.asOfRuleDate === undefined
      ? end
      : typeof input.asOfRuleDate === 'string'
        ? LocalDate.from(input.asOfRuleDate)
        : input.asOfRuleDate;

  const ruleSetResolution = resolveTaxRuleSet(input.ruleSets, jurisdiction, resolutionDate);

  const groups = new Map<string, MutableCategoryAccumulator>();
  const currencies = new Set<string>();

  for (const event of events) {
    currencies.add(event.currency);
    const key = `${event.taxAssetCategory}::${event.currency}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        category: event.taxAssetCategory,
        currency: event.currency,
        eventCount: 0,
        allSalesHaveCanonicalResult: true,
        salesCount: 0,
        issues: new Set<FiscalDataQualityIssue>(),
      };
      groups.set(key, acc);
    }
    acc.eventCount += 1;
    for (const issue of event.qualityIssues) acc.issues.add(issue);

    if (event.eventType === 'SALE') {
      acc.salesCount += 1;
      if (event.proceeds) {
        acc.salesProceeds = acc.salesProceeds
          ? acc.salesProceeds.add(event.proceeds)
          : event.proceeds;
      }
      if (event.realizedResult) {
        if (event.realizedResult.isNegative()) {
          acc.realizedLoss = acc.realizedLoss
            ? acc.realizedLoss.add(event.realizedResult.abs())
            : event.realizedResult.abs();
        } else {
          acc.realizedGain = acc.realizedGain
            ? acc.realizedGain.add(event.realizedResult)
            : event.realizedResult;
        }
      } else {
        acc.allSalesHaveCanonicalResult = false;
      }
    } else if (event.eventType === 'INCOME' && event.amount) {
      acc.income = acc.income ? acc.income.add(event.amount) : event.amount;
    }
  }

  const categories: TaxCategoryMonthlyState[] = [...groups.values()]
    .sort((a, b) =>
      a.category < b.category
        ? -1
        : a.category > b.category
          ? 1
          : a.currency < b.currency
            ? -1
            : a.currency > b.currency
              ? 1
              : 0,
    )
    .map((acc) => {
      const issues: FiscalDataQualityIssue[] = [...acc.issues].sort();
      // Suppress a false realized total when a sale lacks canonical cost basis.
      const realizedGain = acc.allSalesHaveCanonicalResult ? acc.realizedGain : undefined;
      const realizedLoss = acc.allSalesHaveCanonicalResult ? acc.realizedLoss : undefined;
      return {
        category: acc.category,
        currency: acc.currency,
        capability: deriveCategoryCapability(acc.category, issues, supportedCurrencies),
        eventCount: acc.eventCount,
        salesProceeds: acc.salesProceeds,
        realizedGain,
        realizedLoss,
        income: acc.income,
        withholding: undefined,
        qualityIssues: Object.freeze(issues),
      } satisfies TaxCategoryMonthlyState;
    });

  const allIssues = new Set<FiscalDataQualityIssue>();
  for (const category of categories) {
    for (const issue of category.qualityIssues) allIssues.add(issue);
  }
  if (!ruleSetResolution.ok) allIssues.add('MISSING_RULE_SET');

  const status = deriveOverallStatus(events.length, ruleSetResolution.ok, allIssues);

  const capabilities: MonthlyTaxCapabilities = {
    foundationOnly: true,
    productionRuleVerified: ruleSetResolution.ok && ruleSetResolution.ruleSet.status === 'VERIFIED',
    withholdingSupported: false,
    taxLiabilitySupported: false,
  };

  return Object.freeze({
    competence,
    status,
    taxSubjectId: input.taxSubjectId,
    eventCount: events.length,
    events: Object.freeze(events),
    categories: Object.freeze(categories),
    currencies: Object.freeze([...currencies].sort()),
    ruleSetResolution,
    capabilities,
    dataQuality: {
      status,
      issues: Object.freeze([...allIssues].sort()),
      issueCount: allIssues.size,
    },
    projectionVersion: input.events[0]?.projectionVersion ?? FISCAL_PROJECTION_VERSION,
    engineVersion: TAX_ENGINE_VERSION,
  });
}

function deriveCategoryCapability(
  category: TaxAssetCategory,
  issues: readonly FiscalDataQualityIssue[],
  supportedCurrencies: readonly string[],
): TaxCategoryCapability {
  if (category === 'UNKNOWN') return 'BLOCKED';
  if (!isTaxCategorySupportedInPhase4A(category)) return 'UNSUPPORTED';
  const hasBlocking = issues.some(
    (issue) =>
      issue === 'UNSUPPORTED_CURRENCY' ||
      issue === 'UNKNOWN_COST_BASIS' ||
      issue === 'MISSING_PROCEEDS',
  );
  if (hasBlocking) return 'PARTIAL';
  // Currency support is already enforced upstream; keep the parameter meaningful.
  void supportedCurrencies;
  return 'CALCULABLE';
}

function deriveOverallStatus(
  eventCount: number,
  ruleResolved: boolean,
  issues: ReadonlySet<FiscalDataQualityIssue>,
): FiscalStateStatus {
  if (eventCount === 0) return 'EMPTY';
  if (!ruleResolved) return 'BLOCKED';
  if (issues.size > 0) return 'PARTIAL';
  return 'COMPLETE';
}
