import {
  OPPORTUNITY_MODEL_VERSION,
  OpportunityAssetType,
  OpportunityRadarItem,
} from './types';
import { QuoteFreshness } from '../index';
import {
  ContributionAllocationSimulation,
  ContributionScenarioComparison,
} from './contribution-simulator';

export interface ProjectionBaselinePosition {
  assetId: string;
  ticker: string;
  name?: string;
  assetType: OpportunityAssetType | string;
  quantity: string;
  valuationStatus: string;
  marketValueCents?: number | null;
  quoteFreshness?: QuoteFreshness | null;
  quoteAsOf?: string | null;
  isValued: boolean;
}

export interface ProjectionPortfolioBaseline {
  portfolioId: string;
  asOf: string;
  currency: string;
  positions: ProjectionBaselinePosition[];
}

export interface ProjectedClassAllocation {
  classId: string;
  label: string;
  beforeValue: string;
  afterValue: string;
  beforeCents: number;
  afterCents: number;
  beforeWeightPercent: number;
  afterWeightPercent: number;
  targetWeightPercent?: number;
  beforeGapPercent?: number;
  afterGapPercent?: number;
  gapImprovementPercent?: number;
  status: 'IMPROVED' | 'WORSENED' | 'UNCHANGED' | 'NO_TARGET';
  isPartial?: boolean;
  incompletePositionCount?: number;
}

export interface ProjectedAssetAllocation {
  assetId: string;
  ticker: string;
  name: string;
  assetType: OpportunityAssetType;
  beforeValue: string | null;
  simulatedContribution: string;
  afterValue: string | null;
  beforeCents: number | null;
  contributionCents: number;
  afterCents: number | null;
  beforeWeightPercent: number | null;
  afterWeightPercent: number | null;
  deltaWeightPercent: number | null;
  dataFreshness: QuoteFreshness;
  isValued: boolean;
  projectionStatus: 'VALUED' | 'INCOMPLETE';
}

export interface TargetProgressSummary {
  improvedCount: number;
  worsenedCount: number;
  unchangedCount: number;
  largestResidualGap?: { classId: string; gapPercent: number } | null;
  closestToTarget?: { classId: string; gapPercent: number } | null;
}

export interface ConcentrationProjection {
  largestAssetTickerBefore: string | null;
  largestAssetTickerAfter: string | null;
  largestAssetWeightBefore: number;
  largestAssetWeightAfter: number;
  top3WeightBefore: number;
  top3WeightAfter: number;
  deltaLargestAssetWeight: number;
  deltaTop3Weight: number;
}

export interface ProjectionDataQuality {
  totalAssets: number;
  valuedAssets: number;
  incompleteAssets: number;
  quoteFreshCount: number;
  quoteStaleCount: number;
  quoteUnknownCount: number;
  projectionComplete: boolean;
  weightBasis: 'FULL_PORTFOLIO' | 'VALUED_POSITIONS_ONLY';
}

export interface ProjectedPortfolioState {
  portfolioMarketValue: string;
  investedAssetValue: string;
  investedAssetCents: number;
  classWeights: Record<string, number>;
  assetWeights: Record<string, number>;
}

export interface ProjectedPortfolioAfterContribution {
  portfolioId: string;
  asOf: string;
  scenarioId?: string;
  scenarioLabel?: string;
  contributionAmount: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  totalCents: number;
  allocatedCents: number;
  unallocatedCents: number;
  before: ProjectedPortfolioState;
  after: ProjectedPortfolioState;
  deltas: {
    investedAssetValueDelta: string;
    investedAssetCentsDelta: number;
  };
  classProjection: ProjectedClassAllocation[];
  assetProjection: ProjectedAssetAllocation[];
  concentration: ConcentrationProjection;
  targetProgress: TargetProgressSummary;
  warnings: string[];
  dataQuality: ProjectionDataQuality;
  modelVersion: string;
}

export interface ProjectedPortfolioScenarioComparison {
  portfolioId: string;
  asOf: string;
  contributionAmount: string;
  currency: string;
  before: ProjectedPortfolioState;
  scenarios: Array<{
    scenarioId: string;
    scenarioLabel: string;
    description: string;
    projection: ProjectedPortfolioAfterContribution;
  }>;
  comparisonInsights: string[];
  commonWarnings: string[];
  dataQuality: ProjectionDataQuality;
  modelVersion: string;
}

