import {
  AnnualPosition,
  AnnualPositionCompleteness,
  AnnualPositionReport,
} from '@atlas/tax-engine';

export interface AnnualPositionReadModel {
  readonly assetId: string;
  readonly ticker?: string;
  readonly assetCategory: string;
  readonly quantity: string;
  readonly totalHistoricalCost: string | null;
  readonly averageHistoricalCost: string | null;
  readonly currency: string;
  readonly costBasisStatus: string;
  readonly completenessStatus: AnnualPositionCompleteness;
  readonly blockingReasons: readonly string[];
  readonly openingPositionApplied: boolean;
  readonly openingPositionId?: string;
  readonly trace: {
    readonly appliedTransactionCount: number;
    readonly corporateActionCount: number;
    readonly openingPositionApplied: boolean;
    readonly provenanceSummary: string;
  };
}

export interface AnnualPositionSummaryReadModel {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly asOfDate: string;
  readonly totalAssetsCount: number;
  readonly completePositionsCount: number;
  readonly blockedPositionsCount: number;
  readonly requiresConfirmationCount: number;
  readonly totalHistoricalCostKnown: string | null;
  readonly currency: string;
  readonly completenessStatus: AnnualPositionCompleteness;
}

export interface AnnualPositionReportReadModel {
  readonly taxSubjectId: string;
  readonly portfolioId: string;
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly asOfDate: string;
  readonly period: {
    readonly calendarYear: number;
    readonly declarationExercise: number;
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly positions: readonly AnnualPositionReadModel[];
  readonly summary: AnnualPositionSummaryReadModel;
  readonly generatedAt: string;
  readonly version: string;
}

export function mapAnnualPositionToReadModel(position: AnnualPosition): AnnualPositionReadModel {
  return {
    assetId: String(position.assetId),
    ticker: position.ticker,
    assetCategory: position.assetCategory,
    quantity: position.quantity.toString(),
    totalHistoricalCost: position.totalHistoricalCost ? position.totalHistoricalCost.amount : null,
    averageHistoricalCost: position.averageHistoricalCost
      ? position.averageHistoricalCost.amount
      : null,
    currency: String(position.currency),
    costBasisStatus: position.costBasisStatus,
    completenessStatus: position.completenessStatus,
    blockingReasons: position.blockingReasons,
    openingPositionApplied: position.openingPositionApplied,
    openingPositionId: position.openingPositionId,
    trace: {
      appliedTransactionCount: position.trace.appliedTransactionCount,
      corporateActionCount: position.trace.corporateActionCount,
      openingPositionApplied: position.trace.openingPositionApplied,
      provenanceSummary: position.trace.provenanceSummary,
    },
  };
}

export function mapAnnualPositionReportToReadModel(
  report: AnnualPositionReport,
): AnnualPositionReportReadModel {
  return {
    taxSubjectId: String(report.taxSubjectId),
    portfolioId: String(report.portfolioId),
    calendarYear: report.period.calendarYear,
    declarationExercise: report.period.declarationExercise,
    asOfDate: report.period.endDate.toString(),
    period: {
      calendarYear: report.period.calendarYear,
      declarationExercise: report.period.declarationExercise,
      startDate: report.period.startDate.toString(),
      endDate: report.period.endDate.toString(),
    },
    positions: report.positions.map(mapAnnualPositionToReadModel),
    summary: {
      calendarYear: report.summary.calendarYear,
      declarationExercise: report.summary.declarationExercise,
      asOfDate: report.summary.asOfDate.toString(),
      totalAssetsCount: report.summary.totalAssetsCount,
      completePositionsCount: report.summary.completePositionsCount,
      blockedPositionsCount: report.summary.blockedPositionsCount,
      requiresConfirmationCount: report.summary.requiresConfirmationCount,
      totalHistoricalCostKnown: report.summary.totalHistoricalCostKnown
        ? report.summary.totalHistoricalCostKnown.amount
        : null,
      currency: String(report.summary.currency),
      completenessStatus: report.summary.completenessStatus,
    },
    generatedAt: report.generatedAt.toISOString(),
    version: report.version,
  };
}
