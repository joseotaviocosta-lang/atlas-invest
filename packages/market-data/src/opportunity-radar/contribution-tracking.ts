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

export interface ContributionPlanSelectionCandidate {
  id: string;
  name: string;
  plannedDate: string; // YYYY-MM-DD
  status: string; // "PLANNED" | "COMPLETED"
  currency: string; // "BRL"
  totalPlannedAmount: string; // e.g. "2000.00"
  createdAt: string; // ISO timestamp
}

export type ResolveContributionPlanBaselineResult =
  | {
      outcome: 'SELECTED';
      plan: any; // Raw or mapped candidate plan
    }
  | {
      outcome: 'NONE';
    }
  | {
      outcome: 'AMBIGUOUS';
      candidates: ContributionPlanSelectionCandidate[];
    };

/**
 * Pure deterministic resolver for contribution plan baseline selection (APP-16W-R2).
 *
 * Rules:
 * 1. If explicitPlanId is provided:
 *    - Finds matching plan by id in candidatePlans belonging to portfolio.
 *    - Returns SELECTED if found, NONE if not found.
 * 2. If no explicitPlanId:
 *    - Filters candidate plans by period (plannedDate within period month YYYY-MM)
 *      and eligible status ("PLANNED" or "COMPLETED").
 *    - If 0 matches -> NONE.
 *    - If 1 match -> SELECTED.
 *    - If > 1 matches -> AMBIGUOUS with deterministically sorted candidates
 *      (plannedDate ASC, createdAt ASC, id ASC). Never picks matchingPlans[0] silently.
 */
export function resolveContributionPlanBaseline(params: {
  portfolioId: string;
  period: string; // YYYY-MM
  explicitPlanId?: string;
  candidatePlans: Array<{
    id: string;
    portfolioId: string;
    name: string;
    plannedDate: string;
    status: string;
    currency?: string;
    createdAt?: Date | string;
    items?: Array<{ amount: string | number }>;
  }>;
}): ResolveContributionPlanBaselineResult {
  const { period, explicitPlanId, candidatePlans } = params;

  // 1. Explicit planId requested
  if (explicitPlanId) {
    const found = candidatePlans.find((p) => p.id === explicitPlanId);
    if (!found) {
      return { outcome: 'NONE' };
    }
    return { outcome: 'SELECTED', plan: found };
  }

  // 2. Filter candidates by requested period (YYYY-MM) and eligible status
  const periodKey = period.trim().slice(0, 7);
  const eligible = candidatePlans.filter(
    (p) =>
      p.plannedDate &&
      p.plannedDate.slice(0, 7) === periodKey &&
      (p.status === 'PLANNED' || p.status === 'COMPLETED'),
  );

  if (eligible.length === 0) {
    return { outcome: 'NONE' };
  }

  if (eligible.length === 1) {
    return { outcome: 'SELECTED', plan: eligible[0] };
  }

  // 3. Ambiguity: multiple valid plans for the competence
  // Deterministic candidate order: plannedDate ASC, createdAt ASC, id ASC
  const sorted = [...eligible].sort((a, b) => {
    const dateComp = a.plannedDate.localeCompare(b.plannedDate);
    if (dateComp !== 0) return dateComp;

    const createdA = a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt || '');
    const createdB = b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt || '');
    const createdComp = createdA.localeCompare(createdB);
    if (createdComp !== 0) return createdComp;

    return a.id.localeCompare(b.id);
  });

  const candidates: ContributionPlanSelectionCandidate[] = sorted.map((p) => {
    let totalCents = 0;
    if (Array.isArray(p.items)) {
      for (const item of p.items) {
        totalCents += parseMoneyToCents(item.amount);
      }
    }
    const createdStr = p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt || '');

    return {
      id: p.id,
      name: p.name,
      plannedDate: p.plannedDate.slice(0, 10),
      status: p.status,
      currency: p.currency || 'BRL',
      totalPlannedAmount: formatCentsToDecimal(totalCents),
      createdAt: createdStr,
    };
  });

  return {
    outcome: 'AMBIGUOUS',
    candidates,
  };
}

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

export interface ContributionPlanMonthlyReviewCloseReadiness {
  canClose: boolean;
  blockers: string[];
  warnings: string[];
  requiresPendingCandidatesAcknowledgement: boolean;
  requiresEarlyCloseAcknowledgement: boolean;
}

export interface ContributionPlanMonthlyReviewCategoryProgress {
  category: string;
  plannedCents: number;
  plannedAmount: string;
  confirmedCents: number;
  confirmedAmount: string;
  candidateCents: number;
  candidateAmount: string;
  remainingCents: number;
  remainingAmount: string;
  overPlanCents: number;
  overPlanAmount: string;
  confirmedCompletionPercent: number;
  potentialCompletionPercent: number;
  status: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETE' | 'OVER_PLAN';
}

export interface ContributionPlanMonthlyReviewTransactionItem {
  id: string;
  accountId: string;
  assetId: string;
  ticker?: string;
  type: string;
  tradeDate: string;
  amountCents: number;
  amount: string;
  currency: string;
  category: string;
  linkStatus?: 'CONFIRMED' | 'REJECTED' | 'CANDIDATE';
}

export interface ContributionPlanMonthlyReviewResult {
  plan: {
    id: string;
    name: string;
    plannedDate: string;
    status: 'PLANNED' | 'COMPLETED';
    currency: string;
    completedAt?: string | null;
    createdAt?: string;
  };
  period: string; // YYYY-MM
  status: 'PLANNED' | 'COMPLETED';
  completedAt?: string | null;
  asOf: string;

