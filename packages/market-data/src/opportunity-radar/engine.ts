import {
  OpportunityAssetInput,
  OpportunityRadarItem,
  OpportunityRadarResult,
  OpportunityConfidence,
  OPPORTUNITY_MODEL_VERSION,
} from './types';
import { EquityOpportunityScorer } from './equity-scorer';
import { FiiOpportunityScorer } from './fii-scorer';
import { assessOpportunityConfidence } from './confidence';
import { generateExplainabilitySynthesis } from './explainability';
import { filterEffectiveNews } from './news-scorer';

export const OPPORTUNITY_RADAR_DISCLAIMER =
  'Radar informativo baseado nos dados disponíveis. Não executa ordens e não garante desempenho futuro.';

const CONFIDENCE_WEIGHT: Record<OpportunityConfidence, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INSUFFICIENT_DATA: 0,
};

export class OpportunityRadarEngine {
  /**
   * Evaluates a portfolio's assets and generates the Daily Opportunity Radar (APP-16F / APP-16G / APP-16G-R3).
   *
   * Pure deterministic replay engine: zero I/O, zero side effects.
   *
   * Invariant (APP-16G-R3):
   * Scoring, confidence assessment, explainability and output news all consume
   * the exact same Effective News set (filtered for freshness <= 90 days and relevance).
   *
   * Quality Floor Invariant (APP-16G):
   * Primary recommendation list (items) accepts ONLY assets with confidence >= MEDIUM.
   * Never pads the Top 5 with low-confidence assets. If only 2 or 3 qualify, returns Top 2 or 3.
   * Low-confidence assets are placed into lowConfidenceItems ("Ativos que merecem mais dados").
   */
  static evaluate(params: {
    portfolioId: string;
    assets: OpportunityAssetInput[];
    analysisDate?: string; // YYYY-MM-DD
    referenceDate?: Date;
    maxResults?: number;
  }): OpportunityRadarResult {
    const referenceDate = params.referenceDate ?? new Date();
    const analysisDate =
      params.analysisDate ?? referenceDate.toISOString().slice(0, 10);
    const maxResults = params.maxResults ?? 5;

    const evaluatedItems: OpportunityRadarItem[] = [];
    let totalCoverageSum = 0;
    let validAssetsCount = 0;

    for (const input of params.assets) {
      // Missing price or zero quantity is excluded from contribution radar
      if (!input.currentPrice || input.currentPrice === '0') {
        continue;
      }
      validAssetsCount++;

      // Canonical Effective News Set (strictly <= 90 days, deduplicated, relevant)
      const effectiveNews = filterEffectiveNews(input.recentNews, referenceDate);
      const effectiveInput: OpportunityAssetInput = {
        ...input,
        recentNews: effectiveNews,
      };

      const { confidence, provenance } = assessOpportunityConfidence(effectiveInput, referenceDate);
      totalCoverageSum += provenance.coveragePercent;

      // Score using specialized scorer by asset type
      let score: number;
      let components: OpportunityRadarItem['components'];
      let concentrationPenalty: number;

      if (effectiveInput.assetType === 'FII') {
        const result = FiiOpportunityScorer.score(effectiveInput, referenceDate);
        score = result.score;
        components = result.components;
        concentrationPenalty = result.concentrationPenalty;
      } else {
        const result = EquityOpportunityScorer.score(effectiveInput, referenceDate);
        score = result.score;
        components = result.components;
        concentrationPenalty = result.concentrationPenalty;
      }

      // Generate explainability justifications
      const { positives, risks } = generateExplainabilitySynthesis(
        effectiveInput,
        components,
        confidence,
        concentrationPenalty,
      );

      evaluatedItems.push(
        Object.freeze({
          ticker: input.ticker,
          name: input.name,
          assetId: input.assetId,
          assetType: input.assetType,
          currentPrice: input.currentPrice,
          dailyChangePercent: input.dailyChangePercent ?? null,
          portfolioWeight: input.portfolioWeight,
          portfolioQuantity: input.quantity,
          marketValue: input.marketValue,
          score,
          confidence,
          components: Object.freeze(components),
          positives: Object.freeze(positives),
          risks: Object.freeze(risks),
          news: Object.freeze(effectiveNews),
          dataFreshness: input.quoteFreshness ?? 'UNKNOWN',
          dataProvenance: Object.freeze(provenance),
          updatedAt: referenceDate.toISOString(),
        }),
      );
    }

    // Sort comparator:
    // 1. score DESC
    // 2. confidence DESC
    // 3. ticker ASC
    const itemComparator = (a: OpportunityRadarItem, b: OpportunityRadarItem) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const confDiff = CONFIDENCE_WEIGHT[b.confidence] - CONFIDENCE_WEIGHT[a.confidence];
      if (confDiff !== 0) {
        return confDiff;
      }
      return a.ticker.localeCompare(b.ticker);
    };

    // Separate qualified (>= MEDIUM) from low-confidence (< MEDIUM)
    const qualifiedItems = evaluatedItems
      .filter((i) => i.confidence === 'HIGH' || i.confidence === 'MEDIUM')
      .sort(itemComparator);

    const lowConfidenceItems = evaluatedItems
      .filter((i) => i.confidence === 'LOW' || i.confidence === 'INSUFFICIENT_DATA')
      .sort(itemComparator);

    // Primary ranking strictly from qualified items (no artificial padding)
    const topItems = qualifiedItems.slice(0, maxResults);

    const overallCoveragePercent =
      validAssetsCount > 0 ? Math.round(totalCoverageSum / validAssetsCount) : 0;

    return Object.freeze({
      portfolioId: params.portfolioId,
      analysisDate,
      updatedAt: referenceDate.toISOString(),
      modelVersion: OPPORTUNITY_MODEL_VERSION,
      totalEligible: params.assets.length,
      totalRanked: topItems.length,
      items: Object.freeze(topItems),
      lowConfidenceItems: Object.freeze(lowConfidenceItems),
      allEvaluatedItems: Object.freeze(evaluatedItems),
      overallCoveragePercent,
      disclaimer: OPPORTUNITY_RADAR_DISCLAIMER,
    });
  }
}
