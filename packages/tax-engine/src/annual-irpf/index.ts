export {
  isValidCalendarYear,
  createCalendarYear,
  parseCalendarYear,
  isValidDeclarationExercise,
  createDeclarationExercise,
  parseDeclarationExercise,
  resolveDeclarationExercise,
  resolveOrdinaryDeclarationExercise,
  createAnnualTaxPeriod,
} from './annual-period';
export type { CalendarYear, DeclarationExercise, AnnualTaxPeriod } from './annual-period';

export {
  OPENING_POSITION_SOURCES,
  OPENING_POSITION_STATUSES,
  computeOpeningPositionFingerprint,
  createAnnualOpeningPosition,
} from './annual-opening-position';
export type {
  OpeningPositionSource,
  OpeningPositionStatus,
  AnnualOpeningPositionInput,
  OpeningPositionFingerprintInput,
  CreateOpeningPositionDomainInput,
} from './annual-opening-position';

export {
  ANNUAL_POSITION_COMPLETENESS_STATUSES,
  ANNUAL_POSITION_BLOCKING_REASONS,
} from './annual-position';
export type {
  AnnualPositionCompleteness,
  AnnualPositionBlockingReason,
  AnnualPositionTrace,
  AnnualPosition,
  AnnualPositionSummary,
  AnnualPositionReport,
} from './annual-position';

export { buildAnnualPositionReport } from './annual-position-engine';
export type {
  AssetMetadata,
  AssetMetadataResolver,
  BuildAnnualPositionReportInput,
} from './annual-position-engine';

export type {
  AnnualMonthlyCategorySnapshot,
  AnnualMonthlyDarf6015Snapshot,
  AnnualMonthlyFiscalSnapshot,
  AnnualNormalEquitySummary,
  AnnualDayTradeSummary,
  AnnualFiiSummary,
  AnnualCategoryLossContinuity,
  AnnualLossCarrySummary,
  Annual6015Summary,
  AnnualCapitalMarketFiscalSummary,
} from './annual-capital-market-summary';

export { buildAnnualCapitalMarketSummary } from './annual-capital-market-summary-engine';
export type {
  MonthlyCategoryInputData,
  MonthlyDarf6015InputData,
  MonthlyFiscalInputData,
  BuildAnnualCapitalMarketSummaryInput,
} from './annual-capital-market-summary-engine';

export type {
  IncomeType,
  IncomeTaxTreatment,
  IncomeCompletenessStatus,
  AnnualIncomeEvent,
  AnnualIncomeCategorySummary,
  AnnualIncomePayerSummary,
  AnnualMonthlyIncomeSnapshot,
  AnnualInvestmentIncomeSummary,
} from './annual-investment-income';

export {
  classifyIncomeEvent,
  buildAnnualInvestmentIncomeSummary,
} from './annual-investment-income-engine';
export type {
  FiiEligibilityData,
  DividendTransitionEligibility,
  DividendTransitionEvidence,
  IncomeEventInputData,
  BuildAnnualInvestmentIncomeSummaryInput,
} from './annual-investment-income-engine';

export type {
  AnnualTaxReadinessStatus,
  AnnualReadinessSectionKey,
  TaxpayerConfirmationScope,
  TaxpayerConfirmationStatus,
  EvidenceRequirementStatus,
  TaxpayerConfirmation,
  AnnualEvidenceRequirement,
  AnnualReadinessSectionSummary,
  AnnualTaxReadinessAssessment,
} from './annual-tax-readiness';
export {
  READINESS_STATUS_SEVERITY,
  resolveOverallReadinessStatus,
  computeReadinessFingerprint,
} from './annual-tax-readiness';
export { buildAnnualTaxReadinessAssessment } from './annual-tax-readiness-engine';
export type { AnnualReadinessEngineInput } from './annual-tax-readiness-engine';

export type {
  AnnualTaxReportingSection,
  ReportingCategoryStatus,
  AnnualTaxReportingItem,
  AnnualTaxReportingSectionSummary,
  AnnualTaxReportingPackage,
} from './annual-tax-reporting';
export {
  ANNUAL_REPORTING_DISCLAIMER,
  computeReportingPackageFingerprint,
} from './annual-tax-reporting';
export { AnnualTaxReportingRuleRegistry } from './annual-tax-reporting-registry';
export type { ReportingRuleMapping } from './annual-tax-reporting-registry';
export { buildAnnualTaxReportingPackage } from './annual-tax-reporting-engine';
export type { AnnualTaxReportingEngineInput } from './annual-tax-reporting-engine';
export { exportAnnualTaxReportingToCsv } from './annual-tax-reporting-export';

export { escapeCsvCell } from './csv-escape';

// --- Phase 4I.1: high-income minimum tax legal & data foundation (Lei 15.270/2025) ---
export * from './high-income';

// --- Phase 4I.6: high-income annual review / support package, fingerprint & export ---
export {
  HIGH_INCOME_REVIEW_PACKAGE_VERSION,
  HIGH_INCOME_REVIEW_DISCLAIMER,
  HIGH_INCOME_REVIEW_BANNER,
  stableStringify,
  computeHighIncomeReviewPackageFingerprint,
  buildHighIncomeAnnualReviewPackage,
} from './high-income-review-package';
export type {
  ReviewPackageStatus,
  FilingMappingStatus,
  FilingSupportNote,
  Section1Identity,
  Section2Applicability,
  Section3IncomeRow,
  Section3IncomeComposition,
  Section4Calculation,
  Section5CreditRow,
  Section5Credits,
  Section6Payer,
  Section6CorporateRedutor,
  Section7RequirementGroup,
  Section7EvidenceRow,
  Section7Counts,
  Section7Readiness,
  Section8Provenance,
  Section9FilingSupportNotes,
  HighIncomeReviewPackage,
  HighIncomeReviewFingerprintInput,
  BuildHighIncomeReviewPackageOptions,
  HighIncomeReviewAssessmentInput,
  HighIncomeReviewCreditInput,
  HighIncomeReviewBreakdownInput,
  HighIncomeReviewPayerInput,
  HighIncomeReviewCorporateRedutorInput,
  HighIncomeReviewEvidenceRequirementInput,
  HighIncomeReviewEvidenceStateInput,
} from './high-income-review-package';
export {
  HighIncomeReviewFilingRegistry,
  exerciseLabel,
} from './high-income-review-package-registry';
export {
  serializeHighIncomeReviewPackageToJson,
  exportHighIncomeReviewPackageToCsv,
} from './high-income-review-package-export';
