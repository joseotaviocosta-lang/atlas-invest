import { OpportunityAssetInput, OpportunityScoreComponents } from './types';
import { calculatePortfolioFitScore } from './portfolio-fit';
import { calculateTrendAndPriceScores } from './trend-scorer';
import { calculateNewsScore } from './news-scorer';
import { calculateNewsScoreV2 } from './news-score-v2';

export interface EquityScoringResult {
  score: number; // 0..100
  components: OpportunityScoreComponents;
  concentrationPenalty: number;
  knownWeightRatio: number;
}

/**
 * EquityOpportunityScorer (APP-16F / APP-16G)
 *
 * Scoring model for equities (Ações) with dynamic normalization over known dimensions:
 * - Portfolio Fit:         20%
 * - Valuation/Fundamental: 20%
 * - Trend/Momentum:        20%
 * - Price Opportunity:     15%
 * - News/Sentiment:        15%
 * - Future Outlook:        10%
 *
 * Dynamic Normalization Invariant (APP-16G):
 * Components with missing data are null (UNKNOWN), never artificial 50.
 * Composite score is normalized strictly over the sum of known weights:
 *   score = sum(w_i * s_i) / sum(w_i)
 * If total known weight is below 0.35, the asset is capped to prevent
 * low portfolio weight from single-handedly producing high opportunity scores.
 */
export class EquityOpportunityScorer {
  static score(input: OpportunityAssetInput, referenceDate: Date = new Date()): EquityScoringResult {
    // 1. Portfolio Fit (20%)
    const { score: portfolioFit, concentrationPenalty } = calculatePortfolioFitScore({
      portfolioWeight: input.portfolioWeight,
      classWeight: input.classWeight,
      targetWeight: input.targetWeight,
    });

    // 2. Valuation & Fundamentals (20%)
    const valuation = this.calculateEquityValuation(input);

    // 3. Trend & Momentum (20%) + Price Opportunity (15%)
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

    // 4. News & Sentiment (15%)
    let news: number | null = null;
    if (input.portfolioNewsEvents && input.portfolioNewsEvents.length > 0) {
      const v2 = calculateNewsScoreV2(input.portfolioNewsEvents, input.ticker, referenceDate);
      news = v2.score;
    } else {
      const v1 = calculateNewsScore(input.recentNews, referenceDate);
      news = v1.score;
    }

    // 5. Future Outlook (10%)
    const outlook = this.calculateEquityOutlook(input);

    // Dynamic Normalization
    const componentsList: Array<{ score: number | null; weight: number }> = [
      { score: portfolioFit, weight: 0.20 },
      { score: valuation, weight: 0.20 },
      { score: momentum, weight: 0.20 },
      { score: priceOpportunity, weight: 0.15 },
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
      // If only portfolioFit is known (weight 0.20), asset cannot be recommended blindly
      finalScore = Math.min(45, Math.round(portfolioFit * 0.45));
    }

    return {
      score: finalScore,
      components: {
        portfolioFit,
        valuation,
        momentum,
        priceOpportunity,
        news,
        outlook,
      },
      concentrationPenalty,
      knownWeightRatio: knownWeightSum,
    };
  }

  private static calculateEquityValuation(input: OpportunityAssetInput): number | null {
    let indicatorsCount = 0;
    let sum = 0;

    // P/L (P/E)
    if (input.priceEarnings !== null && input.priceEarnings !== undefined) {
      indicatorsCount++;
      const pe = input.priceEarnings;
      if (pe > 0 && pe <= 12) {
        sum += 90;
      } else if (pe > 12 && pe <= 20) {
        sum += 75;
      } else if (pe > 20 && pe <= 35) {
        sum += 50;
      } else if (pe > 35) {
        sum += 30;
      } else {
        // Negative earnings
        sum += 20;
      }
    }

    // P/VP (P/B)
    if (input.priceToBook !== null && input.priceToBook !== undefined) {
      indicatorsCount++;
      const pb = input.priceToBook;
      if (pb > 0.6 && pb <= 1.5) {
        sum += 90;
      } else if (pb > 1.5 && pb <= 2.5) {
        sum += 70;
      } else if (pb > 2.5) {
        sum += 40;
      } else if (pb <= 0.6 && pb > 0) {
        // Deep discount
        sum += 80;
      }
    }

    // Dividend Yield
    if (input.dividendYield !== null && input.dividendYield !== undefined) {
      indicatorsCount++;
      const dy = input.dividendYield;
      if (dy >= 8) {
        sum += 95;
      } else if (dy >= 5) {
        sum += 80;
      } else if (dy >= 2) {
        sum += 60;
      } else {
        sum += 45;
      }
    }

    // ROE
    if (input.returnOnEquity !== null && input.returnOnEquity !== undefined) {
      indicatorsCount++;
      const roe = input.returnOnEquity;
      if (roe >= 18) {
        sum += 95;
      } else if (roe >= 12) {
        sum += 80;
      } else if (roe >= 5) {
        sum += 55;
      } else {
        sum += 35;
      }
    }

    if (indicatorsCount === 0) {
      return null; // UNKNOWN
    }

    const avg = Math.round(sum / indicatorsCount);
    return Math.max(10, Math.min(100, avg));
  }

  private static calculateEquityOutlook(input: OpportunityAssetInput): number | null {
    const hasConsensus = input.analystConsensus !== null && input.analystConsensus !== undefined && input.analystConsensus !== 'UNKNOWN';
    const hasTargetRatio = input.targetPriceRatio !== null && input.targetPriceRatio !== undefined;
    const hasCorporateEvents = input.corporateEventsCount !== null && input.corporateEventsCount !== undefined && input.corporateEventsCount > 0;

    if (!hasConsensus && !hasTargetRatio && !hasCorporateEvents) {
      return null; // UNKNOWN
    }

    let score = 65;

    if (hasConsensus && input.analystConsensus) {
      if (input.analystConsensus === 'BUY') score += 15;
      else if (input.analystConsensus === 'SELL') score -= 20;
    }

    if (hasTargetRatio && input.targetPriceRatio !== null && input.targetPriceRatio !== undefined) {
      if (input.targetPriceRatio > 0.2) score += 15;
      else if (input.targetPriceRatio < -0.1) score -= 15;
    }

    if (hasCorporateEvents) {
      score += 5;
    }

    return Math.max(15, Math.min(95, score));
  }
}
