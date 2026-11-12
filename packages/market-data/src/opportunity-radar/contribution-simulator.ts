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
  /** Maximum single-asset concentration cap. Defaults to DEFAULT_MAX_ASSET_CONCENTRATION_CAP (0.50 = 50%). */
  maxAssetConcentrationCap?: number;
  /** Minimum allocation per asset in cents. Defaults to DEFAULT_MIN_ALLOCATION_CENTS (5000 = R$ 50.00). */
  minAllocationCents?: number;
  /** Scenario weighting profile. Defaults to BALANCED_WEIGHT_PROFILE. */
  weightingProfile?: ContributionScenarioWeightProfile;
}

export type ContributionScenarioMode = 'CAUTIOUS' | 'BALANCED' | 'OPPORTUNITY_FOCUS';

/** Default maximum single-asset concentration cap in multi-asset simulation (50%). */
export const DEFAULT_MAX_ASSET_CONCENTRATION_CAP = 0.5;

/** Default minimum allocation slice per asset in cents (R$ 50.00). */
export const DEFAULT_MIN_ALLOCATION_CENTS = 5000;

export interface ContributionScenarioWeightProfile {
  mode: ContributionScenarioMode;
  label: string;
  description: string;
  tierWeight: (tier: DecisionTier) => number;
  confidenceWeight: (confidence: OpportunityConfidence) => number;
  scoreFactor: (score: number) => number;
  gapFactor: (gapPercent?: number) => number;
  dataQualityFactor: (
    item: PortfolioDecisionPriorityItem,
    radarItem?: OpportunityRadarItem,
    decisionBrief?: PortfolioDailyDecisionBrief,
  ) => { factor: number; reason?: string };
  maxAssetConcentrationCap: number;
}

export const BALANCED_WEIGHT_PROFILE: ContributionScenarioWeightProfile = {
  mode: 'BALANCED',
  label: 'Balanceado',
  description: 'Equilibra oportunidade, confiança e distância do peso-alvo.',
  tierWeight: (tier) => (tier === 'HIGH_PRIORITY' ? 1.0 : 0.6),
  confidenceWeight: (conf) => (conf === 'HIGH' ? 1.0 : 0.8),
  scoreFactor: (score) => Math.max(0.2, score / 100),
  gapFactor: (gap) => 1.0 + (typeof gap === 'number' && gap > 0 ? Math.min(0.5, gap / 10) : 0),
  dataQualityFactor: () => ({ factor: 1.0 }),
  maxAssetConcentrationCap: DEFAULT_MAX_ASSET_CONCENTRATION_CAP,
};

export const CAUTIOUS_WEIGHT_PROFILE: ContributionScenarioWeightProfile = {
  mode: 'CAUTIOUS',
  label: 'Mais cauteloso',
  description: 'Dá mais peso à confiança e à qualidade dos dados disponíveis.',
  tierWeight: (tier) => (tier === 'HIGH_PRIORITY' ? 1.0 : 0.6),
  confidenceWeight: (conf) => (conf === 'HIGH' ? 1.0 : 0.55),
  scoreFactor: (score) => 0.4 + 0.6 * (Math.max(20, score) / 100),
  gapFactor: (gap) => 1.0 + (typeof gap === 'number' && gap > 0 ? Math.min(0.3, gap / 15) : 0),
  dataQualityFactor: (item, radarItem, brief) => {
    let factor = 1.0;
    let reason: string | undefined;

    const isQuoteStale =
      radarItem?.dataFreshness !== 'FRESH' ||
      item.cautions.some((c) => /desatualizad|defasad/i.test(c));
    if (isQuoteStale) {
      factor *= 0.75;
      reason = 'Penalizado por cotação desatualizada ou defasada.';
    }

    const isProviderPartial =
      brief?.dataQuality.label === 'PARCIAL' ||
      item.cautions.some((c) => /notícias parciais|provedor degradado|qualidade.*degradada/i.test(c)) ||
      Boolean(brief?.summary?.some((s) => /provedor.*parcial|notícias parciais/i.test(s)));
    if (isProviderPartial) {
      factor *= 0.85;
      reason = reason ? `${reason} Qualidade parcial do provedor de notícias.` : 'Qualidade parcial do provedor de notícias.';
    }

    return { factor, reason };
  },
  maxAssetConcentrationCap: DEFAULT_MAX_ASSET_CONCENTRATION_CAP,
};

