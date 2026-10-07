import { createHash } from 'crypto';
import {
  HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC,
  HighIncomeMinimumTaxApplicabilityStatus,
  HighIncomeThresholdMetric,
} from './high-income';
import {
  HighIncomeReviewFilingRegistry,
  exerciseLabel,
} from './high-income-review-package-registry';

/**
 * Phase 4I.6 — High-Income Annual Review / Support Package (IRPFM, Lei 15.270/2025).
 *
 * Pure, deterministic SUPPORT/REVIEW package. It arranges, labels and serializes
 * the already-computed 4I.4 assessment read model. It performs NO tax math,
 * introduces NO second tax engine, uses NO float (canonical decimal strings only),
 * and emits NOTHING resembling a Receita file, DIRPF transmission, DARF, payment,
 * refund or Tax-AI output.
 *
 * This is NOT an official Receita file, DIRPF transmission, declaration submission,
 * Receita validation, payment instrument or DARF generator.
 */

export const HIGH_INCOME_REVIEW_PACKAGE_VERSION = 'high-income-annual-review-package-v1';

export const HIGH_INCOME_REVIEW_DISCLAIMER =
  'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL. ' +
  'Pacote de revisão e conferência da tributação mínima de alta renda (IRPFM, Lei 15.270/2025), ' +
  'referente ao Exercício 2027 (ano-calendário 2026). Não constitui transmissão, validação ou ' +
  'aceitação pela Receita Federal, não é DIRPF, DARF, pagamento, restituição nem declaração enviada.';

/** Compulsory human-review banner carried verbatim in every exported human artifact. */
export const HIGH_INCOME_REVIEW_BANNER =
  'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL';

export type ReviewPackageStatus =
  | 'READY_FOR_REVIEW' // authoritative net available; ready for human/accountant review (NOT filed/submitted/paid)
  | 'INCOMPLETE' // applicable, calculable, but net not authoritative (missing/stale evidence)
  | 'BLOCKED' // upstream income BLOCKED or ledger-level block; no reliable figures
  | 'NOT_APPLICABLE' // below threshold / not subject to IRPFM for the year
  | 'UNSUPPORTED'; // year outside supported window — safe, no fabricated figures

export interface Section1Identity {
  readonly calendarYear: number; // from read model
  readonly declarationExercise: number; // from read model — NEVER re-derived here; carried as-is
  readonly ruleVersion: string; // from read model
  readonly generatedAt: string; // echoes package.generatedAt
  readonly packageVersion: string;
}

export interface Section2Applicability {
  readonly status: HighIncomeMinimumTaxApplicabilityStatus; // read model `applicability`, copied verbatim
  readonly totalAnnualIncome: string | null; // null when unknown — never "0"
  readonly eligibilityThreshold: string | null; // read model `applicabilityThreshold`
  readonly thresholdMetric: HighIncomeThresholdMetric; // = HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC
  readonly applicable: boolean | null; // derived from frozen enum; null when undetermined
  readonly blockingReasons: readonly string[]; // copied from read model
}

