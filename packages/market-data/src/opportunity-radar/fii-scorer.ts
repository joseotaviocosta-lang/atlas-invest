import { OpportunityAssetInput, OpportunityScoreComponents } from './types';
import { calculatePortfolioFitScore } from './portfolio-fit';
import { calculateTrendAndPriceScores } from './trend-scorer';
import { calculateNewsScore } from './news-scorer';
import { calculateNewsScoreV2 } from './news-score-v2';
import { calculateDividendCalendarFit } from './calendar-scorer';

export interface FiiScoringResult {
  score: number; // 0..100
  components: OpportunityScoreComponents;
  concentrationPenalty: number;
  knownWeightRatio: number;
}

export interface FiiScoringOptions {
  enableDividendCalendarStrategy?: boolean;
}

/**
 * FiiOpportunityScorer (APP-16F / APP-16G / APP-16I)
 *
 * Scoring model for real estate funds (FIIs) with dynamic normalization over known dimensions:
 * Standard (without calendar):
 * - Portfolio Fit:          20%
 * - Valuation (P/VP/Range): 20%
 * - Income Quality (DY):    20%
 * - Trend / Price:          15%
 * - News / Events:          15%
 * - Fund Quality / Outlook: 10%
 *
 * With Dividend Calendar Strategy (APP-16I):
 * - Portfolio Fit:          15%
 * - Valuation (P/VP):       15%
 * - Income Quality (DY):    15%
 * - Trend / Price:          15%
 * - News / Events:          10%
 * - Fund Quality / Outlook: 10%
 * - Dividend Calendar Fit:  20%
 *
 * Dynamic Normalization Invariant (APP-16G / APP-16I):
 * Components with missing data are null (UNKNOWN), never artificial 50.
 * Composite score is normalized strictly over the sum of known weights:
 *   score = sum(w_i * s_i) / sum(w_i)
 */
export class FiiOpportunityScorer {
  static score(
    input: OpportunityAssetInput,
    referenceDate: Date = new Date(),
    options?: FiiScoringOptions,
  ): FiiScoringResult {
    // 1. Portfolio Fit
    const { score: portfolioFit, concentrationPenalty } = calculatePortfolioFitScore({
      portfolioWeight: input.portfolioWeight,
      classWeight: input.classWeight,
      targetWeight: input.targetWeight,
    });

    // 2. Valuation (P/VP)
    const valuation = this.calculateFiiValuation(input);

    // 3. Income Quality (DY)
    const incomeQuality = this.calculateFiiIncomeQuality(input);

    // 4. Trend / Price
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

    // 5. News / Events
    let news: number | null = null;
    if (input.portfolioNewsEvents && input.portfolioNewsEvents.length > 0) {
      const v2 = calculateNewsScoreV2(input.portfolioNewsEvents, input.ticker, referenceDate);
      news = v2.score;
    } else {
      const v1 = calculateNewsScore(input.recentNews, referenceDate);
      news = v1.score;
    }

    // 6. Fund Quality / Outlook
    const outlook = this.calculateFiiOutlook(input);

    // 7. Dividend Calendar Fit (APP-16I)
    const enableStrategy = options?.enableDividendCalendarStrategy ?? true;
    const dividendCalendarFit = calculateDividendCalendarFit(input.dividendCalendar, enableStrategy);

    // Dynamic Normalization with rebalanced weights if calendar fit is present
    const hasCalendar = dividendCalendarFit !== null;

    const componentsList: Array<{ score: number | null; weight: number }> = hasCalendar
      ? [
          { score: portfolioFit, weight: 0.15 },
          { score: valuation, weight: 0.15 },
          { score: incomeQuality, weight: 0.15 },
          { score: trendPriceCombined, weight: 0.15 },
          { score: news, weight: 0.10 },
          { score: outlook, weight: 0.10 },
          { score: dividendCalendarFit, weight: 0.20 },
        ]
      : [
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
        dividendCalendarFit,
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

    // Invariant (APP-16G-R1): If P/VP is absent, valuation is UNKNOWN (null).
    // 52-week range is price/market data, not valuation/fundamental.
    return null;
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
