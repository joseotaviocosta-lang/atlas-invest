import {
  OPPORTUNITY_MODEL_VERSION,
  OpportunityAssetType,
  OpportunityConfidence,
  OpportunityRadarItem,
  OpportunityRadarResult,
} from './types';
import { PortfolioNewsEvent } from './portfolio-news.types';

export type DecisionTier = 'HIGH_PRIORITY' | 'REVIEW' | 'WATCH' | 'INSUFFICIENT_DATA';

export type DecisionBlockerSeverity = 'BLOCKING' | 'CAUTION' | 'INFORMATIONAL';

export type DecisionBlockerCode =
  | 'MISSING_PRICE'
  | 'QUOTE_STALE'
  | 'NO_FUNDAMENTALS'
  | 'NO_ALLOCATION_TARGET'
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_HISTORY'
  | 'NEWS_PROVIDER_PARTIAL'
  | 'UNKNOWN_DIVIDEND_CALENDAR';

export interface DecisionBlocker {
  code: DecisionBlockerCode;
  severity: DecisionBlockerSeverity;
  message: string;
}

export interface DecisionReadinessAssessment {
  eligibleForHighPriority: boolean;
  tierCeiling: DecisionTier;
  blockers: DecisionBlocker[];
  cautions: string[];
  dataGaps: string[];
}

export type DecisionChangeType =
  | 'SCORE_UP'
  | 'SCORE_DOWN'
  | 'RANK_UP'
  | 'RANK_DOWN'
  | 'NEW_MATERIAL_NEWS'
  | 'UPDATED_MATERIAL_NEWS'
  | 'CONFIDENCE_CHANGED'
  | 'CALENDAR_CHANGED';

export interface DecisionRecentChange {
  type: DecisionChangeType;
  label: string;
  source?: string;
  isOfficial?: boolean;
  canonicalUrl?: string;
}

export interface PortfolioDecisionPriorityItem {
  rank: number;
  assetId: string;
  ticker: string;
  name: string;
  assetType: OpportunityAssetType;
  opportunityScore: number;
  confidence: OpportunityConfidence;
  decisionTier: DecisionTier;
  whyNow: string[];
  cautions: string[];
  dataGaps: string[];
  recentChanges: DecisionRecentChange[];
  allocationContext?: {
    portfolioWeight: number;
    classWeight?: number;
    targetWeight?: number;
    gapPercent?: number;
  };
  dividendContext?: {
    recordDate: string | null;
    paymentDate: string | null;
    eligibilityStatus: string;
    amountPerShare: number | null;
    estimatedRecentCash: number | null;
  };
  newsContext?: {
    headline: string;
    source: string;
    isOfficial: boolean;
    aggregator?: string;
    canonicalUrl?: string;
    materiality?: string;
    state?: string;
  };
}

export interface FiiCashRotationBrief {
  hasRecentPaidCash: boolean;
  estimatedRecentCashTotal: number | null;
  sourceTickers: string[];
  targetTicker: string | null;
  targetRecordDate: string | null;
  targetPaymentDate: string | null;
  summaryText: string;
}

export interface DecisionBriefContributionContext {
  plannedAmount: string | null;
  currency: string;
  source: 'CONTRIBUTION_GOAL' | 'USER_SIMULATION' | 'NONE';
  simulationNote: string | null;
}

export interface DecisionBriefDataQuality {
  label: 'BOA' | 'PARCIAL' | 'LIMITADA';
  sufficientCount: number;
  incompleteCount: number;
  totalAssets: number;
  priceCoveragePercent: number;
  fundamentalsCoveragePercent: number;
  newsCoveragePercent: number;
  officialProviderStatus?: string | null;
}

export interface PortfolioDailyDecisionBrief {
  portfolioId: string;
  asOf: string;
  generatedAt: string;
  modelVersion: string;
  comparisonBasis: 'PREVIOUS_ANALYSIS' | 'INITIAL_BASELINE';
  summary: string[];
  topPriorities: PortfolioDecisionPriorityItem[];
  allEvaluatedCount: number;
  fiiRotation?: FiiCashRotationBrief;
  recentMaterialChanges: Array<{
    ticker: string;
    type: DecisionChangeType;
    label: string;
    isOfficial: boolean;
    source?: string;
    canonicalUrl?: string;
  }>;
  contributionContext: DecisionBriefContributionContext;
  dataQuality: DecisionBriefDataQuality;
}

