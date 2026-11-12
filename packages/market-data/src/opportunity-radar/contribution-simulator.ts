import {
  OPPORTUNITY_MODEL_VERSION,
  OpportunityAssetType,
  OpportunityConfidence,
  OpportunityRadarItem,
} from './types';
import {
  DecisionTier,
  PortfolioDailyDecisionBrief,
  PortfolioDecisionPriorityItem,
} from './decision-brief';

export interface ContributionAllocationItem {
  rank: number;
  assetId: string;
  ticker: string;
  name: string;
  assetType: OpportunityAssetType;
  decisionTier: DecisionTier;
  opportunityScore: number;
  confidence: OpportunityConfidence;
  targetAmount: string; // e.g. "800.00"
  targetCents: number; // e.g. 80000
  allocationPercent: number; // e.g. 40.0
  estimatedUnits: number | null;
  unitPrice: string | null;
  roundingResidualCents: number;
  reasons: string[];
  cautions: string[];
}

export interface ContributionAllocationExcludedAsset {
  assetId: string;
  ticker: string;
  name: string;
  decisionTier: DecisionTier;
  reason: string;
}

export interface ContributionAllocationSimulationDataQuality {
  eligibleAssetsCount: number;
  allocatedAssetsCount: number;
  excludedAssetsCount: number;
  priceUsableCount: number;
}

export interface ContributionAllocationSimulation {
  portfolioId: string;
  asOf: string;
  contributionAmount: string; // user-provided e.g. "2000.00"
  currency: string; // "BRL"
  allocatedAmount: string;
  unallocatedAmount: string;
  allocatedCents: number;
  unallocatedCents: number;
  totalCents: number;
  allocations: ContributionAllocationItem[];
  excludedAssets: ContributionAllocationExcludedAsset[];
  assumptions: string[];
  warnings: string[];
  dataQuality: ContributionAllocationSimulationDataQuality;
  modelVersion: string;
}

export interface BuildContributionAllocationSimulationParams {
  portfolioId: string;
  contributionAmount: string; // decimal string
  currency?: string;
  decisionBrief: PortfolioDailyDecisionBrief;
  radarItems?: readonly OpportunityRadarItem[];
  referenceDate?: Date;
  /** Maximum single-asset concentration cap. Defaults to 0.50 (50%). */
  maxAssetConcentrationCap?: number;
  /** Minimum allocation per asset in cents. Defaults to 5000 (R$ 50.00). */
  minAllocationCents?: number;
}

/**
 * Pure, deterministic simulator for distributing a user-declared contribution amount
 * among prioritized portfolio holdings based on Decision Brief, allocation gap,
 * opportunity score, and confidence.
 *
 * Principles:
 * - Read-only: zero order generation, zero trade execution, zero DB writes.
 * - Money conservation: allocatedCents + unallocatedCents === totalCents exactly.
 * - Zero floats for currency: integer cents for all intermediate math.
 * - Respects decision tiers: LOW/INSUFFICIENT never receive allocations.
 * - WATCH excluded by default.
 * - Deterministic tiebreak: priorityWeight DESC -> brief rank ASC -> score DESC -> ticker ASC.
 */
