import {
  HighIncomeCreditAssessment,
  HighIncomeEvidenceRequirement,
  HighIncomeIncomeBreakdownEntry,
  HighIncomeMinimumTaxCalculationResult,
  CorporatePayerRedutorResult,
  CorporateRedutorAggregateResult,
} from '@atlas/tax-engine';
import { HighIncomeEvidenceRow } from '@atlas/database';

export interface HighIncomeCreditReadModel {
  readonly kind: string;
  readonly role: string;
  readonly supported: boolean;
  readonly provided: boolean;
  readonly amount: string | null;
  readonly applied: boolean;
  readonly requiredForNet: boolean;
  readonly legalReference: string;
  readonly reason: string;
}

export interface HighIncomeIncomeBreakdownReadModel {
  readonly category: string;
  readonly classification: string;
  readonly grossAmount: string;
  readonly includedAmount: string;
  readonly excludedAmount: string;
  readonly itemCount: number;
  readonly payerIds: readonly string[];
  readonly reason: string;
  readonly legalReference: string;
}

export interface HighIncomePayerRedutorReadModel {
  readonly payerId: string;
  readonly payerType: string;
  readonly status: string;
  readonly referenceRatePercentage: string | null;
  readonly corporateEffectiveRatePercentage: string | null;
  readonly pfEffectiveRatePercentage: string;
  readonly eligibleDividends: string;
  readonly reductionExact: string;
  readonly evidenceStatus: string;
  readonly blockingReasons: readonly string[];
  readonly sourceFingerprint: string | null;
}

export interface HighIncomeCorporateRedutorReadModel {
  readonly aggregateVersion: string;
  readonly payerCount: number;
  readonly computedPayerCount: number;
  readonly status: string;
  readonly totalEligibleDividends: string;
  readonly totalReductionExact: string;
  readonly totalSupportedReduction: string | null;
  readonly payers: readonly HighIncomePayerRedutorReadModel[];
  readonly blockingPayers: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
}

export interface HighIncomeEvidenceRequirementReadModel {
  readonly requirementId: string;
  readonly requirement: string;
  readonly subjectId: string;
  readonly title: string;
  readonly status: string;
  readonly legalReference: string;
  readonly blockingReason: string | null;
}

export interface HighIncomeEvidenceStateReadModel {
  readonly id: string;
  readonly evidenceType: string;
  readonly payerId: string | null;
  readonly authority: string;
  readonly evidenceSource: string;
  readonly conflictStatus: string;
  readonly stale: boolean;
  readonly revision: number;
  readonly supersedesId: string | null;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface AnnualHighIncomeAssessmentReadModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersion: string;
  readonly status: string;
  readonly applicability: string;
  readonly totalAnnualIncome: string | null;
  readonly applicabilityThreshold: string | null;
  readonly minimumTaxBase: string | null;
  readonly rateBand: string | null;
  readonly minimumRatePercentage: string | null;
  readonly grossMinimumTax: string | null;
  readonly credits: readonly HighIncomeCreditReadModel[];
  readonly supportedCreditsTotal: string | null;
  readonly reductions: readonly HighIncomeCreditReadModel[];
  readonly supportedReductionsTotal: string | null;
  readonly corporateRedutor: HighIncomeCorporateRedutorReadModel | null;
  readonly netMinimumTax: string | null;
  readonly creditExcess: string | null;
  readonly incomeBreakdown: readonly HighIncomeIncomeBreakdownReadModel[];
  readonly evidenceRequirements: readonly HighIncomeEvidenceRequirementReadModel[];
  readonly evidence: readonly HighIncomeEvidenceStateReadModel[];
  readonly blockingReasons: readonly string[];
  readonly limitations: readonly string[];
  readonly upstreamIncomeStatus: string;
  readonly upstreamIncomeFingerprint: string;
  readonly upstreamCapitalMarketFingerprint: string;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
}

function mapCredit(credit: HighIncomeCreditAssessment): HighIncomeCreditReadModel {
  return {
    kind: credit.kind,
    role: credit.role,
    supported: credit.supported,
    provided: credit.provided,
    amount: credit.amount ? credit.amount.amount : null,
    applied: credit.applied,
    requiredForNet: credit.requiredForNet,
    legalReference: credit.legalReference,
    reason: credit.reason,
  };
}

function mapBreakdownEntry(
  entry: HighIncomeIncomeBreakdownEntry,
): HighIncomeIncomeBreakdownReadModel {
  return {
    category: entry.category,
    classification: entry.classification,
    grossAmount: entry.grossAmount.amount,
    includedAmount: entry.includedAmount.amount,
    excludedAmount: entry.excludedAmount.amount,
    itemCount: entry.itemCount,
    payerIds: entry.payerIds,
    reason: entry.reason,
    legalReference: entry.legalReference,
  };
}