export const OPPORTUNITY_FOCUS_WEIGHT_PROFILE: ContributionScenarioWeightProfile = {
  mode: 'OPPORTUNITY_FOCUS',
  label: 'Mais foco em oportunidades',
  description: 'Dá maior peso às oportunidades relativas identificadas pelo Radar, mantendo os mesmos limites de segurança.',
  tierWeight: (tier) => (tier === 'HIGH_PRIORITY' ? 1.0 : 0.5),
  confidenceWeight: (conf) => (conf === 'HIGH' ? 1.0 : 0.9),
  scoreFactor: (score) => Math.pow(Math.max(0.1, score / 100), 1.6),
  gapFactor: (gap) => 1.0 + (typeof gap === 'number' && gap > 0 ? Math.min(0.8, gap / 6) : 0),
  dataQualityFactor: () => ({ factor: 1.0 }),
  maxAssetConcentrationCap: DEFAULT_MAX_ASSET_CONCENTRATION_CAP,
};

export interface ContributionScenario {
  id: ContributionScenarioMode;
  label: string;
  description: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  allocatedCents: number;
  unallocatedCents: number;
  totalCents: number;
  allocations: ContributionAllocationItem[];
  excludedAssets: ContributionAllocationExcludedAsset[];
  assumptions: string[];
  warnings: string[];
}

export interface ContributionScenarioComparison {
  portfolioId: string;
  contributionAmount: string;
  currency: string;
  asOf: string;
  scenarios: ContributionScenario[];
  comparisonInsights: string[];
  commonWarnings: string[];
  dataQuality: ContributionAllocationSimulationDataQuality;
  modelVersion: string;
}

