/**
 * Contextual Tax Intelligence — narrow input/output contracts (ADR-311).
 *
 * Deterministic, read-only explanation layer. No LLM, no persistence, no
 * recomputation. Monetary values travel as exact decimal strings and are
 * copied verbatim, never arithmetically transformed.
 */

export const TAX_INTELLIGENCE_VERSION = '0.1.0';

/** Deterministic response statuses. Never promoted upward (fail-closed). */
export const CTI_STATUSES = ['CONFIRMED', 'PARTIAL', 'BLOCKED', 'UNKNOWN'] as const;
export type CtiStatus = (typeof CTI_STATUSES)[number];

/** Blocker categories. Canonical codes map into these; nothing invented. */
export const CTI_BLOCKER_CATEGORIES = [
  'COST_BASIS_INCOMPLETE',
  'MISSING_RULE_SET',
  'MISSING_WITHHOLDING_DATA',
  'MISSING_FII_TAX_DATA',
  'UNKNOWN_OPERATION_CLASSIFICATION',
  'EVIDENCE_REQUIRED',
  'RECONCILIATION_BLOCKED',
  'OTHER_CANONICAL_BLOCKER',
] as const;
export type CtiBlockerCategory = (typeof CTI_BLOCKER_CATEGORIES)[number];

/** Allowlisted action ids. The projector never emits arbitrary hrefs. */
export const CTI_ACTION_IDS = [
  'OPEN_TAX',
  'OPEN_TAX_QUALITY',
  'REVIEW_COST_BASIS',
  'REVIEW_POSITIONS',
  'REVIEW_IMPORTS',
  'OPEN_DATA_QUALITY',
  'OPEN_REVIEWS',
  'OPEN_PORTFOLIO',
  'OPEN_ANNUAL_READINESS',
  'OPEN_OBLIGATION',
] as const;
export type CtiActionId = (typeof CTI_ACTION_IDS)[number];

export const CTI_FACT_SOURCES = [
  'TAX_ENGINE',
  'TAX_READINESS',
  'COST_ASSESSMENT',
  'RECONCILIATION',
  'EVIDENCE',
] as const;
export type CtiFactSource = (typeof CTI_FACT_SOURCES)[number];

export const CTI_SOURCE_KINDS = [
  'LEDGER',
  'TAX_ENGINE',
  'VERIFIED_EVIDENCE',
  'B3_REPORT',
  'OFFICIAL_RULE',
] as const;
export type CtiSourceKind = (typeof CTI_SOURCE_KINDS)[number];

/** Reconciliation-blocker input codes (explicitly fed, never inferred). */
export const CTI_RECONCILIATION_BLOCKER_CODES = [
  'UNKNOWN_EVENT_TYPE',
  'UNKNOWN_ORIGIN',
  'MISSING_EVENT_DATE',
] as const;
export type CtiReconciliationBlockerCode =
  (typeof CTI_RECONCILIATION_BLOCKER_CODES)[number];

export interface CtiMoney {
  readonly amount: string;
  readonly currency: string;
}

export interface CtiMonthlyInput {
  /** Canonical monthly status; unknown values fail closed to UNKNOWN. */
  readonly status: string;
  readonly reasonCode?: string | null;
  readonly qualityIssues: readonly string[];
  /** Copied verbatim only when status allows stating it. */
  readonly taxDue?: CtiMoney | null;
  readonly limitations: readonly string[];
  readonly ruleSetVersion?: string | null;
  readonly ruleSetStatus?: string | null;
}

export interface CtiAnnualRequirementInput {
  readonly requirementId: string;
  readonly section: string;
  readonly status: string;
  readonly title: string;
  readonly description: string;
  readonly blockingReason?: string | null;
}

export interface CtiAnnualInput {
  readonly overallStatus: string;
  readonly blockingReasons: readonly string[];
  readonly requirements: readonly CtiAnnualRequirementInput[];
}

export interface CtiCostInput {
  /** Distinct assets with any open scope lacking full documentary coverage. */
  readonly incompleteAssets: number;
  /** Distinct assets partially covered (some scope with 0 < covered < Q). */
  readonly partialAssets: number;
  /** Distinct assets fully covered in every open scope. */
  readonly completeAssets: number;
  /** Distinct assets with any canonically INCOMPLETE scope (tax view). */
  readonly canonicalIncompleteAssets: number;
  readonly reviewRequiredCount: number;
}

export interface CtiReconciliationBlockerInput {
  readonly code: CtiReconciliationBlockerCode;
  readonly assetTicker: string;
  readonly detail: string;
}

export interface CtiFreshnessInput {
  readonly asOf: string;
  readonly lastReplayAt?: string | null;
}

export interface TaxIntelligenceContext {
  readonly portfolioId: string;
  /** Civil competence YYYY-MM. */
  readonly competence: string;
  readonly calendarYear: number;
  readonly monthly: CtiMonthlyInput;
  readonly annual?: CtiAnnualInput | null;
  readonly cost: CtiCostInput;
  readonly reconciliationBlockers: readonly CtiReconciliationBlockerInput[];
  readonly freshness: CtiFreshnessInput;
}

export interface CtiFact {
  readonly code: string;
  readonly label: string;
  readonly value: string | null;
  readonly source: CtiFactSource;
}

export interface CtiBlocker {
  readonly code: string;
  readonly category: CtiBlockerCategory;
  /** Higher surfaces first; ties break by code ASC. */
  readonly priority: number;
  readonly title: string;
  readonly explanation: string;
}

export interface CtiAction {
  readonly actionId: CtiActionId;
  readonly label: string;
  readonly priority: number;
}

export interface CtiSource {
  readonly kind: CtiSourceKind;
  readonly label: string;
}

export interface TaxIntelligenceResponse {
  readonly status: CtiStatus;
  readonly headline: string;
  readonly summary: string;
  readonly facts: readonly CtiFact[];
  readonly blockers: readonly CtiBlocker[];
  readonly actions: readonly CtiAction[];
  readonly limitations: readonly string[];
  readonly sources: readonly CtiSource[];
  readonly generatedAt: string;
}