  // Financial totals (in cents and formatted decimal strings)
  plannedCents: number;
  plannedAmount: string;
  confirmedCents: number;
  confirmedAmount: string;
  candidateCents: number;
  candidateAmount: string;
  rejectedCents: number;
  rejectedAmount: string;
  remainingCents: number;
  remainingAmount: string;
  overPlanCents: number;
  overPlanAmount: string;

  // Percentage progress
  completionPercent: number; // based strictly on confirmed / planned
  potentialCompletionPercent: number; // (confirmed + candidate) / planned

  // Granular groups of transactions
  confirmedTransactions: ContributionPlanMonthlyReviewTransactionItem[];
  candidateTransactions: ContributionPlanMonthlyReviewTransactionItem[];
  rejectedTransactions: ContributionPlanMonthlyReviewTransactionItem[];

  // Category progress
  categoryProgress: ContributionPlanMonthlyReviewCategoryProgress[];

  // Deviations & Structural summary
  deviations: ContributionPlanDeviationItem[];
  largestDeviations: string[];
  structuralSummary?: ContributionPlanStructuralComparison;

  // Close readiness evaluation
  closeReadiness: ContributionPlanMonthlyReviewCloseReadiness;

  // Data Quality & Notes
  dataQuality: ContributionPlanDataQuality & {
    trackingQuality: 'COMPLETE_LINK_REVIEW' | 'HAS_PENDING_CANDIDATES';
  };
  warnings: string[];
  assumptions: string[];
  safeCopy: {
    statusNote: string;
    completionDistinctionNote: string;
    immutableHistoryNote: string;
  };
  modelVersion: string;
}

export interface DeriveContributionPlanMonthlyReviewParams {
  plan: {
    id: string;
    name: string;
    plannedDate: string; // YYYY-MM-DD
    status: 'PLANNED' | 'COMPLETED';
    currency: string;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    items: Array<{ category: string; amount: string | number }>;
  };
  transactions: readonly TransactionInputForTracking[];
  assetCategories?: Map<string, string>; // assetId -> category
  baselinePositions?: readonly ProjectionBaselinePosition[];
  radarItems?: readonly OpportunityRadarItem[];
  classTargetWeights?: Record<string, number>;
  projectedState?: ProjectedPortfolioAfterContribution;
  referenceDate?: Date;
}

/**
 * Pure deterministic domain function to derive a Contribution Plan Monthly Review (APP-16X).
 *
 * Rules:
 * - Read-only and deterministic.
 * - Confirmed actuals strictly from CONFIRMED transaction links.
 * - Eligible BUYs without links in period are CANDIDATES.
 * - REJECTED links are tracked for audit visibility but never counted as confirmed.
 * - SELL transactions never count towards contribution actuals.
 * - Transactions confirmed in another plan are excluded.
 * - Category progress cleanly maps assets to canonical categories (unknown -> UNMAPPED).
 * - Exact integer cents arithmetic (no float rounding).
 * - CloseReadiness flags blockers (foreign plan, already closed) and warnings (pending candidates, early close).
 */
