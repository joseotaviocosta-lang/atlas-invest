import type { LocalDate, Money, Quantity } from '@atlas/domain';
import type { FiscalEventId } from './ids';
import type { FiscalCompetence } from './competence';

// ---------------------------------------------------------------------------
// Fiscal enums
// ---------------------------------------------------------------------------

export const TAX_ASSET_CATEGORIES = [
  'BRAZILIAN_EQUITY',
  'FII',
  'ETF',
  'BDR',
  'FIXED_INCOME',
  'UNKNOWN',
] as const;
export type TaxAssetCategory = (typeof TAX_ASSET_CATEGORIES)[number];

export const FISCAL_EVENT_TYPES = [
  'PURCHASE',
  'SALE',
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'CORPORATE_ACTION',
  'AMORTIZATION',
  'EXPENSE',
  'CASH_FLOW',
  'WITHHOLDING',
  'OTHER',
] as const;
export type FiscalEventType = (typeof FISCAL_EVENT_TYPES)[number];

export const FISCAL_RELEVANCES = [
  'TAXABLE',
  'NON_TAXABLE',
  'INFORMATIONAL',
  'DEFERRED',
  'UNKNOWN',
] as const;
export type FiscalRelevance = (typeof FISCAL_RELEVANCES)[number];

export const FISCAL_DATA_QUALITY_ISSUES = [
  'UNKNOWN_COST_BASIS',
  'UNKNOWN_ASSET_TAX_CATEGORY',
  'UNSUPPORTED_CURRENCY',
  'MISSING_RULE_SET',
  'INCOMPLETE_HISTORY',
  'MISSING_PROCEEDS',
  'UNVERIFIED_RULE_SET',
  'UNKNOWN_OPENING_LOSS_BALANCE',
  'MISSING_REQUIRED_WITHHOLDING',
  'MISSING_RATE_RULE',
] as const;
export type FiscalDataQualityIssue = (typeof FISCAL_DATA_QUALITY_ISSUES)[number];

export const FISCAL_STATE_STATUSES = ['EMPTY', 'COMPLETE', 'PARTIAL', 'BLOCKED'] as const;
export type FiscalStateStatus = (typeof FISCAL_STATE_STATUSES)[number];

export const TAX_RULE_SET_STATUSES = ['TEST_ONLY', 'VERIFIED', 'RETIRED'] as const;
export type TaxRuleSetStatus = (typeof TAX_RULE_SET_STATUSES)[number];

export const TAX_CATEGORY_CAPABILITIES = [
  'CALCULABLE',
  'PARTIAL',
  'UNSUPPORTED',
  'BLOCKED',
] as const;
export type TaxCategoryCapability = (typeof TAX_CATEGORY_CAPABILITIES)[number];

// ---------------------------------------------------------------------------
// Fiscal event
// ---------------------------------------------------------------------------

/**
 * Derived, immutable fiscal projection of one canonical transaction.
 * The transaction ledger remains the single source of truth (ADR-236); a
 * fiscal event is never independently editable.
 */
export interface FiscalEvent {
  readonly id: FiscalEventId;
  readonly sourceTransactionId: string;
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId?: string;
  readonly sourceTransactionType: string;
  readonly economicDate: LocalDate;
  readonly competence: FiscalCompetence;
  readonly eventType: FiscalEventType;
  readonly relevance: FiscalRelevance;
  readonly taxAssetCategory: TaxAssetCategory;
  readonly currency: string;
  readonly quantity?: Quantity;
  readonly unitPrice?: Money;
  /** Canonical net proceeds for a SALE (gross - fees - taxes). */
  readonly proceeds?: Money;
  /** Income amount (DIVIDEND/JCP/FII_INCOME) or AMORTIZATION/EXPENSE amount. */
  readonly amount?: Money;
  /** Canonical cost basis removed, when supplied by the portfolio engine. */
  readonly costBasis?: Money;
  /** Canonical realized gain/loss, when supplied by the portfolio engine. */
  readonly realizedResult?: Money;
  readonly qualityIssues: readonly FiscalDataQualityIssue[];
  readonly projectionVersion: string;
}

// ---------------------------------------------------------------------------
// Tax rules (effective-dated, versioned)
// ---------------------------------------------------------------------------

