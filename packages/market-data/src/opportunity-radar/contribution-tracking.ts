import {
  OPPORTUNITY_MODEL_VERSION,
  OpportunityAssetType,
  OpportunityRadarItem,
} from './types';
import {
  ProjectionBaselinePosition,
  ProjectedPortfolioAfterContribution,
} from './portfolio-projection';

export type ContributionPlanSource =
  | 'SAVED_GOAL'
  | 'USER_SIMULATION'
  | 'EXPLICIT_PLAN';

export interface ContributionPlanAllocationItem {
  assetId: string;
  ticker: string;
  name: string;
  assetType: OpportunityAssetType;
  plannedCents: number;
  plannedAmount: string; // e.g. "800.00"
  plannedPercent: number; // e.g. 40.0
}

export interface ContributionPlanSnapshot {
  id?: string;
  portfolioId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  plannedCents: number;
  plannedAmount: string; // e.g. "2000.00"
  currency: string; // "BRL"
  source: ContributionPlanSource;
  scenarioId?: string;
  allocations: ContributionPlanAllocationItem[];
  createdAt?: string;
}

export type ContributionPlanAssetStatus =
  | 'NOT_STARTED'
  | 'PARTIAL'
  | 'COMPLETE'
  | 'OVER_PLAN'
  | 'UNPLANNED';

export interface ContributionPlanAssetProgress {
  assetId: string;
  ticker: string;
  name: string;
  assetType: OpportunityAssetType;
  plannedCents: number;
  actualCents: number;
  remainingCents: number;
  overPlanCents: number;
  completionPercent: number; // raw e.g. 75.0 or 120.0
  cappedCompletionPercent: number; // capped at 100.0 for visual bars
  status: ContributionPlanAssetStatus;
  tradeCount: number;
}

export interface ContributionPlanOverallProgress {
  plannedCents: number;
  actualCents: number;
  remainingCents: number;
  overPlanCents: number;
  completionPercent: number;
  cappedCompletionPercent: number;
  plannedAmount: string;
  actualAmount: string;
  remainingAmount: string;
  overPlanAmount: string;
  status: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETE' | 'OVER_PLAN';
}

export interface ContributionPlanDeviationItem {
  assetId: string;
  ticker: string;
  name: string;
  plannedCents: number;
  actualCents: number;
  deltaCents: number; // actual - planned
  deltaAmount: string;
  deltaPercent: number; // relative to planned
  isUnplanned: boolean;
  isOverPlan: boolean;
}

export interface ContributionPlanTransactionSummary {
  id: string;
  accountId: string;
  assetId: string;
  ticker?: string;
  type: string;
  tradeDate: string;
  amountCents: number;
  amount: string;
  currency: string;
}

export interface ContributionPlanDataQuality {
  valuationQuality: 'FULL_PORTFOLIO' | 'VALUED_POSITIONS_ONLY';
  totalPositions: number;
  valuedPositions: number;
  incompletePositions: number;
  isPartialValuation: boolean;
  trackedPurchaseCount: number;
  excludedSellCount: number;
  excludedOutOfPeriodCount: number;
}

export interface ContributionPlanStructuralComparison {
  hasTargetContext: boolean;
  plannedProjectedGaps?: Record<string, { classId: string; gapPercent: number }>;
  currentActualGaps?: Record<string, { classId: string; gapPercent: number }>;
  improvedClassesCount?: number;
  worsenedClassesCount?: number;
  attributionDisclaimer: string;
}

export interface ContributionPlanProgressResult {
  portfolioId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  plan: ContributionPlanSnapshot;
  overall: ContributionPlanOverallProgress;
  assets: ContributionPlanAssetProgress[];
  unplannedAssets: ContributionPlanAssetProgress[];
  deviations: ContributionPlanDeviationItem[];
  largestDeviations: string[];
  observedTransactions: ContributionPlanTransactionSummary[];
  structuralProgress: ContributionPlanStructuralComparison;
  dataQuality: ContributionPlanDataQuality;
  warnings: string[];
  assumptions: string[];
  sourceTransparencyNote: string;
  cashSourceLimitationNote: string;
  modelVersion: string;
}