export interface BuildProjectedPortfolioAfterContributionParams {
  portfolioId: string;
  asOf?: string;
  currency?: string;
  scenarioId?: string;
  scenarioLabel?: string;
  baselinePositions?: readonly ProjectionBaselinePosition[];
  radarItems?: readonly OpportunityRadarItem[];
  contributionSimulation: ContributionAllocationSimulation;
  classTargetWeights?: Record<string, number>;
  referenceDate?: Date;
}

export interface BuildProjectedPortfolioScenarioComparisonParams {
  portfolioId: string;
  asOf?: string;
  currency?: string;
  baselinePositions?: readonly ProjectionBaselinePosition[];
  radarItems?: readonly OpportunityRadarItem[];
  scenarioComparison: ContributionScenarioComparison;
  classTargetWeights?: Record<string, number>;
  referenceDate?: Date;
}

const TOLERANCE_GAP_IMPROVEMENT_PP = 0.05;

/**
 * Adapter converting OpportunityRadarItem[] to ProjectionBaselinePosition[].
 * Used for fallback compatibility when full baselinePositions is not passed directly.
 */
export function toProjectionBaselinePositions(
  radarItems: readonly OpportunityRadarItem[],
): ProjectionBaselinePosition[] {
  return radarItems.map((item) => {
    const rawValStr = item.marketValue;
    const isValued = Boolean(
      rawValStr && rawValStr !== '0' && /^\d+(\.\d{1,2})?$/.test(rawValStr),
    );
    const marketValueCents = isValued ? parseDecimalToCents(rawValStr) : null;

    return {
      assetId: item.assetId,
      ticker: item.ticker,
      name: item.name,
      assetType: item.assetType,
      quantity: '1',
      valuationStatus: isValued ? 'VALUED' : 'QUOTE_UNAVAILABLE',
      marketValueCents,
      quoteFreshness: item.dataFreshness as QuoteFreshness,
      isValued,
    };
  });
}

/**
 * Pure deterministic projection engine to compute portfolio weights,
 * class gaps, and concentration before vs after a simulated contribution.
 *
 * Principles (APP-16V & APP-16V-R1):
 * - Authoritative baseline from complete active holdings (ProjectionBaselinePosition[]).
 * - Read-only: zero DB mutations, zero orders, zero transaction ledger edits.
 * - Exact cents arithmetic: afterInvestedCents = beforeInvestedCents + allocatedCents.
 * - Unallocated funds (unallocatedCents > 0) are strictly excluded from projected invested asset value.
 * - Incomplete assets (missing quote/valuation) are preserved in assetProjection with null before/after value.
 * - weightBasis explicitly signals FULL_PORTFOLIO vs VALUED_POSITIONS_ONLY.
 * - Class projections mark isPartial when containing incomplete assets.
 * - No price appreciation, no future dividend returns, no CAGR assumptions.
 * - Standard Atlas gap sign convention: gap = targetWeight - currentWeight.
 * - Improvement measured by reduction in absolute distance: abs(beforeGap) - abs(afterGap).
 */
