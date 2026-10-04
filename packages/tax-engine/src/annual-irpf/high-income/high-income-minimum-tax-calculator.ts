import { Currency, Money } from '@atlas/domain';
import {
  assessHighIncomeMinimumTaxApplicability,
  BuildHighIncomeTaxDataSnapshotInput,
} from './high-income-minimum-tax-engine';
import { HighIncomeTaxPaidFact, HighIncomeTaxPaidFactKind } from './high-income-minimum-tax';
import {
  HIGH_INCOME_CREDIT_SUPPORT_MATRIX,
  HIGH_INCOME_MINIMUM_TAX_CALCULATION_VERSION,
  HIGH_INCOME_MINIMUM_TAX_RATE_SCALE,
  HIGH_INCOME_MINIMUM_TAX_SCOPE,
  HighIncomeCreditAssessment,
  HighIncomeMinimumTaxCalculationResult,
  HighIncomeMinimumTaxCalculationStatus,
  buildHighIncomeRateModel,
  buildIncomeBreakdown,
  computeHighIncomeCalculationFingerprint,
  deduplicateHighIncomeItems,
  resolveHighIncomeRateBandFromModel,
  resolveHighIncomeRatePercentage,
  roundHalfUp,
  roundMoneyToCents,
} from './high-income-minimum-tax-calculation';

/**
 * Phase 4I.2 — pure deterministic high-income minimum-tax calculator.
 *
 * GROSS tax is emitted whenever the minimum-tax base is resolvable; NET tax is
 * emitted only when every legally required credit/reduction is supported and
 * evidenced. Missing facts never become zero, and the art. 16-B corporate
 * reduction (whose formula is not frozen in 4I.1) blocks an authoritative net.
 */
