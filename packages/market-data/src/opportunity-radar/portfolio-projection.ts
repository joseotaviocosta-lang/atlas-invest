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
}

export interface ProjectedAssetAllocation {
  assetId: string;
  ticker: string;
  name: string;
  assetType: OpportunityAssetType;
  beforeValue: string;
  simulatedContribution: string;
  afterValue: string;
  beforeCents: number;
  contributionCents: number;
  afterCents: number;
  beforeWeightPercent: number;
  afterWeightPercent: number;
  deltaWeightPercent: number;
  dataFreshness: QuoteFreshness;
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
  projectionComplete: boolean;
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
  radarItems: readonly OpportunityRadarItem[];
  contributionSimulation: ContributionAllocationSimulation;
  classTargetWeights?: Record<string, number>;
  referenceDate?: Date;
}

export interface BuildProjectedPortfolioScenarioComparisonParams {
  portfolioId: string;
  asOf?: string;
  currency?: string;
  radarItems: readonly OpportunityRadarItem[];
  scenarioComparison: ContributionScenarioComparison;
  classTargetWeights?: Record<string, number>;
  referenceDate?: Date;
}

const TOLERANCE_GAP_IMPROVEMENT_PP = 0.05;

/**
 * Pure deterministic projection engine to compute portfolio weights,
 * class gaps, and concentration before vs after a simulated contribution.
 *
 * Principles:
 * - Read-only: zero DB mutations, zero orders, zero transaction ledger edits.
 * - Exact cents arithmetic: afterInvestedCents = beforeInvestedCents + allocatedCents.
 * - Unallocated funds (unallocatedCents > 0) are strictly excluded from projected invested asset value.
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

  // 1. Audit current portfolio holdings from radarItems
  let beforeInvestedCents = 0;
  let valuedAssets = 0;
  let quoteFreshCount = 0;
  let quoteStaleCount = 0;

  const assetBaseMap = new Map<
    string,
    {
      item: OpportunityRadarItem;
      beforeCents: number;
      isValued: boolean;
    }
  >();

  for (const item of params.radarItems) {
    const rawValStr = item.marketValue;
    const isValued = Boolean(rawValStr && rawValStr !== '0' && /^\d+(\.\d{1,2})?$/.test(rawValStr));
    const cents = isValued ? parseDecimalToCents(rawValStr) : 0;

    if (isValued) {
      valuedAssets++;
      beforeInvestedCents += cents;
    }

    if (item.dataFreshness === 'FRESH') {
      quoteFreshCount++;
    } else if (item.dataFreshness === 'STALE') {
      quoteStaleCount++;
    }

    assetBaseMap.set(item.assetId, { item, beforeCents: cents, isValued });
  }

  const totalAssets = params.radarItems.length;
  const incompleteAssets = totalAssets - valuedAssets;
  const projectionComplete = incompleteAssets === 0 && totalAssets > 0;

  // 2. Map simulated allocations
  const allocMap = new Map<string, number>();
  for (const alloc of sim.allocations) {
    allocMap.set(alloc.assetId, alloc.targetCents);
    allocMap.set(alloc.ticker, alloc.targetCents);
  }

  const allocatedCents = sim.allocatedCents;
  const unallocatedCents = sim.unallocatedCents;
  const totalContributionCents = sim.totalCents;

  // Invariant (Parte H, I, AN, AO): unallocated funds do NOT enter projected invested asset value!
  const afterInvestedCents = beforeInvestedCents + allocatedCents;

  // 3. Compute asset-level before and after projections
  const assetProjection: ProjectedAssetAllocation[] = [];
  const beforeAssetWeights: Record<string, number> = {};
  const afterAssetWeights: Record<string, number> = {};

  for (const item of params.radarItems) {
    const base = assetBaseMap.get(item.assetId);
    const beforeCents = base?.beforeCents ?? 0;
    const contribCents = allocMap.get(item.assetId) ?? allocMap.get(item.ticker) ?? 0;
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

    beforeAssetWeights[item.ticker] = beforeWeightPercent;
    afterAssetWeights[item.ticker] = afterWeightPercent;

    assetProjection.push({
      assetId: item.assetId,
      ticker: item.ticker,
      name: item.name,
      assetType: item.assetType,
      beforeValue: formatCentsToDecimal(beforeCents),
      simulatedContribution: formatCentsToDecimal(contribCents),
      afterValue: formatCentsToDecimal(afterCents),
      beforeCents,
      contributionCents: contribCents,
      afterCents,
      beforeWeightPercent,
      afterWeightPercent,
      deltaWeightPercent,
      dataFreshness: item.dataFreshness as QuoteFreshness,
    });
  }

  // 4. Compute class-level before and after projections
  const classBuckets = new Map<
    string,
    {
      beforeCents: number;
      afterCents: number;
    }
  >();

  // Ensure classes present in targets or holdings are initialized
  for (const item of params.radarItems) {
    if (!classBuckets.has(item.assetType)) {
      classBuckets.set(item.assetType, { beforeCents: 0, afterCents: 0 });
    }
  }
  for (const classKey of Object.keys(targetWeights)) {
    if (!classBuckets.has(classKey)) {
      classBuckets.set(classKey, { beforeCents: 0, afterCents: 0 });
    }
  }

  for (const ap of assetProjection) {
    const bucket = classBuckets.get(ap.assetType);
    if (bucket) {
      bucket.beforeCents += ap.beforeCents;
      bucket.afterCents += ap.afterCents;
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

  for (const [classId, bucket] of classBuckets.entries()) {
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
    const hasTarget = targetWeightPercent !== undefined && typeof targetWeightPercent === 'number';

    let beforeGapPercent: number | undefined;
    let afterGapPercent: number | undefined;
    let gapImprovementPercent: number | undefined;
    let status: ProjectedClassAllocation['status'] = 'NO_TARGET';

    if (hasTarget) {
      // Standard Atlas gap sign convention: target - current
      beforeGapPercent = Math.round((targetWeightPercent - beforeWeightPercent) * 100) / 100;
      afterGapPercent = Math.round((targetWeightPercent - afterWeightPercent) * 100) / 100;

      // Improvement by absolute distance: abs(before) - abs(after)
      const beforeDist = Math.abs(beforeGapPercent);
      const afterDist = Math.abs(afterGapPercent);
      gapImprovementPercent = Math.round((beforeDist - afterDist) * 100) / 100;

      if (gapImprovementPercent > TOLERANCE_GAP_IMPROVEMENT_PP) {
        status = 'IMPROVED';
        improvedCount++;
      } else if (gapImprovementPercent < -TOLERANCE_GAP_IMPROVEMENT_PP) {
        status = 'WORSENED';
        worsenedCount++;
      } else {
        status = 'UNCHANGED';
        unchangedCount++;
      }

      // Track largest residual gap and closest to target
      if (
        largestResidualGap === null ||
        Math.abs(afterGapPercent) > Math.abs(largestResidualGap.gapPercent)
      ) {
        largestResidualGap = { classId, gapPercent: afterGapPercent };
      }

      if (
        closestToTarget === null ||
        Math.abs(afterGapPercent) < Math.abs(closestToTarget.gapPercent)
      ) {
        closestToTarget = { classId, gapPercent: afterGapPercent };
      }
    }

    const label =
      classId === 'STOCK'
        ? 'Ações'
        : classId === 'FII'
          ? 'Fundos Imobiliários (FIIs)'
          : classId;

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
    });
  }

  // Sort class projections alphabetically by label
  classProjection.sort((a, b) => a.label.localeCompare(b.label));

  // 5. Compute Concentration Metrics (Parte AB, AC, AD, AE)
  const sortedBefore = [...assetProjection].sort(
    (a, b) => b.beforeWeightPercent - a.beforeWeightPercent,
  );
  const sortedAfter = [...assetProjection].sort(
    (a, b) => b.afterWeightPercent - a.afterWeightPercent,
  );

  const largestAssetTickerBefore = sortedBefore[0]?.ticker ?? null;
  const largestAssetWeightBefore = sortedBefore[0]?.beforeWeightPercent ?? 0;

  const largestAssetTickerAfter = sortedAfter[0]?.ticker ?? null;
  const largestAssetWeightAfter = sortedAfter[0]?.afterWeightPercent ?? 0;

  const top3WeightBefore = Math.round(
    sortedBefore.slice(0, 3).reduce((acc, a) => acc + a.beforeWeightPercent, 0) * 100,
  ) / 100;
  const top3WeightAfter = Math.round(
    sortedAfter.slice(0, 3).reduce((acc, a) => acc + a.afterWeightPercent, 0) * 100,
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

  // 6. Gather warnings
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
      `Valuation parcial: ${incompleteAssets} ativo(s) sem valor de mercado confiável. A projeção não cobre 100% da carteira.`,
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
      projectionComplete,
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
        assumptions: scen.assumptions,
        warnings: scen.warnings,
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

  const baselineBefore = scenariosOut[0]?.projection.before ?? {
    portfolioMarketValue: '0.00',
    investedAssetValue: '0.00',
    investedAssetCents: 0,
    classWeights: {},
    assetWeights: {},
  };

  // Derive comparison insights objectively
  const comparisonInsights = deriveScenarioProjectionInsights(scenariosOut);

  // Common warnings
  const commonWarningsSet = new Set<string>();
  for (const s of scenariosOut) {
    for (const w of s.projection.warnings) {
      if (scenariosOut.every((other) => other.projection.warnings.includes(w))) {
        commonWarningsSet.add(w);
      }
    }
  }

  const dataQuality = scenariosOut[0]?.projection.dataQuality ?? {
    totalAssets: params.radarItems.length,
    valuedAssets: 0,
    incompleteAssets: params.radarItems.length,
    quoteFreshCount: 0,
    quoteStaleCount: 0,
    projectionComplete: false,
  };

  return {
    portfolioId: params.portfolioId,
    asOf,
    contributionAmount: params.scenarioComparison.contributionAmount,
    currency,
    before: baselineBefore,
    scenarios: scenariosOut,
    comparisonInsights,
    commonWarnings: Array.from(commonWarningsSet),
    dataQuality,
    modelVersion,
  };
}

/**
 * Derives objective comparison insights comparing the 3 projected scenarios.
 * Strictly neutral, zero suitability claims, zero "melhor cenário".
 */