export interface DecisionAllocationContextInput {
  classWeights?: Record<string, number>;
  classTargetWeights?: Record<string, number>;
}

export interface BuildDecisionBriefParams {
  radar: OpportunityRadarResult;
  previousRadar?: OpportunityRadarResult | null;
  allocationContext?: DecisionAllocationContextInput;
  plannedContribution?: {
    amount: string;
    currency: string;
    source: 'CONTRIBUTION_GOAL' | 'USER_SIMULATION';
  } | null;
  newsProviderPartial?: boolean;
  officialProviderStatus?: string | null;
  referenceDate?: Date;
}

const TIER_ORDER: Record<DecisionTier, number> = {
  HIGH_PRIORITY: 0,
  REVIEW: 1,
  WATCH: 2,
  INSUFFICIENT_DATA: 3,
};

const CONFIDENCE_ORDER: Record<OpportunityConfidence, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  INSUFFICIENT_DATA: 3,
};

const MAX_WHY_NOW = 3;
const TOP_DECISIONS_LIMIT = 3;

function parsePositiveDecimal(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function formatBrlAmount(amount: number): string {
  return amount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSaoPauloDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function isOfficialEvent(ev: PortfolioNewsEvent): boolean {
  return (
    ev.official ||
    ev.sourceType === 'OFFICIAL_REGULATORY' ||
    ev.provider === 'CVM' ||
    ev.provider === 'B3' ||
    ev.provider === 'OFFICIAL_REGULATORY'
  );
}

function resolveOfficialSourceLabel(ev: PortfolioNewsEvent): string {
  if (ev.provider === 'CVM') return 'CVM';
  if (ev.provider === 'B3') return 'B3/FNET';
  if (ev.provider === 'OFFICIAL_REGULATORY') return ev.sources?.[0]?.name || 'CVM / B3';
  return ev.sources?.[0]?.name || 'Fonte oficial';
}

function resolveCanonicalEventUrl(ev: PortfolioNewsEvent): string | undefined {
  return ev.sources?.find((s) => Boolean(s.url))?.url ?? undefined;
}

export function evaluateDecisionReadiness(
  item: OpportunityRadarItem,
  options?: {
    hasAllocationTarget?: boolean;
    newsProviderPartial?: boolean;
  },
): DecisionReadinessAssessment {
  const blockers: DecisionBlocker[] = [];
  const cautions: string[] = [];
  const dataGaps: string[] = [];

  const priceNum = parsePositiveDecimal(item.currentPrice);
  const hasFundamentals = Boolean(item.dataProvenance?.hasRealFundamentals);
  const hasPriceHistory = Boolean(item.dataProvenance?.hasPriceHistory);

  if (priceNum === null) {
    blockers.push({
      code: 'MISSING_PRICE',
      severity: 'BLOCKING',
      message: 'Cotação atual ausente ou zerada.',
    });
    dataGaps.push('Cotação atual indisponível.');
  }

  if (item.confidence === 'INSUFFICIENT_DATA') {
    blockers.push({
      code: 'LOW_CONFIDENCE',
      severity: 'BLOCKING',
      message: 'Dados insuficientes para priorizar com segurança.',
    });
    dataGaps.push('Dados mínimos de mercado/carteira insuficientes.');
  } else if (item.confidence === 'LOW') {
    blockers.push({
      code: 'LOW_CONFIDENCE',
      severity: 'BLOCKING',
      message: 'Confiança analítica baixa impede promoção a alta prioridade.',
    });
    cautions.push('Confiança reduzida pela baixa cobertura de dados.');
  }

  if (!hasFundamentals) {
    blockers.push({
      code: 'NO_FUNDAMENTALS',
      severity: 'BLOCKING',
      message: 'Fundamentos indisponíveis no provedor atual.',
    });
    dataGaps.push('Fundamentos indisponíveis no provedor atual.');
  }

  if (!hasPriceHistory) {
    blockers.push({
      code: 'INSUFFICIENT_HISTORY',
      severity: 'CAUTION',
      message: 'Histórico recente de preços ausente ou parcial.',
    });
    dataGaps.push('Histórico de preços (21d/63d) indisponível.');
  }

  if (item.dataFreshness === 'STALE') {
    blockers.push({
      code: 'QUOTE_STALE',
      severity: 'CAUTION',
      message: 'Cotação disponível está desatualizada.',
    });
    cautions.push('Cotação disponível está desatualizada; métricas dependentes de preço atual têm limitação.');
  } else if (item.dataFreshness === 'UNKNOWN' && priceNum !== null) {
    cautions.push('Atualidade da cotação não confirmada.');
  }

  if (options?.hasAllocationTarget === false) {
    blockers.push({
      code: 'NO_ALLOCATION_TARGET',
      severity: 'INFORMATIONAL',
      message: 'Peso-alvo da classe não configurado.',
    });
    dataGaps.push('Peso-alvo da classe não configurado na estratégia.');
  }

  if (
    item.assetType === 'FII' &&
    (!item.dividendCalendar || item.dividendCalendar.eventStatus === 'UNKNOWN')
  ) {
    blockers.push({
      code: 'UNKNOWN_DIVIDEND_CALENDAR',
      severity: 'INFORMATIONAL',
      message: 'Calendário oficial de proventos do FII indisponível.',
    });
    dataGaps.push('Calendário oficial de proventos do FII indisponível.');
  }

  if (options?.newsProviderPartial) {
    blockers.push({
      code: 'NEWS_PROVIDER_PARTIAL',
      severity: 'CAUTION',
      message: 'Cobertura parcial dos provedores de notícias.',
    });
    cautions.push('Cobertura de notícias parcial nesta execução.');
  }

  let tierCeiling: DecisionTier = 'HIGH_PRIORITY';
  if (priceNum === null || item.confidence === 'INSUFFICIENT_DATA') {
    tierCeiling = 'INSUFFICIENT_DATA';
  } else if (item.confidence === 'LOW') {
    tierCeiling = 'WATCH';
  } else if (!hasFundamentals || item.confidence === 'MEDIUM') {
    tierCeiling = 'REVIEW';
  }

  return {
    eligibleForHighPriority: tierCeiling === 'HIGH_PRIORITY',
    tierCeiling,
    blockers,
    cautions,
    dataGaps,
  };
}

function classifyDecisionTier(
  score: number,
  confidence: OpportunityConfidence,
  readiness: DecisionReadinessAssessment,
): DecisionTier {
  if (readiness.tierCeiling === 'INSUFFICIENT_DATA') {
    return 'INSUFFICIENT_DATA';
  }

  let desired: DecisionTier;
  if (score >= 70 && confidence === 'HIGH' && readiness.eligibleForHighPriority) {
    desired = 'HIGH_PRIORITY';
  } else if (score >= 58 && (confidence === 'HIGH' || confidence === 'MEDIUM')) {
    desired = 'REVIEW';
  } else {
    desired = 'WATCH';
  }

  if (TIER_ORDER[desired] < TIER_ORDER[readiness.tierCeiling]) {
    return readiness.tierCeiling;
  }
  return desired;
}

function buildWhyNowReasons(params: {
  item: OpportunityRadarItem;
  tier: DecisionTier;
  allocationGap?: number;
  materialEvents: PortfolioNewsEvent[];
}): string[] {
  const { item, tier, allocationGap, materialEvents } = params;
  if (tier === 'INSUFFICIENT_DATA') {
    return ['Dados insuficientes para priorizar com segurança.'];
  }

  const reasons: string[] = [];
  const isQuoteStale = item.dataFreshness === 'STALE';

  if (allocationGap !== undefined && allocationGap > 0.5) {
    reasons.push('Está abaixo do peso definido para sua classe na carteira.');
  } else if (item.components.portfolioFit >= 70) {
    reasons.push('Aderência favorável ao equilíbrio atual da carteira.');
  }

  const officialMaterial = materialEvents.find((ev) => isOfficialEvent(ev));
  if (officialMaterial) {
    const label = resolveOfficialSourceLabel(officialMaterial);
    reasons.push(`Evento material oficial recente (${label}) aumentou a relevância do ativo.`);
  } else if (materialEvents.length > 0) {
    reasons.push('Notícia relevante recente colocou o ativo em evidência para revisão.');
  }

  if (item.dataProvenance?.hasRealFundamentals && (item.components.valuation ?? 0) >= 60) {
    reasons.push('Fundamentos disponíveis sustentam a posição relativa no Radar.');
  }

  if (
    item.assetType === 'FII' &&
    item.dividendCalendar?.eventStatus === 'ANNOUNCED' &&
    (item.dividendCalendar.eligibilityStatus === 'ELIGIBLE' ||
      item.dividendCalendar.eligibilityStatus === 'RECORD_DATE_TODAY')
  ) {
    reasons.push('FII possui pagamento anunciado com data-com ainda elegível.');
  }

  if (!isQuoteStale && item.components.priceOpportunity !== null && item.components.priceOpportunity >= 65) {
    reasons.push('Desconto relativo na faixa recente de negociação favorece análise.');
  }

  if (!isQuoteStale && item.components.momentum !== null && item.components.momentum >= 65) {
    reasons.push('Tendência recente de preços positiva acompanha o posicionamento no Radar.');
  }

  if (reasons.length === 0) {
    if (tier === 'WATCH') {
      reasons.push('Acompanhar evolução dos fundamentos e eventos antes de priorizar aporte.');
    } else {
      reasons.push('Posicionamento relativo consistente no Radar atual merece revisão.');
    }
  }

  return reasons.slice(0, MAX_WHY_NOW);
}

function buildRecentChangesForItem(params: {
  item: OpportunityRadarItem;
  currentRank: number;
  previousItem?: OpportunityRadarItem;
  previousRank?: number;
  materialEvents: PortfolioNewsEvent[];
}): DecisionRecentChange[] {
  const { item, currentRank, previousItem, previousRank, materialEvents } = params;
  const changes: DecisionRecentChange[] = [];

  for (const ev of materialEvents) {
    if (ev.state === 'NEW' || ev.state === 'UPDATED') {
      const official = isOfficialEvent(ev);
      const primarySourceName = ev.sources?.[0]?.name || ev.provider;
      const sourceLabel = official
        ? resolveOfficialSourceLabel(ev)
        : primarySourceName;
      changes.push({
        type: ev.state === 'NEW' ? 'NEW_MATERIAL_NEWS' : 'UPDATED_MATERIAL_NEWS',
        label:
          ev.state === 'NEW'
            ? `${official ? 'Novo evento oficial' : 'Nova notícia relevante'} (${ev.materiality}): ${ev.headline}`
            : `Atualização relevante (${ev.materiality}): ${ev.headline}`,
        source: sourceLabel,
        isOfficial: official,
        canonicalUrl: resolveCanonicalEventUrl(ev),
      });
    }
  }

  if (previousItem) {
    const scoreDelta = item.score - previousItem.score;
    if (scoreDelta >= 3) {
      changes.push({
        type: 'SCORE_UP',
        label: `+${scoreDelta} pontos no Radar desde a última análise`,
      });
    } else if (scoreDelta <= -3) {
      changes.push({
        type: 'SCORE_DOWN',
        label: `${scoreDelta} pontos no Radar desde a última análise`,
      });
    }

    if (previousRank !== undefined && currentRank !== previousRank) {
      const diff = previousRank - currentRank;
      if (diff > 0) {
        changes.push({
          type: 'RANK_UP',
          label: `Subiu ${diff} posição(ões) desde a última análise`,
        });
      } else {
        changes.push({
          type: 'RANK_DOWN',
          label: `Caiu ${Math.abs(diff)} posição(ões) desde a última análise`,
        });
      }
    }

    if (previousItem.confidence !== item.confidence) {
      changes.push({
        type: 'CONFIDENCE_CHANGED',
        label: `Confiança alterada de ${previousItem.confidence} para ${item.confidence}`,
      });
    }

    const prevRecord = previousItem.dividendCalendar?.recordDate ?? null;
    const currRecord = item.dividendCalendar?.recordDate ?? null;
    if (prevRecord !== currRecord && currRecord) {
      changes.push({
        type: 'CALENDAR_CHANGED',
        label: `Nova data-com anunciada para ${currRecord}`,
      });
    }
  }

  return changes;
}

/**
 * Pure deterministic builder for APP-16S Daily Portfolio Decision Brief.
 * Reuses Opportunity Radar v2.3.1 evaluations without recalculating scores.
 */
export function buildPortfolioDailyDecisionBrief(
  params: BuildDecisionBriefParams,
): PortfolioDailyDecisionBrief {
  const referenceDate = params.referenceDate ?? new Date();
  const asOf = params.radar.analysisDate || formatSaoPauloDate(referenceDate);
  const generatedAt = referenceDate.toISOString();
  const evaluated = params.radar.allEvaluatedItems ?? [
    ...params.radar.items,
    ...params.radar.fiiItems,
    ...(params.radar.lowConfidenceItems ?? []),
  ];

  // Deduplicate by assetId deterministically
  const uniqueByAsset = new Map<string, OpportunityRadarItem>();
  for (const item of evaluated) {
    if (!uniqueByAsset.has(item.assetId)) {
      uniqueByAsset.set(item.assetId, item);
    }
  }
  const uniqueItems = Array.from(uniqueByAsset.values());

  const prevMap = new Map<string, { item: OpportunityRadarItem; rank: number }>();
  if (params.previousRadar) {
    const prevList = params.previousRadar.allEvaluatedItems ?? params.previousRadar.items;
    prevList.forEach((it, idx) => {
      if (!prevMap.has(it.assetId)) {
        prevMap.set(it.assetId, { item: it, rank: idx + 1 });
      }
    });
  }

  const classTargets = params.allocationContext?.classTargetWeights;
  const classWeights = params.allocationContext?.classWeights;
  const hasAnyTarget = Boolean(classTargets && Object.keys(classTargets).length > 0);

  const assessed = uniqueItems.map((item) => {
    const targetWeight = classTargets?.[item.assetType];
    const classWeight = classWeights?.[item.assetType];
    const hasAllocationTarget = targetWeight !== undefined;
    const allocationGap =
      targetWeight !== undefined && classWeight !== undefined
        ? Math.round((targetWeight - classWeight) * 100) / 100
        : undefined;

    const readiness = evaluateDecisionReadiness(item, {
      hasAllocationTarget: hasAnyTarget ? hasAllocationTarget : false,
      newsProviderPartial: params.newsProviderPartial,
    });
    const tier = classifyDecisionTier(item.score, item.confidence, readiness);

    const materialEvents = (item.effectiveNewsEvents ?? []).filter(
      (ev) => ev.materiality === 'CRITICAL' || ev.materiality === 'HIGH',
    );

    const whyNow = buildWhyNowReasons({
      item,
      tier,
      allocationGap,
      materialEvents,
    });

    const cautions = [...readiness.cautions];
    const unreviewedMaterial = materialEvents.find((ev) => ev.state === 'NEW' || ev.state === 'UPDATED');
    if (unreviewedMaterial) {
      cautions.push('Existe evento material recente ainda não revisado.');
    }

    return {
      item,
      tier,
      readiness,
      whyNow,
      cautions: Array.from(new Set(cautions)),
      dataGaps: Array.from(new Set(readiness.dataGaps)),
      materialEvents,
      classWeight,
      targetWeight,
      allocationGap,
    };
  });

  // Deterministic tiebreak (PARTE BO):
  // 1. decisionTier -> 2. opportunityScore DESC -> 3. confidence -> 4. ticker ASC
  assessed.sort((a, b) => {
    const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tierDiff !== 0) return tierDiff;

    const scoreDiff = b.item.score - a.item.score;
    if (scoreDiff !== 0) return scoreDiff;

    const confDiff = CONFIDENCE_ORDER[a.item.confidence] - CONFIDENCE_ORDER[b.item.confidence];
    if (confDiff !== 0) return confDiff;

    return a.item.ticker.localeCompare(b.item.ticker);
  });

  const allItemsWithChanges: PortfolioDecisionPriorityItem[] = assessed.map((entry, idx) => {
    const rank = idx + 1;
    const prev = prevMap.get(entry.item.assetId);
    const recentChanges = buildRecentChangesForItem({
      item: entry.item,
      currentRank: rank,
      previousItem: prev?.item,
      previousRank: prev?.rank,
      materialEvents: entry.materialEvents,
    });

    const primaryEvent =
      entry.materialEvents.find((ev) => isOfficialEvent(ev)) ?? entry.materialEvents[0];
    const estimatedRecentCash =
      entry.item.recentPaidDividends?.reduce(
        (sum, ev) => sum + (ev.estimatedCashReceived ?? 0),
        0,
      ) ?? null;

    return {
      rank,
      assetId: entry.item.assetId,
      ticker: entry.item.ticker,
      name: entry.item.name,
      assetType: entry.item.assetType,
      opportunityScore: entry.item.score,
      confidence: entry.item.confidence,
      decisionTier: entry.tier,
      whyNow: entry.whyNow,
      cautions: entry.cautions,
      dataGaps: entry.dataGaps,
      recentChanges,
      allocationContext: {
        portfolioWeight: entry.item.portfolioWeight,
        classWeight: entry.classWeight,
        targetWeight: entry.targetWeight,
        gapPercent: entry.allocationGap,
      },
      dividendContext:
        entry.item.assetType === 'FII' && entry.item.dividendCalendar
          ? {
              recordDate: entry.item.dividendCalendar.recordDate,
              paymentDate: entry.item.dividendCalendar.paymentDate,
              eligibilityStatus: entry.item.dividendCalendar.eligibilityStatus,
              amountPerShare: entry.item.dividendCalendar.amountPerShare,
              estimatedRecentCash:
                estimatedRecentCash !== null && estimatedRecentCash > 0
                  ? Math.round(estimatedRecentCash * 100) / 100
                  : null,
            }
          : undefined,
      newsContext: primaryEvent
        ? {
            headline: primaryEvent.headline,
            source: isOfficialEvent(primaryEvent)
              ? resolveOfficialSourceLabel(primaryEvent)
              : primaryEvent.sources?.[0]?.name || primaryEvent.provider,
            isOfficial: isOfficialEvent(primaryEvent),
            canonicalUrl: resolveCanonicalEventUrl(primaryEvent),
            materiality: primaryEvent.materiality,
            state: primaryEvent.state,
          }
        : undefined,
    };
  });

  // Top 3 actionable (non-INSUFFICIENT_DATA if available; otherwise empty or limited)
  const prioritizedPool = allItemsWithChanges.filter(
    (it) => it.decisionTier !== 'INSUFFICIENT_DATA',
  );
  const topPriorities = prioritizedPool.slice(0, TOP_DECISIONS_LIMIT);

  // Recent material changes across all evaluated holdings
  const recentMaterialChanges = allItemsWithChanges.flatMap((it) =>
    it.recentChanges
      .filter((c) => c.type === 'NEW_MATERIAL_NEWS' || c.type === 'UPDATED_MATERIAL_NEWS')
      .map((c) => ({
        ticker: it.ticker,
        type: c.type,
        label: c.label,
        isOfficial: Boolean(c.isOfficial),
        source: c.source,
        canonicalUrl: c.canonicalUrl,
      })),
  );

  // FII Cash Rotation (PARTE U-W)
  const recentPaidSources = params.radar.allRecentPaidSources ?? [];
  let fiiRotation: FiiCashRotationBrief | undefined;
  if (recentPaidSources.length > 0) {
    const totalEstimated = recentPaidSources.reduce(
      (acc, src) => acc + (src.estimatedCashReceived ?? 0),
      0,
    );
    const hasReliableTotal =
      totalEstimated > 0 && recentPaidSources.every((s) => typeof s.estimatedCashReceived === 'number');
    const roundedTotal = hasReliableTotal ? Math.round(totalEstimated * 100) / 100 : null;
    const sourceTickers = Array.from(new Set(recentPaidSources.map((s) => s.ticker)));
    const chain = params.radar.reinvestmentChains?.find((c) => c.cashAvailableNow) ??
      params.radar.reinvestmentChains?.[0];

    const summaryText =
      roundedTotal !== null
        ? `R$ ${formatBrlAmount(roundedTotal)} estimados de proventos recentes (${sourceTickers.join(', ')}) podem ser considerados em um próximo aporte.`
        : `Proventos recentes identificados em ${sourceTickers.join(', ')}; valor total estimado indisponível.`;

    fiiRotation = {
      hasRecentPaidCash: true,
      estimatedRecentCashTotal: roundedTotal,
      sourceTickers,
      targetTicker: chain?.targetTicker ?? null,
      targetRecordDate: chain?.targetRecordDate ?? null,
      targetPaymentDate: null,
      summaryText,
    };
  }

  // Contribution context (PARTE X-AB: never invent monetary amounts)
  const contributionContext: DecisionBriefContributionContext = params.plannedContribution
    ? {
        plannedAmount: params.plannedContribution.amount,
        currency: params.plannedContribution.currency,
        source: params.plannedContribution.source,
        simulationNote: `Se o aporte planejado de R$ ${formatBrlAmount(Number(params.plannedContribution.amount))} fosse realizado hoje, os ativos acima representam a ordem sugerida de estudo por aderência e evidências.`,
      }
    : {
        plannedAmount: null,
        currency: 'BRL',
        source: 'NONE',
        simulationNote: null,
      };

  // Honest coverage summary (PARTE AT-AV)
  const totalAssets = uniqueItems.length;
  const sufficientCount = uniqueItems.filter(
    (it) => it.confidence === 'HIGH' || it.confidence === 'MEDIUM',
  ).length;
  const incompleteCount = totalAssets - sufficientCount;

  const freshPriceCount = uniqueItems.filter(
    (it) => parsePositiveDecimal(it.currentPrice) !== null && it.dataFreshness === 'FRESH',
  ).length;
  const fundamentalsCount = uniqueItems.filter(
    (it) => Boolean(it.dataProvenance?.hasRealFundamentals),
  ).length;
  const newsCount = uniqueItems.filter(
    (it) => Boolean(it.dataProvenance?.hasVerifiedNews),
  ).length;

  const pct = (count: number) =>
    totalAssets > 0 ? Math.round((count / totalAssets) * 100) : 0;

  const qualityLabel: DecisionBriefDataQuality['label'] =
    totalAssets === 0
      ? 'LIMITADA'
      : sufficientCount / totalAssets >= 0.7 && freshPriceCount / totalAssets >= 0.7
        ? 'BOA'
        : sufficientCount > 0
          ? 'PARCIAL'
          : 'LIMITADA';

  // Summary lines (PARTE AF / BG / BH)
  const summary: string[] = [];
  if (totalAssets === 0) {
    summary.push('Nenhum ativo em custódia para priorização de aporte.');
  } else if (topPriorities.length === 0) {
    summary.push('Ainda não há dados suficientes para gerar prioridades de aporte confiáveis.');
  } else {
    const highCount = topPriorities.filter((p) => p.decisionTier === 'HIGH_PRIORITY').length;
    if (highCount > 0) {
      summary.push(`${highCount} ativo(s) em alta prioridade para estudo de aporte hoje.`);
    } else {
      summary.push(`${topPriorities.length} ativo(s) selecionados para revisão prioritária com ressalvas de dados.`);
    }

    const officialNewsCount = recentMaterialChanges.filter((c) => c.isOfficial).length;
    if (officialNewsCount > 0) {
      summary.push(`${officialNewsCount} evento(s) oficial(is) novo(s) ou atualizado(s) identificado(s).`);
    }

    const belowTargetCount = topPriorities.filter(
      (p) => (p.allocationContext?.gapPercent ?? 0) > 0.5,
    ).length;
    if (belowTargetCount > 0) {
      summary.push(`${belowTargetCount} ativo(s) abaixo do peso-alvo da classe.`);
    }
  }

  return {
    portfolioId: params.radar.portfolioId,
    asOf,
    generatedAt,
    modelVersion: OPPORTUNITY_MODEL_VERSION,
    comparisonBasis: params.previousRadar ? 'PREVIOUS_ANALYSIS' : 'INITIAL_BASELINE',
    summary,
    topPriorities,
    allEvaluatedCount: totalAssets,
    fiiRotation,
    recentMaterialChanges,
    contributionContext,
    dataQuality: {
      label: qualityLabel,
      sufficientCount,
      incompleteCount,
      totalAssets,
      priceCoveragePercent: pct(freshPriceCount),
      fundamentalsCoveragePercent: pct(fundamentalsCount),
      newsCoveragePercent: pct(newsCount),
      officialProviderStatus: params.officialProviderStatus ?? null,
    },
  };
}