export interface TransactionInputForTracking {
  id: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  ticker?: string;
  type: string; // 'BUY', 'SELL', 'DIVIDEND', etc.
  tradeDate: string; // YYYY-MM-DD
  amount: string; // decimal string or money JSON
  currency?: string;
}

export interface DeriveContributionPlanActualsParams {
  plan: ContributionPlanSnapshot;
  transactions: readonly TransactionInputForTracking[];
  baselinePositions?: readonly ProjectionBaselinePosition[];
  radarItems?: readonly OpportunityRadarItem[];
  classTargetWeights?: Record<string, number>;
  projectedState?: ProjectedPortfolioAfterContribution;
  referenceDate?: Date;
}

function parseMoneyToCents(amount: unknown): number {
  if (typeof amount === 'number') {
    return Math.round(amount * 100);
  }
  if (typeof amount !== 'string') {
    return 0;
  }
  const cleaned = amount.trim().replace(',', '.');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return 0;
  const isNeg = Boolean(match[1]);
  const whole = parseInt(match[2] ?? '0', 10);
  const fracStr = (match[3] || '').padEnd(2, '0');
  const frac = parseInt(fracStr.slice(0, 2), 10);
  const cents = whole * 100 + frac;
  return isNeg ? -cents : cents;
}

function formatCentsToDecimal(cents: number): string {
  const isNeg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${isNeg ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`;
}

/**
 * Derives actual investment movements from ledger transactions for a given plan period.
 *
 * Principles:
 * - Read-only, pure derivation.
 * - Exact cents conservation (zero float arithmetic).
 * - Conservative purchase tracking: BUY only (SELL is never counted as contribution).
 * - Period boundaries: periodStart <= tradeDate <= periodEnd.
 * - Multi-account consolidation: all purchases in portfolio accounts are aggregated by asset.
 * - Does not claim cash-flow causation: distinguishes planned vs actual observed.
 */
export function deriveContributionPlanActuals(
  params: DeriveContributionPlanActualsParams,
): ContributionPlanProgressResult {
  const {
    plan,
    transactions,
    baselinePositions = [],
    radarItems = [],
    classTargetWeights = {},
    projectedState,
    referenceDate = new Date(),
  } = params;

  const asOf = referenceDate.toISOString();
  const periodStart = plan.periodStart;
  const periodEnd = plan.periodEnd;

  // Build lookup maps for asset metadata
  const assetMetadata = new Map<
    string,
    { ticker: string; name: string; assetType: OpportunityAssetType }
  >();

  // Seed from plan allocations
  for (const alloc of plan.allocations) {
    assetMetadata.set(alloc.assetId, {
      ticker: alloc.ticker,
      name: alloc.name,
      assetType: alloc.assetType,
    });
  }

  // Enrich from baseline positions
  for (const pos of baselinePositions) {
    if (!assetMetadata.has(pos.assetId)) {
      assetMetadata.set(pos.assetId, {
        ticker: pos.ticker,
        name: pos.name || pos.ticker,
        assetType: (pos.assetType as OpportunityAssetType) || 'STOCK',
      });
    }
  }

  // Enrich from radar items
  for (const r of radarItems) {
    if (!assetMetadata.has(r.assetId)) {
      assetMetadata.set(r.assetId, {
        ticker: r.ticker,
        name: r.name,
        assetType: r.assetType,
      });
    }
  }

  // Filter and classify transactions
  let excludedSellCount = 0;
  let excludedOutOfPeriodCount = 0;
  const observedPurchases: ContributionPlanTransactionSummary[] = [];

  // Group purchases by assetId
  const actualPurchasesByAsset = new Map<
    string,
    { cents: number; count: number; ticker?: string }
  >();

  for (const tx of transactions) {
    const tradeDate = tx.tradeDate.slice(0, 10);

    // Period filter
    if (tradeDate < periodStart || tradeDate > periodEnd) {
      excludedOutOfPeriodCount++;
      continue;
    }

    // Conservative type filtering: BUY is the primary purchase activity.
    // SELL transactions are tracked for quality metrics but NEVER added to actual contribution.
    if (tx.type === 'SELL') {
      excludedSellCount++;
      continue;
    }

    if (tx.type !== 'BUY') {
      // Non-BUY transactions (DIVIDEND, SPLIT, TRANSFER, etc.) do not count as purchases
      continue;
    }

    const txCents = parseMoneyToCents(tx.amount);
    if (txCents <= 0) continue;

    const existing = actualPurchasesByAsset.get(tx.assetId) ?? {
      cents: 0,
      count: 0,
      ticker: tx.ticker,
    };
    existing.cents += txCents;
    existing.count += 1;
    if (tx.ticker && !existing.ticker) existing.ticker = tx.ticker;
    actualPurchasesByAsset.set(tx.assetId, existing);

    observedPurchases.push({
      id: tx.id,
      accountId: tx.accountId,
      assetId: tx.assetId,
      ticker: tx.ticker,
      type: tx.type,
      tradeDate,
      amountCents: txCents,
      amount: formatCentsToDecimal(txCents),
      currency: tx.currency || plan.currency,
    });
  }

  // Process planned allocations
  const plannedAssetIds = new Set<string>();
  const assetProgressList: ContributionPlanAssetProgress[] = [];
  const deviations: ContributionPlanDeviationItem[] = [];

  let totalPlannedCents = 0;
  let totalActualOnPlannedCents = 0;

  for (const alloc of plan.allocations) {
    plannedAssetIds.add(alloc.assetId);
    totalPlannedCents += alloc.plannedCents;

    const actual = actualPurchasesByAsset.get(alloc.assetId);
    const actualCents = actual?.cents ?? 0;
    const tradeCount = actual?.count ?? 0;
    totalActualOnPlannedCents += actualCents;

    const remainingCents = Math.max(alloc.plannedCents - actualCents, 0);
    const overPlanCents = Math.max(actualCents - alloc.plannedCents, 0);

    const completionPercent =
      alloc.plannedCents > 0
        ? Math.round((actualCents / alloc.plannedCents) * 1000) / 10
        : 0;
    const cappedCompletionPercent = Math.min(completionPercent, 100.0);

    let status: ContributionPlanAssetStatus;
    if (actualCents === 0) {
      status = 'NOT_STARTED';
    } else if (actualCents < alloc.plannedCents) {
      status = 'PARTIAL';
    } else if (actualCents === alloc.plannedCents) {
      status = 'COMPLETE';
    } else {
      status = 'OVER_PLAN';
    }

    assetProgressList.push({
      assetId: alloc.assetId,
      ticker: alloc.ticker,
      name: alloc.name,
      assetType: alloc.assetType,
      plannedCents: alloc.plannedCents,
      actualCents,
      remainingCents,
      overPlanCents,
      completionPercent,
      cappedCompletionPercent,
      status,
      tradeCount,
    });

    const deltaCents = actualCents - alloc.plannedCents;
    const deltaPercent =
      alloc.plannedCents > 0
        ? Math.round((deltaCents / alloc.plannedCents) * 1000) / 10
        : 0;

    deviations.push({
      assetId: alloc.assetId,
      ticker: alloc.ticker,
      name: alloc.name,
      plannedCents: alloc.plannedCents,
      actualCents,
      deltaCents,
      deltaAmount: formatCentsToDecimal(deltaCents),
      deltaPercent,
      isUnplanned: false,
      isOverPlan: deltaCents > 0,
    });
  }

  // Process unplanned purchases (assets bought in period but not in plan)
  const unplannedProgressList: ContributionPlanAssetProgress[] = [];
  let totalUnplannedCents = 0;

  for (const [assetId, actual] of actualPurchasesByAsset.entries()) {
    if (plannedAssetIds.has(assetId)) continue;

    totalUnplannedCents += actual.cents;
    const meta = assetMetadata.get(assetId) ?? {
      ticker: actual.ticker || assetId,
      name: actual.ticker || assetId,
      assetType: 'STOCK' as OpportunityAssetType,
    };

    unplannedProgressList.push({
      assetId,
      ticker: meta.ticker,
      name: meta.name,
      assetType: meta.assetType,
      plannedCents: 0,
      actualCents: actual.cents,
      remainingCents: 0,
      overPlanCents: actual.cents,
      completionPercent: 0,
      cappedCompletionPercent: 0,
      status: 'UNPLANNED',
      tradeCount: actual.count,
    });

    deviations.push({
      assetId,
      ticker: meta.ticker,
      name: meta.name,
      plannedCents: 0,
      actualCents: actual.cents,
      deltaCents: actual.cents,
      deltaAmount: formatCentsToDecimal(actual.cents),
      deltaPercent: 100.0,
      isUnplanned: true,
      isOverPlan: true,
    });
  }

  // Sort assets: planned allocations by original order, unplanned by actualCents desc
  unplannedProgressList.sort((a, b) => b.actualCents - a.actualCents);

  // Overall totals
  // Note: Total actual purchases in period = totalActualOnPlannedCents + totalUnplannedCents
  const totalActualCents = totalActualOnPlannedCents + totalUnplannedCents;
  const overallRemainingCents = Math.max(plan.plannedCents - totalActualOnPlannedCents, 0);
  const overallOverPlanCents = Math.max(totalActualCents - plan.plannedCents, 0);

  const overallCompletionPercent =
    plan.plannedCents > 0
      ? Math.round((totalActualOnPlannedCents / plan.plannedCents) * 1000) / 10
      : 0;
  const overallCappedCompletionPercent = Math.min(overallCompletionPercent, 100.0);

  let overallStatus: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETE' | 'OVER_PLAN';
  if (totalActualOnPlannedCents === 0) {
    overallStatus = 'NOT_STARTED';
  } else if (totalActualOnPlannedCents < plan.plannedCents) {
    overallStatus = 'PARTIAL';
  } else if (totalActualOnPlannedCents === plan.plannedCents && totalUnplannedCents === 0) {
    overallStatus = 'COMPLETE';
  } else {
    overallStatus = 'OVER_PLAN';
  }

  const overall: ContributionPlanOverallProgress = {
    plannedCents: plan.plannedCents,
    actualCents: totalActualCents,
    remainingCents: overallRemainingCents,
    overPlanCents: overallOverPlanCents,
    completionPercent: overallCompletionPercent,
    cappedCompletionPercent: overallCappedCompletionPercent,
    plannedAmount: formatCentsToDecimal(plan.plannedCents),
    actualAmount: formatCentsToDecimal(totalActualCents),
    remainingAmount: formatCentsToDecimal(overallRemainingCents),
    overPlanAmount: formatCentsToDecimal(overallOverPlanCents),
    status: overallStatus,
  };

  // Generate largest deviation insights (neutral, factual language)
  const largestDeviations: string[] = [];
  const sortedDeviations = [...deviations].sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));

  for (const dev of sortedDeviations) {
    if (dev.deltaCents === 0) continue;
    if (dev.isUnplanned) {
      largestDeviations.push(
        `${dev.ticker} teve compra de R$ ${formatCentsToDecimal(dev.actualCents)} fora do plano original.`,
      );
    } else if (dev.deltaCents < 0) {
      largestDeviations.push(
        `${dev.ticker} recebeu R$ ${formatCentsToDecimal(Math.abs(dev.deltaCents))} abaixo do planejado.`,
      );
    } else {
      largestDeviations.push(
        `${dev.ticker} recebeu R$ ${formatCentsToDecimal(dev.deltaCents)} acima do planejado.`,
      );
    }
    if (largestDeviations.length >= 3) break;
  }

  // Data quality review
  let totalPositions = 0;
  let valuedPositions = 0;
  let incompletePositions = 0;

  for (const pos of baselinePositions) {
    totalPositions++;
    if (pos.isValued) {
      valuedPositions++;
    } else {
      incompletePositions++;
    }
  }

  const isPartialValuation = incompletePositions > 0;
  const valuationQuality: 'FULL_PORTFOLIO' | 'VALUED_POSITIONS_ONLY' =
    isPartialValuation ? 'VALUED_POSITIONS_ONLY' : 'FULL_PORTFOLIO';

  const dataQuality: ContributionPlanDataQuality = {
    valuationQuality,
    totalPositions,
    valuedPositions,
    incompletePositions,
    isPartialValuation,
    trackedPurchaseCount: observedPurchases.length,
    excludedSellCount,
    excludedOutOfPeriodCount,
  };

  // Structural progress comparison
  const hasTargetContext = Object.keys(classTargetWeights).length > 0;
  const attributionDisclaimer =
    'Variações de peso e alocação na carteira decorrem de múltiplos fatores de mercado (preços, dividendos, compras e vendas). Os movimentos observados não devem ser interpretados como causa exclusiva das alterações estruturais.';

  let plannedProjectedGaps: Record<string, { classId: string; gapPercent: number }> | undefined;
  if (projectedState?.classProjection) {
    plannedProjectedGaps = {};
    for (const cls of projectedState.classProjection) {
      if (cls.afterGapPercent !== undefined) {
        plannedProjectedGaps[cls.classId] = {
          classId: cls.classId,
          gapPercent: cls.afterGapPercent,
        };
      }
    }
  }

  const structuralProgress: ContributionPlanStructuralComparison = {
    hasTargetContext,
    plannedProjectedGaps,
    attributionDisclaimer,
  };

  const warnings: string[] = [];
  if (isPartialValuation) {
    warnings.push(
      `Progresso estrutural calculado com base em ${valuedPositions}/${totalPositions} posições avaliadas. ${incompletePositions} posição(ões) sem cotação recente.`,
    );
  }
  if (totalUnplannedCents > 0) {
    warnings.push(
      `Foram identificadas compras de R$ ${formatCentsToDecimal(totalUnplannedCents)} em ativos não previstos no plano.`,
    );
  }
  if (excludedSellCount > 0) {
    warnings.push(
      `Foram identificadas ${excludedSellCount} operação(ões) de venda no período, as quais foram desconsideradas para o cálculo de aporte.`,
    );
  }

  const assumptions = [
    'Apenas operações de compra (BUY) registradas no ledger dentro do período do plano são contabilizadas.',
    'Valores monetários conservam precisão exata em centavos inteiros.',
    'O acompanhamento não executa ordens nem interage com corretoras.',
  ];

  const sourceTransparencyNote = `Baseado em ${observedPurchases.length} compra(s) registradas no ledger entre ${periodStart} e ${periodEnd}.`;
  const cashSourceLimitationNote =
    'O Atlas identificou compras no período, mas não distingue com precisão a origem do caixa utilizado (novo capital externo vs. reinvestimento de dividendos ou saldo em conta).';

  return {
    portfolioId: plan.portfolioId,
    currency: plan.currency,
    periodStart,
    periodEnd,
    asOf,
    plan,
    overall,
    assets: assetProgressList,
    unplannedAssets: unplannedProgressList,
    deviations,
    largestDeviations,
    observedTransactions: observedPurchases,
    structuralProgress,
    dataQuality,
    warnings,
    assumptions,
    sourceTransparencyNote,
    cashSourceLimitationNote,
    modelVersion: OPPORTUNITY_MODEL_VERSION,
  };
}