export function buildProjectedPortfolioAfterContribution(
  params: BuildProjectedPortfolioAfterContributionParams,
): ProjectedPortfolioAfterContribution {
  const currency = params.currency || 'BRL';
  const asOf = params.asOf || params.contributionSimulation.asOf;
  const modelVersion = OPPORTUNITY_MODEL_VERSION;

  const sim = params.contributionSimulation;
  const targetWeights = params.classTargetWeights || {};

  // 1. Resolve authoritative baseline positions (Parte J & K)
  const baseline =
    params.baselinePositions && params.baselinePositions.length > 0
      ? params.baselinePositions
      : toProjectionBaselinePositions(params.radarItems || []);

  let beforeInvestedCents = 0;
  let valuedAssets = 0;
  let quoteFreshCount = 0;
  let quoteStaleCount = 0;
  let quoteUnknownCount = 0;

  // Build radar item fast lookup for supplementary radar metadata (like name or assetType)
  const radarItemMap = new Map<string, OpportunityRadarItem>();
  if (params.radarItems) {
    for (const r of params.radarItems) {
      radarItemMap.set(r.assetId, r);
      radarItemMap.set(r.ticker, r);
    }
  }

  for (const pos of baseline) {
    if (pos.isValued && typeof pos.marketValueCents === 'number' && pos.marketValueCents > 0) {
      valuedAssets++;
      beforeInvestedCents += pos.marketValueCents;
    }

    if (pos.quoteFreshness === 'FRESH') {
      quoteFreshCount++;
    } else if (pos.quoteFreshness === 'STALE') {
      quoteStaleCount++;
    } else {
      quoteUnknownCount++;
    }
  }

  const totalAssets = baseline.length;
  const incompleteAssets = totalAssets - valuedAssets;
  const projectionComplete = totalAssets > 0 && incompleteAssets === 0;
  const weightBasis: 'FULL_PORTFOLIO' | 'VALUED_POSITIONS_ONLY' = projectionComplete
    ? 'FULL_PORTFOLIO'
    : 'VALUED_POSITIONS_ONLY';

  // 2. Map simulated allocations
  const allocMap = new Map<string, number>();
  for (const alloc of sim.allocations) {
    allocMap.set(alloc.assetId, alloc.targetCents);
    allocMap.set(alloc.ticker, alloc.targetCents);
  }

  const allocatedCents = sim.allocatedCents;
  const unallocatedCents = sim.unallocatedCents;
  const totalContributionCents = sim.totalCents;

  // Invariant (Parte H, I, AN, AO, AQ): unallocated funds do NOT enter projected invested asset value!
  const afterInvestedCents = beforeInvestedCents + allocatedCents;

  // 3. Compute asset-level before and after projections (Parte S, T, AO, AP)
  const assetProjection: ProjectedAssetAllocation[] = [];
  const beforeAssetWeights: Record<string, number> = {};
  const afterAssetWeights: Record<string, number> = {};

  for (const pos of baseline) {
    const radarRef = radarItemMap.get(pos.assetId) ?? radarItemMap.get(pos.ticker);
    const assetType = (pos.assetType || radarRef?.assetType || 'STOCK') as OpportunityAssetType;
    const name = pos.name || radarRef?.name || pos.ticker;
    const dataFreshness = (pos.quoteFreshness || radarRef?.dataFreshness || 'UNKNOWN') as QuoteFreshness;

    const contribCents = allocMap.get(pos.assetId) ?? allocMap.get(pos.ticker) ?? 0;

    if (!pos.isValued || pos.marketValueCents === null || pos.marketValueCents === undefined) {
      // Incomplete position: preserve visibility without inventing 0 as real market value (Parte S & T)
      const afterCents = contribCents > 0 ? contribCents : null;
      const afterWeightPercent =
        contribCents > 0 && afterInvestedCents > 0
          ? Math.round((contribCents / afterInvestedCents) * 10000) / 100
          : null;

      assetProjection.push({
        assetId: pos.assetId,
        ticker: pos.ticker,
        name,
        assetType,
        beforeValue: null,
        simulatedContribution: formatCentsToDecimal(contribCents),
        afterValue: afterCents !== null ? formatCentsToDecimal(afterCents) : null,
        beforeCents: null,
        contributionCents: contribCents,
        afterCents,
        beforeWeightPercent: null,
        afterWeightPercent,
        deltaWeightPercent: null,
        dataFreshness,
        isValued: false,
        projectionStatus: 'INCOMPLETE',
      });
      continue;
    }

    // Valued position
    const beforeCents = pos.marketValueCents;
    const afterCents = beforeCents + contribCents;

    const beforeWeightPercent =
      beforeInvestedCents > 0
        ? Math.round((beforeCents / beforeInvestedCents) * 10000) / 100
        : 0;
    const afterWeightPercent =
      afterInvestedCents > 0
        ? Math.round((afterCents / afterInvestedCents) * 10000) / 100
        : 0;
    const deltaWeightPercent =
      Math.round((afterWeightPercent - beforeWeightPercent) * 100) / 100;

    beforeAssetWeights[pos.ticker] = beforeWeightPercent;
    afterAssetWeights[pos.ticker] = afterWeightPercent;

    assetProjection.push({
      assetId: pos.assetId,
      ticker: pos.ticker,
      name,
      assetType,
      beforeValue: formatCentsToDecimal(beforeCents),
      simulatedContribution: formatCentsToDecimal(contribCents),
      afterValue: formatCentsToDecimal(afterCents),
      beforeCents,
      contributionCents: contribCents,
      afterCents,
      beforeWeightPercent,
      afterWeightPercent,
      deltaWeightPercent,
      dataFreshness,
      isValued: true,
      projectionStatus: 'VALUED',
    });
  }

  // 4. Compute class-level before and after projections (Parte AA, AB, AC, AD, AE)
  const classBuckets = new Map<
    string,
    {
      beforeCents: number;
      afterCents: number;
      incompleteCount: number;
    }
  >();

  // Ensure classes present in targets or holdings are initialized
  for (const pos of baseline) {
    const cls = pos.assetType || 'STOCK';
    if (!classBuckets.has(cls)) {
      classBuckets.set(cls, { beforeCents: 0, afterCents: 0, incompleteCount: 0 });
    }
  }
  for (const classKey of Object.keys(targetWeights)) {
    if (!classBuckets.has(classKey)) {
      classBuckets.set(classKey, { beforeCents: 0, afterCents: 0, incompleteCount: 0 });
    }
  }

  for (const ap of assetProjection) {
    const bucket = classBuckets.get(ap.assetType);
    if (bucket) {
      if (ap.isValued && ap.beforeCents !== null && ap.afterCents !== null) {
        bucket.beforeCents += ap.beforeCents;
        bucket.afterCents += ap.afterCents;
      } else {
        bucket.incompleteCount++;
      }
    }
  }

  const classProjection: ProjectedClassAllocation[] = [];
  const beforeClassWeights: Record<string, number> = {};
  const afterClassWeights: Record<string, number> = {};

  let improvedCount = 0;
  let worsenedCount = 0;
  let unchangedCount = 0;

  let largestResidualGap: { classId: string; gapPercent: number } | null = null;
  let closestToTarget: { classId: string; gapPercent: number } | null = null;
  let maxAbsGap = -1;
  let minAbsGap = 999999;

  for (const [classId, bucket] of classBuckets.entries()) {
    const label = formatClassLabel(classId);

    const beforeWeightPercent =
      beforeInvestedCents > 0
        ? Math.round((bucket.beforeCents / beforeInvestedCents) * 10000) / 100
        : 0;
    const afterWeightPercent =
      afterInvestedCents > 0
        ? Math.round((bucket.afterCents / afterInvestedCents) * 10000) / 100
        : 0;

    beforeClassWeights[classId] = beforeWeightPercent;
    afterClassWeights[classId] = afterWeightPercent;

    const targetWeightPercent = targetWeights[classId];
    const hasTarget = typeof targetWeightPercent === 'number' && !isNaN(targetWeightPercent);

    let beforeGapPercent: number | undefined;
    let afterGapPercent: number | undefined;
    let gapImprovementPercent: number | undefined;
    let status: 'IMPROVED' | 'WORSENED' | 'UNCHANGED' | 'NO_TARGET' = 'NO_TARGET';

    if (hasTarget && targetWeightPercent !== undefined) {
      beforeGapPercent = Math.round((targetWeightPercent - beforeWeightPercent) * 100) / 100;
      afterGapPercent = Math.round((targetWeightPercent - afterWeightPercent) * 100) / 100;

      const beforeDist = Math.abs(beforeGapPercent);
      const afterDist = Math.abs(afterGapPercent);
      const distanceReduction = Math.round((beforeDist - afterDist) * 100) / 100;
      gapImprovementPercent = distanceReduction;

      if (distanceReduction > TOLERANCE_GAP_IMPROVEMENT_PP) {
        status = 'IMPROVED';
        improvedCount++;
      } else if (distanceReduction < -TOLERANCE_GAP_IMPROVEMENT_PP) {
        status = 'WORSENED';
        worsenedCount++;
      } else {
        status = 'UNCHANGED';
        unchangedCount++;
      }

      if (afterDist > maxAbsGap) {
        maxAbsGap = afterDist;
        largestResidualGap = { classId, gapPercent: afterGapPercent };
      }
      if (afterDist < minAbsGap) {
        minAbsGap = afterDist;
        closestToTarget = { classId, gapPercent: afterGapPercent };
      }
    }

    classProjection.push({
      classId,
      label,
      beforeValue: formatCentsToDecimal(bucket.beforeCents),
      afterValue: formatCentsToDecimal(bucket.afterCents),
      beforeCents: bucket.beforeCents,
      afterCents: bucket.afterCents,
      beforeWeightPercent,
      afterWeightPercent,
      targetWeightPercent,
      beforeGapPercent,
      afterGapPercent,
      gapImprovementPercent,
      status,
      isPartial: bucket.incompleteCount > 0,
      incompletePositionCount: bucket.incompleteCount,
    });
  }

  // Sort class projections alphabetically by label
  classProjection.sort((a, b) => a.label.localeCompare(b.label));

  // 5. Compute Concentration Metrics on valued assets
  const valuedAssetProjections = assetProjection.filter(
    (a) => a.isValued && a.beforeWeightPercent !== null && a.afterWeightPercent !== null,
  );

  const sortedBefore = [...valuedAssetProjections].sort(
    (a, b) => (b.beforeWeightPercent ?? 0) - (a.beforeWeightPercent ?? 0),
  );
  const sortedAfter = [...valuedAssetProjections].sort(
    (a, b) => (b.afterWeightPercent ?? 0) - (a.afterWeightPercent ?? 0),
  );

  const largestAssetTickerBefore = sortedBefore[0]?.ticker ?? null;
  const largestAssetWeightBefore = sortedBefore[0]?.beforeWeightPercent ?? 0;

  const largestAssetTickerAfter = sortedAfter[0]?.ticker ?? null;
  const largestAssetWeightAfter = sortedAfter[0]?.afterWeightPercent ?? 0;

  const top3WeightBefore = Math.round(
    sortedBefore.slice(0, 3).reduce((acc, a) => acc + (a.beforeWeightPercent ?? 0), 0) * 100,
  ) / 100;
  const top3WeightAfter = Math.round(
    sortedAfter.slice(0, 3).reduce((acc, a) => acc + (a.afterWeightPercent ?? 0), 0) * 100,
  ) / 100;

  const concentration: ConcentrationProjection = {
    largestAssetTickerBefore,
    largestAssetTickerAfter,
    largestAssetWeightBefore,
    largestAssetWeightAfter,
    top3WeightBefore,
    top3WeightAfter,
    deltaLargestAssetWeight:
      Math.round((largestAssetWeightAfter - largestAssetWeightBefore) * 100) / 100,
    deltaTop3Weight: Math.round((top3WeightAfter - top3WeightBefore) * 100) / 100,
  };

  // 6. Gather warnings (Parte BO & UI)
  const warnings: string[] = [];

  if (unallocatedCents > 0) {
    warnings.push(
      `O valor não alocado de ${currency} ${formatCentsToDecimal(unallocatedCents)} não foi incorporado aos ativos projetados.`,
    );
  }

  if (quoteStaleCount > 0) {
    warnings.push(
      `${quoteStaleCount} ativo(s) com cotação desatualizada; a projeção estrutural utiliza a última cotação conhecida.`,
    );
  }

  if (incompleteAssets > 0) {
    warnings.push(
      `Valuation parcial: ${incompleteAssets} de ${totalAssets} posição(ões) não possui valor confiável. Pesos calculados apenas sobre as posições com valuation disponível.`,
    );
  }

  if (beforeInvestedCents === 0) {
    warnings.push(
      'Não há posições avaliadas suficientes na carteira para projeção estrutural.',
    );
  }

  const beforeState: ProjectedPortfolioState = {
    portfolioMarketValue: formatCentsToDecimal(beforeInvestedCents),
    investedAssetValue: formatCentsToDecimal(beforeInvestedCents),
    investedAssetCents: beforeInvestedCents,
    classWeights: beforeClassWeights,
    assetWeights: beforeAssetWeights,
  };

  const afterState: ProjectedPortfolioState = {
    portfolioMarketValue: formatCentsToDecimal(afterInvestedCents),
    investedAssetValue: formatCentsToDecimal(afterInvestedCents),
    investedAssetCents: afterInvestedCents,
    classWeights: afterClassWeights,
    assetWeights: afterAssetWeights,
  };

  return {
    portfolioId: params.portfolioId,
    asOf,
    scenarioId: params.scenarioId,
    scenarioLabel: params.scenarioLabel,
    contributionAmount: formatCentsToDecimal(totalContributionCents),
    allocatedAmount: formatCentsToDecimal(allocatedCents),
    unallocatedAmount: formatCentsToDecimal(unallocatedCents),
    totalCents: totalContributionCents,
    allocatedCents,
    unallocatedCents,
    before: beforeState,
    after: afterState,
    deltas: {
      investedAssetValueDelta: formatCentsToDecimal(allocatedCents),
      investedAssetCentsDelta: allocatedCents,
    },
    classProjection,
    assetProjection,
    concentration,
    targetProgress: {
      improvedCount,
      worsenedCount,
      unchangedCount,
      largestResidualGap,
      closestToTarget,
    },
    warnings,
    dataQuality: {
      totalAssets,
      valuedAssets,
      incompleteAssets,
      quoteFreshCount,
      quoteStaleCount,
      quoteUnknownCount,
      projectionComplete,
      weightBasis,
    },
    modelVersion,
  };
}

