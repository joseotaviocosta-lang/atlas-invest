import type { Money } from '@atlas/domain';
import type { FiscalCompetence } from './competence';
import type {
  FiscalDataQualityIssue,
  FiscalDataQualitySummary,
  FiscalEvent,
  TaxAssetCategory,
  TaxRuleSet,
  TaxRuleSetStatus,
} from './types';

/**
 * Phase 4B — Brazilian Monthly Tax Liability & Loss Compensation.
 *
 * This module defines the domain of the monthly liability projection. All
 * amounts are exact `Money`; all percentages are exact decimal strings.
 * Taxable treatment is decided exclusively by effective-dated rule sets.
 * This phase never produces DARF, payment instructions or IRPF data.
 */

export const TAX_LIABILITY_STATUSES = ['COMPLETE', 'PARTIAL', 'BLOCKED', 'NO_ACTIVITY'] as const;
export type TaxLiabilityStatus = (typeof TAX_LIABILITY_STATUSES)[number];

/** Per-category status (no global NO_ACTIVITY: a category only exists with activity). */
export type TaxCategoryLiabilityStatus = 'COMPLETE' | 'PARTIAL' | 'BLOCKED';

export const TAX_TRACE_STAGES = [
  'INPUT',
  'RULE_RESOLUTION',
  'CLASSIFICATION',
  'EXEMPTION',
  'OPENING_LOSS',
  'LOSS_APPLICATION',
  'TAXABLE_BASE',
  'RATE',
  'WITHHOLDING',
  'FINAL',
] as const;
export type TaxTraceStage = (typeof TAX_TRACE_STAGES)[number];

export interface TaxCalculationTraceEntry {
  readonly stage: TaxTraceStage;
  readonly category?: TaxAssetCategory;
  readonly operation: string;
  readonly ruleVersion?: string;
  readonly inputReferences?: readonly string[];
  readonly exactInputs?: Readonly<Record<string, string>>;
  readonly exactOutput?: string;
  readonly status: string;
}

export type TaxLossProvenance = 'REPLAY' | 'MANUAL' | 'ZERO_AT_INCEPTION';

export interface TaxLossBalance {
  readonly category: TaxAssetCategory;
  readonly currency: string;
  readonly amount: Money;
  readonly competence: string;
  readonly provenance: TaxLossProvenance;
}

export interface TaxWithholdingCredit {
  readonly category: TaxAssetCategory;
  readonly currency: string;
  readonly amount: Money;
  readonly source: 'FISCAL_EVENT';
  readonly sourceEventId?: string;
}

export interface TaxCategoryMonthlyResult {
  readonly category: TaxAssetCategory;
  readonly currency: string;
  readonly status: TaxCategoryLiabilityStatus;
  readonly ruleVersion: string | null;
  readonly ruleSetStatus: TaxRuleSetStatus | null;
  readonly grossSales: Money;
  readonly realizedResult: Money;
  readonly taxableRealizedResult: Money;
  readonly exemptionApplied: boolean;
  readonly taxableBaseBeforeLosses: Money;
  readonly openingLossBalance: Money;
  readonly lossApplied: Money;
  readonly lossGenerated: Money;
  readonly closingLossBalance: Money;
  readonly taxableBaseAfterLosses: Money;
  readonly ratePercentage: string | null;
  readonly taxBeforeWithholding: Money;
  readonly withholdingAvailable: Money;
  readonly withholdingApplied: Money;
  /** Non-null only when the result is production-eligible (COMPLETE + VERIFIED). */
  readonly taxDue: Money | null;
  readonly qualityIssues: readonly FiscalDataQualityIssue[];
  readonly trace: readonly TaxCalculationTraceEntry[];
}

export interface MonthlyTaxLiabilityCapabilities {
  readonly foundationOnly: boolean;
  /** True when at least one category resolved to a VERIFIED rule. */
  readonly productionRuleVerified: boolean;
  /** True only when canonical withholding inputs were supplied. */
  readonly withholdingSupported: boolean;
  /** True when the engine can emit a production taxDue. */
  readonly taxLiabilitySupported: boolean;
}

export interface MonthlyTaxLiability {
  readonly competence: FiscalCompetence;
  readonly taxSubjectId?: string;
  readonly status: TaxLiabilityStatus;
  readonly ruleVersions: readonly string[];
  readonly categories: readonly TaxCategoryMonthlyResult[];
  /** Null unless the whole month is COMPLETE and production-eligible. */
  readonly totalTaxBeforeCredits: Money | null;
  readonly creditsApplied: Money | null;
  readonly taxDue: Money | null;
  readonly openingLossBalances: readonly TaxLossBalance[];
  readonly closingLossBalances: readonly TaxLossBalance[];
  readonly dataQuality: FiscalDataQualitySummary;
  readonly calculationTrace: readonly TaxCalculationTraceEntry[];
  readonly capabilities: MonthlyTaxLiabilityCapabilities;
  readonly calculationVersion: string;
  readonly engineVersion: string;
  /** Human-readable limitation codes (e.g. `IN_PROGRESS`) — never tax advice. */
  readonly limitations: readonly string[];
}

/** Canonical withholding input, traceable to a fiscal event. */
export interface CanonicalWithholdingInput {
  readonly category: TaxAssetCategory;
  readonly currency: string;
  readonly amount: string;
  readonly sourceEventId?: string;
}

export interface MonthlyTaxCalculationInput {
  readonly competence: string | FiscalCompetence;
  /** 4A fiscal events for the competence (already projected). */
  readonly events: readonly FiscalEvent[];
  readonly ruleSets: readonly TaxRuleSet[];
  readonly taxSubjectId?: string;
  readonly jurisdiction?: string;
  readonly supportedCurrencies?: readonly string[];
  /** Known opening loss balances per category (from prior replay). */
  readonly openingLossBalances?: readonly TaxLossBalance[];
  /**
   * Whether the opening loss state is known. When `UNKNOWN`, any positive
   * taxable gain becomes PARTIAL (never silently zero) — ADR-243.
   */
  readonly openingLossState?: 'KNOWN' | 'UNKNOWN';
  readonly withholdingCredits?: readonly TaxWithholdingCredit[];
  readonly calculationVersion?: string;
  /** Set for the current, still-open competence — adds an `IN_PROGRESS` limitation. */
  readonly inProgress?: boolean;
  readonly asOfRuleDate?: string;
}

export interface ReplayMonthlyTaxInput {
  readonly months: readonly {
    readonly competence: string | FiscalCompetence;
    readonly events: readonly FiscalEvent[];
  }[];
  readonly ruleSets: readonly TaxRuleSet[];
  readonly taxSubjectId?: string;
  readonly jurisdiction?: string;
  readonly supportedCurrencies?: readonly string[];
  readonly openingLossState?: 'KNOWN' | 'UNKNOWN';
  readonly calculationVersion?: string;
  readonly asOfRuleDateByCompetence?: Readonly<Record<string, string>>;
  /** Canonical withholding credits per competence (keyed by `YYYY-MM`). */
  readonly withholdingCreditsByCompetence?: Readonly<
    Record<string, readonly import('./liability-types').TaxWithholdingCredit[]>
  >;
}
