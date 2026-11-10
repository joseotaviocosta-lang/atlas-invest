import { OpportunityAssetInput, OpportunityScoreComponents } from './types';
import { calculatePortfolioFitScore } from './portfolio-fit';
import { calculateTrendAndPriceScores } from './trend-scorer';
import { calculateNewsScore } from './news-scorer';

export interface FiiScoringResult {
  score: number; // 0..100
  components: OpportunityScoreComponents;
  concentrationPenalty: number;
  knownWeightRatio: number;
}

/**
 * FiiOpportunityScorer (APP-16F / APP-16G)
 *
 * Scoring model for real estate funds (FIIs) with dynamic normalization over known dimensions:
 * - Portfolio Fit:          20%
 * - Valuation (P/VP/Range): 20%
 * - Income Quality (DY):    20%
 * - Trend / Price:          15%
 * - News / Events:          15%
 * - Fund Quality / Outlook: 10%
 *
 * Dynamic Normalization Invariant (APP-16G):
 * Components with missing data are null (UNKNOWN), never artificial 50.
 * Composite score is normalized strictly over the sum of known weights:
 *   score = sum(w_i * s_i) / sum(w_i)
 */
export class FiiOpportunityScorer {
  static score(input: OpportunityAssetInput, referenceDate: Date = new Date()): FiiScoringResult {
    // 1. Portfolio Fit (20%)
    const { score: portfolioFit, concentrationPenalty } = calculatePortfolioFitScore({
      portfolioWeight: input.portfolioWeight,
      classWeight: input.classWeight,
      targetWeight: input.targetWeight,
    });

    // 2. Valuation (P/VP or 52w Range position) (20%)
    const valuation = this.calculateFiiValuation(input);

    // 3. Income Quality (DY) (20%)
    const incomeQuality = this.calculateFiiIncomeQuality(input);

    // 4. Trend / Price (15%)
    const { momentumScore: momentum, priceOpportunityScore: priceOpportunity } =
      calculateTrendAndPriceScores({
        dailyChangePercent: input.dailyChangePercent,
        change5dPercent: input.change5dPercent,
        change21dPercent: input.change21dPercent,
        change63dPercent: input.change63dPercent,
        drawdownFromHighPercent: input.drawdownFromHighPercent,
        fiftyTwoWeekHigh: input.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: input.fiftyTwoWeekLow,
        currentPrice: input.currentPrice,
      });

    let trendPriceCombined: number | null = null;
    if (momentum !== null && priceOpportunity !== null) {
      trendPriceCombined = Math.round(momentum * 0.5 + priceOpportunity * 0.5);
    } else if (momentum !== null) {
      trendPriceCombined = momentum;
    } else if (priceOpportunity !== null) {
      trendPriceCombined = priceOpportunity;
    }

    // 5. News / Events (15%)
    const { score: news } = calculateNewsScore(input.recentNews, referenceDate);

    // 6. Fund Quality / Outlook (10%)
    const outlook = this.calculateFiiOutlook(input);

    // Dynamic Normalization
    const componentsList: Array<{ score: number | null; weight: number }> = [
      { score: portfolioFit, weight: 0.20 },
      { score: valuation, weight: 0.20 },
      { score: incomeQuality, weight: 0.20 },
      { score: trendPriceCombined, weight: 0.15 },
      { score: news, weight: 0.15 },
      { score: outlook, weight: 0.10 },
    ];

    let weightedSum = 0;
    let knownWeightSum = 0;

    for (const comp of componentsList) {
      if (comp.score !== null) {
        weightedSum += comp.score * comp.weight;
        knownWeightSum += comp.weight;
      }
    }

    let finalScore = 40;
    if (knownWeightSum >= 0.35) {
      const normalizedScore = weightedSum / knownWeightSum;
      finalScore = Math.max(0, Math.min(100, Math.round(normalizedScore)));
    } else {
      finalScore = Math.min(45, Math.round(portfolioFit * 0.45));
    }

    return {
      score: finalScore,
      components: {
        portfolioFit,
        valuation,
        momentum: trendPriceCombined,
        priceOpportunity: incomeQuality,
        news,
        outlook,
      },
      concentrationPenalty,
      knownWeightRatio: knownWeightSum,
    };
  }

  private static calculateFiiValuation(input: OpportunityAssetInput): number | null {
    const pvp = input.fiiPriceToBook ?? input.priceToBook ?? null;
    if (pvp !== null && pvp !== undefined) {
      if (pvp >= 0.88 && pvp <= 1.0) {
        return 95;
      }
      if (pvp > 1.0 && pvp <= 1.05) {
        return 85;
      }
      if (pvp >= 0.8 && pvp < 0.88) {
        return 80;
      }
      if (pvp < 0.8) {
        return 70;
      }
      if (pvp > 1.05 && pvp <= 1.15) {
        return 55;
      }
      return 30;
    }

    // If P/VP is absent, evaluate 52-week range discount
    const high = input.fiftyTwoWeekHigh ?? null;
    const low = input.fiftyTwoWeekLow ?? null;
    const currentPriceNum = parseFloat(input.currentPrice) || 0;
    if (high && low && high > low && currentPriceNum > 0) {
      const pos = (currentPriceNum - low) / (high - low);
      if (pos <= 0.30) {
        return 85; // Attractive range discount
      }
      if (pos <= 0.60) {
        return 70;
      }
      return 50;
    }

    return null; // UNKNOWN
  }

  private static calculateFiiIncomeQuality(input: OpportunityAssetInput): number | null {
    const dy = input.fiiDividendYield ?? input.dividendYield ?? null;
    if (dy === null || dy === undefined) {
      return null; // UNKNOWN
    }

    if (dy >= 11.5) {
      return 95;
    }
    if (dy >= 9.5) {
      return 85;
    }
    if (dy >= 7.5) {
      return 70;
    }
    if (dy >= 5.0) {
      return 50;
    }
    return 30;
  }

  private static calculateFiiOutlook(input: OpportunityAssetInput): number | null {
    const hasSegment = Boolean(input.fiiSegment);
    const hasEvents = input.corporateEventsCount !== null && input.corporateEventsCount !== undefined && input.corporateEventsCount > 0;

    if (!hasSegment && !hasEvents) {
      return null; // UNKNOWN
    }

    let score = 65;

    if (input.fiiSegment) {
      const seg = input.fiiSegment.toLowerCase();
      if (seg.includes('log') || seg.includes('papel') || seg.includes('infra') || seg.includes('agro') || seg.includes('multi')) {
        score += 15;
      }
    }

    if (hasEvents) {
      score += 5;
    }

    return Math.max(20, Math.min(95, score));
  }
}