function mapPayerRedutor(payer: CorporatePayerRedutorResult): HighIncomePayerRedutorReadModel {
  return {
    payerId: payer.payerId,
    payerType: payer.payerType,
    status: payer.status,
    referenceRatePercentage: payer.referenceRatePercentage,
    corporateEffectiveRatePercentage: payer.corporateEffectiveRatePercentage,
    pfEffectiveRatePercentage: payer.pfEffectiveRatePercentage,
    eligibleDividends: payer.eligibleDividends.amount,
    reductionExact: payer.reductionExact.amount,
    evidenceStatus: payer.evidenceStatus,
    blockingReasons: payer.blockingReasons,
    sourceFingerprint: payer.sourceFingerprint,
  };
}

function mapCorporateRedutor(
  aggregate: CorporateRedutorAggregateResult,
): HighIncomeCorporateRedutorReadModel {
  return {
    aggregateVersion: aggregate.aggregateVersion,
    payerCount: aggregate.payerCount,
    computedPayerCount: aggregate.computedPayerCount,
    status: aggregate.status,
    totalEligibleDividends: aggregate.totalEligibleDividends.amount,
    totalReductionExact: aggregate.totalReductionExact.amount,
    totalSupportedReduction: aggregate.totalSupportedReduction
      ? aggregate.totalSupportedReduction.amount
      : null,
    payers: aggregate.payers.map(mapPayerRedutor),
    blockingPayers: aggregate.blockingPayers,
    blockingReasons: aggregate.blockingReasons,
    sourceFingerprint: aggregate.sourceFingerprint,
    calculationFingerprint: aggregate.calculationFingerprint,
  };
}

function mapEvidenceRequirement(
  requirement: HighIncomeEvidenceRequirement,
): HighIncomeEvidenceRequirementReadModel {
  return {
    requirementId: requirement.requirementId,
    requirement: requirement.requirement,
    subjectId: requirement.subjectId,
    title: requirement.title,
    status: requirement.status,
    legalReference: requirement.legalReference,
    blockingReason: requirement.blockingReason,
  };
}

export function mapHighIncomeEvidenceRowToState(
  row: HighIncomeEvidenceRow,
  stale: boolean,
): HighIncomeEvidenceStateReadModel {
  return {
    id: row.id,
    evidenceType: row.evidenceType,
    payerId: row.payerId,
    authority: row.authority,
    evidenceSource: row.evidenceSource,
    conflictStatus: row.conflictStatus,
    stale,
    revision: row.revision,
    supersedesId: row.supersedesId,
    sourceFingerprint: row.sourceFingerprint,
    fingerprint: row.fingerprint,
  };
}

export interface MapAnnualHighIncomeAssessmentInput {
  readonly calculation: HighIncomeMinimumTaxCalculationResult;
  readonly status: string;
  readonly evidence: readonly HighIncomeEvidenceStateReadModel[];
  readonly upstreamIncomeStatus: string;
  readonly upstreamIncomeFingerprint: string;
  readonly upstreamCapitalMarketFingerprint: string;
}

export function mapAnnualHighIncomeAssessmentToReadModel(
  input: MapAnnualHighIncomeAssessmentInput,
): AnnualHighIncomeAssessmentReadModel {
  const calculation = input.calculation;
  return {
    calendarYear: calculation.calendarYear,
    declarationExercise: calculation.declarationExercise,
    ruleVersion: calculation.ruleVersion,
    status: input.status,
    applicability: calculation.applicability,
    totalAnnualIncome: calculation.totalAnnualIncome ? calculation.totalAnnualIncome.amount : null,
    applicabilityThreshold: calculation.applicabilityThreshold,
    minimumTaxBase: calculation.minimumTaxBase ? calculation.minimumTaxBase.amount : null,
    rateBand: calculation.rateBand,
    minimumRatePercentage: calculation.minimumRatePercentage,
    grossMinimumTax: calculation.grossMinimumTax ? calculation.grossMinimumTax.amount : null,
    credits: calculation.credits.map(mapCredit),
    supportedCreditsTotal: calculation.supportedCreditsTotal
      ? calculation.supportedCreditsTotal.amount
      : null,
    reductions: calculation.reductions.map(mapCredit),
    supportedReductionsTotal: calculation.supportedReductionsTotal
      ? calculation.supportedReductionsTotal.amount
      : null,
    corporateRedutor: calculation.corporateRedutor
      ? mapCorporateRedutor(calculation.corporateRedutor)
      : null,
    netMinimumTax: calculation.netMinimumTax ? calculation.netMinimumTax.amount : null,
    creditExcess: calculation.creditExcess ? calculation.creditExcess.amount : null,
    incomeBreakdown: calculation.incomeBreakdown.map(mapBreakdownEntry),
    evidenceRequirements: calculation.evidenceRequirements.map(mapEvidenceRequirement),
    evidence: input.evidence,
    blockingReasons: calculation.blockingReasons,
    limitations: calculation.limitations,
    upstreamIncomeStatus: input.upstreamIncomeStatus,
    upstreamIncomeFingerprint: input.upstreamIncomeFingerprint,
    upstreamCapitalMarketFingerprint: input.upstreamCapitalMarketFingerprint,
    sourceFingerprint: calculation.sourceFingerprint,
    calculationFingerprint: calculation.calculationFingerprint,
  };
}
