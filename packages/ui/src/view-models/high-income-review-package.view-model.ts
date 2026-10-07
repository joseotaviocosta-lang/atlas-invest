import { formatCurrency, formatPercentage } from '../formatters';

/**
 * Phase 4I.6 — High-Income Annual Review / Support Package UI mirror.
 *
 * `RawHighIncomeReviewPackage` is a structurally-identical, hand-maintained
 * MIRROR of the authoritative `HighIncomeReviewPackage` defined in
 * `@atlas/tax-engine`. It is NOT a re-export: `@atlas/ui` has no dependency on
 * `@atlas/tax-engine` (AGENTS.md §2.2/§2.4), so the engine type cannot be
 * imported here without leaking engine code (and Node `crypto`) into the web
 * bundle. The two shapes are kept in lock-step by a tax-engine assignability
 * test (anti-drift guard). The JSON wire shape is identical, so the mirror is
 * structurally interchangeable with the serialized engine package.
 *
 * This module performs NO tax math and NO float arithmetic — it only formats
 * canonical decimal strings via the safe `@atlas/ui` formatters.
 */

export function highIncomeReviewPackageQueryKey(calendarYear: number | string): readonly string[] {
  return ['fiscal', 'annual', String(calendarYear), 'high-income', 'review'];
}

export type RawReviewPackageStatus =
  'READY_FOR_REVIEW' | 'INCOMPLETE' | 'BLOCKED' | 'NOT_APPLICABLE' | 'UNSUPPORTED';

export type RawFilingMappingStatus =
  'VERIFIED_OFFICIAL_MAPPING' | 'GENERAL_SUPPORT' | 'NO_OFFICIAL_MAPPING' | 'UNSUPPORTED';

export interface RawReviewSection1Identity {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersion: string;
  readonly generatedAt: string;
  readonly packageVersion: string;
}

export interface RawReviewSection2Applicability {
  readonly status: string;
  readonly totalAnnualIncome: string | null;
  readonly eligibilityThreshold: string | null;
  readonly thresholdMetric: string;
  readonly applicable: boolean | null;
  readonly blockingReasons: readonly string[];
}

