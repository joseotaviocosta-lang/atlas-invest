import { createHash } from 'node:crypto';
import { Currency, Money } from '@atlas/domain';
import {
  HIGH_INCOME_MINIMUM_TAX_CALCULATION_BOUNDARY,
  HIGH_INCOME_TAX_SNAPSHOT_VERSION,
  HighIncomeEvidenceRequirement,
  HighIncomeEvidenceRequirementCode,
  HighIncomeEvidenceRequirementStatus,
  HighIncomeEvidenceState,
  HighIncomeEvidenceStateInput,
  HighIncomeIncomeClassificationResult,
  HighIncomeIncomeItemInput,
  HighIncomeMinimumTaxApplicabilityStatus,
  HighIncomeMinimumTaxCompletenessStatus,
  HighIncomeMinimumTaxRuleSet,
  HighIncomeRateBand,
  HighIncomeTaxDataSnapshot,
  HighIncomeTaxPaidFact,
  HighIncomeTaxPaidFactInput,
  classifyHighIncomeIncomeItem,
  computeHighIncomeSnapshotFingerprint,
  resolveHighIncomeRateBand,
} from './high-income-minimum-tax';
import { resolveHighIncomeMinimumTaxRuleSet } from './high-income-minimum-tax-rules';

export interface BuildHighIncomeTaxDataSnapshotInput {
  readonly calendarYear: number;
  readonly declarationExercise?: number;
  readonly taxSubjectId: string;
  readonly currency?: Currency;
  readonly authoritativeTotalAnnualIncome?: string | Money | null;
  readonly items: readonly HighIncomeIncomeItemInput[];
  readonly taxPaidFacts?: readonly HighIncomeTaxPaidFactInput[];
  readonly evidenceStates?: readonly HighIncomeEvidenceStateInput[];
  readonly sourceFingerprints?: readonly string[];
  readonly ruleSet?: HighIncomeMinimumTaxRuleSet;
}

export interface HighIncomeMinimumTaxThresholdMetadata {
  readonly amount: string;
  readonly currency: Currency;
  readonly comparison: 'STRICTLY_GREATER';
  readonly legalReference: string;
}

export interface HighIncomeMinimumTaxApplicabilityAssessment {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly currency: Currency;
  readonly ruleVersion: string;
  readonly ruleSet: HighIncomeMinimumTaxRuleSet | null;
  readonly applicability: HighIncomeMinimumTaxApplicabilityStatus;
  readonly dataCompleteness: HighIncomeMinimumTaxCompletenessStatus;
  readonly threshold: HighIncomeMinimumTaxThresholdMetadata | null;
  readonly totalAnnualIncome: Money | null;
  readonly minimumTaxBase: Money | null;
  readonly isAboveThreshold: boolean | null;
  readonly rateBand: HighIncomeRateBand | null;
  /** Final payable minimum tax is explicitly never computed in Phase 4I.1. */
  readonly minimumEffectiveRatePercentage: null;
  readonly finalTaxAmount: null;
  readonly calculationBoundary: typeof HIGH_INCOME_MINIMUM_TAX_CALCULATION_BOUNDARY;
  readonly incomeClassifications: readonly HighIncomeIncomeClassificationResult[];
  readonly includedCategories: readonly string[];
  readonly excludedCategories: readonly string[];
  readonly conditionalCategories: readonly string[];
  readonly unsupportedCategories: readonly string[];
  readonly evidenceRequirements: readonly HighIncomeEvidenceRequirement[];
  readonly limitations: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly snapshot: HighIncomeTaxDataSnapshot;
  readonly snapshotFingerprint: string;
}

function toMoney(value: string | Money | null | undefined, currency: Currency): Money | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? Money.from(value, currency) : value;
}