/**
 * Pure deterministic projection comparison engine for the 3 contribution scenarios:
 * CAUTIOUS, BALANCED, and OPPORTUNITY_FOCUS.
 *
 * Rules:
 * - Same baseline before state shared across all scenarios.
 * - Distinct after states reflecting each scenario's simulated distribution.
 * - Exact cents arithmetic, zero provider multiplication.
 * - Objective comparison insights without subjective "melhor cenário" declarations.
 */
export function buildProjectedPortfolioScenarioComparison(
  params: BuildProjectedPortfolioScenarioComparisonParams,
): ProjectedPortfolioScenarioComparison {
  const currency = params.currency || 'BRL';
  const asOf = params.asOf || params.scenarioComparison.asOf;
  const modelVersion = OPPORTUNITY_MODEL_VERSION;

  const scenariosOut: Array<{
    scenarioId: string;
    scenarioLabel: string;
    description: string;
    projection: ProjectedPortfolioAfterContribution;
  }> = [];

  for (const scen of params.scenarioComparison.scenarios) {
    const proj = buildProjectedPortfolioAfterContribution({
      portfolioId: params.portfolioId,
      asOf,
      currency,
      scenarioId: scen.id,
      scenarioLabel: scen.label,
      baselinePositions: params.baselinePositions,
      radarItems: params.radarItems,
      contributionSimulation: {
        portfolioId: params.portfolioId,
        asOf,
        contributionAmount: params.scenarioComparison.contributionAmount,
        currency,
        allocatedAmount: scen.allocatedAmount,
        unallocatedAmount: scen.unallocatedAmount,
        allocatedCents: scen.allocatedCents,
        unallocatedCents: scen.unallocatedCents,
        totalCents: scen.totalCents,
        allocations: scen.allocations,
        excludedAssets: scen.excludedAssets,
        assumptions: [],
        warnings: [],
        dataQuality: params.scenarioComparison.dataQuality,
        modelVersion,
      },
      classTargetWeights: params.classTargetWeights,
      referenceDate: params.referenceDate,
    });

    scenariosOut.push({
      scenarioId: scen.id,
      scenarioLabel: scen.label,
      description: scen.description,
      projection: proj,
    });
  }

  // Derive comparison insights across the 3 scenarios
  const comparisonInsights = deriveScenarioComparisonInsights(scenariosOut);

  // Common warnings (deduplicated)
  const commonWarnings = Array.from(
    new Set(scenariosOut.flatMap((s) => s.projection.warnings)),
  );

  const sharedBefore = scenariosOut[0]?.projection.before ?? {
    portfolioMarketValue: '0.00',
    investedAssetValue: '0.00',
    investedAssetCents: 0,
    classWeights: {},
    assetWeights: {},
  };

  const sharedDataQuality = scenariosOut[0]?.projection.dataQuality ?? {
    totalAssets: 0,
    valuedAssets: 0,
    incompleteAssets: 0,
    quoteFreshCount: 0,
    quoteStaleCount: 0,
    quoteUnknownCount: 0,
    projectionComplete: false,
    weightBasis: 'FULL_PORTFOLIO' as const,
  };

  return {
    portfolioId: params.portfolioId,
    asOf,
    contributionAmount: params.scenarioComparison.contributionAmount,
    currency,
    before: sharedBefore,
    scenarios: scenariosOut,
    comparisonInsights,
    commonWarnings,
    dataQuality: sharedDataQuality,
    modelVersion,
  };
}

