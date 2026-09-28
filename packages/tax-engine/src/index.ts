/**
 * @atlas/tax-engine — Phase 4A Brazilian Tax Engine Foundation.
 *
 * Pure, deterministic, zero-I/O fiscal domain. Derives auditable fiscal events
 * and a normalized Monthly Tax State from the canonical immutable transaction
 * ledger. It does NOT compute payable tax, DARF, or IRPF (ADR-235, ADR-240).
 *
 * Hard boundaries: no Prisma, no React/Next/Nest, no OpenAI/provider SDK, no
 * network, no browser APIs, no AI engine, no market-intelligence dependency.
 */
export {
  TAX_ENGINE_VERSION,
  FISCAL_PROJECTION_VERSION,
  CALCULATION_VERSION,
  DEFAULT_TAX_JURISDICTION,
  SUPPORTED_FISCAL_CURRENCIES,
} from './version';

export type { FiscalEventId, TaxSubjectId } from './ids';
export { createTaxSubjectId, deriveFiscalEventId } from './ids';

export {
  TaxEngineError,
  TaxRuleOverlapError,
  InvalidTaxRuleSetError,
  InvalidFiscalCompetenceError,
  UnsupportedTaxOperationError,
} from './errors';

export {
  TAX_ASSET_CATEGORIES,
  FISCAL_EVENT_TYPES,
  FISCAL_RELEVANCES,
  FISCAL_DATA_QUALITY_ISSUES,
  FISCAL_STATE_STATUSES,
  TAX_RULE_SET_STATUSES,
  TAX_CATEGORY_CAPABILITIES,
} from './types';
export type {
  TaxAssetCategory,
  FiscalEventType,
  FiscalRelevance,
  FiscalDataQualityIssue,
  FiscalStateStatus,
  TaxRuleSetStatus,
  TaxCategoryCapability,
  FiscalEvent,
  TaxRuleSet,
  TaxRuleSetSource,
  TaxRuleResolution,
  TaxRuleResolutionOk,
  TaxRuleResolutionFailure,
  TaxCategoryMonthlyState,
  MonthlyTaxCapabilities,
  FiscalDataQualitySummary,
  MonthlyTaxState,
} from './types';

export {
  daysInMonth,
  parseFiscalCompetence,
  fiscalCompetenceFromString,
  fiscalCompetenceFromDate,
  compareFiscalCompetence,
  fiscalCompetenceRange,
  isWithinCompetence,
} from './competence';
export type { FiscalCompetence } from './competence';

export {
  resolveTaxAssetCategory,
  isTaxCategorySupportedInPhase4A,
  PHASE_4A_SUPPORTED_TAX_CATEGORIES,
} from './asset-classification';

export {
  validateTaxRuleSetRegistry,
  resolveTaxRuleSet,
  resolveTaxRuleSetForCategory,
} from './rules';

export { projectFiscalEvents, getTransactionFiscalMapping } from './projection';
export type { FiscalProjectionOptions, CanonicalRealizedResult } from './projection';

export { buildMonthlyTaxState } from './monthly-state';
export type { BuildMonthlyTaxStateInput } from './monthly-state';

// --- Phase 4B: monthly tax liability & loss compensation ---
export { TAX_LIABILITY_STATUSES, TAX_TRACE_STAGES } from './liability-types';
export type {
  TaxLiabilityStatus,
  TaxCategoryLiabilityStatus,
  TaxTraceStage,
  TaxCalculationTraceEntry,
  TaxLossProvenance,
  TaxLossBalance,
  TaxWithholdingCredit,
  TaxCategoryMonthlyResult,
  MonthlyTaxLiabilityCapabilities,
  MonthlyTaxLiability,
  CanonicalWithholdingInput,
  MonthlyTaxCalculationInput,
  ReplayMonthlyTaxInput,
} from './liability-types';
export {
  calculateMonthlyTaxLiability,
  replayMonthlyTaxLiability,
  toWithholdingCredits,
} from './liability';

// --- Phase 4B.2: canonical tax input foundation ---
export {
  TAX_TRADE_CLASSIFICATIONS,
  TRADE_CLASSIFICATION_SOURCES,
  TAX_WITHHOLDING_STATUSES,
  TAX_WITHHOLDING_SOURCE_TYPES,
  FII_TAX_ELIGIBILITY_STATUSES,
  FII_TAX_METADATA_SOURCES,
  TAX_INPUT_READINESS_STATUSES,
  validateTaxTradeClassification,
  validateTaxWithholdingInput,
  validateFiiTaxEligibilityFacts,
  isValidOwnershipPercent,
  withholdingConfirmedTotal,
  evaluateTaxInputReadiness,
  isCompetenceAtOrAfter,
} from './tax-inputs';
export type {
  TaxInputProvenance,
  TaxTradeClassificationValue,
  TradeClassificationSource,
  TaxTradeClassification,
  TaxWithholdingStatus,
  TaxWithholdingSourceType,
  TaxWithholdingInput,
  FiiTaxEligibilityStatus,
  FiiTaxMetadataSource,
  FiiTaxEligibilityFacts,
  TaxInputReadinessStatus,
  TaxInputReadinessInput,
  TaxInputReadiness,
  ValidationResult,
} from './tax-inputs';