function normalizePaidFact(
  fact: HighIncomeTaxPaidFactInput,
  currency: Currency,
): HighIncomeTaxPaidFact {
  const amount = toMoney(fact.amount, fact.currency ?? currency) ?? Money.zero(currency);
  const source = fact.source ?? 'AUTHORITATIVE_TAX_PAID_FACT';
  const sourceFingerprint = createHash('sha256')
    .update(
      `${fact.factId}:${fact.kind}:${amount.amount}:${amount.currency}:${fact.payerId ?? 'NULL'}`,
    )
    .digest('hex');
  return Object.freeze({
    factId: fact.factId,
    kind: fact.kind,
    amount,
    payerId: fact.payerId ?? null,
    source,
    sourceFingerprint,
  });
}

function canonicalItemSort(
  a: HighIncomeIncomeClassificationResult,
  b: HighIncomeIncomeClassificationResult,
): number {
  if (a.paymentDate !== b.paymentDate) {
    return (a.paymentDate ?? '').localeCompare(b.paymentDate ?? '');
  }
  if (a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }
  return a.itemId.localeCompare(b.itemId);
}

export function buildHighIncomeTaxDataSnapshot(
  input: BuildHighIncomeTaxDataSnapshotInput,
): HighIncomeTaxDataSnapshot {
  const currency: Currency = input.currency ?? 'BRL';
  const ruleSet = input.ruleSet ?? resolveHighIncomeMinimumTaxRuleSet(input.calendarYear);
  const declarationExercise = input.declarationExercise ?? input.calendarYear + 1;
  const ruleVersion = ruleSet?.ruleVersion ?? 'UNSUPPORTED_YEAR';

  const items = input.items
    .map((item) => classifyHighIncomeIncomeItem(item, currency))
    .sort(canonicalItemSort);

  const taxPaidFacts = (input.taxPaidFacts ?? [])
    .map((fact) => normalizePaidFact(fact, currency))
    .sort((a, b) => a.factId.localeCompare(b.factId));

  const payerIdentities = Array.from(
    new Set(items.map((item) => item.payerId).filter((id): id is string => Boolean(id))),
  ).sort();

  const evidenceStates: HighIncomeEvidenceState[] = (input.evidenceStates ?? [])
    .map((state) =>
      Object.freeze({
        requirement: state.requirement,
        status: state.status,
        subjectId: state.subjectId ?? input.taxSubjectId,
        sourceFingerprint:
          state.sourceFingerprint ??
          createHash('sha256')
            .update(`${state.requirement}:${state.status}:${state.subjectId ?? input.taxSubjectId}`)
            .digest('hex'),
      }),
    )
    .sort((a, b) => a.requirement.localeCompare(b.requirement));

  const limitations = Array.from(new Set(items.flatMap((item) => item.limitations))).sort();

  const hasUnresolved = items.some(
    (item) =>
      item.classification === 'REQUIRES_CONFIRMATION' || item.classification === 'UNSUPPORTED',
  );
  const hasMissingPayer = items.some((item) =>
    item.limitations.includes('MISSING_CANONICAL_PAYER_IDENTITY'),
  );

  let completenessStatus: HighIncomeMinimumTaxCompletenessStatus = 'READY';
  if (items.length === 0 && !input.authoritativeTotalAnnualIncome) {
    completenessStatus = 'NO_ACTIVITY';
  } else if (hasUnresolved || hasMissingPayer) {
    completenessStatus = 'REQUIRES_CONFIRMATION';
  }

  const sourceFingerprints = Array.from(
    new Set([
      ...(input.sourceFingerprints ?? []),
      ...items.map((item) => item.sourceFingerprint),
      ...taxPaidFacts.map((fact) => fact.sourceFingerprint),
    ]),
  ).sort();

  const fingerprint = computeHighIncomeSnapshotFingerprint({
    snapshotVersion: HIGH_INCOME_TAX_SNAPSHOT_VERSION,
    calendarYear: input.calendarYear,
    declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency,
    ruleVersion,
    items,
    taxPaidFacts,
    payerIdentities,
    evidenceStates,
    sourceFingerprints,
    limitations,
  });

  return Object.freeze({
    snapshotVersion: HIGH_INCOME_TAX_SNAPSHOT_VERSION,
    calendarYear: input.calendarYear,
    declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency,
    ruleVersion,
    items: Object.freeze(items),
    taxPaidFacts: Object.freeze(taxPaidFacts),
    payerIdentities: Object.freeze(payerIdentities),
    evidenceStates: Object.freeze(evidenceStates),
    sourceFingerprints: Object.freeze(sourceFingerprints),
    isComplete: completenessStatus === 'READY',
    completenessStatus,
    limitations: Object.freeze(limitations),
    fingerprint,
  });
}