/** Formats uppercase class key e.g. "STOCK" -> "Ações", "FII" -> "Fundos Imobiliários". */
function formatClassLabel(classId: string): string {
  switch (classId.toUpperCase()) {
    case 'STOCK':
    case 'STOCKS':
    case 'EQUITY':
      return 'Ações';
    case 'FII':
    case 'REIT':
      return 'Fundos Imobiliários';
    case 'FIXED_INCOME':
    case 'RF':
      return 'Renda Fixa';
    case 'INTERNATIONAL':
    case 'GLOBAL':
      return 'Internacional';
    case 'CASH':
      return 'Caixa & Equivalentes';
    case 'CRYPTO':
      return 'Criptoativos';
    default:
      return classId;
  }
}

/** Objective comparison insights across CAUTIOUS, BALANCED, and OPPORTUNITY_FOCUS. */
function deriveScenarioComparisonInsights(
  scenarios: Array<{
    scenarioId: string;
    scenarioLabel: string;
    projection: ProjectedPortfolioAfterContribution;
  }>,
): string[] {
  const insights: string[] = [];

  const cautious = scenarios.find((s) => s.scenarioId === 'CAUTIOUS')?.projection;
  const balanced = scenarios.find((s) => s.scenarioId === 'BALANCED')?.projection;
  const opportunity = scenarios.find((s) => s.scenarioId === 'OPPORTUNITY_FOCUS')?.projection;

  if (!cautious || !balanced || !opportunity) {
    return insights;
  }

  // 1. Target progress comparison
  const bImproved = balanced.targetProgress.improvedCount;
  const cImproved = cautious.targetProgress.improvedCount;
  const oImproved = opportunity.targetProgress.improvedCount;

  if (bImproved !== cImproved || bImproved !== oImproved) {
    insights.push(
      `O cenário Balanceado aproxima ${bImproved} classe(s) do alvo, enquanto Cautela aproxima ${cImproved} e Oportunidade aproxima ${oImproved}.`,
    );
  }

  // 2. Largest residual gap
  if (balanced.targetProgress.largestResidualGap) {
    const gap = balanced.targetProgress.largestResidualGap;
    insights.push(
      `Maior gap residual projetado no cenário balanceado: classe ${gap.classId} (${gap.gapPercent > 0 ? '+' : ''}${gap.gapPercent.toFixed(1)} p.p. frente ao alvo).`,
    );
  }

  // 3. Concentration comparison
  const oppConc = opportunity.concentration.largestAssetWeightAfter;
  const balConc = balanced.concentration.largestAssetWeightAfter;
  const cautConc = cautious.concentration.largestAssetWeightAfter;

  if (Math.abs(oppConc - cautConc) >= 0.5) {
    insights.push(
      `A concentração projetada no maior ativo varia de ${cautConc.toFixed(1)}% (Cautela) a ${oppConc.toFixed(1)}% (Oportunidade), com ${balConc.toFixed(1)}% no Balanceado.`,
    );
  }

  // 4. Unallocated difference if any
  if (
    cautious.unallocatedCents !== balanced.unallocatedCents ||
    balanced.unallocatedCents !== opportunity.unallocatedCents
  ) {
    insights.push(
      'Os cenários diferem no valor retido não alocado devido aos limites de concentração e fatia mínima.',
    );
  }

  if (insights.length === 0) {
    insights.push(
      'Os cenários projetam reduções graduais nos gaps de alocação de acordo com os critérios de cada modo.',
    );
  }

  return insights.slice(0, 4);
}

/** Converts decimal string e.g. "2000.50" to integer cents (200050) without float errors. */
function parseDecimalToCents(amountStr?: string | null): number {
  if (!amountStr) return 0;
  const cleaned = amountStr.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match || !match[1]) return 0;
  const whole = parseInt(match[1], 10);
  const fracStr = (match[2] || '').padEnd(2, '0');
  const frac = parseInt(fracStr.slice(0, 2), 10);
  return whole * 100 + frac;
}

/** Formats integer cents e.g. 200050 to canonical "2000.50". */
function formatCentsToDecimal(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = Math.abs(cents % 100);
  return `${whole}.${String(frac).padStart(2, '0')}`;
}
