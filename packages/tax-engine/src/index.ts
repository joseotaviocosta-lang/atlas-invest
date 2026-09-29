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
  InvalidTaxDeadlineEntryError,
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
  nextFiscalCompetence,
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
  validateTaxRuleProvenance,
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

// --- Phase 4C.2: direct federal tax deadline registry & tax obligations ---
export {
  TAX_OBLIGATION_BUCKETS,
  PRODUCTION_REVENUE_CODE_MAPPINGS,
  isTaxObligationBucket,
  resolveRevenueCodeForBucket,
  resolveObligationBucketForCategory,
} from './revenue-codes';
export type { TaxObligationBucket } from './revenue-codes';

export {
  FEDERAL_TAX_DEADLINE_STATUSES,
  FEDERAL_TAX_DEADLINE_RESOLUTION_OUTCOMES,
  isCanonicalCivilDate,
  isCanonicalCompetence,
  validateFederalTaxDeadlineEntry,
  activeVerifiedDeadlineEntries,
  resolveFederalTaxDeadline,
} from './deadlines';
export type {
  FederalTaxDeadlineStatus,
  FederalTaxDeadlineEntry,
  FederalTaxDeadlineResolutionOutcome,
  FederalTaxDeadlineResolution,
} from './deadlines';

export {
  TAX_OBLIGATION_STATUSES,
  TAX_OBLIGATION_BASE_STATUSES,
  TAX_OBLIGATION_REASON_CODES,
  DARF_READINESS_STATUSES,
  TAX_PAYMENT_EVIDENCE_SOURCES,
  TAX_PAYMENT_EVIDENCE_STATUSES,
  materializeTaxObligation,
  deriveObligationDisplayStatus,
  validateTaxPaymentEvidence,
} from './obligations';
export type {
  TaxObligationStatus,
  TaxObligationBaseStatus,
  TaxObligationReasonCode,
  DarfReadinessStatus,
  TaxPaymentEvidenceSource,
  TaxPaymentEvidenceStatus,
  TaxObligationPlan,
  MaterializeTaxObligationInput,
  PaymentValidationResult,
} from './obligations';

// --- Phase 4D.2: overdue tax adjustment (late fee + interest) ---
export {
  LATE_PAYMENT_ROUNDING_MODES,
  LATE_PAYMENT_INTEREST_METHODS,
  TAX_PAYMENT_ADJUSTMENT_STATUSES,
  TAX_PAYMENT_ADJUSTMENT_REASON_CODES,
  isCivilDate,
  roundHalfEven,
  monthsBetween,
  daysBetweenInclusive,
  buildTaxPaymentAdjustment,
  computeAdjustmentFingerprint,
} from './late-payment';
export type {
  LatePaymentRoundingMode,
  LatePaymentInterestMethod,
  TaxPaymentAdjustmentStatus,
  TaxPaymentAdjustmentReasonCode,
  LatePaymentRuleSet,
  OfficialLateFeeAuthority,
  OfficialInterestRate,
  TaxPaymentAdjustmentTraceEntry,
  TaxPaymentAdjustment,
  BuildTaxPaymentAdjustmentInput,
} from './late-payment';

// --- Phase 4E: minimum DARF & same-revenue-code carry-forward ---
export {
  MINIMUM_DARF_RULE_STATUSES,
  MINIMUM_DARF_COMPARISON,
  MINIMUM_DARF_DEFERRED_DUE_DATE_POLICY,
  MINIMUM_DARF_RESOLUTION_OUTCOMES,
  DARF_PAYMENT_ELIGIBILITY_STATUSES,
  DARF_PAYMENT_ELIGIBILITY_REASON_CODES,
  resolveMinimumDarfRule,
  isBelowMinimumDarf,
  computeDarfEligibilityFingerprint,
  buildDarfPaymentEligibility,
} from './minimum-darf';
export type {
  MinimumDarfRuleStatus,
  MinimumDarfComparison,
  MinimumDarfDeferredDueDatePolicy,
  MinimumDarfRuleSet,
  MinimumDarfResolutionOutcome,
  MinimumDarfRuleResolution,
  DarfPaymentEligibilityStatus,
  DarfPaymentEligibilityReasonCode,
  DarfEligibilitySourceBreakdown,
  DarfPaymentEligibility,
  CarryForwardCandidate,
  BuildDarfPaymentEligibilityInput,
} from './minimum-darf';

export {
  TAX_CARRY_FORWARD_STATUSES,
  computeCarryForwardFingerprint,
  buildCarryForwardEntry,
  isConsumableCarryForwardEntry,
} from './carry-forward';
export type { TaxCarryForwardStatus, TaxCarryForwardEntry } from './carry-forward';

export { computeAggregationFingerprint, buildTaxPaymentAggregation } from './payment-aggregation';
export type { TaxPaymentAggregation, AggregationFingerprintInput } from './payment-aggregation';

// --- Phase 4F: taxpayer identity boundary & official DARF handoff ---
export {
  TAXPAYER_IDENTITY_TYPES,
  normalizeTaxpayerIdentifier,
  isCanonicalCpf,
  isCanonicalCnpj,
  maskCpf,
  maskCnpj,
  maskTaxpayerIdentifier,
  isValidTaxpayerIdentifier,
} from './taxpayer-identity';
export type { TaxpayerIdentityType, TaxpayerIdentityReference } from './taxpayer-identity';

export {
  DARF_GENERATION_MODES,
  DARF_GENERATION_STATUSES,
  DARF_HANDOFF_REASON_CODES,
  computeDarfHandoffFingerprint,
  buildDarfHandoffPlan,
} from './darf-handoff';
export type {
  DarfGenerationMode,
  DarfGenerationStatus,
  DarfHandoffReasonCode,
  OfficialDarfDestination,
  DarfHandoffPreparedValues,
  DarfHandoffPlan,
  DarfAdjustmentSnapshot,
  BuildDarfHandoffPlanInput,
} from './darf-handoff';
