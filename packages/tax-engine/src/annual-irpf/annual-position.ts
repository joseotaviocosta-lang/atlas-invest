import { AssetId, Currency, LocalDate, Money, PortfolioId, Quantity } from '@atlas/domain';
import { CostBasisStatus } from '@atlas/portfolio-engine';
import { TaxSubjectId } from '../ids';
import { TaxAssetCategory } from '../types';
import { AnnualTaxPeriod, CalendarYear, DeclarationExercise } from './annual-period';

/**
 * Completeness state for an annual tax position or report.
 * - `COMPLETE`: All positions and costs are known and mathematically grounded.
 * - `PARTIAL`: Some positions or items require attention but partial calculation exists.
 * - `BLOCKED`: Critical cost basis or historical continuity missing; annual cost cannot be emitted.
 * - `REQUIRES_CONFIRMATION`: Requires investor action (e.g. unconfirmed opening position).
 */
export type AnnualPositionCompleteness =
  'COMPLETE' | 'PARTIAL' | 'BLOCKED' | 'REQUIRES_CONFIRMATION';

export const ANNUAL_POSITION_COMPLETENESS_STATUSES: readonly AnnualPositionCompleteness[] = [
  'COMPLETE',
  'PARTIAL',
  'BLOCKED',
  'REQUIRES_CONFIRMATION',
] as const;

/**
 * Reason codes explaining why an annual position is blocked or requires confirmation.
 */
export type AnnualPositionBlockingReason =
  | 'MISSING_OPENING_HISTORY'
  | 'UNKNOWN_COST_BASIS'
  | 'UNSUPPORTED_ASSET_CLASS'
  | 'OVERLAPPING_OPENING_AND_LEDGER_HISTORY'
  | 'UNCONFIRMED_OPENING_POSITION'
  | 'CURRENCY_CONVERSION_MISSING';

export const ANNUAL_POSITION_BLOCKING_REASONS: readonly AnnualPositionBlockingReason[] = [
  'MISSING_OPENING_HISTORY',
  'UNKNOWN_COST_BASIS',
  'UNSUPPORTED_ASSET_CLASS',
  'OVERLAPPING_OPENING_AND_LEDGER_HISTORY',
  'UNCONFIRMED_OPENING_POSITION',
  'CURRENCY_CONVERSION_MISSING',
] as const;

/**
 * Audit trace for derived annual position calculation.
 */
export interface AnnualPositionTrace {
  readonly appliedTransactionCount: number;
  readonly corporateActionCount: number;
  readonly openingPositionApplied: boolean;
  readonly provenanceSummary: string;
}

/**
 * Derived annual position on December 31st of the calendar year.
 * Represents quantity and historical acquisition cost (never market valuation).
 */
export interface AnnualPosition {
  readonly taxSubjectId: TaxSubjectId;
  readonly portfolioId: PortfolioId;
  readonly calendarYear: CalendarYear;
  readonly declarationExercise: DeclarationExercise;
  readonly asOfDate: LocalDate;
  readonly assetId: AssetId;
  /** Display ticker (display only — AssetId is canonical identity). */
  readonly ticker?: string;
  readonly assetCategory: TaxAssetCategory;
  /** Strictly positive custody quantity (> 0). */
  readonly quantity: Quantity;
  /** Historical acquisition cost (null when costBasisStatus is INCOMPLETE — never '0'). */
  readonly totalHistoricalCost: Money | null;
  /** Historical unit average cost (null when costBasisStatus is INCOMPLETE). */
  readonly averageHistoricalCost: Money | null;
  readonly currency: Currency;
  readonly costBasisStatus: CostBasisStatus;
  readonly completenessStatus: AnnualPositionCompleteness;
  readonly blockingReasons: readonly AnnualPositionBlockingReason[];
  readonly openingPositionApplied: boolean;
  readonly openingPositionId?: string;
  readonly trace: AnnualPositionTrace;
}

/**
 * Aggregated summary of annual positions for a portfolio and calendar year.
 */
export interface AnnualPositionSummary {
  readonly calendarYear: CalendarYear;
  readonly declarationExercise: DeclarationExercise;
  readonly asOfDate: LocalDate;
  readonly totalAssetsCount: number;
  readonly completePositionsCount: number;
  readonly blockedPositionsCount: number;
  readonly requiresConfirmationCount: number;
  readonly totalHistoricalCostKnown: Money | null;
  readonly currency: Currency;
  readonly completenessStatus: AnnualPositionCompleteness;
}

/**
 * Authoritative annual position report generated for an investor portfolio on December 31st.
 */
export interface AnnualPositionReport {
  readonly taxSubjectId: TaxSubjectId;
  readonly portfolioId: PortfolioId;
  readonly period: AnnualTaxPeriod;
  readonly positions: readonly AnnualPosition[];
  readonly summary: AnnualPositionSummary;
  readonly generatedAt: Date;
  readonly version: string;
}
