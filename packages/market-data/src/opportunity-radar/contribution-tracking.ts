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
  | 'PERSISTED_PLAN'
  | 'SAVED_GOAL'
  | 'USER_SIMULATION'
  | 'NO_PLAN';

export type ContributionPlanBaselineMode =
  | 'PERSISTED_PLAN'
  | 'LIVE_SIMULATION'
  | 'NO_PLAN';

export interface ContributionPlanCategoryAllocation {
  category: string;
  plannedCents: number;
  plannedAmount: string; // e.g. "1200.00"
  actualCents: number;
  remainingCents: number;
  overPlanCents: number;
  completionPercent: number;
  status: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETE' | 'OVER_PLAN';
}

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
  baselineMode: ContributionPlanBaselineMode;
  baselineStable: boolean;
  plannedDate?: string;
  scenarioId?: string;
  allocations: ContributionPlanAllocationItem[];
  categoryAllocations?: ContributionPlanCategoryAllocation[];
  isCategoryLevelPlan?: boolean;
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
  linkStatus?: 'CONFIRMED' | 'CANDIDATE' | 'REJECTED';
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
  confirmedLinkCount: number;
  rejectedLinkCount: number;
  candidateLinkCount: number;
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
  categories?: ContributionPlanCategoryAllocation[];
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
  amount: string; // decimal string
  currency?: string;
  linkStatus?: 'CONFIRMED' | 'REJECTED' | 'CANDIDATE';
  linkedPlanId?: string;
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