export interface BuildContributionScenarioComparisonParams {
  portfolioId: string;
  contributionAmount: string; // decimal string
  currency?: string;
  decisionBrief: PortfolioDailyDecisionBrief;
  radarItems?: readonly OpportunityRadarItem[];
  referenceDate?: Date;
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
 * - Final monetary allocations and conservation use integer cents.
 * - Concentration cap integrity: in multi-asset scenarios, targetCents <= floor(totalCents * maxCap).
 * - Single-asset exception: 100% permitted only when exactly 1 asset is eligible (with warning).
 * - Respects decision tiers: LOW/INSUFFICIENT never receive allocations.
 * - WATCH excluded by default.
 * - Deterministic tiebreak: priorityWeight DESC -> brief rank ASC -> score DESC -> ticker ASC.
 */
export function buildContributionAllocationSimulation(
  params: BuildContributionAllocationSimulationParams,
): ContributionAllocationSimulation {
  const profile = params.weightingProfile ?? BALANCED_WEIGHT_PROFILE;
  const currency = params.currency || 'BRL';
  const modelVersion = OPPORTUNITY_MODEL_VERSION;
  const asOf = params.decisionBrief.asOf;
  const maxCap = params.maxAssetConcentrationCap ?? profile.maxAssetConcentrationCap;
  const minCents = params.minAllocationCents ?? DEFAULT_MIN_ALLOCATION_CENTS;

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

    // Calculate priority weighting factors using scenario profile
    const tierWeight = profile.tierWeight(item.decisionTier);
    const confidenceFactor = profile.confidenceWeight(item.confidence);
    const scoreFactor = profile.scoreFactor(item.opportunityScore);
    const gapPercent = item.allocationContext?.gapPercent;
    const gapFactor = profile.gapFactor(gapPercent);
    const dq = profile.dataQualityFactor(item, radarItem, params.decisionBrief);

    const priorityWeight = tierWeight * confidenceFactor * scoreFactor * gapFactor * dq.factor;

    // Synthesize up to 3 explainability reasons
    const reasons: string[] = [];
    if (typeof gapPercent === 'number' && gapPercent > 0.5) {
      reasons.push(`Abaixo do peso-alvo da classe (déficit de ${gapPercent.toFixed(1)}%).`);
    }
    if (profile.mode === 'CAUTIOUS' && item.confidence === 'HIGH' && dq.factor >= 1.0) {
      reasons.push('Favorecido pela alta confiança e qualidade dos dados disponíveis.');
    } else if (profile.mode === 'OPPORTUNITY_FOCUS' && item.opportunityScore >= 75) {
      reasons.push(`Destaque para elevado Opportunity Score (${item.opportunityScore}).`);
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
    if (dq.reason && !cautions.includes(dq.reason)) {
      cautions.push(dq.reason);
    }

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

    // Multi-asset concentration cap in integer cents: floor(totalCents * maxCap)
    const maxAssetCents = Math.floor(totalCents * maxCap);

    // Convert to provisional cents respecting maxAssetCents and minCents threshold
    let distributedCents = 0;
    const provAmounts: number[] = [];

    for (let i = 0; i < shares.length; i++) {
      const share = shares[i]?.rawShare ?? 0;
      let cents = Math.floor(totalCents * share);
      // Hard clamp to maxAssetCents
      if (cents > maxAssetCents) {
        cents = maxAssetCents;
      }
      // If below minCents, do not allocate tiny slices
      if (cents < minCents) {
        cents = 0;
      }
      provAmounts.push(cents);
      distributedCents += cents;
    }

    // Active allocation set: only assets that met or exceeded the minimum threshold
    // Assets zeroed out by minCents MUST NOT be reintroduced to receive remainder
    const activeIndices: number[] = [];
    for (let i = 0; i < provAmounts.length; i++) {
      if ((provAmounts[i] ?? 0) > 0) {
        activeIndices.push(i);
      }
    }

    // Cap-aware remainder distribution:
    // Only active assets can receive remainder, strictly up to their remaining capacity (maxAssetCents - currentAllocation)
    let remainder = totalCents - distributedCents;
    if (remainder > 0 && activeIndices.length > 0) {
      for (const idx of activeIndices) {
        const currentAmount = provAmounts[idx] ?? 0;
        const remainingCapacityCents = Math.max(0, maxAssetCents - currentAmount);
        const delta = Math.min(remainder, remainingCapacityCents);
        if (delta > 0) {
          provAmounts[idx] = currentAmount + delta;
          distributedCents += delta;
          remainder -= delta;
        }
        if (remainder === 0) {
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

    // Defensive assert (Part AA & Part AD): in multi-asset scenario, no allocation may exceed maxAssetCents
    for (const alloc of rawAllocations) {
      if (alloc.targetCents > maxAssetCents) {
        throw new Error(
          `Defensive invariant violation: asset ${alloc.candidate.item.ticker} allocation (${alloc.targetCents} cents) exceeds max allowed cap (${maxAssetCents} cents).`,
        );
      }
    }
  }

  // Invariant check: allocatedCents <= totalCents
  if (allocatedCents > totalCents) {
    allocatedCents = totalCents;
  }
  const unallocatedCents = totalCents - allocatedCents;

  // Add explainable warnings for unallocated remainder due to concentration cap or minimum thresholds
  if (unallocatedCents > 0 && allocatedCents > 0) {
    warnings.push(
      'Parte do valor ficou não alocada porque o limite de concentração impediria distribuição segura.',
    );
  } else if (unallocatedCents > 0 && allocatedCents === 0 && warnings.length === 0) {
    warnings.push(
      'Nenhum ativo atingiu a fatia mínima recomendada para este valor de aporte.',
    );
  }

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

    const unitPriceCents = parsePriceToCents(rawPriceStr);

    if (isQuoteFresh && unitPriceCents > 0) {
      priceUsableCount++;
      unitPrice = formatCentsToDecimal(unitPriceCents);
      // Floor units to whole number for stocks/FIIs using exact integer cents
      const units = Math.floor(targetCents / unitPriceCents);
      estimatedUnits = units > 0 ? units : null;
      if (units > 0) {
        const costCents = units * unitPriceCents;
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
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match || !match[1]) return 0;
  const whole = parseInt(match[1], 10);
  const fracStr = (match[2] || '').padEnd(2, '0');
  const frac = parseInt(fracStr.slice(0, 2), 10);
  return whole * 100 + frac;
}

/** Parses quote price to integer cents (e.g. "28.50" -> 2850 cents). */
function parsePriceToCents(priceStr?: string | null): number {
  if (!priceStr) return 0;
  return parseDecimalToCents(priceStr);
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

/**
 * Pure deterministic engine for comparing three explainable contribution scenarios:
 * CAUTIOUS, BALANCED, and OPPORTUNITY_FOCUS.
 *
 * Rules:
 * - Shared eligibility floor: LOW/INSUFFICIENT/WATCH never allocated in any scenario.
 * - BALANCED matches current simulator output identically.
 * - Exact integer cents conservation in all 3 scenarios.
 * - Multi-asset concentration cap respected by all scenarios.
 * - Single-asset exception permitted with mandatory warning.
 * - Pure, deterministic comparison insights derived from scenario outputs.
 * - Read-only: zero orders, zero persistence.
 */
export function buildContributionScenarioComparison(
  params: BuildContributionScenarioComparisonParams,
): ContributionScenarioComparison {
  const currency = params.currency || 'BRL';
  const totalCents = parseDecimalToCents(params.contributionAmount);
  const asOf = params.decisionBrief.asOf;

  // Run the 3 canonical scenarios
  const cautiousSim = buildContributionAllocationSimulation({
    ...params,
    weightingProfile: CAUTIOUS_WEIGHT_PROFILE,
  });

  const balancedSim = buildContributionAllocationSimulation({
    ...params,
    weightingProfile: BALANCED_WEIGHT_PROFILE,
  });

  const opportunitySim = buildContributionAllocationSimulation({
    ...params,
    weightingProfile: OPPORTUNITY_FOCUS_WEIGHT_PROFILE,
  });

  const scenarios: ContributionScenario[] = [
    {
      id: CAUTIOUS_WEIGHT_PROFILE.mode,
      label: CAUTIOUS_WEIGHT_PROFILE.label,
      description: CAUTIOUS_WEIGHT_PROFILE.description,
      allocatedAmount: cautiousSim.allocatedAmount,
      unallocatedAmount: cautiousSim.unallocatedAmount,
      allocatedCents: cautiousSim.allocatedCents,
      unallocatedCents: cautiousSim.unallocatedCents,
      totalCents: cautiousSim.totalCents,
      allocations: cautiousSim.allocations,
      excludedAssets: cautiousSim.excludedAssets,
      assumptions: cautiousSim.assumptions,
      warnings: cautiousSim.warnings,
    },
    {
      id: BALANCED_WEIGHT_PROFILE.mode,
      label: BALANCED_WEIGHT_PROFILE.label,
      description: BALANCED_WEIGHT_PROFILE.description,
      allocatedAmount: balancedSim.allocatedAmount,
      unallocatedAmount: balancedSim.unallocatedAmount,
      allocatedCents: balancedSim.allocatedCents,
      unallocatedCents: balancedSim.unallocatedCents,
      totalCents: balancedSim.totalCents,
      allocations: balancedSim.allocations,
      excludedAssets: balancedSim.excludedAssets,
      assumptions: balancedSim.assumptions,
      warnings: balancedSim.warnings,
    },
    {
      id: OPPORTUNITY_FOCUS_WEIGHT_PROFILE.mode,
      label: OPPORTUNITY_FOCUS_WEIGHT_PROFILE.label,
      description: OPPORTUNITY_FOCUS_WEIGHT_PROFILE.description,
      allocatedAmount: opportunitySim.allocatedAmount,
      unallocatedAmount: opportunitySim.unallocatedAmount,
      allocatedCents: opportunitySim.allocatedCents,
      unallocatedCents: opportunitySim.unallocatedCents,
      totalCents: opportunitySim.totalCents,
      allocations: opportunitySim.allocations,
      excludedAssets: opportunitySim.excludedAssets,
      assumptions: opportunitySim.assumptions,
      warnings: opportunitySim.warnings,
    },
  ];

  // Derive comparison insights
  const comparisonInsights = deriveComparisonInsights(scenarios, totalCents, currency);

  // Collect common warnings across scenarios
  const commonWarningsSet = new Set<string>();
  for (const s of scenarios) {
    for (const w of s.warnings) {
      if (scenarios.every((other) => other.warnings.includes(w))) {
        commonWarningsSet.add(w);
      }
    }
  }

  return {
    portfolioId: params.portfolioId,
    contributionAmount: formatCentsToDecimal(totalCents),
    currency,
    asOf,
    scenarios,
    comparisonInsights,
    commonWarnings: Array.from(commonWarningsSet),
    dataQuality: balancedSim.dataQuality,
    modelVersion: OPPORTUNITY_MODEL_VERSION,
  };
}

/**
 * Derives explainable comparison insights across the 3 scenarios.
 * Strictly mechanical and deterministic, zero subjective claims.
 */
function deriveComparisonInsights(
  scenarios: ContributionScenario[],
  totalCents: number,
  currency: string,
): string[] {
  if (totalCents <= 0) {
    return ['Informe um valor de aporte para comparar cenários.'];
  }

  const cautious = scenarios.find((s) => s.id === 'CAUTIOUS')!;
  const balanced = scenarios.find((s) => s.id === 'BALANCED')!;
  const opportunity = scenarios.find((s) => s.id === 'OPPORTUNITY_FOCUS')!;

  // Check if no asset is allocated across all scenarios
  if (
    cautious.allocations.length === 0 &&
    balanced.allocations.length === 0 &&
    opportunity.allocations.length === 0
  ) {
    return ['Nenhum ativo atingiu os critérios de elegibilidade para simulação nos cenários.'];
  }

  // Check if all 3 scenarios have identical allocations
  const allocFingerprint = (s: ContributionScenario) =>
    s.allocations.map((a) => `${a.ticker}:${a.targetCents}`).join('|');

  if (
    allocFingerprint(cautious) === allocFingerprint(balanced) &&
    allocFingerprint(balanced) === allocFingerprint(opportunity)
  ) {
    return ['Os três cenários resultaram na mesma distribuição com os dados atuais.'];
  }

  const insights: string[] = [];

  // Collect all tickers
  const allTickers = new Set<string>();
  for (const s of scenarios) {
    for (const a of s.allocations) allTickers.add(a.ticker);
  }

  const tickerStats: Array<{
    ticker: string;
    cautiousPct: number;
    balancedPct: number;
    oppPct: number;
    cautiousAmount: number;
    balancedAmount: number;
    oppAmount: number;
    minPct: number;
    maxPct: number;
    spread: number;
    score: number;
    confidence: string;
    presentCount: number;
  }> = [];

  for (const ticker of allTickers) {
    const cAlloc = cautious.allocations.find((a) => a.ticker === ticker);
    const bAlloc = balanced.allocations.find((a) => a.ticker === ticker);
    const oAlloc = opportunity.allocations.find((a) => a.ticker === ticker);

    const cPct = cAlloc?.allocationPercent ?? 0;
    const bPct = bAlloc?.allocationPercent ?? 0;
    const oPct = oAlloc?.allocationPercent ?? 0;

    const minPct = Math.min(cPct, bPct, oPct);
    const maxPct = Math.max(cPct, bPct, oPct);
    const spread = Math.round((maxPct - minPct) * 10) / 10;

    const score = bAlloc?.opportunityScore ?? oAlloc?.opportunityScore ?? cAlloc?.opportunityScore ?? 0;
    const confidence = bAlloc?.confidence ?? oAlloc?.confidence ?? cAlloc?.confidence ?? 'HIGH';
    const presentCount = (cAlloc ? 1 : 0) + (bAlloc ? 1 : 0) + (oAlloc ? 1 : 0);

    tickerStats.push({
      ticker,
      cautiousPct: cPct,
      balancedPct: bPct,
      oppPct: oPct,
      cautiousAmount: cAlloc?.targetCents ?? 0,
      balancedAmount: bAlloc?.targetCents ?? 0,
      oppAmount: oAlloc?.targetCents ?? 0,
      minPct,
      maxPct,
      spread,
      score,
      confidence,
      presentCount,
    });
  }

  // Sort by spread DESC
  tickerStats.sort((a, b) => b.spread - a.spread);

  // 1. Largest variation
  const topSpread = tickerStats[0];
  if (topSpread && topSpread.spread >= 1.0) {
    insights.push(
      `Maior variação entre cenários: ${topSpread.ticker} varia de ${topSpread.minPct.toFixed(1)}% a ${topSpread.maxPct.toFixed(1)}% (${topSpread.spread.toFixed(1)} p.p. de amplitude).`,
    );
  }

  // 2. Cautious preference
  const cautiousWinner = tickerStats.find(
    (t) => t.cautiousPct > t.balancedPct && t.confidence === 'HIGH',
  );
  if (cautiousWinner) {
    insights.push(
      `${cautiousWinner.ticker} recebe maior peso no cenário cauteloso por apresentar alta confiança e qualidade de dados (${cautiousWinner.cautiousPct.toFixed(1)}% vs ${cautiousWinner.balancedPct.toFixed(1)}% no balanceado).`,
    );
  }

  // 3. Opportunity preference
  const oppWinner = tickerStats.find(
    (t) => t.oppPct > t.balancedPct && t.oppAmount > t.balancedAmount,
  );
  if (oppWinner) {
    const deltaAmount = formatCentsToDecimal(oppWinner.oppAmount - oppWinner.balancedAmount);
    insights.push(
      `${oppWinner.ticker} recebe maior alocação no cenário de oportunidade (+${currency} ${deltaAmount}) impulsionado pelo Opportunity Score de ${oppWinner.score}.`,
    );
  }

  // 4. Stable asset across all 3
  const stable = tickerStats.find(
    (t) => t.presentCount === 3 && t.spread <= 3.0,
  );
  if (stable && insights.length < 4) {
    insights.push(
      `${stable.ticker} mantém alocação consistente nos três cenários (~${stable.balancedPct.toFixed(1)}%).`,
    );
  }

  // 5. Dropped asset due to min allocation
  const dropped = tickerStats.find((t) => t.presentCount > 0 && t.presentCount < 3);
  if (dropped && insights.length < 4) {
    const inScenarios: string[] = [];
    if (dropped.cautiousPct > 0) inScenarios.push('Cautela');
    if (dropped.balancedPct > 0) inScenarios.push('Balanceado');
    if (dropped.oppPct > 0) inScenarios.push('Oportunidade');
    insights.push(
      `${dropped.ticker} recebe alocação apenas no(s) cenário(s) ${inScenarios.join(' e ')} devido ao valor mínimo por ativo.`,
    );
  }

  if (insights.length === 0) {
    insights.push(
      'Os cenários apresentam variações graduais de acordo com a priorização de confiança vs oportunidade.',
    );
  }

  return insights.slice(0, 4);
}