export interface Section3IncomeRow {
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

export interface Section3IncomeComposition {
  readonly rows: readonly Section3IncomeRow[];
}

export interface Section4Calculation {
  readonly minimumTaxBase: string | null;
  readonly rateBand: string | null;
  readonly minimumRatePercentage: string | null;
  readonly grossMinimumTax: string | null;
  readonly supportedCreditsTotal: string | null;
  readonly supportedReductionsTotal: string | null;
  readonly corporateRedutorSupportedTotal: string | null; // = corporateRedutor.totalSupportedReduction (copied)
  readonly netMinimumTax: string | null; // null unless authoritative
  readonly creditExcess: string | null;
  readonly netIsAuthoritative: boolean; // true only when status === READY_FOR_REVIEW
}

export interface Section5CreditRow {
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

export interface Section5Credits {
  readonly credits: readonly Section5CreditRow[];
  readonly reductions: readonly Section5CreditRow[];
  readonly supportedCreditsTotal: string | null;
  readonly supportedReductionsTotal: string | null;
}

export interface Section6Payer {
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

export interface Section6CorporateRedutor {
  readonly present: boolean; // false when read model corporateRedutor === null
  readonly aggregateVersion: string | null;
  readonly status: string | null;
  readonly payerCount: number;
  readonly computedPayerCount: number;
  readonly totalEligibleDividends: string | null;
  readonly totalReductionExact: string | null;
  readonly totalSupportedReduction: string | null;
  readonly payers: readonly Section6Payer[]; // one row per read-model payer, verbatim, sorted by payerId ASC
  readonly blockingPayers: readonly string[];
  readonly blockingReasons: readonly string[];
}

export interface Section7RequirementGroup {
  readonly requirementId: string;
  readonly requirement: string;
  readonly subjectId: string;
  readonly title: string;
  readonly status: string;
  readonly legalReference: string;
  readonly blockingReason: string | null;
}

export interface Section7EvidenceRow {
  readonly rowKey: string; // `${evidenceType}:${payerId ?? '_ANNUAL_'}:${revision}` — NO DB id
  readonly evidenceType: string;
  readonly payerId: string | null; // business payer key, already UI-surfaced
  readonly authority: string;
  readonly evidenceSource: string;
  readonly conflictStatus: string;
  readonly stale: boolean;
  readonly revision: number;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface Section7Counts {
  readonly total: number;
  readonly ready: number;
  readonly missing: number;
  readonly stale: number;
  readonly conflicting: number;
  readonly unsupported: number;
}

export interface Section7Readiness {
  readonly counts: Section7Counts;
  readonly requirements: readonly Section7RequirementGroup[]; // deterministic order
  readonly evidence: readonly Section7EvidenceRow[]; // deterministic order; NO DB id/supersedesId
}

export interface Section8Provenance {
  readonly upstreamCapitalMarketFingerprint: string;
  readonly upstreamIncomeFingerprint: string;
  readonly upstreamIncomeStatus: string;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
  readonly corporateRedutorSourceFingerprint: string | null;
  readonly corporateRedutorCalculationFingerprint: string | null;
  readonly packageFingerprint: string; // echoes top-level (export convenience)
}

export type FilingMappingStatus =
  'VERIFIED_OFFICIAL_MAPPING' | 'GENERAL_SUPPORT' | 'NO_OFFICIAL_MAPPING' | 'UNSUPPORTED';

export interface FilingSupportNote {
  readonly mappingStatus: FilingMappingStatus;
  readonly legalReference: string;
  readonly text: string;
}

export interface Section9FilingSupportNotes {
  readonly notes: readonly FilingSupportNote[];
  readonly exerciseLabel: string; // e.g. "Exercício 2027 (ano-calendário 2026)"
}

export interface HighIncomeReviewPackage {
  readonly packageVersion: string; // HIGH_INCOME_REVIEW_PACKAGE_VERSION
  readonly status: ReviewPackageStatus;
  readonly generatedAt: string; // ISO; injected by caller; EXCLUDED from fingerprint
  readonly packageFingerprint: string; // SHA-256 (generatedAt excluded)
  readonly disclaimer: string; // HIGH_INCOME_REVIEW_DISCLAIMER
  readonly section1Identity: Section1Identity;
  readonly section2Applicability: Section2Applicability;
  readonly section3IncomeComposition: Section3IncomeComposition;
  readonly section4Calculation: Section4Calculation;
  readonly section5Credits: Section5Credits;
  readonly section6CorporateRedutorByPayer: Section6CorporateRedutor;
  readonly section7Readiness: Section7Readiness;
  readonly section8Provenance: Section8Provenance;
  readonly section9FilingSupportNotes: Section9FilingSupportNotes;
}

/**
 * Minimal structural shape of the 4I.4 `AnnualHighIncomeAssessmentReadModel`
 * consumed by the assembler. Declared locally (not imported from the API layer)
 * so the pure engine keeps zero dependency on `apps/api`; it is structurally
 * compatible with the authoritative read model which the API passes in.
 */
export interface HighIncomeReviewCreditInput {
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

export interface HighIncomeReviewBreakdownInput {
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

export interface HighIncomeReviewPayerInput {
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

export interface HighIncomeReviewCorporateRedutorInput {
  readonly aggregateVersion: string;
  readonly payerCount: number;
  readonly computedPayerCount: number;
  readonly status: string;
  readonly totalEligibleDividends: string;
  readonly totalReductionExact: string;
  readonly totalSupportedReduction: string | null;
  readonly payers: readonly HighIncomeReviewPayerInput[];
  readonly blockingPayers: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
}

export interface HighIncomeReviewEvidenceRequirementInput {
  readonly requirementId: string;
  readonly requirement: string;
  readonly subjectId: string;
  readonly title: string;
  readonly status: string;
  readonly legalReference: string;
  readonly blockingReason: string | null;
}

export interface HighIncomeReviewEvidenceStateInput {
  readonly id: string; // DB UUID — used ONLY as in-memory sort tiebreaker; never emitted
  readonly evidenceType: string;
  readonly payerId: string | null;
  readonly authority: string;
  readonly evidenceSource: string;
  readonly conflictStatus: string;
  readonly stale: boolean;
  readonly revision: number;
  readonly supersedesId: string | null; // DB UUID — never emitted
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface HighIncomeReviewAssessmentInput {
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
  readonly credits: readonly HighIncomeReviewCreditInput[];
  readonly supportedCreditsTotal: string | null;
  readonly reductions: readonly HighIncomeReviewCreditInput[];
  readonly supportedReductionsTotal: string | null;
  readonly corporateRedutor: HighIncomeReviewCorporateRedutorInput | null;
  readonly netMinimumTax: string | null;
  readonly creditExcess: string | null;
  readonly incomeBreakdown: readonly HighIncomeReviewBreakdownInput[];
  readonly evidenceRequirements: readonly HighIncomeReviewEvidenceRequirementInput[];
  readonly evidence: readonly HighIncomeReviewEvidenceStateInput[];
  readonly blockingReasons: readonly string[];
  readonly limitations: readonly string[];
  readonly upstreamIncomeStatus: string;
  readonly upstreamIncomeFingerprint: string;
  readonly upstreamCapitalMarketFingerprint: string;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
}

export interface BuildHighIncomeReviewPackageOptions {
  readonly generatedAt: string; // ISO string; injected — assembler NEVER calls Date.now()/new Date()
}

/**
 * Canonical fingerprint input — EXCLUDES `generatedAt`. All arrays are already
 * canonically sorted by the assembler before this object is hashed.
 */
export interface HighIncomeReviewFingerprintInput {
  readonly packageVersion: string;
  readonly ruleVersion: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly status: ReviewPackageStatus;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
  readonly upstreamIncomeFingerprint: string;
  readonly upstreamCapitalMarketFingerprint: string;
  readonly section2Applicability: Section2Applicability;
  readonly section3IncomeComposition: Section3IncomeComposition;
  readonly section4Calculation: Section4Calculation;
  readonly section5Credits: Section5Credits;
  readonly section6CorporateRedutorByPayer: Section6CorporateRedutor;
  readonly section7Readiness: Section7Readiness;
  readonly section9FilingSupportNotes: Section9FilingSupportNotes;
}

/**
 * Pure, recursive, deterministic canonical stringify. Object keys are sorted
 * lexicographically; arrays keep their (already canonically sorted) order.
 * In-repo helper — NO third-party dependency.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

export function computeHighIncomeReviewPackageFingerprint(
  canonicalContent: HighIncomeReviewFingerprintInput,
): string {
  return createHash('sha256').update(stableStringify(canonicalContent), 'utf8').digest('hex');
}

const PAYER_ANNUAL_SENTINEL = '_ANNUAL_';

function sortedPayers(
  payers: readonly HighIncomeReviewPayerInput[],
): readonly HighIncomeReviewPayerInput[] {
  return [...payers].sort((a, b) => (a.payerId < b.payerId ? -1 : a.payerId > b.payerId ? 1 : 0));
}

function sortedBreakdown(
  rows: readonly HighIncomeReviewBreakdownInput[],
): readonly HighIncomeReviewBreakdownInput[] {
  return [...rows].sort((a, b) => {
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    if (a.classification !== b.classification) return a.classification < b.classification ? -1 : 1;
    return 0;
  });
}

function sortedRequirements(
  requirements: readonly HighIncomeReviewEvidenceRequirementInput[],
): readonly HighIncomeReviewEvidenceRequirementInput[] {
  return [...requirements].sort((a, b) =>
    a.requirementId < b.requirementId ? -1 : a.requirementId > b.requirementId ? 1 : 0,
  );
}

function payerKeyOf(evidence: HighIncomeReviewEvidenceStateInput): string {
  return evidence.payerId ?? PAYER_ANNUAL_SENTINEL;
}

function sortedEvidence(
  evidence: readonly HighIncomeReviewEvidenceStateInput[],
): readonly HighIncomeReviewEvidenceStateInput[] {
  return [...evidence].sort((a, b) => {
    if (a.evidenceType !== b.evidenceType) return a.evidenceType < b.evidenceType ? -1 : 1;
    const ak = payerKeyOf(a);
    const bk = payerKeyOf(b);
    if (ak !== bk) return ak < bk ? -1 : 1;
    if (a.revision !== b.revision) return a.revision - b.revision;
    // DB id used ONLY as a final in-memory tiebreaker; never emitted
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

/**
 * Section 7 bucket classification for one evidence row.
 * Precedence: conflicting > stale > unsupported > ready.
 */
type EvidenceBucket = 'conflicting' | 'stale' | 'unsupported' | 'ready';

function classifyEvidenceBucket(evidence: HighIncomeReviewEvidenceStateInput): EvidenceBucket {
  if (evidence.conflictStatus === 'CONFLICT') return 'conflicting';
  if (evidence.stale === true) return 'stale';
  if (evidence.evidenceType === 'UNSUPPORTED' || evidence.conflictStatus === 'UNSUPPORTED') {
    return 'unsupported';
  }
  return 'ready';
}

function deriveApplicable(
  applicability: string,
  totalAnnualIncome: string | null,
  eligibilityThreshold: string | null,
): boolean | null {
  // Fail-closed null-override: never a settled boolean when either operand is unknown.
  if (totalAnnualIncome === null || eligibilityThreshold === null) {
    return null;
  }
  switch (applicability) {
    case 'APPLICABLE':
      return true;
    case 'NOT_APPLICABLE':
      return false;
    case 'REQUIRES_CONFIRMATION':
    case 'BLOCKED':
    case 'UNSUPPORTED_YEAR':
    default:
      return null;
  }
}

function derivePackageStatus(input: HighIncomeReviewAssessmentInput): ReviewPackageStatus {
  const applicability = input.applicability;
  // Top-down precedence: UNSUPPORTED -> BLOCKED -> NOT_APPLICABLE -> READY_FOR_REVIEW -> INCOMPLETE
  if (applicability === 'UNSUPPORTED_YEAR') {
    return 'UNSUPPORTED';
  }
  if (
    input.status === 'BLOCKED' ||
    applicability === 'BLOCKED' ||
    input.upstreamIncomeStatus === 'BLOCKED' ||
    input.blockingReasons.length > 0
  ) {
    return 'BLOCKED';
  }
  if (applicability === 'NOT_APPLICABLE') {
    return 'NOT_APPLICABLE';
  }
  if (applicability === 'APPLICABLE' && input.netMinimumTax !== null) {
    return 'READY_FOR_REVIEW';
  }
  return 'INCOMPLETE';
}

/**
 * Pure assembler. Copies every read-model field verbatim into the right section;
 * performs NO tax arithmetic and uses NO float. `generatedAt` is injected and is
 * EXCLUDED from the fingerprint.
 */
export function buildHighIncomeAnnualReviewPackage(
  readModel: HighIncomeReviewAssessmentInput,
  options: BuildHighIncomeReviewPackageOptions,
): HighIncomeReviewPackage {
  const generatedAt = options.generatedAt;
  const status = derivePackageStatus(readModel);
  const netIsAuthoritative = status === 'READY_FOR_REVIEW';

  const section1Identity: Section1Identity = {
    calendarYear: readModel.calendarYear,
    declarationExercise: readModel.declarationExercise,
    ruleVersion: readModel.ruleVersion,
    generatedAt,
    packageVersion: HIGH_INCOME_REVIEW_PACKAGE_VERSION,
  };

  const section2Applicability: Section2Applicability = {
    status: readModel.applicability as HighIncomeMinimumTaxApplicabilityStatus,
    totalAnnualIncome: readModel.totalAnnualIncome,
    eligibilityThreshold: readModel.applicabilityThreshold,
    thresholdMetric: HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC,
    applicable: deriveApplicable(
      readModel.applicability,
      readModel.totalAnnualIncome,
      readModel.applicabilityThreshold,
    ),
    blockingReasons: [...readModel.blockingReasons],
  };

  const section3IncomeComposition: Section3IncomeComposition = {
    rows: sortedBreakdown(readModel.incomeBreakdown).map((entry) => ({
      category: entry.category,
      classification: entry.classification,
      grossAmount: entry.grossAmount,
      includedAmount: entry.includedAmount,
      excludedAmount: entry.excludedAmount,
      itemCount: entry.itemCount,
      payerIds: [...entry.payerIds],
      reason: entry.reason,
      legalReference: entry.legalReference,
    })),
  };

  const section4Calculation: Section4Calculation = {
    minimumTaxBase: readModel.minimumTaxBase,
    rateBand: readModel.rateBand,
    minimumRatePercentage: readModel.minimumRatePercentage,
    grossMinimumTax: readModel.grossMinimumTax,
    supportedCreditsTotal: readModel.supportedCreditsTotal,
    supportedReductionsTotal: readModel.supportedReductionsTotal,
    corporateRedutorSupportedTotal: readModel.corporateRedutor
      ? readModel.corporateRedutor.totalSupportedReduction
      : null,
    netMinimumTax: netIsAuthoritative ? readModel.netMinimumTax : null,
    creditExcess: readModel.creditExcess,
    netIsAuthoritative,
  };

  const mapCredit = (credit: HighIncomeReviewCreditInput): Section5CreditRow => ({
    kind: credit.kind,
    role: credit.role,
    supported: credit.supported,
    provided: credit.provided,
    amount: credit.amount,
    applied: credit.applied,
    requiredForNet: credit.requiredForNet,
    legalReference: credit.legalReference,
    reason: credit.reason,
  });

  const section5Credits: Section5Credits = {
    credits: readModel.credits.map(mapCredit),
    reductions: readModel.reductions.map(mapCredit),
    supportedCreditsTotal: readModel.supportedCreditsTotal,
    supportedReductionsTotal: readModel.supportedReductionsTotal,
  };

  const redutor = readModel.corporateRedutor;
  const section6CorporateRedutorByPayer: Section6CorporateRedutor = redutor
    ? {
        present: true,
        aggregateVersion: redutor.aggregateVersion,
        status: redutor.status,
        payerCount: redutor.payerCount,
        computedPayerCount: redutor.computedPayerCount,
        totalEligibleDividends: redutor.totalEligibleDividends,
        totalReductionExact: redutor.totalReductionExact,
        totalSupportedReduction: redutor.totalSupportedReduction,
        payers: sortedPayers(redutor.payers).map((payer) => ({
          payerId: payer.payerId,
          payerType: payer.payerType,
          status: payer.status,
          referenceRatePercentage: payer.referenceRatePercentage,
          corporateEffectiveRatePercentage: payer.corporateEffectiveRatePercentage,
          pfEffectiveRatePercentage: payer.pfEffectiveRatePercentage,
          eligibleDividends: payer.eligibleDividends,
          reductionExact: payer.reductionExact,
          evidenceStatus: payer.evidenceStatus,
          blockingReasons: [...payer.blockingReasons],
          sourceFingerprint: payer.sourceFingerprint,
        })),
        blockingPayers: [...redutor.blockingPayers],
        blockingReasons: [...redutor.blockingReasons],
      }
    : {
        present: false,
        aggregateVersion: null,
        status: null,
        payerCount: 0,
        computedPayerCount: 0,
        totalEligibleDividends: null,
        totalReductionExact: null,
        totalSupportedReduction: null,
        payers: [],
        blockingPayers: [],
        blockingReasons: [],
      };

  const requirements: readonly Section7RequirementGroup[] = sortedRequirements(
    readModel.evidenceRequirements,
  ).map((req) => ({
    requirementId: req.requirementId,
    requirement: req.requirement,
    subjectId: req.subjectId,
    title: req.title,
    status: req.status,
    legalReference: req.legalReference,
    blockingReason: req.blockingReason,
  }));

  const orderedEvidence = sortedEvidence(readModel.evidence);
  const evidenceRows: Section7EvidenceRow[] = orderedEvidence.map((evidence) => ({
    rowKey: `${evidence.evidenceType}:${payerKeyOf(evidence)}:${evidence.revision}`,
    evidenceType: evidence.evidenceType,
    payerId: evidence.payerId,
    authority: evidence.authority,
    evidenceSource: evidence.evidenceSource,
    conflictStatus: evidence.conflictStatus,
    stale: evidence.stale,
    revision: evidence.revision,
    sourceFingerprint: evidence.sourceFingerprint,
    fingerprint: evidence.fingerprint,
  }));

  let ready = 0;
  let stale = 0;
  let conflicting = 0;
  let unsupported = 0;
  for (const evidence of orderedEvidence) {
    switch (classifyEvidenceBucket(evidence)) {
      case 'conflicting':
        conflicting += 1;
        break;
      case 'stale':
        stale += 1;
        break;
      case 'unsupported':
        unsupported += 1;
        break;
      case 'ready':
        ready += 1;
        break;
    }
  }
  // `missing`: requirements not satisfied and with no evidence row present.
  let missing = 0;
  for (const req of requirements) {
    if (req.status !== 'SATISFIED') {
      missing += 1;
    }
  }

  const counts: Section7Counts = {
    total: evidenceRows.length + missing,
    ready,
    missing,
    stale,
    conflicting,
    unsupported,
  };

  const section7Readiness: Section7Readiness = {
    counts,
    requirements,
    evidence: evidenceRows,
  };

  const section9FilingSupportNotes: Section9FilingSupportNotes = {
    notes: HighIncomeReviewFilingRegistry.getNotes(),
    exerciseLabel: exerciseLabel(),
  };

  const fingerprintInput: HighIncomeReviewFingerprintInput = {
    packageVersion: HIGH_INCOME_REVIEW_PACKAGE_VERSION,
    ruleVersion: readModel.ruleVersion,
    calendarYear: readModel.calendarYear,
    declarationExercise: readModel.declarationExercise,
    status,
    sourceFingerprint: readModel.sourceFingerprint,
    calculationFingerprint: readModel.calculationFingerprint,
    upstreamIncomeFingerprint: readModel.upstreamIncomeFingerprint,
    upstreamCapitalMarketFingerprint: readModel.upstreamCapitalMarketFingerprint,
    section2Applicability,
    section3IncomeComposition,
    section4Calculation,
    section5Credits,
    section6CorporateRedutorByPayer,
    section7Readiness,
    section9FilingSupportNotes,
  };

  const packageFingerprint = computeHighIncomeReviewPackageFingerprint(fingerprintInput);

  const section8Provenance: Section8Provenance = {
    upstreamCapitalMarketFingerprint: readModel.upstreamCapitalMarketFingerprint,
    upstreamIncomeFingerprint: readModel.upstreamIncomeFingerprint,
    upstreamIncomeStatus: readModel.upstreamIncomeStatus,
    sourceFingerprint: readModel.sourceFingerprint,
    calculationFingerprint: readModel.calculationFingerprint,
    corporateRedutorSourceFingerprint: redutor ? redutor.sourceFingerprint : null,
    corporateRedutorCalculationFingerprint: redutor ? redutor.calculationFingerprint : null,
    packageFingerprint,
  };

  return {
    packageVersion: HIGH_INCOME_REVIEW_PACKAGE_VERSION,
    status,
    generatedAt,
    packageFingerprint,
    disclaimer: HIGH_INCOME_REVIEW_DISCLAIMER,
    section1Identity,
    section2Applicability,
    section3IncomeComposition,
    section4Calculation,
    section5Credits,
    section6CorporateRedutorByPayer,
    section7Readiness,
    section8Provenance,
    section9FilingSupportNotes,
  };
}
