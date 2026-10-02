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