export function deriveContributionPlanMonthlyReview(
  params: DeriveContributionPlanMonthlyReviewParams,
): ContributionPlanMonthlyReviewResult {
  const {
    plan,
    transactions,
    assetCategories = new Map(),
    baselinePositions = [],
    referenceDate = new Date(),
  } = params;

  const asOf = referenceDate.toISOString();
  const todayStr = referenceDate.toISOString().slice(0, 10);
  const period = plan.plannedDate.slice(0, 7);

  const [pYearStr, pMonthStr] = period.split('-');
  const pYear = parseInt(pYearStr!, 10);
  const pMonth = parseInt(pMonthStr!, 10);
  const lastDayOfMonth = new Date(Date.UTC(pYear, pMonth, 0)).getUTCDate();
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-${lastDayOfMonth.toString().padStart(2, '0')}`;

  // 1. Calculate planned amounts by category
  const plannedCentsByCategory = new Map<string, number>();
  let totalPlannedCents = 0;
  for (const item of plan.items) {
    const c = parseMoneyToCents(item.amount);
    totalPlannedCents += c;
    plannedCentsByCategory.set(item.category, (plannedCentsByCategory.get(item.category) ?? 0) + c);
  }

  // 2. Classify transactions into confirmed, candidate, rejected
  const confirmedTxs: ContributionPlanMonthlyReviewTransactionItem[] = [];
  const candidateTxs: ContributionPlanMonthlyReviewTransactionItem[] = [];
  const rejectedTxs: ContributionPlanMonthlyReviewTransactionItem[] = [];

  const confirmedCentsByCategory = new Map<string, number>();
  const candidateCentsByCategory = new Map<string, number>();

  let confirmedCents = 0;
  let candidateCents = 0;
  let rejectedCents = 0;

  let excludedSellCount = 0;
  let excludedOutOfPeriodCount = 0;
  const warnings: string[] = [];

  for (const tx of transactions) {
    const tradeDate = tx.tradeDate.slice(0, 10);

    // Period boundary check
    if (tradeDate < periodStart || tradeDate > periodEnd) {
      excludedOutOfPeriodCount++;
      if (tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId === plan.id) {
        warnings.push(`Transação confirmada ${tx.id} possui data fora do período do plano (${periodStart} a ${periodEnd}).`);
      }
      continue;
    }

    // Exclude confirmed in another plan
    if (tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId && tx.linkedPlanId !== plan.id) {
      continue;
    }

    // Exclude rejected links from actuals, but keep for audit
    if (tx.linkStatus === 'REJECTED' && tx.linkedPlanId === plan.id) {
      const txCents = parseMoneyToCents(tx.amount);
      const cat = assetCategories.get(tx.assetId) || 'UNMAPPED';
      rejectedCents += txCents;
      rejectedTxs.push({
        id: tx.id,
        accountId: tx.accountId,
        assetId: tx.assetId,
        ticker: tx.ticker,
        type: tx.type,
        tradeDate,
        amountCents: txCents,
        amount: formatCentsToDecimal(txCents),
        currency: tx.currency || plan.currency,
        category: cat,
        linkStatus: 'REJECTED',
      });
      continue;
    }

    // Exclude SELL
    if (tx.type === 'SELL') {
      excludedSellCount++;
      continue;
    }

    // Only BUY transactions can count as purchase actuals or candidates
    if (tx.type !== 'BUY') {
      continue;
    }

    const txCents = parseMoneyToCents(tx.amount);
    if (txCents <= 0) continue;

    const cat = assetCategories.get(tx.assetId) || 'UNMAPPED';
    const txItem: ContributionPlanMonthlyReviewTransactionItem = {
      id: tx.id,
      accountId: tx.accountId,
      assetId: tx.assetId,
      ticker: tx.ticker,
      type: tx.type,
      tradeDate,
      amountCents: txCents,
      amount: formatCentsToDecimal(txCents),
      currency: tx.currency || plan.currency,
      category: cat,
      linkStatus: tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId === plan.id ? 'CONFIRMED' : 'CANDIDATE',
    };

    if (tx.linkStatus === 'CONFIRMED' && tx.linkedPlanId === plan.id) {
      confirmedCents += txCents;
      confirmedCentsByCategory.set(cat, (confirmedCentsByCategory.get(cat) ?? 0) + txCents);
      confirmedTxs.push(txItem);
    } else {
      // Eligible purchase in period without confirmed link to this plan -> CANDIDATE
      candidateCents += txCents;
      candidateCentsByCategory.set(cat, (candidateCentsByCategory.get(cat) ?? 0) + txCents);
      candidateTxs.push(txItem);
    }
  }

  // 3. Category Progress
  const allCategories = new Set<string>([
    ...plannedCentsByCategory.keys(),
    ...confirmedCentsByCategory.keys(),
    ...candidateCentsByCategory.keys(),
  ]);

  const categoryProgress: ContributionPlanMonthlyReviewCategoryProgress[] = [];
  for (const cat of allCategories) {
    const planned = plannedCentsByCategory.get(cat) ?? 0;
    const confirmed = confirmedCentsByCategory.get(cat) ?? 0;
    const candidate = candidateCentsByCategory.get(cat) ?? 0;

    const remaining = Math.max(planned - confirmed, 0);
    const overPlan = Math.max(confirmed - planned, 0);

    const confirmedPercent = planned > 0 ? Math.round((confirmed / planned) * 1000) / 10 : 0;
    const potentialPercent = planned > 0 ? Math.round(((confirmed + candidate) / planned) * 1000) / 10 : 0;

    let catStatus: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETE' | 'OVER_PLAN';
    if (confirmed === 0) catStatus = 'NOT_STARTED';
    else if (confirmed < planned) catStatus = 'PARTIAL';
    else if (confirmed === planned) catStatus = 'COMPLETE';
    else catStatus = 'OVER_PLAN';

    categoryProgress.push({
      category: cat,
      plannedCents: planned,
      plannedAmount: formatCentsToDecimal(planned),
      confirmedCents: confirmed,
      confirmedAmount: formatCentsToDecimal(confirmed),
      candidateCents: candidate,
      candidateAmount: formatCentsToDecimal(candidate),
      remainingCents: remaining,
      remainingAmount: formatCentsToDecimal(remaining),
      overPlanCents: overPlan,
      overPlanAmount: formatCentsToDecimal(overPlan),
      confirmedCompletionPercent: confirmedPercent,
      potentialCompletionPercent: potentialPercent,
      status: catStatus,
    });
  }

  // 4. Financial Totals & Progress
  const remainingCents = Math.max(totalPlannedCents - confirmedCents, 0);
  const overPlanCents = Math.max(confirmedCents - totalPlannedCents, 0);

  const completionPercent =
    totalPlannedCents > 0 ? Math.round((confirmedCents / totalPlannedCents) * 1000) / 10 : 0;
  const potentialCompletionPercent =
    totalPlannedCents > 0
      ? Math.round(((confirmedCents + candidateCents) / totalPlannedCents) * 1000) / 10
      : 0;

  // 5. Close Readiness
  const blockers: string[] = [];
  const closeWarnings: string[] = [];

  const isAlreadyCompleted = plan.status === 'COMPLETED';
  if (isAlreadyCompleted) {
    blockers.push('PLANO_JA_CONCLUIDO');
  }

  const hasPendingCandidates = candidateTxs.length > 0;
  const requiresPendingCandidatesAcknowledgement = hasPendingCandidates && !isAlreadyCompleted;
  if (hasPendingCandidates) {
    closeWarnings.push(
      `Existem ${candidateTxs.length} compra(s) candidata(s) no período que ainda não foram confirmadas.`,
    );
  }

  const isPeriodOngoing = todayStr < periodEnd;
  const requiresEarlyCloseAcknowledgement = isPeriodOngoing && !isAlreadyCompleted;
  if (isPeriodOngoing) {
    closeWarnings.push(`O período deste plano (${period}) ainda não terminou (encerra em ${periodEnd}).`);
  }

  const canClose = !isAlreadyCompleted;

  const closeReadiness: ContributionPlanMonthlyReviewCloseReadiness = {
    canClose,
    blockers,
    warnings: closeWarnings,
    requiresPendingCandidatesAcknowledgement,
    requiresEarlyCloseAcknowledgement,
  };

  // 6. Data Quality
  const trackingQuality = hasPendingCandidates
    ? ('HAS_PENDING_CANDIDATES' as const)
    : ('COMPLETE_LINK_REVIEW' as const);

  const totalPositions = baselinePositions.length;
  const valuedPositions = baselinePositions.filter((p) => p.isValued).length;
  const incompletePositions = totalPositions - valuedPositions;
  const isPartialValuation = incompletePositions > 0;

  const dataQuality: ContributionPlanMonthlyReviewResult['dataQuality'] = {
    valuationQuality: isPartialValuation ? 'VALUED_POSITIONS_ONLY' : 'FULL_PORTFOLIO',
    totalPositions,
    valuedPositions,
    incompletePositions,
    isPartialValuation,
    trackedPurchaseCount: confirmedTxs.length + candidateTxs.length,
    excludedSellCount,
    excludedOutOfPeriodCount,
    confirmedLinkCount: confirmedTxs.length,
    rejectedLinkCount: rejectedTxs.length,
    candidateLinkCount: candidateTxs.length,
    trackingQuality,
  };

  // 7. Deviations calculation (by category and asset)
  const deviations: ContributionPlanDeviationItem[] = [];
  for (const cat of categoryProgress) {
    const deltaCents = cat.confirmedCents - cat.plannedCents;
    const deltaPercent =
      cat.plannedCents > 0 ? Math.round((deltaCents / cat.plannedCents) * 1000) / 10 : 0;
    deviations.push({
      assetId: cat.category,
      ticker: cat.category,
      name: cat.category,
      plannedCents: cat.plannedCents,
      actualCents: cat.confirmedCents,
      deltaCents,
      deltaAmount: formatCentsToDecimal(deltaCents),
      deltaPercent,
      isUnplanned: cat.plannedCents === 0,
      isOverPlan: deltaCents > 0,
    });
  }

  const largestDeviations: string[] = [];
  for (const dev of deviations) {
    if (dev.deltaCents === 0) continue;
    if (dev.isUnplanned) {
      largestDeviations.push(
        `Categoria ${dev.ticker} teve aporte confirmado de R$ ${formatCentsToDecimal(dev.actualCents)} fora do planejado.`,
      );
    } else if (dev.deltaCents < 0) {
      largestDeviations.push(
        `Categoria ${dev.ticker} recebeu R$ ${formatCentsToDecimal(Math.abs(dev.deltaCents))} abaixo do planejado.`,
      );
    } else {
      largestDeviations.push(
        `Categoria ${dev.ticker} recebeu R$ ${formatCentsToDecimal(dev.deltaCents)} acima do planejado.`,
      );
    }
  }

  // 8. Safe Copy & Notes
  const safeCopy = {
    statusNote:
      plan.status === 'COMPLETED'
        ? `Acompanhamento do plano encerrado em ${plan.completedAt ? String(plan.completedAt).slice(0, 10) : 'data registrada'}. O valor realizado pode ser menor ou maior que o planejado.`
        : 'Plano em acompanhamento ativo. O encerramento requer decisão do usuário e não executa compras.',
    completionDistinctionNote:
      'O status Concluído indica encerramento formal do acompanhamento humano e não equivale a 100% de execução financeira.',
    immutableHistoryNote:
      'Transações do ledger e vínculos históricos são imutáveis. O encerramento não altera itens do plano nem insere ordens.',
  };

  const assumptions = [
    'Apenas transações com vínculo CONFIRMED com este plano são contabilizadas como valor confirmado.',
    'Compras identificadas sem vínculo (CANDIDATE) representam potenciais correspondências pendentes de revisão humana.',
    'Vendas registradas no período não reduzem o aporte nem integram o total realizado.',
  ];

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      plannedDate: plan.plannedDate.slice(0, 10),
      status: plan.status,
      currency: plan.currency,
      completedAt: plan.completedAt ? (plan.completedAt instanceof Date ? plan.completedAt.toISOString() : String(plan.completedAt)) : null,
      createdAt: plan.createdAt ? (plan.createdAt instanceof Date ? plan.createdAt.toISOString() : String(plan.createdAt)) : undefined,
    },
    period,
    status: plan.status,
    completedAt: plan.completedAt ? (plan.completedAt instanceof Date ? plan.completedAt.toISOString() : String(plan.completedAt)) : null,
    asOf,

    plannedCents: totalPlannedCents,
    plannedAmount: formatCentsToDecimal(totalPlannedCents),
    confirmedCents,
    confirmedAmount: formatCentsToDecimal(confirmedCents),
    candidateCents,
    candidateAmount: formatCentsToDecimal(candidateCents),
    rejectedCents,
    rejectedAmount: formatCentsToDecimal(rejectedCents),
    remainingCents,
    remainingAmount: formatCentsToDecimal(remainingCents),
    overPlanCents,
    overPlanAmount: formatCentsToDecimal(overPlanCents),

    completionPercent,
    potentialCompletionPercent,

    confirmedTransactions: confirmedTxs,
    candidateTransactions: candidateTxs,
    rejectedTransactions: rejectedTxs,

    categoryProgress,
    deviations,
    largestDeviations,
    structuralSummary: undefined,

    closeReadiness,
    dataQuality,
    warnings,
    assumptions,
    safeCopy,
    modelVersion: OPPORTUNITY_MODEL_VERSION,
  };
}
// ---------------------------------------------------------------------------
// APP-16Y: Monthly Portfolio Progress & Goal History
// ---------------------------------------------------------------------------

export interface PortfolioMonthlyProgressGoalDto {
  amount: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  sourceId: string;
}

export interface MonthlyPlanEntryDto {
  id: string;
  name: string;
  plannedDate: string;
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
  completedAt?: string | null;
  plannedCents: number;
  plannedAmount: string;
  confirmedCents: number;
  confirmedAmount: string;
  candidateCents: number;
  candidateAmount: string;
  rejectedCents: number;
  rejectedAmount: string;
  completionPercent: number;
  baselineStable: boolean;
}

export interface PortfolioMonthlyProgressEntryDto {
  competence: string; // YYYY-MM
  goal: PortfolioMonthlyProgressGoalDto | null;
  plans: MonthlyPlanEntryDto[];
  totalPlannedCents: number;
  totalPlannedAmount: string;
  totalConfirmedCents: number;
  totalConfirmedAmount: string;
  totalCandidateCents: number;
  totalCandidateAmount: string;
  purchaseActivityCents: number;
  purchaseActivityAmount: string;
  purchaseTransactionCount: number;
  sellActivityCents: number;
  sellActivityAmount: string;
  sellTransactionCount: number;
  completedPlanCount: number;
  openPlanCount: number;
  monthStatus: 'NO_GOAL' | 'GOAL_ONLY' | 'PLAN_OPEN' | 'PLAN_COMPLETED' | 'MULTIPLE_PLANS';
  dataQuality: {
    ledgerAvailable: boolean;
    planHistoryAvailable: boolean;
    goalHistoryAvailable: boolean;
    valuationHistoryAvailable: boolean;
  };
  warnings: string[];
}

export interface MonthlyProgressSummaryDto {
  monthsCount: number;
  goalsConfiguredMonths: number;
  totalGoalCents: number;
  totalGoalAmount: string;
  totalPlannedCents: number;
  totalPlannedAmount: string;
  totalConfirmedCents: number;
  totalConfirmedAmount: string;
  totalPurchaseActivityCents: number;
  totalPurchaseActivityAmount: string;
  plansCreated: number;
  plansCompleted: number;
}

export interface PortfolioMonthlyProgressTimelineResult {
  portfolioId: string;
  fromMonth: string;
  toMonth: string;
  summary: MonthlyProgressSummaryDto;
  months: PortfolioMonthlyProgressEntryDto[];
  currentPortfolioState?: {
    valuationQuality: 'FULL_PORTFOLIO' | 'VALUED_POSITIONS_ONLY';
    totalEquity?: string;
    totalPositions: number;
    valuedPositions: number;
    currentPositions: Array<{
      assetId: string;
      ticker: string;
      weightPercent: number;
    }>;
  };
  historyCapabilities: {
    valuationHistory: 'UNAVAILABLE';
    allocationHistory: 'UNAVAILABLE';
    targetHistory: 'UNAVAILABLE';
    contributionPlanHistory: 'AVAILABLE';
    contributionGoalHistory: 'AVAILABLE';
  };
  safeCopy: {
    historicalValuationNote: string;
    historicalTargetNote: string;
    cashSourceNote: string;
  };
  modelVersion: string;
}

export interface MonthlyProgressGoalInput {
  id: string;
  amount: string | number;
  currency: string;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
}

export interface MonthlyProgressPlanItemInput {
  id?: string;
  category?: string;
  amount: string | number;
}

export interface MonthlyProgressPlanInput {
  id: string;
  portfolioId: string;
  name: string;
  plannedDate: string;
  status: string;
  currency?: string;
  completedAt?: Date | string | null;
  createdAt?: Date | string;
  items?: MonthlyProgressPlanItemInput[];
}

export interface MonthlyProgressTransactionLinkInput {
  id?: string;
  planId: string;
  transactionId: string;
  status: string; // 'CONFIRMED' | 'CANDIDATE' | 'REJECTED'
}

export interface MonthlyProgressTransactionInput {
  id: string;
  portfolioId: string;
  accountId?: string;
  assetId?: string;
  type: string; // BUY, SELL, etc.
  tradeDate: string; // YYYY-MM-DD
  amount: string | number;
  currency?: string;
  quantity?: string;
  unitPrice?: string;
}

export interface BuildPortfolioMonthlyProgressTimelineParams {
  portfolioId: string;
  fromMonth?: string; // YYYY-MM
  toMonth?: string; // YYYY-MM
  asOf?: string | Date;
  goals?: MonthlyProgressGoalInput[];
  plans?: MonthlyProgressPlanInput[];
  links?: MonthlyProgressTransactionLinkInput[];
  transactions?: MonthlyProgressTransactionInput[];
  currentPortfolioState?: {
    valuationQuality: 'FULL_PORTFOLIO' | 'VALUED_POSITIONS_ONLY';
    totalEquity?: string;
    totalPositions: number;
    valuedPositions: number;
    currentPositions: Array<{
      assetId: string;
      ticker: string;
      weightPercent: number;
    }>;
  };
}

export function parseDecimalStringToCents(val: string | number): number {
  if (typeof val === 'number') {
    return Math.round(val * 100);
  }
  const clean = val.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(clean);
  if (!match) return 0;
  const whole = BigInt(match[1] ?? '0');
  const fracStr = (match[2] || '').padEnd(2, '0').slice(0, 2);
  const cents = whole * 100n + BigInt(fracStr);
  return Number(cents);
}

/**
 * Pure deterministic timeline builder for monthly portfolio progress and goal history (APP-16Y).
 *
 * Rules:
 * - Deterministic output: identical inputs produce identical outputs.
 * - Exact cents conservation: integer cents used for all monetary sums.
 * - Temporal continuity: every month in range is present, even with zero activity.
 * - Oldest to newest chronological order.
 * - Confirmed contribution vs ledger BUY activity strictly separated.
 * - Historical valuation and target versioning marked UNAVAILABLE (no false backfill).
 */
export function buildPortfolioMonthlyProgressTimeline(
  params: BuildPortfolioMonthlyProgressTimelineParams,
): PortfolioMonthlyProgressTimelineResult {
  const { portfolioId, goals = [], plans = [], links = [], transactions = [], currentPortfolioState } = params;

  // 1. Resolve Reference Date & Default Range
  let referenceMonthStr: string;
  if (params.asOf) {
    if (typeof params.asOf === 'string') {
      referenceMonthStr = params.asOf.slice(0, 7);
    } else {
      const year = params.asOf.getFullYear();
      const month = String(params.asOf.getMonth() + 1).padStart(2, '0');
      referenceMonthStr = `${year}-${month}`;
    }
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    referenceMonthStr = `${year}-${month}`;
  }

  const toMonth = params.toMonth ? params.toMonth.trim() : referenceMonthStr;
  let fromMonth = params.fromMonth ? params.fromMonth.trim() : '';

  if (!fromMonth) {
    const [tYearStr, tMonthStr] = toMonth.split('-');
    const tYear = parseInt(tYearStr!, 10);
    const tMonth = parseInt(tMonthStr!, 10);
    const date = new Date(Date.UTC(tYear, tMonth - 1, 1));
    date.setUTCMonth(date.getUTCMonth() - 11);
    const fYear = date.getUTCFullYear();
    const fMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
    fromMonth = `${fYear}-${fMonth}`;
  }

  // Validate format
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!monthRegex.test(fromMonth)) {
    throw new Error(`Invalid fromMonth: '${fromMonth}'. Expected YYYY-MM.`);
  }
  if (!monthRegex.test(toMonth)) {
    throw new Error(`Invalid toMonth: '${toMonth}'. Expected YYYY-MM.`);
  }

  const [fromY, fromM] = fromMonth.split('-').map(Number);
  const [toY, toM] = toMonth.split('-').map(Number);
  const totalMonthsCount = (toY! - fromY!) * 12 + (toM! - fromM!) + 1;

  if (totalMonthsCount <= 0) {
    throw new Error(`Invalid range: fromMonth (${fromMonth}) cannot be after toMonth (${toMonth}).`);
  }
  if (totalMonthsCount > 60) {
    throw new Error(`Requested range (${totalMonthsCount} months) exceeds maximum limit of 60 months.`);
  }

  // 2. Generate competences array (chronological oldest -> newest)
  const competences: string[] = [];
  let currY = fromY!;
  let currM = fromM!;
  for (let i = 0; i < totalMonthsCount; i++) {
    const compStr = `${currY}-${String(currM).padStart(2, '0')}`;
    competences.push(compStr);
    currM++;
    if (currM > 12) {
      currM = 1;
      currY++;
    }
  }

  // 3. Index Transactions by ID and by Month
  const txMap = new Map<string, MonthlyProgressTransactionInput>();
  const txsByMonth = new Map<string, MonthlyProgressTransactionInput[]>();
  for (const tx of transactions) {
    txMap.set(tx.id, tx);
    const txComp = tx.tradeDate.slice(0, 7);
    const list = txsByMonth.get(txComp) ?? [];
    list.push(tx);
    txsByMonth.set(txComp, list);
  }

  // 4. Index Links by Plan ID
  const linksByPlan = new Map<string, MonthlyProgressTransactionLinkInput[]>();
  for (const link of links) {
    const list = linksByPlan.get(link.planId) ?? [];
    list.push(link);
    linksByPlan.set(link.planId, list);
  }

  // Helper to get transaction amount in cents
  function getTxAmountCents(tx: MonthlyProgressTransactionInput): number {
    if (tx.unitPrice && tx.quantity) {
      const calc = multiplyUnitPriceQuantityToCents(tx.unitPrice, tx.quantity);
      if (calc !== null) return calc;
    }
    return parseDecimalStringToCents(tx.amount);
  }

  // Global confirmed transactions set for double count prevention in summary
  const globalConfirmedTxIds = new Set<string>();
  let summaryGoalsConfiguredMonths = 0;
  let summaryTotalGoalCents = 0;
  let summaryTotalPlannedCents = 0;
  let summaryTotalConfirmedCents = 0;
  let summaryTotalPurchaseActivityCents = 0;
  let summaryPlansCreated = 0;
  let summaryPlansCompleted = 0;

  // 5. Build Each Month Entry
  const monthEntries: PortfolioMonthlyProgressEntryDto[] = [];

  for (const competence of competences) {
    // A. Goal Resolution
    // effectiveFrom <= competence < effectiveTo
    const matchingGoals = goals.filter((g) => {
      const gStart = typeof g.effectiveFrom === 'string' ? g.effectiveFrom.slice(0, 7) : g.effectiveFrom.toISOString().slice(0, 7);
      const gEnd = g.effectiveTo
        ? (typeof g.effectiveTo === 'string' ? g.effectiveTo.slice(0, 7) : g.effectiveTo.toISOString().slice(0, 7))
        : null;
      return gStart <= competence && (!gEnd || gEnd > competence);
    });

    // Sort matching goals by effectiveFrom DESC, id DESC to pick active goal
    matchingGoals.sort((a, b) => {
      const aStart = typeof a.effectiveFrom === 'string' ? a.effectiveFrom : a.effectiveFrom.toISOString();
      const bStart = typeof b.effectiveFrom === 'string' ? b.effectiveFrom : b.effectiveFrom.toISOString();
      if (aStart !== bStart) return bStart.localeCompare(aStart);
      return b.id.localeCompare(a.id);
    });

    const activeGoal = matchingGoals[0] ?? null;
    let goalDto: PortfolioMonthlyProgressGoalDto | null = null;
    let goalCents = 0;

    if (activeGoal) {
      goalCents = parseDecimalStringToCents(activeGoal.amount);
      summaryGoalsConfiguredMonths++;
      summaryTotalGoalCents += goalCents;

      goalDto = {
        amount: formatCentsToDecimal(goalCents),
        currency: activeGoal.currency || 'BRL',
        effectiveFrom: typeof activeGoal.effectiveFrom === 'string'
          ? activeGoal.effectiveFrom.slice(0, 10)
          : activeGoal.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: activeGoal.effectiveTo
          ? (typeof activeGoal.effectiveTo === 'string'
              ? activeGoal.effectiveTo.slice(0, 10)
              : activeGoal.effectiveTo.toISOString().slice(0, 10))
          : null,
        sourceId: activeGoal.id,
      };
    }

    // B. Plans Resolution
    const monthPlans = plans.filter((p) => p.plannedDate && p.plannedDate.slice(0, 7) === competence);
    monthPlans.sort((a, b) => {
      if (a.plannedDate !== b.plannedDate) return a.plannedDate.localeCompare(b.plannedDate);
      const aCreated = a.createdAt ? (typeof a.createdAt === 'string' ? a.createdAt : a.createdAt.toISOString()) : '';
      const bCreated = b.createdAt ? (typeof b.createdAt === 'string' ? b.createdAt : b.createdAt.toISOString()) : '';
      if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
      return a.id.localeCompare(b.id);
    });

    const planEntries: MonthlyPlanEntryDto[] = [];
    let monthTotalPlannedCents = 0;
    const monthConfirmedTxIds = new Set<string>();
    const monthCandidateTxIds = new Set<string>();

    for (const plan of monthPlans) {
      summaryPlansCreated++;
      const normStatus = (plan.status.toUpperCase() === 'COMPLETED'
        ? 'COMPLETED'
        : plan.status.toUpperCase() === 'CANCELLED'
        ? 'CANCELLED'
        : 'PLANNED') as 'PLANNED' | 'COMPLETED' | 'CANCELLED';

      if (normStatus === 'COMPLETED') {
        summaryPlansCompleted++;
      }

      // Planned amount from items
      let planPlannedCents = 0;
      if (plan.items) {
        for (const item of plan.items) {
          planPlannedCents += parseDecimalStringToCents(item.amount);
        }
      }
      monthTotalPlannedCents += planPlannedCents;

      // Plan links
      const planLinks = linksByPlan.get(plan.id) ?? [];
      let planConfirmedCents = 0;
      let planCandidateCents = 0;
      let planRejectedCents = 0;

      for (const link of planLinks) {
        const tx = txMap.get(link.transactionId);
        const txCents = tx ? getTxAmountCents(tx) : 0;
        const linkStatus = link.status.toUpperCase();
        if (linkStatus === 'CONFIRMED') {
          planConfirmedCents += txCents;
          monthConfirmedTxIds.add(link.transactionId);
          globalConfirmedTxIds.add(link.transactionId);
        } else if (linkStatus === 'CANDIDATE') {
          planCandidateCents += txCents;
          monthCandidateTxIds.add(link.transactionId);
        } else if (linkStatus === 'REJECTED') {
          planRejectedCents += txCents;
        }
      }

      const completionPercent =
        planPlannedCents > 0 ? Math.round((planConfirmedCents / planPlannedCents) * 1000) / 10 : 0;

      const completedAtStr = plan.completedAt
        ? (typeof plan.completedAt === 'string' ? plan.completedAt : plan.completedAt.toISOString())
        : null;

      planEntries.push({
        id: plan.id,
        name: plan.name,
        plannedDate: plan.plannedDate.slice(0, 10),
        status: normStatus,
        completedAt: completedAtStr,
        plannedCents: planPlannedCents,
        plannedAmount: formatCentsToDecimal(planPlannedCents),
        confirmedCents: planConfirmedCents,
        confirmedAmount: formatCentsToDecimal(planConfirmedCents),
        candidateCents: planCandidateCents,
        candidateAmount: formatCentsToDecimal(planCandidateCents),
        rejectedCents: planRejectedCents,
        rejectedAmount: formatCentsToDecimal(planRejectedCents),
        completionPercent,
        baselineStable: true,
      });
    }

    summaryTotalPlannedCents += monthTotalPlannedCents;

    // Month confirmed cents: sum of unique confirmed transactions in this month
    let monthTotalConfirmedCents = 0;
    for (const txId of monthConfirmedTxIds) {
      const tx = txMap.get(txId);
      if (tx) {
        monthTotalConfirmedCents += getTxAmountCents(tx);
      }
    }

    // Month candidate cents: sum of unique candidate transactions in this month
    let monthTotalCandidateCents = 0;
    for (const txId of monthCandidateTxIds) {
      // If a tx is both confirmed and candidate (should not occur), prefer confirmed
      if (!monthConfirmedTxIds.has(txId)) {
        const tx = txMap.get(txId);
        if (tx) {
          monthTotalCandidateCents += getTxAmountCents(tx);
        }
      }
    }

    // C. Month Purchase & Sell Activity (Ledger)
    const monthTxs = txsByMonth.get(competence) ?? [];
    let purchaseActivityCents = 0;
    let purchaseTransactionCount = 0;
    let sellActivityCents = 0;
    let sellTransactionCount = 0;

    for (const tx of monthTxs) {
      const txType = tx.type.toUpperCase();
      const amountCents = getTxAmountCents(tx);
      if (txType === 'BUY') {
        purchaseActivityCents += amountCents;
        purchaseTransactionCount++;
      } else if (txType === 'SELL') {
        sellActivityCents += amountCents;
        sellTransactionCount++;
      }
    }

    summaryTotalPurchaseActivityCents += purchaseActivityCents;

    // D. Month Status Derivation
    const completedPlanCount = planEntries.filter((p) => p.status === 'COMPLETED').length;
    const openPlanCount = planEntries.filter((p) => p.status === 'PLANNED').length;

    let monthStatus: PortfolioMonthlyProgressEntryDto['monthStatus'];
    if (planEntries.length > 1) {
      monthStatus = 'MULTIPLE_PLANS';
    } else if (planEntries.length === 1) {
      monthStatus = planEntries[0]!.status === 'COMPLETED' ? 'PLAN_COMPLETED' : 'PLAN_OPEN';
    } else if (goalDto !== null) {
      monthStatus = 'GOAL_ONLY';
    } else {
      monthStatus = 'NO_GOAL';
    }

    // E. Data Quality & Warnings
    const warnings: string[] = [];
    if (goalDto !== null && goalCents > 0 && purchaseActivityCents < goalCents) {
      warnings.push('Compras registradas abaixo da meta mensal declarada.');
    }
    warnings.push('Valuation histórico não disponível para esta competência.');

    monthEntries.push({
      competence,
      goal: goalDto,
      plans: planEntries,
      totalPlannedCents: monthTotalPlannedCents,
      totalPlannedAmount: formatCentsToDecimal(monthTotalPlannedCents),
      totalConfirmedCents: monthTotalConfirmedCents,
      totalConfirmedAmount: formatCentsToDecimal(monthTotalConfirmedCents),
      totalCandidateCents: monthTotalCandidateCents,
      totalCandidateAmount: formatCentsToDecimal(monthTotalCandidateCents),
      purchaseActivityCents,
      purchaseActivityAmount: formatCentsToDecimal(purchaseActivityCents),
      purchaseTransactionCount,
      sellActivityCents,
      sellActivityAmount: formatCentsToDecimal(sellActivityCents),
      sellTransactionCount,
      completedPlanCount,
      openPlanCount,
      monthStatus,
      dataQuality: {
        ledgerAvailable: true,
        planHistoryAvailable: true,
        goalHistoryAvailable: true,
        valuationHistoryAvailable: false,
      },
      warnings,
    });
  }

  // Global total confirmed cents: sum of all unique confirmed transactions
  for (const txId of globalConfirmedTxIds) {
    const tx = txMap.get(txId);
    if (tx) {
      summaryTotalConfirmedCents += getTxAmountCents(tx);
    }
  }

  const summary: MonthlyProgressSummaryDto = {
    monthsCount: monthEntries.length,
    goalsConfiguredMonths: summaryGoalsConfiguredMonths,
    totalGoalCents: summaryTotalGoalCents,
    totalGoalAmount: formatCentsToDecimal(summaryTotalGoalCents),
    totalPlannedCents: summaryTotalPlannedCents,
    totalPlannedAmount: formatCentsToDecimal(summaryTotalPlannedCents),
    totalConfirmedCents: summaryTotalConfirmedCents,
    totalConfirmedAmount: formatCentsToDecimal(summaryTotalConfirmedCents),
    totalPurchaseActivityCents: summaryTotalPurchaseActivityCents,
    totalPurchaseActivityAmount: formatCentsToDecimal(summaryTotalPurchaseActivityCents),
    plansCreated: summaryPlansCreated,
    plansCompleted: summaryPlansCompleted,
  };

  const safeCopy = {
    historicalValuationNote:
      'O Atlas não possui valuation histórico suficiente para reconstruir com precisão o patrimônio ou peso da carteira neste mês.',
    historicalTargetNote:
      'Metas de alocação por categoria não possuem versionamento histórico no banco de dados e não são projetadas retroativamente.',
    cashSourceNote:
      'Compras registradas refletem operações executadas no ledger. A origem do caixa (novo aporte vs. saldo pré-existente) não é inferida.',
  };

  return {
    portfolioId,
    fromMonth,
    toMonth,
    summary,
    months: monthEntries,
    currentPortfolioState,
    historyCapabilities: {
      valuationHistory: 'UNAVAILABLE',
      allocationHistory: 'UNAVAILABLE',
      targetHistory: 'UNAVAILABLE',
      contributionPlanHistory: 'AVAILABLE',
      contributionGoalHistory: 'AVAILABLE',
    },
    safeCopy,
    modelVersion: OPPORTUNITY_MODEL_VERSION,
  };
}
