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
