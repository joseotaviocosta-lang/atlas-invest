import { LocalDate, Money } from '@atlas/domain';
import {
  fiscalCompetenceFromString,
  fiscalCompetenceRange,
  isWithinCompetence,
} from './competence';
import { resolveTaxRuleSetForCategory } from './rules';
import {
  CALCULATION_VERSION,
  DEFAULT_TAX_JURISDICTION,
  SUPPORTED_FISCAL_CURRENCIES,
  TAX_ENGINE_VERSION,
} from './version';
import type { FiscalDataQualityIssue, FiscalStateStatus, TaxAssetCategory } from './types';
import type {
  CanonicalWithholdingInput,
  MonthlyTaxCalculationInput,
  MonthlyTaxLiability,
  ReplayMonthlyTaxInput,
  TaxCalculationTraceEntry,
  TaxCategoryLiabilityStatus,
  TaxCategoryMonthlyResult,
  TaxLiabilityStatus,
  TaxLossBalance,
  TaxTraceStage,
  TaxWithholdingCredit,
} from './liability-types';

const RELEVANT_FISCAL_EVENT_TYPES = new Set(['SALE', 'INCOME']);
const HUNDRED = '100';

interface CategoryBucket {
  readonly category: TaxAssetCategory;
  readonly currency: string;
  grossSales: Money;
  realizedResult: Money;
  realizedKnown: boolean;
  hasSales: boolean;
  income: Money;
  readonly issues: Set<FiscalDataQualityIssue>;
  readonly inputReferences: string[];
}

function traceEntry(
  stage: TaxTraceStage,
  operation: string,
  status: string,
  extra: Partial<TaxCalculationTraceEntry> = {},
): TaxCalculationTraceEntry {
  return { stage, operation, status, ...extra };
}

function sortCategories(results: readonly TaxCategoryMonthlyResult[]): TaxCategoryMonthlyResult[] {
  return [...results].sort((a, b) => {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0;
  });
}

function bucketKey(category: TaxAssetCategory, currency: string): string {
  return `${category}::${currency}`;
}

/**
 * Deterministic monthly tax liability calculation (ADR-242).
 *
 * Consumes 4A fiscal events + effective-dated rule sets + canonical opening
 * loss balances + canonical withholding credits and produces an auditable
 * MonthlyTaxLiability. Never computes in a client/AI/controller layer. Never
 * produces a production taxDue without an effective VERIFIED rule.
 */