function deriveScenarioProjectionInsights(
  scenarios: Array<{
    scenarioId: string;
    scenarioLabel: string;
    description: string;
    projection: ProjectedPortfolioAfterContribution;
  }>,
): string[] {
  if (scenarios.length === 0) return [];

  const cautious = scenarios.find((s) => s.scenarioId === 'CAUTIOUS')?.projection;
  const balanced = scenarios.find((s) => s.scenarioId === 'BALANCED')?.projection;
  const opportunity = scenarios.find((s) => s.scenarioId === 'OPPORTUNITY_FOCUS')?.projection;

  if (!cautious || !balanced || !opportunity) return [];

  // Check if allocations are identical
  const bAllocStr = balanced.assetProjection.map((a) => `${a.ticker}:${a.afterCents}`).join('|');
  const cAllocStr = cautious.assetProjection.map((a) => `${a.ticker}:${a.afterCents}`).join('|');
  const oAllocStr = opportunity.assetProjection.map((a) => `${a.ticker}:${a.afterCents}`).join('|');

  if (bAllocStr === cAllocStr && cAllocStr === oAllocStr) {
    return ['As projeções dos três cenários resultaram na mesma estrutura patrimonial com os dados atuais.'];
  }

  const insights: string[] = [];

  // 1. Target gaps progress
  const bImproved = balanced.targetProgress.improvedCount;
  const cImproved = cautious.targetProgress.improvedCount;
  const oImproved = opportunity.targetProgress.improvedCount;

  if (bImproved > 0 || cImproved > 0 || oImproved > 0) {
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
  if (cautious.unallocatedCents !== balanced.unallocatedCents || balanced.unallocatedCents !== opportunity.unallocatedCents) {
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
