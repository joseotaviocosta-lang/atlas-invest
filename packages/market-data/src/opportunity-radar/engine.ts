import {
  OpportunityAssetInput,
  OpportunityRadarItem,
  OpportunityRadarResult,
  OpportunityConfidence,
  OPPORTUNITY_MODEL_VERSION,
} from './types';
import { EquityOpportunityScorer } from './equity-scorer';
import { FiiOpportunityScorer } from './fii-scorer';
import { calculateOpportunityConfidence } from './confidence';
import { generateExplainabilitySynthesis } from './explainability';

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
   * Evaluates a portfolio's assets and generates the Daily Opportunity Radar (APP-16F).
   *
   * Pure deterministic replay engine: zero I/O, zero side effects.
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

    for (const input of params.assets) {
      // Missing price or zero quantity is excluded from contribution radar
      if (!input.currentPrice || input.currentPrice === '0') {
        continue;
      }

      const confidence = calculateOpportunityConfidence(input);

      // Score using specialized scorer by asset type
      let score: number;
      let components: OpportunityRadarItem['components'];
      let concentrationPenalty: number;

      if (input.assetType === 'FII') {
        const result = FiiOpportunityScorer.score(input, referenceDate);
        score = result.score;
        components = result.components;
        concentrationPenalty = result.concentrationPenalty;
      } else {
        const result = EquityOpportunityScorer.score(input, referenceDate);
        score = result.score;
        components = result.components;
        concentrationPenalty = result.concentrationPenalty;
      }

      // Generate explainability justifications
      const { positives, risks } = generateExplainabilitySynthesis(
        input,
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
          news: Object.freeze(input.recentNews ?? []),
          dataFreshness: input.quoteFreshness ?? 'UNKNOWN',
          updatedAt: referenceDate.toISOString(),
        }),
      );
    }

    // Deterministic sorting (APP-16F PARTE R, AI.1):
    // 1. score DESC
    // 2. confidence DESC
    // 3. ticker ASC
    evaluatedItems.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const confDiff = CONFIDENCE_WEIGHT[b.confidence] - CONFIDENCE_WEIGHT[a.confidence];
      if (confDiff !== 0) {
        return confDiff;
      }
      return a.ticker.localeCompare(b.ticker);
    });

    const topItems = evaluatedItems.slice(0, maxResults);

    return Object.freeze({
      portfolioId: params.portfolioId,
      analysisDate,
      updatedAt: referenceDate.toISOString(),
      modelVersion: OPPORTUNITY_MODEL_VERSION,
      totalEligible: params.assets.length,
      totalRanked: topItems.length,
      items: Object.freeze(topItems),
      disclaimer: OPPORTUNITY_RADAR_DISCLAIMER,
    });
  }
}