export function parseMoneyToCents(amount: unknown): number {
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

export function formatCentsToDecimal(cents: number): string {
  const isNeg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${isNeg ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`;
}

export function multiplyUnitPriceQuantityToCents(unitPriceStr: string, quantityStr: string): number | null {
  const priceClean = unitPriceStr.trim().replace(',', '.');
  const priceMatch = /^(\d+)(?:\.(\d+))?$/.exec(priceClean);
  if (!priceMatch) return null;
  const priceWhole = BigInt(priceMatch[1] ?? '0');
  const priceFracStr = (priceMatch[2] || '').padEnd(2, '0').slice(0, 2);
  const priceCents = priceWhole * 100n + BigInt(priceFracStr);

  const qtyClean = quantityStr.trim().replace(',', '.');
  const qtyMatch = /^(\d+)(?:\.(\d+))?$/.exec(qtyClean);
  if (!qtyMatch) return null;
  const qtyWhole = BigInt(qtyMatch[1] ?? '0');
  const qtyFracStr = qtyMatch[2] || '';
  const qtyScale = qtyFracStr.length;
  const qtyUnits = qtyWhole * (10n ** BigInt(qtyScale)) + BigInt(qtyFracStr === '' ? '0' : qtyFracStr);

  if (qtyScale === 0) {
    const totalCents = priceCents * qtyWhole;
    return Number(totalCents);
  }
  const scaleDivisor = 10n ** BigInt(qtyScale);
  const totalCents = (priceCents * qtyUnits) / scaleDivisor;
  return Number(totalCents);
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
 * - Preserves persisted plan baseline stability.
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
  let confirmedLinkCount = 0;
  let rejectedLinkCount = 0;
  let candidateLinkCount = 0;
  const observedPurchases: ContributionPlanTransactionSummary[] = [];

  // Group purchases by assetId
  const actualPurchasesByAsset = new Map<
    string,
    { cents: number; count: number; ticker?: string; assetType?: OpportunityAssetType }
  >();

  const warnings: string[] = [];

  for (const tx of transactions) {
    const tradeDate = tx.tradeDate.slice(0, 10);

    // Period filter
    if (tradeDate < periodStart || tradeDate > periodEnd) {
      excludedOutOfPeriodCount++;
      if (tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId === plan.id) {
        warnings.push(
          `Transação confirmada ${tx.id} possui data (${tradeDate}) fora do período do plano (${periodStart} a ${periodEnd}).`,
        );
      }
      continue;
    }

    // Exclude double-linked confirmed transactions belonging to another plan
    if (tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId && plan.id && tx.linkedPlanId !== plan.id) {
      warnings.push(`Transação ${tx.id} confirmada em outro plano e excluída deste plano.`);
      continue;
    }

    // Exclude rejected links
    if (tx.linkStatus === 'REJECTED' && tx.linkedPlanId === plan.id) {
      rejectedLinkCount++;
      continue;
    }

    // Conservative type filtering: BUY is the primary purchase activity.
    // SELL transactions are tracked for quality metrics but NEVER added to actual contribution.
    if (tx.type === 'SELL') {
      excludedSellCount++;
      if (tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId === plan.id) {
        warnings.push(`Transação de VENDA ${tx.id} desconsiderada para cálculo de aporte mesmo com link.`);
      }
      continue;
    }

    if (tx.type !== 'BUY') {
      // Non-BUY transactions (DIVIDEND, SPLIT, TRANSFER, etc.) do not count as purchases
      continue;
    }

    if (tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId === plan.id) {
      confirmedLinkCount++;
    } else if (plan.source === 'PERSISTED_PLAN') {
      candidateLinkCount++;
    }

    const txCents = parseMoneyToCents(tx.amount);
    if (txCents <= 0) continue;

    const meta = assetMetadata.get(tx.assetId);
    const existing = actualPurchasesByAsset.get(tx.assetId) ?? {
      cents: 0,
      count: 0,
      ticker: tx.ticker || meta?.ticker,
      assetType: meta?.assetType,
    };
    existing.cents += txCents;
    existing.count += 1;
    if (tx.ticker && !existing.ticker) existing.ticker = tx.ticker;
    if (meta?.assetType && !existing.assetType) existing.assetType = meta.assetType;
    actualPurchasesByAsset.set(tx.assetId, existing);

    observedPurchases.push({
      id: tx.id,
      accountId: tx.accountId,
      assetId: tx.assetId,
      ticker: tx.ticker || meta?.ticker,
      type: tx.type,
      tradeDate,
      amountCents: txCents,
      amount: formatCentsToDecimal(txCents),
      currency: tx.currency || plan.currency,
      linkStatus: tx.linkStatus,
    });
  }

  // Asset progress tracking
  const plannedAllocationsMap = new Map<string, ContributionPlanAllocationItem>();
  for (const alloc of plan.allocations) {
    plannedAllocationsMap.set(alloc.assetId, alloc);
  }

  const assetProgressList: ContributionPlanAssetProgress[] = [];
  const unplannedProgressList: ContributionPlanAssetProgress[] = [];
  const deviations: ContributionPlanDeviationItem[] = [];

  let totalActualOnPlannedCents = 0;
  let totalUnplannedCents = 0;

  // Process planned allocations
  for (const alloc of plan.allocations) {
    const actualData = actualPurchasesByAsset.get(alloc.assetId);
    const actualCents = actualData ? actualData.cents : 0;
    const tradeCount = actualData ? actualData.count : 0;

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

  // Process unplanned purchases (assets bought in period not in the plan)
  for (const [assetId, actualData] of actualPurchasesByAsset.entries()) {
    if (!plannedAllocationsMap.has(assetId)) {
      totalUnplannedCents += actualData.cents;

      const meta = assetMetadata.get(assetId);
      const ticker = meta?.ticker || actualData.ticker || 'UNKNOWN';
      const name = meta?.name || ticker;
      const assetType = meta?.assetType || 'STOCK';

      unplannedProgressList.push({
        assetId,
        ticker,
        name,
        assetType,
        plannedCents: 0,
        actualCents: actualData.cents,
        remainingCents: 0,
        overPlanCents: actualData.cents,
        completionPercent: 0,
        cappedCompletionPercent: 0,
        status: 'UNPLANNED',
        tradeCount: actualData.count,
      });

      deviations.push({
        assetId,
        ticker,
        name,
        plannedCents: 0,
        actualCents: actualData.cents,
        deltaCents: actualData.cents,
        deltaAmount: formatCentsToDecimal(actualData.cents),
        deltaPercent: 100.0,
        isUnplanned: true,
        isOverPlan: true,
      });
    }
  }

  // Category progress tracking (if categoryAllocations present or category-level plan)
  let categoryResults: ContributionPlanCategoryAllocation[] | undefined;
  if (plan.categoryAllocations && plan.categoryAllocations.length > 0) {
    categoryResults = [];
    const actualCentsByCategory = new Map<string, number>();

    for (const [assetId, actualData] of actualPurchasesByAsset.entries()) {
      const meta = assetMetadata.get(assetId);
      const cat = (meta?.assetType as string) || (actualData.assetType as string) || 'OTHER';
      actualCentsByCategory.set(cat, (actualCentsByCategory.get(cat) ?? 0) + actualData.cents);
    }

    for (const catAlloc of plan.categoryAllocations) {
      const actualCatCents = actualCentsByCategory.get(catAlloc.category) ?? 0;
      const remCatCents = Math.max(catAlloc.plannedCents - actualCatCents, 0);
      const overCatCents = Math.max(actualCatCents - catAlloc.plannedCents, 0);
      const completion =
        catAlloc.plannedCents > 0
          ? Math.round((actualCatCents / catAlloc.plannedCents) * 1000) / 10
          : 0;

      let catStatus: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETE' | 'OVER_PLAN';
      if (actualCatCents === 0) catStatus = 'NOT_STARTED';
      else if (actualCatCents < catAlloc.plannedCents) catStatus = 'PARTIAL';
      else if (actualCatCents === catAlloc.plannedCents) catStatus = 'COMPLETE';
      else catStatus = 'OVER_PLAN';

      categoryResults.push({
        category: catAlloc.category,
        plannedCents: catAlloc.plannedCents,
        plannedAmount: catAlloc.plannedAmount,
        actualCents: actualCatCents,
        remainingCents: remCatCents,
        overPlanCents: overCatCents,
        completionPercent: completion,
        status: catStatus,
      });
    }
  }

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
  if (totalActualOnPlannedCents === 0 && totalUnplannedCents === 0) {
    overallStatus = 'NOT_STARTED';
  } else if (totalActualOnPlannedCents < plan.plannedCents && totalUnplannedCents === 0) {
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
  }

  // Structural progress comparison
  const hasTargetContext = Object.keys(classTargetWeights).length > 0;
  const structuralProgress: ContributionPlanStructuralComparison = {
    hasTargetContext,
    attributionDisclaimer:
      'A evolução dos gaps e pesos reflete movimentos de mercado e operações da carteira, não sendo atribuível exclusivamente aos aportes realizados.',
  };

  // Data quality metrics
  const totalPositions = baselinePositions.length;
  const valuedPositions = baselinePositions.filter((p) => p.isValued).length;
  const incompletePositions = totalPositions - valuedPositions;
  const isPartialValuation = incompletePositions > 0;

  const dataQuality: ContributionPlanDataQuality = {
    valuationQuality: isPartialValuation ? 'VALUED_POSITIONS_ONLY' : 'FULL_PORTFOLIO',
    totalPositions,
    valuedPositions,
    incompletePositions,
    isPartialValuation,
    trackedPurchaseCount: observedPurchases.length,
    excludedSellCount,
    excludedOutOfPeriodCount,
    confirmedLinkCount,
    rejectedLinkCount,
    candidateLinkCount,
  };

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
  if (!plan.baselineStable) {
    warnings.push(
      'A distribuição planejada é recalculada com os dados atuais e pode mudar ao longo do tempo.',
    );
  }

  const assumptions = [
    'Apenas compras registradas no período (BUY) são consideradas como capital aplicado no plano.',
    'Vendas registradas no período são excluídas do cálculo de aporte para preservar a semântica long-only.',
    'A consolidação de compras agrega todas as contas do portfólio por ativo.',
  ];

  let sourceTransparencyNote = 'Simulação baseada na meta mensal ou parâmetros informados.';
  if (plan.source === 'PERSISTED_PLAN') {
    sourceTransparencyNote = `Plano salvo em ${plan.plannedDate || plan.createdAt?.slice(0, 10) || 'data original'}. Base histórica estável (${observedPurchases.length} compra(s) registradas no ledger).`;
  } else if (plan.source === 'SAVED_GOAL') {
    sourceTransparencyNote = `Simulação atual baseada na meta mensal (${observedPurchases.length} compra(s) registradas no ledger).`;
  } else if (plan.source === 'USER_SIMULATION') {
    sourceTransparencyNote = `Simulação atual baseada no valor informado pelo usuário (${observedPurchases.length} compra(s) registradas no ledger).`;
  } else if (plan.source === 'NO_PLAN') {
    sourceTransparencyNote = `Nenhum plano ou meta configurado para o período (${observedPurchases.length} compra(s) registradas no ledger).`;
  }

  const cashSourceLimitationNote =
    'Valores realizados refletem compras registradas no período e não distinguem capital novo de reinvestimento ou caixa prévio. O Atlas identificou compras no período, mas não distingue com precisão a origem do caixa utilizado (novo capital externo vs. reinvestimento de dividendos ou saldo em conta).';

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
    categories: categoryResults,
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
