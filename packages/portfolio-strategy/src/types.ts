/**
 * Phase 5Q-C — allocation strategy vocabulary (pure, zero I/O).
 *
 * Strategy categories are exactly the asset-class values the allocation
 * engine can emit: the domain asset types plus the 'OTHER' catch-all the
 * engine uses for untyped assets. Nothing else is targetable — inventing
 * sectors/issuers/regions would create comparisons against data that does
 * not exist.
 */

export const STRATEGY_CATEGORIES = [
  'STOCK',
  'FII',
  'ETF',
  'BDR',
  'FIXED_INCOME',
  'TREASURY',
  'FUND',
  'CASH',
  'OTHER',
] as const;
export type StrategyCategory = (typeof STRATEGY_CATEGORIES)[number];

/** Canonical display order: domain order, OTHER always last. */
export const STRATEGY_CATEGORY_ORDER: readonly string[] = [...STRATEGY_CATEGORIES];

/** Comparison states. Neutral vocabulary: no overweight/underweight. */
export const COMPARISON_STATES = [
  'ABOVE_TARGET',
  'BELOW_TARGET',
  'ON_TARGET',
  'UNAVAILABLE',
] as const;
export type ComparisonState = (typeof COMPARISON_STATES)[number];

export interface StrategyTargetInput {
  category: string;
  /** Basis points as an integer (4000 = 40%). */
  targetBp: number;
}

export interface StrategyValidationError {
  code:
    | 'UNKNOWN_CATEGORY'
    | 'DUPLICATE_CATEGORY'
    | 'INVALID_WEIGHT'
    | 'TOTAL_NOT_100'
    | 'EMPTY_TARGETS';
}

export interface CurrentWeightInput {
  category: string;
  /** Current weight in basis points, integer. Null when unknown. */
  currentBp: number | null;
}

export interface CategoryComparison {
  category: string;
  targetBp: number;
  currentBp: number | null;
  /** currentBp - targetBp in basis points. Null when current is unknown. */
  deviationBp: number | null;
  state: ComparisonState;
}

export interface StrategyComparison {
  rows: CategoryComparison[];
  /** Categories outside tolerance, in canonical order. */
  outsideTolerance: string[];
  /** Most negative deviation (largest absolute below-target gap), if any. */
  worstGap: { category: string; deviationBp: number } | null;
}
