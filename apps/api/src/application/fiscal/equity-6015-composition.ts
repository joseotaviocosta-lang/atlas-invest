import { compose6015, resolveObligationBucketForCategory } from '@atlas/tax-engine';
import type {
  Composed6015ComponentInput,
  Composed6015Result,
  MonthlyTaxLiability,
  TaxCategoryMonthlyResult,
} from '@atlas/tax-engine';
import type { EquityMonthlyFiscalReadModel } from './equity-monthly-fiscal-replay.service';

/**
 * Phase 4G.2C — builds the 6015 composition input from the canonical
 * server-authoritative category results (FII monthly liability + equity normal /
 * day-trade monthly read). Performs NO rate/loss/IRRF arithmetic: it only maps
 * already-computed category net taxes into `compose6015`.
 *
 * The foundation liability path also materializes a `BRAZILIAN_EQUITY` category
 * (no production rule at 4A/4B); that category is intentionally excluded here —
 * Brazilian equity is handled authoritatively by the dedicated equity engine.
 */

type ComponentStatus = Composed6015ComponentInput['status'];

function categoryStatus(status: TaxCategoryMonthlyResult['status']): ComponentStatus {
  return status;
}

/** Activity outside the composed set (FII + Brazilian equity) must fail closed. */
function hasUnsupportedActivity(liability: MonthlyTaxLiability): boolean {
  return liability.categories.some((result) => {
    if (result.category === 'FII' || result.category === 'BRAZILIAN_EQUITY') return false;
    if (resolveObligationBucketForCategory(result.category) !== null) return false;
    return (
      result.taxDue !== null ||
      result.grossSales.isPositive() ||
      result.realizedResult.isPositive() ||
      result.realizedResult.isNegative()
    );
  });
}

function fiiComponent(liability: MonthlyTaxLiability): Composed6015ComponentInput {
  const category: TaxCategoryMonthlyResult | undefined = liability.categories.find(
    (result) => result.category === 'FII',
  );
  // A category may be materialized only from a zero opening-loss balance with no
  // activity in the competence; such a category must not block the composition.
  const hasActivity =
    category !== undefined &&
    (category.taxDue !== null ||
      category.grossSales.isPositive() ||
      category.realizedResult.isPositive() ||
      category.realizedResult.isNegative());
  const status: ComponentStatus = !hasActivity ? 'COMPLETE' : categoryStatus(category!.status);
  const net = hasActivity ? (category?.taxDue?.amount ?? '0') : '0';
  return {
    category: 'FII',
    status,
    netTax: net,
    currency: category?.currency ?? 'BRL',
    sourceRuleId: null,
    sourceRuleVersion: category?.ruleVersion ?? null,
    sourceFingerprint: ['FII', liability.calculationVersion, category?.ruleVersion ?? '', net].join(
      ':',
    ),
    traceReference: 'MONTHLY_TAX_LIABILITY',
  };
}

export function build6015Composition(input: {
  competence: string;
  liability: MonthlyTaxLiability;
  equity: EquityMonthlyFiscalReadModel;
}): Composed6015Result {
  const { liability, equity } = input;
  const status: ComponentStatus =
    equity.status === 'BLOCKED' ? 'BLOCKED' : equity.status === 'PARTIAL' ? 'PARTIAL' : 'COMPLETE';

  const equityComponent = (
    category: 'EQUITY_NORMAL' | 'EQUITY_DAY_TRADE',
    source: EquityMonthlyFiscalReadModel['normal'],
  ): Composed6015ComponentInput => ({
    category,
    status,
    netTax: source.netTaxBefore6015Aggregation,
    currency: 'BRL',
    sourceRuleId: source.ruleId,
    sourceRuleVersion: source.ruleVersion,
    sourceFingerprint: [
      category,
      source.ruleId,
      source.ruleVersion,
      source.grossTax,
      source.irrfUsed,
      source.netTaxBefore6015Aggregation,
    ].join(':'),
    traceReference: 'EQUITY_MONTHLY_READ',
  });

  return compose6015({
    competence: input.competence,
    currency: 'BRL',
    unsupportedActivity: hasUnsupportedActivity(liability),
    components: [
      fiiComponent(liability),
      equityComponent('EQUITY_NORMAL', equity.normal),
      equityComponent('EQUITY_DAY_TRADE', equity.dayTrade),
    ],
  });
}

/** Re-exported for tests: true when a category outside the composed set carries activity. */
export function liabilityHasUnsupportedActivity(liability: MonthlyTaxLiability): boolean {
  return hasUnsupportedActivity(liability);
}