export function calculateHighIncomeMinimumTax(
  input: BuildHighIncomeTaxDataSnapshotInput,
): HighIncomeMinimumTaxCalculationResult {
  const currency: Currency = input.currency ?? 'BRL';
  const dedupe = deduplicateHighIncomeItems(input.items);
  const hasConflict = dedupe.conflictingItemIds.length > 0;
  const assessment = assessHighIncomeMinimumTaxApplicability({ ...input, items: dedupe.items });
  const ruleSet = assessment.ruleSet;

  const limitations = new Set(assessment.limitations);
  const blockingReasons = new Set(assessment.blockingReasons);
  if (dedupe.duplicateCount > 0) {
    limitations.add('DUPLICATE_SOURCE_ITEMS_DEDUPLICATED');
  }

  const hasUnsupported = assessment.unsupportedCategories.length > 0;
  const baseUnresolved = assessment.minimumTaxBase === null;
  const aboveThreshold = assessment.isAboveThreshold === true;
  const hasMissingPayer = assessment.incomeClassifications.some((item) =>
    item.limitations.includes('MISSING_CANONICAL_PAYER_IDENTITY'),
  );
  const isApplicable = aboveThreshold && !baseUnresolved;

  const hasIncludedDividend = assessment.incomeClassifications.some(
    (item) =>
      (item.category === 'DIVIDEND' || item.category === 'DIVIDEND_TRANSITION') &&
      item.classification === 'INCLUDED',
  );
  const hasExclusiveWithholdingIncome = assessment.incomeClassifications.some(
    (item) =>
      item.classification === 'INCLUDED' &&
      (item.category === 'JCP' || item.category === 'EXCLUSIVE_WITHHOLDING_INCOME'),
  );

  // --- Credit / reduction assessment (data + support matrix) ---------------
  const factsByKind = new Map<HighIncomeTaxPaidFactKind, HighIncomeTaxPaidFact[]>();
  for (const fact of assessment.snapshot.taxPaidFacts) {
    const bucket = factsByKind.get(fact.kind) ?? [];
    bucket.push(fact);
    factsByKind.set(fact.kind, bucket);
  }

  const requiredCreditKinds = new Set<HighIncomeTaxPaidFactKind>();
  if (isApplicable) {
    requiredCreditKinds.add('ANNUAL_ADJUSTMENT_IRPF_DUE');
    if (hasExclusiveWithholdingIncome) {
      requiredCreditKinds.add('EXCLUSIVE_SOURCE_WITHHOLDING');
    }
  }

  const assessedKinds = new Set<HighIncomeTaxPaidFactKind>([
    ...factsByKind.keys(),
    ...requiredCreditKinds,
  ]);

  const creditAssessments: HighIncomeCreditAssessment[] = Array.from(assessedKinds)
    .sort()
    .map((kind) => {
      const definition = HIGH_INCOME_CREDIT_SUPPORT_MATRIX[kind];
      const facts = factsByKind.get(kind) ?? [];
      const provided = facts.length > 0;
      const amount = provided
        ? facts.reduce((acc, fact) => acc.add(fact.amount), Money.zero(currency))
        : null;
      const supported = definition.supported;
      const applied = supported && provided;
      const requiredForNet = requiredCreditKinds.has(kind);
      const reason = !supported
        ? 'UNSUPPORTED_BY_FROZEN_FOUNDATION'
        : provided
          ? applied
            ? 'APPLIED'
            : 'NOT_APPLIED'
          : requiredForNet
            ? 'REQUIRED_FOR_NET_MISSING'
            : 'OPTIONAL_NOT_PROVIDED';
      return Object.freeze({
        kind,
        role: definition.role,
        supported,
        provided,
        amount,
        applied,
        requiredForNet,
        legalReference: definition.legalReference,
        reason,
      });
    });

  const credits = creditAssessments.filter((entry) => entry.role === 'CREDIT');
  const reductions = creditAssessments.filter((entry) => entry.role === 'REDUCTION');

  const appliedCreditsSum = credits
    .filter((entry) => entry.applied && entry.amount !== null)
    .reduce((acc, entry) => acc.add(entry.amount!), Money.zero(currency));
  const appliedReductionsSum = reductions
    .filter((entry) => entry.applied && entry.amount !== null)
    .reduce((acc, entry) => acc.add(entry.amount!), Money.zero(currency));

  const missingRequiredCredits = Array.from(requiredCreditKinds)
    .filter((kind) => !factsByKind.has(kind))
    .sort();
  const corporateReductionPotential = isApplicable && hasIncludedDividend;

  // --- Gross tax (independent of credits/reduction) ------------------------
  const canComputeGross =
    !hasConflict &&
    ruleSet !== null &&
    aboveThreshold &&
    !baseUnresolved &&
    !hasUnsupported &&
    !hasMissingPayer;

  let minimumRatePercentage: string | null = null;
  let grossExact: Money | null = null;
  let grossMinimumTax: Money | null = null;
  let rateBand = assessment.rateBand;

  if (canComputeGross && ruleSet && assessment.minimumTaxBase !== null) {
    const model = buildHighIncomeRateModel(ruleSet, currency);
    const rateExact = resolveHighIncomeRatePercentage(model, assessment.minimumTaxBase);
    rateBand = resolveHighIncomeRateBandFromModel(model, assessment.minimumTaxBase);
    minimumRatePercentage = roundHalfUp(rateExact.amount, HIGH_INCOME_MINIMUM_TAX_RATE_SCALE);
    grossExact = assessment.minimumTaxBase.multiply(rateExact.amount).divide('100');
    grossMinimumTax = roundMoneyToCents(grossExact);
  }

  // --- Status precedence (fail-closed) -------------------------------------
  let status: HighIncomeMinimumTaxCalculationStatus;
  let netMinimumTax: Money | null = null;
  let creditExcess: Money | null = null;

  if (ruleSet === null) {
    status = 'UNSUPPORTED_YEAR';
    blockingReasons.add('UNSUPPORTED_CALENDAR_YEAR');
  } else if (assessment.applicability === 'BLOCKED') {
    status = 'BLOCKED';
  } else if (hasConflict) {
    status = 'BLOCKED';
    blockingReasons.add('CONFLICTING_DUPLICATE_SOURCE_ITEM');
  } else if (hasUnsupported) {
    status = 'UNSUPPORTED_INPUT';
    blockingReasons.add('UNSUPPORTED_INCOME_INPUT');
  } else if (baseUnresolved || hasMissingPayer) {
    status = 'REQUIRES_CONFIRMATION';
    blockingReasons.add('MINIMUM_TAX_BASE_UNRESOLVED');
  } else if (!aboveThreshold) {
    status = 'NOT_APPLICABLE';
  } else if (corporateReductionPotential) {
    status = 'INCOMPLETE_REDUCTION_DATA';
    blockingReasons.add('CORPORATE_EFFECTIVE_TAX_REDUCTION_NOT_IMPLEMENTED');
    limitations.add('CORPORATE_EFFECTIVE_TAX_EVIDENCE_PENDING');
  } else if (missingRequiredCredits.length > 0) {
    status = 'INCOMPLETE_CREDITS';
    for (const kind of missingRequiredCredits) {
      blockingReasons.add(`MISSING_REQUIRED_CREDIT:${kind}`);
    }
  } else {
    status = 'CALCULABLE';
    const netExact = grossExact!.subtract(appliedCreditsSum);
    if (netExact.isNegative()) {
      creditExcess = roundMoneyToCents(netExact.abs());
      netMinimumTax = Money.zero(currency);
    } else {
      creditExcess = Money.zero(currency);
      netMinimumTax = roundMoneyToCents(netExact);
    }
  }

  const supportedCreditsTotal = grossMinimumTax !== null ? appliedCreditsSum : null;
  const supportedReductionsTotal = grossMinimumTax !== null ? appliedReductionsSum : null;

  const incomeBreakdown = buildIncomeBreakdown(assessment.incomeClassifications);
  const blockingReasonsArray = Array.from(blockingReasons).sort();

  const calculationFingerprint = computeHighIncomeCalculationFingerprint({
    calculationVersion: HIGH_INCOME_MINIMUM_TAX_CALCULATION_VERSION,
    ruleVersion: assessment.ruleVersion,
    sourceFingerprint: assessment.snapshotFingerprint,
    calendarYear: assessment.calendarYear,
    declarationExercise: assessment.declarationExercise,
    taxSubjectId: assessment.taxSubjectId,
    currency,
    status,
    totalAnnualIncome: assessment.totalAnnualIncome,
    minimumTaxBase: assessment.minimumTaxBase,
    minimumRatePercentage,
    grossMinimumTax,
    credits,
    reductions,
    netMinimumTax,
    blockingReasons: blockingReasonsArray,
  });

  return Object.freeze({
    calculationVersion: HIGH_INCOME_MINIMUM_TAX_CALCULATION_VERSION,
    calendarYear: assessment.calendarYear,
    declarationExercise: assessment.declarationExercise,
    taxSubjectId: assessment.taxSubjectId,
    currency,
    ruleVersion: assessment.ruleVersion,
    status,
    applicability: assessment.applicability,
    totalAnnualIncome: assessment.totalAnnualIncome,
    applicabilityThreshold: assessment.threshold?.amount ?? null,
    minimumTaxBase: assessment.minimumTaxBase,
    rateBand,
    minimumRatePercentage,
    grossMinimumTax,
    credits: Object.freeze(credits),
    supportedCreditsTotal,
    reductions: Object.freeze(reductions),
    supportedReductionsTotal,
    netMinimumTax,
    creditExcess,
    incomeBreakdown: Object.freeze(incomeBreakdown),
    evidenceRequirements: assessment.evidenceRequirements,
    blockingReasons: Object.freeze(blockingReasonsArray),
    limitations: Object.freeze(Array.from(limitations).sort()),
    sourceFingerprint: assessment.snapshotFingerprint,
    calculationFingerprint,
    scope: HIGH_INCOME_MINIMUM_TAX_SCOPE,
    paymentBoundary: 'NO_PAYMENT_OBLIGATION',
    refundBoundary: 'NO_REFUND_CALCULATION',
  });
}
