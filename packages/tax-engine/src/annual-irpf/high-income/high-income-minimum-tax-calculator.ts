import { Currency, Money } from '@atlas/domain';
import {
  assessHighIncomeMinimumTaxApplicability,
  BuildHighIncomeTaxDataSnapshotInput,
} from './high-income-minimum-tax-engine';
import { HighIncomeTaxPaidFact, HighIncomeTaxPaidFactKind } from './high-income-minimum-tax';
import {
  aggregateCorporateRedutor,
  calculateCorporatePayerRedutor,
  CorporatePayerEvidenceInput,
  CorporateRedutorAggregateResult,
  deduplicateCorporateEvidence,
} from './high-income-corporate-redutor';
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
 * evidenced. Missing facts never become zero.
 *
 * Phase 4I.3 integration: the art. 16-B corporate redutor is computed per
 * canonical payer from explicit corporate evidence and integrated into the net.
 * Unresolved required redutor evidence keeps the net null (fail-closed).
 */
export interface CalculateHighIncomeMinimumTaxInput extends BuildHighIncomeTaxDataSnapshotInput {
  /** Phase 4I.3: per-payer corporate evidence for the art. 16-B redutor. */
  readonly corporateEvidence?: readonly CorporatePayerEvidenceInput[];
}

export function calculateHighIncomeMinimumTax(
  input: CalculateHighIncomeMinimumTaxInput,
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

  // --- Phase 4I.3: payer-scoped corporate redutor (art. 16-B) ---------------
  // Eligible dividends: INCLUDED "lucros e dividendos" only. JCP is deductible
  // remuneration, not distributed profit, and transition-exempt dividends are
  // outside the base — neither enters the redutor.
  const eligibleDividendsByPayer = new Map<string, Money>();
  if (canComputeGross) {
    for (const item of assessment.incomeClassifications) {
      if (
        item.classification !== 'INCLUDED' ||
        (item.category !== 'DIVIDEND' && item.category !== 'DIVIDEND_TRANSITION') ||
        !item.payerId
      ) {
        continue;
      }
      const current = eligibleDividendsByPayer.get(item.payerId) ?? Money.zero(currency);
      eligibleDividendsByPayer.set(item.payerId, current.add(item.amount));
    }
  }
  const redutorPathActive = canComputeGross && eligibleDividendsByPayer.size > 0;

  let corporateRedutor: CorporateRedutorAggregateResult | null = null;
  let pfEffectiveRatePercentage: string | null = null;

  if (redutorPathActive && ruleSet && assessment.minimumTaxBase !== null && grossExact !== null) {
    const totalEligible = Array.from(eligibleDividendsByPayer.values()).reduce(
      (acc, amount) => acc.add(amount),
      Money.zero(currency),
    );
    // Statutory PF rate (§3, II): increment from including ALL eligible dividends,
    // before any reduction. Exact: (Gross(Base) − Gross(Base − D)) / D × 100.
    const baseWithoutDividends = assessment.minimumTaxBase.subtract(totalEligible);
    const model = buildHighIncomeRateModel(ruleSet, currency);
    const rateWithout = resolveHighIncomeRatePercentage(model, baseWithoutDividends);
    const grossWithout = baseWithoutDividends.multiply(rateWithout.amount).divide('100');
    const increment = grossExact.subtract(grossWithout);
    pfEffectiveRatePercentage = increment.divide(totalEligible.amount).multiply('100').amount;

    const deduped = deduplicateCorporateEvidence(input.corporateEvidence ?? [], currency);
    const evidenceByPayer = new Map(deduped.evidence.map((record) => [record.payerId, record]));
    const payerIds = Array.from(
      new Set([...eligibleDividendsByPayer.keys(), ...evidenceByPayer.keys()]),
    ).sort();
    const payerResults = payerIds.map((payerId) => {
      const dividends = eligibleDividendsByPayer.get(payerId) ?? Money.zero(currency);
      const record = evidenceByPayer.get(payerId) ?? null;
      const conflict =
        deduped.conflictingPayerIds.includes(payerId) || record?.hasConflictingEvidence === true;
      const evidence = conflict ? null : record;
      return calculateCorporatePayerRedutor({
        payerId,
        payerType: evidence?.payerType ?? 'UNKNOWN',
        eligibleDividends: dividends,
        pfEffectiveRatePercentage: pfEffectiveRatePercentage!,
        evidence,
        currency,
        hasConflictingEvidence: conflict,
      });
    });
    const conflictedPayerIds = new Set([
      ...deduped.conflictingPayerIds,
      ...Array.from(evidenceByPayer.entries())
        .filter(([, record]) => record.hasConflictingEvidence === true)
        .map(([payerId]) => payerId),
    ]);
    if (conflictedPayerIds.size > 0) {
      for (const payerId of conflictedPayerIds) {
        blockingReasons.add(`CONFLICTING_CORPORATE_EVIDENCE:${payerId}`);
      }
    }
    corporateRedutor = aggregateCorporateRedutor(payerResults, currency);
  }

  const redutorComplete =
    corporateRedutor !== null &&
    (corporateRedutor.status === 'APPLICABLE' || corporateRedutor.status === 'NOT_APPLICABLE');
  const redutorBlocked =
    corporateRedutor !== null &&
    (corporateRedutor.status === 'BLOCKED' ||
      corporateRedutor.status === 'UNSUPPORTED_PAYER_TYPE' ||
      corporateRedutor.status === 'UNSUPPORTED_YEAR');
  const redutorPending =
    (redutorPathActive && corporateRedutor === null) ||
    (corporateRedutor !== null && corporateRedutor.status === 'REQUIRES_EVIDENCE');

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
  } else if (redutorBlocked) {
    status = 'BLOCKED';
    blockingReasons.add('CORPORATE_REDUTOR_BLOCKED');
  } else if (redutorPending) {
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
    const redutorAmount = corporateRedutor?.totalSupportedReduction ?? Money.zero(currency);
    const netExact = grossExact!.subtract(appliedCreditsSum).subtract(redutorAmount);
    if (netExact.isNegative()) {
      creditExcess = roundMoneyToCents(netExact.abs());
      netMinimumTax = Money.zero(currency);
    } else {
      creditExcess = Money.zero(currency);
      netMinimumTax = roundMoneyToCents(netExact);
    }
  }

  const supportedCreditsTotal = grossMinimumTax !== null ? appliedCreditsSum : null;
  const computedReductionEntry =
    corporateRedutor !== null &&
    redutorComplete &&
    corporateRedutor.totalSupportedReduction !== null
      ? [
          Object.freeze({
            kind: 'ART_16B_REDUTOR' as HighIncomeTaxPaidFactKind,
            role: 'REDUCTION' as const,
            supported: true,
            provided: true,
            amount: corporateRedutor.totalSupportedReduction,
            applied: true,
            requiredForNet: true,
            legalReference: 'Lei 9.250/1995, art. 16-A, §3º, V e art. 16-B',
            reason: 'APPLIED',
          }),
        ]
      : [];
  const supportedReductionsTotal =
    grossMinimumTax !== null
      ? appliedReductionsSum.add(
          computedReductionEntry.length > 0
            ? computedReductionEntry[0]!.amount!
            : Money.zero(currency),
        )
      : null;

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
    reductions: [...reductions, ...computedReductionEntry],
    netMinimumTax,
    blockingReasons: blockingReasonsArray,
    corporateRedutor:
      corporateRedutor === null
        ? null
        : {
            aggregateVersion: corporateRedutor.aggregateVersion,
            status: corporateRedutor.status,
            totalEligibleDividends: corporateRedutor.totalEligibleDividends,
            totalReductionExact: corporateRedutor.totalReductionExact,
            totalSupportedReduction: corporateRedutor.totalSupportedReduction,
            calculationFingerprint: corporateRedutor.calculationFingerprint,
          },
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
    reductions: Object.freeze([...reductions, ...computedReductionEntry]),
    supportedReductionsTotal,
    corporateRedutor,
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