export function calculateMonthlyTaxLiability(
  input: MonthlyTaxCalculationInput,
): MonthlyTaxLiability {
  const competence =
    typeof input.competence === 'string'
      ? fiscalCompetenceFromString(input.competence)
      : input.competence;
  const jurisdiction = input.jurisdiction ?? DEFAULT_TAX_JURISDICTION;
  const supportedCurrencies = input.supportedCurrencies ?? SUPPORTED_FISCAL_CURRENCIES;
  const calculationVersion = input.calculationVersion ?? CALCULATION_VERSION;
  const openingLossState = input.openingLossState ?? 'KNOWN';

  const { end } = fiscalCompetenceRange(competence);
  const ruleDate = input.asOfRuleDate ? LocalDate.from(input.asOfRuleDate) : end;

  const events = input.events.filter((event) => isWithinCompetence(event.economicDate, competence));

  // --- Group relevant events by category + currency ---
  const buckets = new Map<string, CategoryBucket>();
  for (const event of events) {
    if (!RELEVANT_FISCAL_EVENT_TYPES.has(event.eventType)) continue;
    const key = bucketKey(event.taxAssetCategory, event.currency);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        category: event.taxAssetCategory,
        currency: event.currency,
        grossSales: Money.zero(event.currency),
        realizedResult: Money.zero(event.currency),
        realizedKnown: true,
        hasSales: false,
        income: Money.zero(event.currency),
        issues: new Set<FiscalDataQualityIssue>(),
        inputReferences: [],
      };
      buckets.set(key, bucket);
    }
    bucket.inputReferences.push(String(event.id));
    for (const issue of event.qualityIssues) bucket.issues.add(issue);

    if (event.eventType === 'SALE') {
      bucket.hasSales = true;
      if (event.proceeds) bucket.grossSales = bucket.grossSales.add(event.proceeds);
      if (event.realizedResult) {
        bucket.realizedResult = bucket.realizedResult.add(event.realizedResult);
      } else {
        bucket.realizedKnown = false;
      }
    } else if (event.eventType === 'INCOME' && event.amount) {
      bucket.income = bucket.income.add(event.amount);
    }
  }

  const openingByKey = new Map<string, TaxLossBalance>();
  for (const balance of input.openingLossBalances ?? []) {
    openingByKey.set(bucketKey(balance.category, balance.currency), balance);
  }
  const withholdingByKey = new Map<string, Money>();
  for (const credit of input.withholdingCredits ?? []) {
    const key = bucketKey(credit.category, credit.currency);
    const current = withholdingByKey.get(key);
    withholdingByKey.set(key, current ? current.add(credit.amount) : credit.amount);
  }

  const categoryResults: TaxCategoryMonthlyResult[] = [];
  const openingLossBalances: TaxLossBalance[] = [];
  const closingLossBalances: TaxLossBalance[] = [];
  const calculationTrace: TaxCalculationTraceEntry[] = [];
  const allIssues = new Set<FiscalDataQualityIssue>();
  const ruleVersions = new Set<string>();
  let anyVerifiedRule = false;

  // Ensure categories that only carry an opening loss are still reported.
  const keys = new Set<string>([...buckets.keys(), ...openingByKey.keys()]);

  for (const key of [...keys].sort()) {
    const [category, currency] = key.split('::') as [TaxAssetCategory, string];
    const bucket =
      buckets.get(key) ??
      ({
        category,
        currency,
        grossSales: Money.zero(currency),
        realizedResult: Money.zero(currency),
        realizedKnown: true,
        hasSales: false,
        income: Money.zero(currency),
        issues: new Set<FiscalDataQualityIssue>(),
        inputReferences: [],
      } satisfies CategoryBucket);

    const issues = new Set<FiscalDataQualityIssue>(bucket.issues);
    const trace: TaxCalculationTraceEntry[] = [];
    const categoryRefs = [...bucket.inputReferences].sort().slice(0, 50);

    trace.push(
      traceEntry('INPUT', 'collect-relevant-events', 'OK', {
        category,
        inputReferences: categoryRefs,
        exactInputs: { grossSales: bucket.grossSales.amount, income: bucket.income.amount },
      }),
    );

    const resolution = resolveTaxRuleSetForCategory(
      input.ruleSets,
      jurisdiction,
      category,
      ruleDate,
    );
    if (resolution.ok) {
      ruleVersions.add(resolution.ruleSet.version);
      if (resolution.ruleSet.status === 'VERIFIED') anyVerifiedRule = true;
    }
    trace.push(
      traceEntry('RULE_RESOLUTION', 'resolve-effective-rule', resolution.ok ? 'OK' : 'MISSING', {
        category,
        ...(resolution.ok ? { ruleVersion: resolution.ruleSet.version } : {}),
      }),
    );

    // --- Classification / blocking preconditions ---
    let blocked = false;
    if (category === 'UNKNOWN') {
      issues.add('UNKNOWN_ASSET_TAX_CATEGORY');
      blocked = true;
    }
    if (!supportedCurrencies.includes(currency)) {
      issues.add('UNSUPPORTED_CURRENCY');
      blocked = true;
    }
    if (!resolution.ok) {
      issues.add('MISSING_RULE_SET');
      blocked = true;
    } else if (resolution.ruleSet.status !== 'VERIFIED') {
      issues.add('UNVERIFIED_RULE_SET');
      blocked = true;
    }
    if (bucket.hasSales && !bucket.realizedKnown) {
      issues.add('UNKNOWN_COST_BASIS');
    }
    trace.push(
      traceEntry('CLASSIFICATION', 'classify-category', blocked ? 'BLOCKED' : 'OK', {
        category,
        status: blocked ? 'BLOCKED' : 'OK',
      }),
    );

    // --- Exemption (rule-driven only) ---
    const components = resolution.ok ? resolution.ruleSet.components : undefined;
    const exemptionThreshold = components?.exemptionGrossSalesThreshold;
    let exemptionApplied = false;
    if (exemptionThreshold !== undefined && !blocked) {
      const threshold = Money.from(exemptionThreshold, currency);
      exemptionApplied = bucket.grossSales.compare(threshold) <= 0;
      trace.push(
        traceEntry(
          'EXEMPTION',
          'apply-gross-sales-threshold',
          exemptionApplied ? 'APPLIED' : 'NOT_APPLIED',
          {
            category,
            exactInputs: { grossSales: bucket.grossSales.amount, threshold: exemptionThreshold },
          },
        ),
      );
    }

    // --- Taxable realized result / loss generated ---
    const taxableRealizedResult = bucket.realizedResult.isPositive()
      ? bucket.realizedResult
      : Money.zero(currency);
    const lossGenerated = bucket.realizedResult.isNegative()
      ? bucket.realizedResult.abs()
      : Money.zero(currency);

    // --- Opening loss (never silently zero when unknown) ---
    const openingEntry = openingByKey.get(key);
    let openingLoss = Money.zero(currency);
    let openingLossKnown = true;
    if (openingLossState === 'UNKNOWN' && !openingEntry) {
      openingLossKnown = false;
      issues.add('UNKNOWN_OPENING_LOSS_BALANCE');
    } else if (openingEntry) {
      openingLoss = openingEntry.amount;
    }
    trace.push(
      traceEntry('OPENING_LOSS', 'load-opening-loss', openingLossKnown ? 'KNOWN' : 'UNKNOWN', {
        category,
        exactOutput: openingLoss.amount,
      }),
    );

    const taxableBaseBeforeLosses = exemptionApplied ? Money.zero(currency) : taxableRealizedResult;

    let lossApplied = Money.zero(currency);
    if (!blocked && taxableBaseBeforeLosses.isPositive() && openingLoss.isPositive()) {
      lossApplied =
        openingLoss.compare(taxableBaseBeforeLosses) <= 0 ? openingLoss : taxableBaseBeforeLosses;
    }
    const taxableBaseAfterLosses = taxableBaseBeforeLosses.subtract(lossApplied);
    const closingLoss = openingLoss.subtract(lossApplied).add(lossGenerated);

    trace.push(
      traceEntry('LOSS_APPLICATION', 'compensate-opening-loss', 'OK', {
        category,
        exactInputs: {
          openingLoss: openingLoss.amount,
          taxableBaseBeforeLosses: taxableBaseBeforeLosses.amount,
        },
        exactOutput: lossApplied.amount,
      }),
    );
    trace.push(
      traceEntry('TAXABLE_BASE', 'derive-taxable-base', 'OK', {
        category,
        exactOutput: taxableBaseAfterLosses.amount,
      }),
    );

    // --- Rate (rule-driven only) ---
    const ratePercentage = components?.ratePercentage ?? null;
    let taxBeforeWithholding = Money.zero(currency);
    if (!blocked && ratePercentage !== null) {
      taxBeforeWithholding = taxableBaseAfterLosses.multiply(ratePercentage).divide(HUNDRED);
      trace.push(
        traceEntry('RATE', 'apply-statutory-rate', 'OK', {
          category,
          ...(resolution.ok ? { ruleVersion: resolution.ruleSet.version } : {}),
          exactInputs: { base: taxableBaseAfterLosses.amount, ratePercentage },
          exactOutput: taxBeforeWithholding.amount,
        }),
      );
    } else if (!blocked && taxableBaseAfterLosses.isPositive()) {
      issues.add('MISSING_RATE_RULE');
    }

    // --- Withholding (canonical inputs only) ---
    const withholdingAvailable = withholdingByKey.get(key) ?? Money.zero(currency);
    if (
      components?.withholding?.ratePercentage !== undefined &&
      withholdingAvailable.isZero() &&
      !blocked
    ) {
      issues.add('MISSING_REQUIRED_WITHHOLDING');
    }
    let withholdingApplied = Money.zero(currency);
    if (!blocked && withholdingAvailable.isPositive() && taxBeforeWithholding.isPositive()) {
      withholdingApplied =
        withholdingAvailable.compare(taxBeforeWithholding) <= 0
          ? withholdingAvailable
          : taxBeforeWithholding;
    }
    trace.push(
      traceEntry('WITHHOLDING', 'apply-canonical-credit', 'OK', {
        category,
        exactInputs: {
          available: withholdingAvailable.amount,
          taxBefore: taxBeforeWithholding.amount,
        },
        exactOutput: withholdingApplied.amount,
      }),
    );

    const computedTaxDue = taxBeforeWithholding.subtract(withholdingApplied);

    // --- Status ---
    let status: TaxCategoryLiabilityStatus;
    if (blocked) status = 'BLOCKED';
    else if (!bucket.realizedKnown && bucket.hasSales) status = 'PARTIAL';
    else if (!openingLossKnown && taxableBaseBeforeLosses.isPositive()) status = 'PARTIAL';
    else if (issues.size > 0) status = 'PARTIAL';
    else status = 'COMPLETE';

    const taxDue = status === 'COMPLETE' ? computedTaxDue : null;

    trace.push(
      traceEntry('FINAL', 'finalize-category', status, {
        category,
        ...(resolution.ok ? { ruleVersion: resolution.ruleSet.version } : {}),
        exactOutput: taxDue ? taxDue.amount : '',
      }),
    );

    for (const issue of issues) allIssues.add(issue);

    categoryResults.push({
      category,
      currency,
      status,
      ruleVersion: resolution.ok ? resolution.ruleSet.version : null,
      ruleSetStatus: resolution.ok ? resolution.ruleSet.status : null,
      grossSales: bucket.grossSales,
      realizedResult: bucket.realizedResult,
      taxableRealizedResult,
      exemptionApplied,
      taxableBaseBeforeLosses,
      openingLossBalance: openingLoss,
      lossApplied,
      lossGenerated,
      closingLossBalance: closingLoss,
      taxableBaseAfterLosses,
      ratePercentage,
      taxBeforeWithholding,
      withholdingAvailable,
      withholdingApplied,
      taxDue,
      qualityIssues: Object.freeze([...issues].sort()),
      trace: Object.freeze(trace),
    });

    openingLossBalances.push({
      category,
      currency,
      amount: openingLoss,
      competence: competence.value,
      provenance: openingEntry ? openingEntry.provenance : 'ZERO_AT_INCEPTION',
    });
    closingLossBalances.push({
      category,
      currency,
      amount: closingLoss,
      competence: competence.value,
      provenance: 'REPLAY',
    });

    for (const entry of trace) calculationTrace.push(entry);
  }

  const categories = sortCategories(categoryResults);
  const status = deriveOverallStatus(categories, buckets.size, openingLossState);
  const complete = status === 'COMPLETE';

  let totalTaxBeforeCredits: Money | null = null;
  let creditsApplied: Money | null = null;
  let taxDue: Money | null = null;
  if (complete && categories.length > 0) {
    const currency = categories[0]!.currency;
    totalTaxBeforeCredits = Money.zero(currency);
    creditsApplied = Money.zero(currency);
    taxDue = Money.zero(currency);
    for (const result of categories) {
      totalTaxBeforeCredits = totalTaxBeforeCredits.add(result.taxBeforeWithholding);
      creditsApplied = creditsApplied.add(result.withholdingApplied);
      taxDue = taxDue.add(result.taxDue ?? Money.zero(result.currency));
    }
  } else if (status === 'NO_ACTIVITY' && openingLossState === 'KNOWN') {
    const currency = SUPPORTED_FISCAL_CURRENCIES[0] ?? 'BRL';
    taxDue = Money.zero(currency);
  }

  const limitations: string[] = [];
  if (input.inProgress) limitations.push('IN_PROGRESS');
  if (!anyVerifiedRule) limitations.push('NO_VERIFIED_PRODUCTION_RULE');

  const dataQualityIssueList = [...allIssues].sort();
  const dqStatus: FiscalStateStatus =
    status === 'BLOCKED'
      ? 'BLOCKED'
      : status === 'PARTIAL'
        ? 'PARTIAL'
        : status === 'NO_ACTIVITY'
          ? 'EMPTY'
          : 'COMPLETE';

  return Object.freeze({
    competence,
    taxSubjectId: input.taxSubjectId,
    status,
    ruleVersions: Object.freeze([...ruleVersions].sort()),
    categories: Object.freeze(categories),
    totalTaxBeforeCredits,
    creditsApplied,
    taxDue,
    openingLossBalances: Object.freeze(openingLossBalances),
    closingLossBalances: Object.freeze(closingLossBalances),
    dataQuality: {
      status: dqStatus,
      issues: Object.freeze(dataQualityIssueList),
      issueCount: dataQualityIssueList.length,
    },
    calculationTrace: Object.freeze(calculationTrace),
    capabilities: {
      foundationOnly: true,
      productionRuleVerified: anyVerifiedRule,
      withholdingSupported: (input.withholdingCredits?.length ?? 0) > 0,
      taxLiabilitySupported: complete,
    },
    calculationVersion,
    engineVersion: TAX_ENGINE_VERSION,
    limitations: Object.freeze(limitations),
  });
}

