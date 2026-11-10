import { OpportunityAssetInput, OpportunityScoreComponents } from './types';
import { calculatePortfolioFitScore } from './portfolio-fit';
import { calculateTrendAndPriceScores } from './trend-scorer';
import { calculateNewsScore } from './news-scorer';

export interface EquityScoringResult {
  score: number; // 0..100
  components: OpportunityScoreComponents;
  concentrationPenalty: number;
}

/**
 * EquityOpportunityScorer (APP-16F PARTE C, G, O)
 *
 * Distinct scoring model for equities (Ações):
 * - Portfolio Fit:         20%
 * - Valuation/Fundamental: 20%
 * - Trend/Momentum:        20%
 * - Price Opportunity:     15%
 * - News/Sentiment:        15%
 * - Future Outlook:        10%
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
    const { score: news } = calculateNewsScore(input.recentNews, referenceDate);

    // 5. Future Outlook (10%)
    const outlook = this.calculateEquityOutlook(input);

    // Weighted composite
    const rawScore =
      portfolioFit * 0.2 +
      valuation * 0.2 +
      momentum * 0.2 +
      priceOpportunity * 0.15 +
      news * 0.15 +
      outlook * 0.1;

    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

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
    };
  }

  private static calculateEquityValuation(input: OpportunityAssetInput): number {
    let score = 50; // Neutral default if missing (fail-closed)
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

    if (indicatorsCount > 0) {
      score = Math.round(sum / indicatorsCount);
    }

    return Math.max(10, Math.min(100, score));
  }

  private static calculateEquityOutlook(input: OpportunityAssetInput): number {
    let score = 65; // Base neutral outlook

    if (input.analystConsensus) {
      if (input.analystConsensus === 'BUY') score += 15;
      else if (input.analystConsensus === 'SELL') score -= 20;
    }

    if (input.targetPriceRatio !== null && input.targetPriceRatio !== undefined) {
      if (input.targetPriceRatio > 0.2) score += 15;
      else if (input.targetPriceRatio < -0.1) score -= 15;
    }

    if (input.corporateEventsCount && input.corporateEventsCount > 0) {
      score += 5;
    }

    return Math.max(15, Math.min(95, score));
  }
}