export function buildContributionAllocationSimulation(
  params: BuildContributionAllocationSimulationParams,
): ContributionAllocationSimulation {
  const currency = params.currency || 'BRL';
  const modelVersion = OPPORTUNITY_MODEL_VERSION;
  const asOf = params.decisionBrief.asOf;
  const maxCap = params.maxAssetConcentrationCap ?? 0.5;
  const minCents = params.minAllocationCents ?? 5000; // R$ 50.00

  // 1. Parse contribution amount into integer cents
  const totalCents = parseDecimalToCents(params.contributionAmount);

  const assumptions: string[] = [
    'Simulação informativa baseada na carteira atual e no Decision Brief.',
    'Nenhuma ordem de compra ou venda é gerada ou enviada a corretoras.',
  ];
  const warnings: string[] = [];

  // If contribution amount is 0 or negative
  if (totalCents <= 0) {
    return {
      portfolioId: params.portfolioId,
      asOf,
      contributionAmount: params.contributionAmount || '0.00',
      currency,
      allocatedAmount: '0.00',
      unallocatedAmount: '0.00',
      allocatedCents: 0,
      unallocatedCents: 0,
      totalCents: 0,
      allocations: [],
      excludedAssets: [],
      assumptions,
      warnings: ['Valor de aporte não informado ou inválido para simulação.'],
      dataQuality: {
        eligibleAssetsCount: 0,
        allocatedAssetsCount: 0,
        excludedAssetsCount: 0,
        priceUsableCount: 0,
      },
      modelVersion,
    };
  }

  // Map radar items for rich lookup (currentPrice, dataFreshness, etc.)
  const radarItemMap = new Map<string, OpportunityRadarItem>();
  if (params.radarItems) {
    for (const item of params.radarItems) {
      radarItemMap.set(item.ticker, item);
      radarItemMap.set(item.assetId, item);
    }
  }

  // 2. Classify candidates into eligible vs excluded
  const candidates: Array<{
    item: PortfolioDecisionPriorityItem;
    radarItem?: OpportunityRadarItem;
    priorityWeight: number;
    reasons: string[];
    cautions: string[];
  }> = [];

  const excludedAssets: ContributionAllocationExcludedAsset[] = [];

  // Evaluate prioritized items from Decision Brief
  const evaluatedItems = params.decisionBrief.topPriorities;

  for (const item of evaluatedItems) {
    const radarItem = radarItemMap.get(item.ticker) || radarItemMap.get(item.assetId);

    // Rule 1: INSUFFICIENT_DATA is never allocated
    if (item.decisionTier === 'INSUFFICIENT_DATA') {
      excludedAssets.push({
        assetId: item.assetId,
        ticker: item.ticker,
        name: item.name,
        decisionTier: item.decisionTier,
        reason: 'Dados mínimos insuficientes no momento.',
      });
      continue;
    }

    // Rule 2: LOW confidence or INSUFFICIENT_DATA confidence is excluded
    if (item.confidence === 'LOW' || item.confidence === 'INSUFFICIENT_DATA') {
      excludedAssets.push({
        assetId: item.assetId,
        ticker: item.ticker,
        name: item.name,
        decisionTier: item.decisionTier,
        reason: 'Baixa confiança analítica dos dados.',
      });
      continue;
    }

    // Rule 3: WATCH tier is not allocated by default
    if (item.decisionTier === 'WATCH') {
      excludedAssets.push({
        assetId: item.assetId,
        ticker: item.ticker,
        name: item.name,
        decisionTier: item.decisionTier,
        reason: 'Ativo classificado para apenas acompanhamento (WATCH).',
      });
      continue;
    }

    // Rule 4: Critical price blocker missing
    const hasPriceBlocker = item.cautions.some(
      (c) => /preço.*indisponível|cotação.*ausente/i.test(c),
    );
    const itemPrice = radarItem?.currentPrice;
    if (hasPriceBlocker && (!itemPrice || itemPrice === '0')) {
      excludedAssets.push({
        assetId: item.assetId,
        ticker: item.ticker,
        name: item.name,
        decisionTier: item.decisionTier,
        reason: 'Cotação ausente ou zerada.',
      });
      continue;
    }

    // Calculate priority weighting factors
    // Tier weight: HIGH_PRIORITY = 1.0, REVIEW = 0.6
    const tierWeight = item.decisionTier === 'HIGH_PRIORITY' ? 1.0 : 0.6;

    // Confidence factor: HIGH = 1.0, MEDIUM = 0.8
    const confidenceFactor = item.confidence === 'HIGH' ? 1.0 : 0.8;

    // Score factor: (score / 100)
    const scoreFactor = Math.max(0.2, item.opportunityScore / 100);

    // Gap factor: if allocationContext has gapPercent > 0, give boost (e.g. 1.0 + min(gap/10, 0.5))
    let gapFactor = 1.0;
    const gapPercent = item.allocationContext?.gapPercent;
    if (typeof gapPercent === 'number' && gapPercent > 0) {
      gapFactor += Math.min(0.5, gapPercent / 10);
    }

    const priorityWeight = tierWeight * confidenceFactor * scoreFactor * gapFactor;

    // Synthesize up to 3 explainability reasons
    const reasons: string[] = [];
    if (typeof gapPercent === 'number' && gapPercent > 0.5) {
      reasons.push(`Abaixo do peso-alvo da classe (déficit de ${gapPercent.toFixed(1)}%).`);
    }
    if (item.decisionTier === 'HIGH_PRIORITY') {
      reasons.push('Prioridade alta para análise no resumo diário.');
    } else {
      reasons.push('Classificado para revisão prioritária.');
    }
    reasons.push(`Opportunity Score de ${item.opportunityScore} com confiança ${item.confidence === 'HIGH' ? 'alta' : 'média'}.`);

    // Add FII cash rotation context reason if applicable
    if (
      params.decisionBrief.fiiRotation?.targetTicker === item.ticker &&
      params.decisionBrief.fiiRotation.hasRecentPaidCash
    ) {
      reasons.push('Potencial destino para giro de proventos recentes de FIIs.');
    }

    const finalReasons = reasons.slice(0, 3);
    const cautions = [...item.cautions];

    candidates.push({
      item,
      radarItem,
      priorityWeight,
      reasons: finalReasons,
      cautions,
    });
  }

  // 3. Sort candidates deterministically
  candidates.sort((a, b) => {
    // 1. Priority weight DESC
    if (Math.abs(b.priorityWeight - a.priorityWeight) > 0.0001) {
      return b.priorityWeight - a.priorityWeight;
    }
    // 2. Brief rank ASC
    if (a.item.rank !== b.item.rank) {
      return a.item.rank - b.item.rank;
    }
    // 3. Opportunity score DESC
    if (b.item.opportunityScore !== a.item.opportunityScore) {
      return b.item.opportunityScore - a.item.opportunityScore;
    }
    // 4. Ticker ASC
    return a.item.ticker.localeCompare(b.item.ticker);
  });

  // Limit to top 3 eligible assets
  const topEligible = candidates.slice(0, 3);
  const eligibleAssetsCount = candidates.length;

  // If no assets are eligible
  if (topEligible.length === 0) {
    return {
      portfolioId: params.portfolioId,
      asOf,
      contributionAmount: formatCentsToDecimal(totalCents),
      currency,
      allocatedAmount: '0.00',
      unallocatedAmount: formatCentsToDecimal(totalCents),
      allocatedCents: 0,
      unallocatedCents: totalCents,
      totalCents,
      allocations: [],
      excludedAssets,
      assumptions,
      warnings: ['Nenhum ativo da carteira atingiu os critérios mínimos de elegibilidade para simulação.'],
      dataQuality: {
        eligibleAssetsCount: 0,
        allocatedAssetsCount: 0,
        excludedAssetsCount: excludedAssets.length,
        priceUsableCount: 0,
      },
      modelVersion,
    };
  }

  // 4. Distribute contribution amount among topEligible
  let allocatedCents = 0;
  const rawAllocations: Array<{
    candidate: (typeof candidates)[number];
    targetCents: number;
  }> = [];

  const firstEligible = topEligible[0];
  if (topEligible.length === 1 && firstEligible) {
    // Single asset: can receive up to 100% of the amount if above minCents
    const target = totalCents >= minCents ? totalCents : 0;
    rawAllocations.push({
      candidate: firstEligible,
      targetCents: target,
    });
    allocatedCents = target;
    warnings.push('A simulação ficou concentrada porque apenas um ativo passou pelos critérios atuais de elegibilidade.');
  } else {
    // Multi-asset: normalize weights with concentration cap
    const totalWeight = topEligible.reduce((acc, c) => acc + c.priorityWeight, 0);

    // Initial raw share per asset
    const initialShares = topEligible.map((c) => ({
      candidate: c,
      rawShare: totalWeight > 0 ? c.priorityWeight / totalWeight : 1 / topEligible.length,
    }));

    // Apply cap per asset (e.g. 50%) and redistribute excess to remaining assets
    const capped = applyConcentrationCap(initialShares.map((s) => s.rawShare), maxCap);
    const shares: Array<{ candidate: (typeof candidates)[number]; rawShare: number }> = initialShares.map((s, idx) => ({
      candidate: s.candidate,
      rawShare: capped[idx] ?? (1 / initialShares.length),
    }));

    // Convert to provisional cents
    let distributedCents = 0;
    const provAmounts: number[] = [];

    for (let i = 0; i < shares.length; i++) {
      const share = shares[i]?.rawShare ?? 0;
      let cents = Math.floor(totalCents * share);
      // If below minCents, do not allocate tiny slices
      if (cents < minCents) {
        cents = 0;
      }
      provAmounts.push(cents);
      distributedCents += cents;
    }

    // Allocate remaining cents (from floor rounding) to highest priority asset that has > 0 allocation
    let remainder = totalCents - distributedCents;
    if (remainder > 0) {
      for (let i = 0; i < provAmounts.length; i++) {
        const currentAmount = provAmounts[i];
        if (typeof currentAmount === 'number' && (currentAmount > 0 || (provAmounts.length === 1 && remainder >= minCents))) {
          provAmounts[i] = currentAmount + remainder;
          distributedCents += remainder;
          remainder = 0;
          break;
        }
      }
    }

    for (let i = 0; i < shares.length; i++) {
      const amount = provAmounts[i] ?? 0;
      const sh = shares[i];
      if (!sh) continue;

      if (amount > 0) {
        rawAllocations.push({
          candidate: sh.candidate,
          targetCents: amount,
        });
        allocatedCents += amount;
      } else {
        excludedAssets.push({
          assetId: sh.candidate.item.assetId,
          ticker: sh.candidate.item.ticker,
          name: sh.candidate.item.name,
          decisionTier: sh.candidate.item.decisionTier,
          reason: `Valor simulado resultou abaixo da fatia mínima recomendada (${formatCentsToDecimal(minCents)}).`,
        });
      }
    }
  }

  // Invariant check: allocatedCents <= totalCents
  if (allocatedCents > totalCents) {
    allocatedCents = totalCents;
  }
  const unallocatedCents = totalCents - allocatedCents;

  // 5. Build final allocation items and unit estimations
  let priceUsableCount = 0;
  const allocations: ContributionAllocationItem[] = [];

  for (let i = 0; i < rawAllocations.length; i++) {
    const rawAlloc = rawAllocations[i];
    if (!rawAlloc) continue;
    const { candidate, targetCents } = rawAlloc;
    const item = candidate.item;
    const radarItem = candidate.radarItem;

    const allocationPercent =
      totalCents > 0 ? Math.round((targetCents / totalCents) * 1000) / 10 : 0;

    // Unit estimation: only if quote is FRESH and price > 0
    let estimatedUnits: number | null = null;
    let unitPrice: string | null = null;
    let roundingResidualCents = 0;

    const rawPriceStr =
      radarItem?.currentPrice && radarItem.currentPrice !== '0'
        ? radarItem.currentPrice
        : null;

    const isQuoteFresh =
      radarItem?.dataFreshness === 'FRESH' &&
      !candidate.cautions.some((c: string) => /desatualizad|defasad/i.test(c));

    const priceNum = rawPriceStr ? parseFloat(rawPriceStr) : 0;

    if (isQuoteFresh && priceNum > 0) {
      priceUsableCount++;
      unitPrice = priceNum.toFixed(2);
      // Floor units to whole number for stocks/FIIs
      const units = Math.floor((targetCents / 100) / priceNum);
      estimatedUnits = units > 0 ? units : null;
      if (units > 0) {
        const costCents = Math.round(units * priceNum * 100);
        roundingResidualCents = Math.max(0, targetCents - costCents);
      }
    } else if (rawPriceStr && !isQuoteFresh) {
      candidate.cautions.push('Cotação desatualizada; quantidade aproximada de unidades não estimada.');
    }

    allocations.push({
      rank: i + 1,
      assetId: item.assetId,
      ticker: item.ticker,
      name: item.name,
      assetType: item.assetType,
      decisionTier: item.decisionTier,
      opportunityScore: item.opportunityScore,
      confidence: item.confidence,
      targetAmount: formatCentsToDecimal(targetCents),
      targetCents,
      allocationPercent,
      estimatedUnits,
      unitPrice,
      roundingResidualCents,
      reasons: candidate.reasons,
      cautions: candidate.cautions,
    });
  }

  return {
    portfolioId: params.portfolioId,
    asOf,
    contributionAmount: formatCentsToDecimal(totalCents),
    currency,
    allocatedAmount: formatCentsToDecimal(allocatedCents),
    unallocatedAmount: formatCentsToDecimal(unallocatedCents),
    allocatedCents,
    unallocatedCents,
    totalCents,
    allocations,
    excludedAssets,
    assumptions,
    warnings,
    dataQuality: {
      eligibleAssetsCount,
      allocatedAssetsCount: allocations.length,
      excludedAssetsCount: excludedAssets.length,
      priceUsableCount,
    },
    modelVersion,
  };
}

/** Converts decimal string e.g. "2000.50" to integer cents (200050) without float errors. */
function parseDecimalToCents(amountStr?: string | null): number {
  if (!amountStr) return 0;
  const cleaned = amountStr.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
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

/** Iteratively caps individual shares and redistributes excess to uncapped shares. */
function applyConcentrationCap(shares: number[], maxCap: number): number[] {
  if (shares.length <= 1) return shares;
  let result = [...shares];
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 5) {
    iterations++;
    changed = false;
    let excess = 0;
    let uncappedWeight = 0;

    for (let i = 0; i < result.length; i++) {
      const current = result[i] ?? 0;
      if (current > maxCap) {
        excess += current - maxCap;
        result[i] = maxCap;
        changed = true;
      } else {
        uncappedWeight += current;
      }
    }

    if (excess > 0 && uncappedWeight > 0) {
      for (let i = 0; i < result.length; i++) {
        const current = result[i] ?? 0;
        if (current < maxCap) {
          result[i] = current + excess * (current / uncappedWeight);
        }
      }
    }
  }

  // Re-normalize to sum to 1.0
  const sum = result.reduce((a, b) => a + b, 0);
  return sum > 0 ? result.map((r) => r / sum) : result;
}
