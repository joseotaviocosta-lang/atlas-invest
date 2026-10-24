/**
 * Phase 5Q-A — portfolio review input/output contracts (pure, zero I/O).
 *
 * A PortfolioReview is a derived read model: facts already computed by the
 * existing engines are projected into prioritized, explainable signals.
 * Nothing here replays ledgers, values positions, fetches prices or touches
 * the network. The API layer adapts its read models into these minimal
 * structural inputs (data minimization: only the fields below cross the
 * boundary).
 */

export const REVIEW_SIGNAL_CATEGORIES = [
  'DATA_QUALITY',
  'ALLOCATION',
  'PERFORMANCE',
  'INCOME',
  'TAX',
  'INTEGRATION',
] as const;
export type ReviewSignalCategory = (typeof REVIEW_SIGNAL_CATEGORIES)[number];

export const REVIEW_SEVERITIES = ['INFO', 'REVIEW', 'WARNING'] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

/**
 * Stable signal codes. One code emits at most one signal per review
 * (aggregation is built into derivation — never one card per position).
 * TAX codes are reserved for a future phase: no portfolio-scoped tax
 * intelligence exists yet (the fiscal domain is keyed by taxSubject /
 * competence, not portfolio), so v1 emits no TAX signals rather than
 * fabricating them.
 */
export const REVIEW_SIGNAL_CODES = [
  'DATA_VALUATION_COVERAGE',
  'DATA_RECONCILIATION_DIVERGENCE',
  'INTEGRATION_PENDING_REVIEW',
  'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
  'PERFORMANCE_BENCHMARK_GAP',
  'PERFORMANCE_BENCHMARK_UNAVAILABLE',
  'INCOME_RECEIVED',
] as const;
export type ReviewSignalCode = (typeof REVIEW_SIGNAL_CODES)[number];

export type ReviewSignalAction = { kind: 'ROUTE'; href: string; label: string } | { kind: 'NONE' };

export interface PortfolioReviewSignal {
  /** Stable id: the code (codes are unique per review by construction). */
  id: string;
  code: ReviewSignalCode;
  category: ReviewSignalCategory;
  severity: ReviewSeverity;
  /** Raw evidence only: decimal/money strings, counts, codes. Never prose. */
  evidence: Record<string, string | number | boolean | null>;
  action: ReviewSignalAction;
}

export interface PortfolioReviewDataQuality {
  valuationCoveragePercent: string | null;
  totalPositions: number;
  valuedPositions: number;
  unvaluedPositions: number;
  stalePositions: number;
  missingPrices: number;
  reconciliation: {
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
  };
  partialRuns: number;
  pendingReviews: number;
}

export interface PortfolioReviewSummary {
  attentionCount: number;
  dataNote: string | null;
}

export interface PortfolioReview {
  portfolioId: string;
  asOf: {
    /** When the review was generated (server clock, ISO). */
    generatedAt: string;
    /** Trading date of the underlying market data, when known. */
    marketDataAsOf: string | null;
  };
  summary: PortfolioReviewSummary;
  dataQuality: PortfolioReviewDataQuality;
  signals: PortfolioReviewSignal[];
  /** True when the portfolio has no positions to review. */
  isEmpty: boolean;
}

/** Minimal valuation slice the review needs. */
export interface ReviewValuationInput {
  asOf: string | null;
  summary: {
    totalPositions: number;
    valuedPositions: number;
    unvaluedPositions: number;
    stalePositions: number;
    mismatchPositions: number;
    valuationCoveragePercent: string;
    currencies: string[];
  };
  quoteSummary: {
    totalQuotesRequested: number;
    quotesAvailable: number;
    quotesUnavailable: number;
    quotesStale: number;
  };
}

/** Minimal allocation slice the review needs. */
export interface ReviewAllocationBucketInput {
  byAsset: Array<{
    assetId: string;
    ticker: string | null;
    allocationPercent: string;
    currency: string;
  }>;
}

export interface ReviewAllocationInput {
  status: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
  valuationCoveragePercent: string;
  currencies: Record<string, ReviewAllocationBucketInput>;
  translatedAllocation?: {
    status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
    byAsset: Array<{
      assetId: string;
      ticker?: string | null;
      allocationPercent: string;
    }>;
  } | null;
}

/** Minimal ledger-state slice the review needs. */
export interface ReviewStateInput {
  openPositionCount: number;
  hasCashFlowsOnly: boolean;
  income: Array<{
    currency: string;
    totalDividends: { amount: string; currency: string };
    totalJcp: { amount: string; currency: string };
    totalFiiIncome: { amount: string; currency: string };
    totalIncome: { amount: string; currency: string };
  }>;
}

/** Minimal benchmark slice (per currency, from the intelligence summary). */
export interface ReviewBenchmarkInput {
  id: string;
  currency: string;
  differencePercentagePoints: string | null;
  status: string;
}

export interface ReviewIntelligenceInput {
  period: { startDate: string; endDate: string };
  benchmarks: ReviewBenchmarkInput[];
}

/** Pre-aggregated run-derived counts (computed by the API layer with deriveReviewItems). */
export interface ReviewRunsInput {
  pendingReviewCount: number;
  partialRuns: number;
  reconciliation: {
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
  };
}

export interface BuildReviewInput {
  portfolioId: string;
  generatedAt: Date;
  valuation: ReviewValuationInput;
  allocation: ReviewAllocationInput;
  state: ReviewStateInput;
  intelligence: ReviewIntelligenceInput;
  runs: ReviewRunsInput;
}