export interface RawReviewSection3IncomeRow {
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

export interface RawReviewSection3IncomeComposition {
  readonly rows: readonly RawReviewSection3IncomeRow[];
}

export interface RawReviewSection4Calculation {
  readonly minimumTaxBase: string | null;
  readonly rateBand: string | null;
  readonly minimumRatePercentage: string | null;
  readonly grossMinimumTax: string | null;
  readonly supportedCreditsTotal: string | null;
  readonly supportedReductionsTotal: string | null;
  readonly corporateRedutorSupportedTotal: string | null;
  readonly netMinimumTax: string | null;
  readonly creditExcess: string | null;
  readonly netIsAuthoritative: boolean;
}

export interface RawReviewSection5CreditRow {
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

export interface RawReviewSection5Credits {
  readonly credits: readonly RawReviewSection5CreditRow[];
  readonly reductions: readonly RawReviewSection5CreditRow[];
  readonly supportedCreditsTotal: string | null;
  readonly supportedReductionsTotal: string | null;
}

export interface RawReviewSection6Payer {
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

export interface RawReviewSection6CorporateRedutor {
  readonly present: boolean;
  readonly aggregateVersion: string | null;
  readonly status: string | null;
  readonly payerCount: number;
  readonly computedPayerCount: number;
  readonly totalEligibleDividends: string | null;
  readonly totalReductionExact: string | null;
  readonly totalSupportedReduction: string | null;
  readonly payers: readonly RawReviewSection6Payer[];
  readonly blockingPayers: readonly string[];
  readonly blockingReasons: readonly string[];
}

export interface RawReviewSection7RequirementGroup {
  readonly requirementId: string;
  readonly requirement: string;
  readonly subjectId: string;
  readonly title: string;
  readonly status: string;
  readonly legalReference: string;
  readonly blockingReason: string | null;
}

export interface RawReviewSection7EvidenceRow {
  readonly rowKey: string;
  readonly evidenceType: string;
  readonly payerId: string | null;
  readonly authority: string;
  readonly evidenceSource: string;
  readonly conflictStatus: string;
  readonly stale: boolean;
  readonly revision: number;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface RawReviewSection7Counts {
  readonly total: number;
  readonly ready: number;
  readonly missing: number;
  readonly stale: number;
  readonly conflicting: number;
  readonly unsupported: number;
}

export interface RawReviewSection7Readiness {
  readonly counts: RawReviewSection7Counts;
  readonly requirements: readonly RawReviewSection7RequirementGroup[];
  readonly evidence: readonly RawReviewSection7EvidenceRow[];
}

export interface RawReviewSection8Provenance {
  readonly upstreamCapitalMarketFingerprint: string;
  readonly upstreamIncomeFingerprint: string;
  readonly upstreamIncomeStatus: string;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string;
  readonly corporateRedutorSourceFingerprint: string | null;
  readonly corporateRedutorCalculationFingerprint: string | null;
  readonly packageFingerprint: string;
}

export interface RawReviewFilingSupportNote {
  readonly mappingStatus: RawFilingMappingStatus;
  readonly legalReference: string;
  readonly text: string;
}

export interface RawReviewSection9FilingSupportNotes {
  readonly notes: readonly RawReviewFilingSupportNote[];
  readonly exerciseLabel: string;
}

export interface RawHighIncomeReviewPackage {
  readonly packageVersion: string;
  readonly status: RawReviewPackageStatus;
  readonly generatedAt: string;
  readonly packageFingerprint: string;
  readonly disclaimer: string;
  readonly section1Identity: RawReviewSection1Identity;
  readonly section2Applicability: RawReviewSection2Applicability;
  readonly section3IncomeComposition: RawReviewSection3IncomeComposition;
  readonly section4Calculation: RawReviewSection4Calculation;
  readonly section5Credits: RawReviewSection5Credits;
  readonly section6CorporateRedutorByPayer: RawReviewSection6CorporateRedutor;
  readonly section7Readiness: RawReviewSection7Readiness;
  readonly section8Provenance: RawReviewSection8Provenance;
  readonly section9FilingSupportNotes: RawReviewSection9FilingSupportNotes;
}

const NA_LABEL = 'Não disponível';

function money(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return NA_LABEL;
  }
  return formatCurrency(value, 'BRL');
}

function rate(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return NA_LABEL;
  }
  return formatPercentage(value, {});
}

export function highIncomeReviewPackageStatusLabel(status: string): string {
  switch (status) {
    case 'READY_FOR_REVIEW':
      return 'Pronto para revisão';
    case 'INCOMPLETE':
      return 'Incompleto';
    case 'BLOCKED':
      return 'Bloqueado';
    case 'NOT_APPLICABLE':
      return 'Não aplicável';
    case 'UNSUPPORTED':
      return 'Não suportado';
    default:
      return 'Status desconhecido';
  }
}

export function highIncomeApplicableLabel(applicable: boolean | null): string {
  if (applicable === null) {
    return NA_LABEL;
  }
  return applicable ? 'Sim' : 'Não';
}

export function highIncomeFilingMappingStatusLabel(status: string): string {
  switch (status) {
    case 'VERIFIED_OFFICIAL_MAPPING':
      return 'Mapeamento oficial verificado';
    case 'GENERAL_SUPPORT':
      return 'Apoio geral';
    case 'NO_OFFICIAL_MAPPING':
      return 'Sem mapeamento oficial';
    case 'UNSUPPORTED':
      return 'Não suportado';
    default:
      return 'Status desconhecido';
  }
}

export interface HighIncomeReviewPackageViewModel {
  readonly packageVersion: string;
  readonly status: RawReviewPackageStatus;
  readonly statusLabel: string;
  readonly generatedAt: string;
  readonly packageFingerprint: string;
  readonly disclaimer: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersion: string;
  readonly exerciseLabel: string;
  readonly applicability: {
    readonly status: string;
    readonly applicable: boolean | null;
    readonly applicableLabel: string;
    readonly formattedTotalAnnualIncome: string;
    readonly formattedEligibilityThreshold: string;
    readonly thresholdMetric: string;
    readonly blockingReasons: readonly string[];
  };
  readonly calculation: {
    readonly formattedMinimumTaxBase: string;
    readonly rateBand: string | null;
    readonly formattedMinimumRate: string;
    readonly formattedGrossMinimumTax: string;
    readonly formattedSupportedCreditsTotal: string;
    readonly formattedSupportedReductionsTotal: string;
    readonly formattedCorporateRedutorSupportedTotal: string;
    readonly formattedNetMinimumTax: string;
    readonly formattedCreditExcess: string;
    readonly netIsAuthoritative: boolean;
  };
  readonly readinessCounts: RawReviewSection7Counts;
  readonly isStale: boolean;
  readonly notes: readonly {
    readonly mappingStatus: RawFilingMappingStatus;
    readonly mappingStatusLabel: string;
    readonly legalReference: string;
    readonly text: string;
  }[];
}

function isReviewPackageStructure(data: unknown): data is RawHighIncomeReviewPackage {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  const pkg = data as Record<string, unknown>;
  return (
    typeof pkg.packageVersion === 'string' &&
    typeof pkg.status === 'string' &&
    typeof pkg.packageFingerprint === 'string' &&
    typeof pkg.section1Identity === 'object' &&
    pkg.section1Identity !== null &&
    typeof pkg.section2Applicability === 'object' &&
    pkg.section2Applicability !== null &&
    typeof pkg.section4Calculation === 'object' &&
    pkg.section4Calculation !== null &&
    typeof pkg.section7Readiness === 'object' &&
    pkg.section7Readiness !== null &&
    typeof pkg.section9FilingSupportNotes === 'object' &&
    pkg.section9FilingSupportNotes !== null
  );
}

/**
 * Formats the serialized review package into a presentation view-model. Returns
 * `null` for any malformed/missing input (fail-safe: the UI renders EmptyState).
 * NO tax math; only safe decimal-string formatting.
 */
export function formatHighIncomeReviewPackageViewModel(
  data: RawHighIncomeReviewPackage | null | undefined,
): HighIncomeReviewPackageViewModel | null {
  if (!isReviewPackageStructure(data)) {
    return null;
  }

  const counts = data.section7Readiness.counts;
  const anyEvidenceStale = data.section7Readiness.evidence.some((row) => row.stale === true);
  const isStale = counts.stale > 0 || anyEvidenceStale;

  return {
    packageVersion: data.packageVersion,
    status: data.status,
    statusLabel: highIncomeReviewPackageStatusLabel(data.status),
    generatedAt: data.generatedAt,
    packageFingerprint: data.packageFingerprint,
    disclaimer: data.disclaimer,
    calendarYear: data.section1Identity.calendarYear,
    declarationExercise: data.section1Identity.declarationExercise,
    ruleVersion: data.section1Identity.ruleVersion,
    exerciseLabel: data.section9FilingSupportNotes.exerciseLabel,
    applicability: {
      status: data.section2Applicability.status,
      applicable: data.section2Applicability.applicable,
      applicableLabel: highIncomeApplicableLabel(data.section2Applicability.applicable),
      formattedTotalAnnualIncome: money(data.section2Applicability.totalAnnualIncome),
      formattedEligibilityThreshold: money(data.section2Applicability.eligibilityThreshold),
      thresholdMetric: data.section2Applicability.thresholdMetric,
      blockingReasons: data.section2Applicability.blockingReasons,
    },
    calculation: {
      formattedMinimumTaxBase: money(data.section4Calculation.minimumTaxBase),
      rateBand: data.section4Calculation.rateBand,
      formattedMinimumRate: rate(data.section4Calculation.minimumRatePercentage),
      formattedGrossMinimumTax: money(data.section4Calculation.grossMinimumTax),
      formattedSupportedCreditsTotal: money(data.section4Calculation.supportedCreditsTotal),
      formattedSupportedReductionsTotal: money(data.section4Calculation.supportedReductionsTotal),
      formattedCorporateRedutorSupportedTotal: money(
        data.section4Calculation.corporateRedutorSupportedTotal,
      ),
      formattedNetMinimumTax: money(data.section4Calculation.netMinimumTax),
      formattedCreditExcess: money(data.section4Calculation.creditExcess),
      netIsAuthoritative: data.section4Calculation.netIsAuthoritative,
    },
    readinessCounts: counts,
    isStale,
    notes: data.section9FilingSupportNotes.notes.map((note) => ({
      mappingStatus: note.mappingStatus,
      mappingStatusLabel: highIncomeFilingMappingStatusLabel(note.mappingStatus),
      legalReference: note.legalReference,
      text: note.text,
    })),
  };
}