interface RequirementDraft {
  readonly requirement: HighIncomeEvidenceRequirementCode;
  readonly title: string;
  readonly legalReference: string;
  readonly blockingReason: string | null;
  readonly defaultStatus: HighIncomeEvidenceRequirementStatus;
}

/**
 * Pure deterministic applicability assessment for the high-income minimum tax.
 * Classifies eligibility, selects the rule set, assesses required evidence and
 * completeness — but NEVER computes the final payable minimum tax.
 */
export function assessHighIncomeMinimumTaxApplicability(
  input: BuildHighIncomeTaxDataSnapshotInput,
): HighIncomeMinimumTaxApplicabilityAssessment {
  const currency: Currency = input.currency ?? 'BRL';
  const ruleSet = input.ruleSet ?? resolveHighIncomeMinimumTaxRuleSet(input.calendarYear);
  const declarationExercise = input.declarationExercise ?? input.calendarYear + 1;
  const snapshot = buildHighIncomeTaxDataSnapshot({
    ...input,
    ruleSet: ruleSet ?? undefined,
    currency,
  });

  const blockingReasons = new Set<string>();
  const limitations = new Set<string>(snapshot.limitations);
  const noActivity = snapshot.items.length === 0 && !input.authoritativeTotalAnnualIncome;

  // Hard integrity checks.
  for (const item of snapshot.items) {
    if (item.amount.isNegative()) {
      blockingReasons.add('NEGATIVE_INCOME_AMOUNT');
    }
  }
  const authoritativeTotalRaw = toMoney(input.authoritativeTotalAnnualIncome, currency);
  if (
    typeof input.authoritativeTotalAnnualIncome !== 'string' &&
    input.authoritativeTotalAnnualIncome instanceof Money &&
    input.authoritativeTotalAnnualIncome.currency !== currency
  ) {
    blockingReasons.add('AUTHORITATIVE_TOTAL_CURRENCY_MISMATCH');
  }

  // Threshold income: authoritative total wins; otherwise derive from all items.
  const hasUnsupported = snapshot.items.some((item) => item.classification === 'UNSUPPORTED');
  let totalAnnualIncome: Money | null = authoritativeTotalRaw;
  if (totalAnnualIncome === null && !hasUnsupported) {
    let sum = Money.zero(currency);
    for (const item of snapshot.items) {
      sum = sum.add(item.amount);
    }
    totalAnnualIncome = snapshot.items.length > 0 ? sum : null;
  }

  // Minimum-tax base metadata (after legal exclusions): INCLUDED items only.
  let base = Money.zero(currency);
  let baseResolved = true;
  for (const item of snapshot.items) {
    if (item.classification === 'INCLUDED') {
      base = base.add(item.amount);
    } else if (
      item.classification === 'CONDITIONAL' ||
      item.classification === 'REQUIRES_CONFIRMATION' ||
      item.classification === 'UNSUPPORTED'
    ) {
      baseResolved = false;
    }
  }
  const minimumTaxBase: Money | null = baseResolved ? base : null;

  const thresholdMoney = ruleSet ? Money.from(ruleSet.applicabilityThreshold, currency) : null;
  const isAboveThreshold =
    totalAnnualIncome !== null && thresholdMoney !== null
      ? totalAnnualIncome.compare(thresholdMoney) > 0
      : null;

  const rateBand =
    ruleSet && minimumTaxBase !== null ? resolveHighIncomeRateBand(ruleSet, minimumTaxBase) : null;

  // Evidence requirements (data-requirement assessment only).
  const requirementDrafts: RequirementDraft[] = [];

  requirementDrafts.push({
    requirement: 'ANNUAL_INCOME_TOTAL',
    title: 'Total anual de rendimentos (base do limiar)',
    legalReference: 'Lei 9.250/1995, art. 16-A, caput',
    blockingReason: totalAnnualIncome === null ? 'UNKNOWN_TOTAL_ANNUAL_INCOME' : null,
    defaultStatus: totalAnnualIncome === null ? 'PENDING' : 'SATISFIED',
  });
  if (noActivity && requirementDrafts.length > 0) {
    requirementDrafts.pop();
  }

  if (
    snapshot.items.some((item) => item.limitations.includes('TRANSITION_ELIGIBILITY_UNCONFIRMED'))
  ) {
    requirementDrafts.push({
      requirement: 'TRANSITION_ELIGIBILITY',
      title: 'Comprovação de lucros/dividendos de transição (apurados até 2025)',
      legalReference: 'Lei 9.250/1995, art. 16-A, § 1º, XII',
      blockingReason: 'TRANSITION_ELIGIBILITY_UNCONFIRMED',
      defaultStatus: 'PENDING',
    });
  }

  if (snapshot.items.some((item) => item.limitations.includes('FII_ELIGIBILITY_UNVERIFIED'))) {
    requirementDrafts.push({
      requirement: 'FII_ELIGIBILITY',
      title: 'Elegibilidade de isenção de FII (listado, ≥ 100 cotistas)',
      legalReference: 'Lei 9.250/1995, art. 16-A, § 1º, V, "i"',
      blockingReason: 'FII_ELIGIBILITY_UNVERIFIED',
      defaultStatus: 'PENDING',
    });
  }

  if (
    snapshot.items.some((item) => item.limitations.includes('MISSING_CANONICAL_PAYER_IDENTITY'))
  ) {
    requirementDrafts.push({
      requirement: 'DIVIDEND_SOURCE_CLASSIFICATION',
      title: 'Identidade canônica da fonte pagadora',
      legalReference: 'Lei 9.250/1995, art. 16-A, § 1º, XI e XII',
      blockingReason: 'MISSING_CANONICAL_PAYER_IDENTITY',
      defaultStatus: 'PENDING',
    });
  }

  const hasIncludedDividends = snapshot.items.some(
    (item) => item.category === 'DIVIDEND' && item.classification === 'INCLUDED',
  );
  if (isAboveThreshold === true && hasIncludedDividends) {
    const corporateProvided = (input.evidenceStates ?? []).some(
      (state) =>
        state.requirement === 'CORPORATE_EFFECTIVE_TAX_EVIDENCE' && state.status === 'SATISFIED',
    );
    requirementDrafts.push({
      requirement: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
      title: 'Demonstrações financeiras / alíquota efetiva da pessoa jurídica (redutor)',
      legalReference: 'Lei 9.250/1995, art. 16-B, §§ 3º a 5º',
      blockingReason: corporateProvided ? null : 'CORPORATE_EFFECTIVE_TAX_EVIDENCE_PENDING',
      defaultStatus: corporateProvided ? 'SATISFIED' : 'PENDING',
    });
  }

  if (
    snapshot.items.some((item) => item.category === 'FOREIGN_INCOME' || item.currency !== currency)
  ) {
    const foreignProvided = (input.evidenceStates ?? []).some(
      (state) =>
        state.requirement === 'FOREIGN_TAX_CREDIT_EVIDENCE' && state.status === 'SATISFIED',
    );
    requirementDrafts.push({
      requirement: 'FOREIGN_TAX_CREDIT_EVIDENCE',
      title: 'Tributação de rendimentos no exterior (Lei 14.754/2023)',
      legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, III',
      blockingReason: foreignProvided ? null : 'FOREIGN_TAX_CREDIT_EVIDENCE_PENDING',
      defaultStatus: foreignProvided ? 'SATISFIED' : 'PENDING',
    });
  }

  const hasWithholdingIncome = snapshot.items.some(
    (item) =>
      item.category === 'JCP' ||
      item.category === 'EXCLUSIVE_WITHHOLDING_INCOME' ||
      (item.classification === 'INCLUDED' &&
        item.requiredEvidence.includes('WITHHOLDING_EVIDENCE')),
  );
  const withholdingProvided = (input.evidenceStates ?? []).some(
    (state) => state.requirement === 'WITHHOLDING_EVIDENCE' && state.status === 'SATISFIED',
  );
  if (hasWithholdingIncome || withholdingProvided) {
    requirementDrafts.push({
      requirement: 'WITHHOLDING_EVIDENCE',
      title: 'Comprovação de retenção exclusiva/definitiva na fonte',
      legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, II',
      blockingReason:
        withholdingProvided || !hasWithholdingIncome ? null : 'WITHHOLDING_EVIDENCE_PENDING',
      defaultStatus: withholdingProvided || !hasWithholdingIncome ? 'SATISFIED' : 'PENDING',
    });
  }

  if (isAboveThreshold === true) {
    const adjustmentProvided = (input.evidenceStates ?? []).some(
      (state) => state.requirement === 'ANNUAL_ADJUSTMENT_TAX_DUE' && state.status === 'SATISFIED',
    );
    requirementDrafts.push({
      requirement: 'ANNUAL_ADJUSTMENT_TAX_DUE',
      title: 'IRPF devido na declaração de ajuste anual',
      legalReference: 'Lei 9.250/1995, art. 16-A, § 3º, I',
      blockingReason: adjustmentProvided ? null : 'ANNUAL_ADJUSTMENT_TAX_DUE_PENDING',
      defaultStatus: adjustmentProvided ? 'SATISFIED' : 'PENDING',
    });
  }

  const evidenceRequirements: HighIncomeEvidenceRequirement[] = requirementDrafts
    .map((draft) => {
      const provided = providedEvidenceLookup(input.evidenceStates, draft.requirement);
      const status = provided ?? draft.defaultStatus;
      const sourceFingerprint = createHash('sha256')
        .update(`${draft.requirement}:${snapshot.taxSubjectId}:${status}`)
        .digest('hex');
      return Object.freeze({
        requirementId: `${draft.requirement}:${snapshot.taxSubjectId}`,
        requirement: draft.requirement,
        subjectId: snapshot.taxSubjectId,
        title: draft.title,
        status,
        legalReference: draft.legalReference,
        blockingReason: status === 'PENDING' ? draft.blockingReason : null,
        sourceFingerprint,
      });
    })
    .sort((a, b) => a.requirement.localeCompare(b.requirement));

  const pendingBlocking = evidenceRequirements.filter(
    (req) => req.status === 'PENDING' && req.blockingReason !== null,
  );
  const confirmationReasons = new Set<string>();
  for (const pending of pendingBlocking) {
    if (
      pending.requirement === 'TRANSITION_ELIGIBILITY' ||
      pending.requirement === 'FII_ELIGIBILITY' ||
      pending.requirement === 'DIVIDEND_SOURCE_CLASSIFICATION' ||
      pending.requirement === 'ANNUAL_INCOME_TOTAL' ||
      pending.requirement === 'CORPORATE_EFFECTIVE_TAX_EVIDENCE'
    ) {
      confirmationReasons.add(pending.blockingReason!);
      if (pending.requirement === 'CORPORATE_EFFECTIVE_TAX_EVIDENCE') {
        limitations.add('CORPORATE_EFFECTIVE_TAX_EVIDENCE_PENDING');
      }
    }
  }

  // Applicability precedence (fail-closed).
  const hasUnresolvedClassification = snapshot.items.some(
    (item) => item.classification !== 'INCLUDED' && item.classification !== 'EXCLUDED',
  );
  let applicability: HighIncomeMinimumTaxApplicabilityStatus;
  if (ruleSet === null) {
    applicability = 'UNSUPPORTED_YEAR';
  } else if (noActivity) {
    applicability = 'NOT_APPLICABLE';
  } else if (blockingReasons.size > 0) {
    applicability = 'BLOCKED';
  } else if (hasUnresolvedClassification) {
    if (hasUnsupported) {
      limitations.add('UNSUPPORTED_INCOME_CATEGORY_PRESENT');
    }
    applicability = 'REQUIRES_CONFIRMATION';
  } else if (confirmationReasons.size > 0) {
    applicability = 'REQUIRES_CONFIRMATION';
  } else if (totalAnnualIncome === null) {
    applicability = 'REQUIRES_CONFIRMATION';
  } else if (isAboveThreshold === true) {
    applicability = 'APPLICABLE';
  } else {
    applicability = 'NOT_APPLICABLE';
  }

  let dataCompleteness: HighIncomeMinimumTaxCompletenessStatus = snapshot.completenessStatus;
  if (applicability === 'BLOCKED') {
    dataCompleteness = 'BLOCKED';
  } else if (applicability === 'REQUIRES_CONFIRMATION') {
    dataCompleteness = 'REQUIRES_CONFIRMATION';
  } else if (snapshot.items.length === 0 && !input.authoritativeTotalAnnualIncome) {
    dataCompleteness = 'NO_ACTIVITY';
  }

  const includedCategories = Array.from(
    new Set(snapshot.items.filter((i) => i.classification === 'INCLUDED').map((i) => i.category)),
  ).sort();
  const excludedCategories = Array.from(
    new Set(snapshot.items.filter((i) => i.classification === 'EXCLUDED').map((i) => i.category)),
  ).sort();
  const conditionalCategories = Array.from(
    new Set(
      snapshot.items
        .filter(
          (i) => i.classification === 'CONDITIONAL' || i.classification === 'REQUIRES_CONFIRMATION',
        )
        .map((i) => i.category),
    ),
  ).sort();
  const unsupportedCategories = Array.from(
    new Set(
      snapshot.items.filter((i) => i.classification === 'UNSUPPORTED').map((i) => i.category),
    ),
  ).sort();

  const threshold: HighIncomeMinimumTaxThresholdMetadata | null = ruleSet
    ? Object.freeze({
        amount: ruleSet.applicabilityThreshold,
        currency,
        comparison: 'STRICTLY_GREATER',
        legalReference: 'Lei 9.250/1995, art. 16-A, caput',
      })
    : null;

  return Object.freeze({
    calendarYear: input.calendarYear,
    declarationExercise,
    taxSubjectId: input.taxSubjectId,
    currency,
    ruleVersion: ruleSet?.ruleVersion ?? 'UNSUPPORTED_YEAR',
    ruleSet,
    applicability,
    dataCompleteness,
    threshold,
    totalAnnualIncome,
    minimumTaxBase,
    isAboveThreshold,
    rateBand,
    minimumEffectiveRatePercentage: null,
    finalTaxAmount: null,
    calculationBoundary: HIGH_INCOME_MINIMUM_TAX_CALCULATION_BOUNDARY,
    incomeClassifications: snapshot.items,
    includedCategories: Object.freeze(includedCategories),
    excludedCategories: Object.freeze(excludedCategories),
    conditionalCategories: Object.freeze(conditionalCategories),
    unsupportedCategories: Object.freeze(unsupportedCategories),
    evidenceRequirements: Object.freeze(evidenceRequirements),
    limitations: Object.freeze(Array.from(limitations).sort()),
    blockingReasons: Object.freeze(Array.from(blockingReasons).sort()),
    snapshot,
    snapshotFingerprint: snapshot.fingerprint,
  });
}

function providedEvidenceLookup(
  states: readonly HighIncomeEvidenceStateInput[] | undefined,
  requirement: HighIncomeEvidenceRequirementCode,
): HighIncomeEvidenceRequirementStatus | null {
  if (!states) {
    return null;
  }
  const match = states.find((state) => state.requirement === requirement);
  return match?.status ?? null;
}