function deriveOverallStatus(
  categories: readonly TaxCategoryMonthlyResult[],
  bucketCount: number,
  openingLossState: 'KNOWN' | 'UNKNOWN',
): TaxLiabilityStatus {
  if (bucketCount === 0) {
    return openingLossState === 'UNKNOWN' ? 'BLOCKED' : 'NO_ACTIVITY';
  }
  const hasComplete = categories.some((c) => c.status === 'COMPLETE');
  const hasBlocked = categories.some((c) => c.status === 'BLOCKED');
  const hasPartial = categories.some((c) => c.status === 'PARTIAL');
  if (hasComplete && !hasBlocked && !hasPartial) return 'COMPLETE';
  if (!hasComplete && !hasPartial && hasBlocked) return 'BLOCKED';
  return 'PARTIAL';
}

/**
 * Deterministic multi-month replay: month N+1 opening losses are exactly
 * month N closing losses. Never uses future events or future rules (ADR-243).
 */
export function replayMonthlyTaxLiability(input: ReplayMonthlyTaxInput): MonthlyTaxLiability[] {
  const results: MonthlyTaxLiability[] = [];
  let opening: readonly TaxLossBalance[] = [];
  const openingLossState = input.openingLossState ?? 'KNOWN';

  for (const month of input.months) {
    const competence =
      typeof month.competence === 'string'
        ? fiscalCompetenceFromString(month.competence)
        : month.competence;
    const asOf = input.asOfRuleDateByCompetence?.[competence.value];
    const credits = input.withholdingCreditsByCompetence?.[competence.value];
    const liability = calculateMonthlyTaxLiability({
      competence,
      events: month.events,
      ruleSets: input.ruleSets,
      ...(input.taxSubjectId !== undefined ? { taxSubjectId: input.taxSubjectId } : {}),
      ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
      ...(input.supportedCurrencies !== undefined
        ? { supportedCurrencies: input.supportedCurrencies }
        : {}),
      openingLossBalances: opening,
      openingLossState,
      ...(input.calculationVersion !== undefined
        ? { calculationVersion: input.calculationVersion }
        : {}),
      ...(asOf !== undefined ? { asOfRuleDate: asOf } : {}),
      ...(credits !== undefined ? { withholdingCredits: credits } : {}),
    });
    results.push(liability);
    opening = liability.closingLossBalances;
  }
  return results;
}

/** Convenience for canonical withholding inputs -> domain credits. */
export function toWithholdingCredits(
  inputs: readonly CanonicalWithholdingInput[],
): TaxWithholdingCredit[] {
  return inputs.map((input) => ({
    category: input.category,
    currency: input.currency,
    amount: Money.from(input.amount, input.currency),
    source: 'FISCAL_EVENT',
    ...(input.sourceEventId !== undefined ? { sourceEventId: input.sourceEventId } : {}),
  }));
}