export interface TaxRuleSetSource {
  readonly legalSourceId: string;
  readonly legalSourceReference?: string;
  readonly verifiedAt?: string;
}

/**
 * Optional legal components carried by a rule set (Phase 4B). A rule set with
 * no components contributes no taxable treatment and is effectively
 * informational. Amounts are exact decimal strings; percentages are exact
 * decimal strings (e.g. `'15'` = 15%).
 */
export interface TaxRuleComponents {
  /** Statutory rate as a percentage of the taxable base (e.g. `'15'`). */
  readonly ratePercentage?: string;
  /** Gross-sales exemption threshold; sales at or below are exempt. */
  readonly exemptionGrossSalesThreshold?: string;
  /** Loss compensation policy (category-isolated unless explicitly overridden). */
  readonly lossCompensation?: {
    readonly crossCategoryAllowed?: boolean;
  };
  /** Withholding applied at the canonical source. */
  readonly withholding?: {
    readonly ratePercentage?: string;
  };
  /** Opaque official rounding instruction, applied only if the law requires it. */
  readonly rounding?: {
    readonly decimalPlaces?: number;
  };
}

/**
 * Versioned, effective-dated rule set (ADR-237). Production liability (4B)
 * may only derive from `VERIFIED` rule sets; Phase 4A never computes liability.
 */
export interface TaxRuleSet {
  readonly id: string;
  readonly jurisdiction: string;
  readonly version: string;
  readonly effectiveFrom: LocalDate;
  readonly effectiveTo?: LocalDate;
  readonly status: TaxRuleSetStatus;
  readonly source?: TaxRuleSetSource;
  /** Category this rule applies to; `undefined` means it is category-agnostic. */
  readonly taxCategory?: TaxAssetCategory;
  /** Legal components; absent means the rule carries no computed treatment. */
  readonly components?: TaxRuleComponents;
}

export interface TaxRuleResolutionOk {
  readonly ok: true;
  readonly ruleSet: TaxRuleSet;
}

export interface TaxRuleResolutionFailure {
  readonly ok: false;
  readonly code: 'MISSING_RULE_SET' | 'AMBIGUOUS_RULE_SET';
  readonly message: string;
}

export type TaxRuleResolution = TaxRuleResolutionOk | TaxRuleResolutionFailure;

// ---------------------------------------------------------------------------
// Monthly tax state (normalized fiscal facts — NOT tax liability)
// ---------------------------------------------------------------------------

export interface TaxCategoryMonthlyState {
  readonly category: TaxAssetCategory;
  readonly currency: string;
  readonly capability: TaxCategoryCapability;
  readonly eventCount: number;
  readonly salesProceeds?: Money;
  readonly realizedGain?: Money;
  readonly realizedLoss?: Money;
  readonly income?: Money;
  /** No canonical withholding source exists in the ledger yet (capability gap). */
  readonly withholding?: Money;
  readonly qualityIssues: readonly FiscalDataQualityIssue[];
}

export interface MonthlyTaxCapabilities {
  readonly foundationOnly: true;
  /** True only when the resolved rule set is `VERIFIED`. */
  readonly productionRuleVerified: boolean;
  /** False in Phase 4A: the ledger has no canonical broker withholding source. */
  readonly withholdingSupported: boolean;
  /** Phase 4A never computes payable tax. */
  readonly taxLiabilitySupported: false;
}

export interface FiscalDataQualitySummary {
  readonly status: FiscalStateStatus;
  readonly issues: readonly FiscalDataQualityIssue[];
  readonly issueCount: number;
}

export interface MonthlyTaxState {
  readonly competence: FiscalCompetence;
  readonly status: FiscalStateStatus;
  readonly taxSubjectId?: string;
  readonly eventCount: number;
  readonly events: readonly FiscalEvent[];
  readonly categories: readonly TaxCategoryMonthlyState[];
  readonly currencies: readonly string[];
  readonly ruleSetResolution: TaxRuleResolution;
  readonly capabilities: MonthlyTaxCapabilities;
  readonly dataQuality: FiscalDataQualitySummary;
  readonly projectionVersion: string;
  readonly engineVersion: string;
}
