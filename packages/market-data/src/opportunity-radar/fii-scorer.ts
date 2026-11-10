import { OpportunityAssetInput, OpportunityScoreComponents } from './types';
import { calculatePortfolioFitScore } from './portfolio-fit';
import { calculateTrendAndPriceScores } from './trend-scorer';
import { calculateNewsScore } from './news-scorer';

export interface FiiScoringResult {
  score: number; // 0..100
  components: OpportunityScoreComponents;
  concentrationPenalty: number;
}

/**
 * FiiOpportunityScorer (APP-16F PARTE C, H, O)
 *
 * Distinct scoring model for real estate funds (FIIs):
 * - Portfolio Fit:          20%
 * - Valuation (P/VP):       20%
 * - Income Quality (DY):    20%
 * - Trend / Price:          15%
 * - News / Events:          15%
 * - Fund Quality / Outlook: 10%
 */
export class FiiOpportunityScorer {
  static score(input: OpportunityAssetInput, referenceDate: Date = new Date()): FiiScoringResult {
    // 1. Portfolio Fit (20%)
    const { score: portfolioFit, concentrationPenalty } = calculatePortfolioFitScore({
      portfolioWeight: input.portfolioWeight,
      classWeight: input.classWeight,
      targetWeight: input.targetWeight,
    });

    // 2. Valuation (P/VP) (20%)
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
    // For FII, trend/price is combined 15%
    const trendPriceCombined = Math.round(momentum * 0.5 + priceOpportunity * 0.5);

    // 5. News / Events (15%)
    const { score: news } = calculateNewsScore(input.recentNews, referenceDate);

    // 6. Fund Quality / Outlook (10%)
    const outlook = this.calculateFiiOutlook(input);

    // Weighted composite
    const rawScore =
      portfolioFit * 0.2 +
      valuation * 0.2 +
      incomeQuality * 0.2 +
      trendPriceCombined * 0.15 +
      news * 0.15 +
      outlook * 0.1;

    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    return {
      score: finalScore,
      components: {
        portfolioFit,
        valuation,
        momentum: trendPriceCombined,
        priceOpportunity: incomeQuality, // mapped into the component contract
        news,
        outlook,
      },
      concentrationPenalty,
    };
  }

  private static calculateFiiValuation(input: OpportunityAssetInput): number {
    const pvp = input.fiiPriceToBook ?? input.priceToBook ?? null;
    if (pvp === null || pvp === undefined) {
      return 50; // Neutral default if missing (fail-closed)
    }

    // FII sweet spot around 0.88..1.02
    if (pvp >= 0.88 && pvp <= 1.0) {
      return 95;
    }
    if (pvp > 1.0 && pvp <= 1.05) {
      return 85;
    }
    if (pvp >= 0.8 && pvp < 0.88) {
      return 80; // Discount, but check credit/vacancy
    }
    if (pvp < 0.8) {
      return 70; // Deep discount, higher structural risk
    }
    if (pvp > 1.05 && pvp <= 1.15) {
      return 55; // Premium
    }
    return 30; // High premium > 1.15
  }

  private static calculateFiiIncomeQuality(input: OpportunityAssetInput): number {
    const dy = input.fiiDividendYield ?? input.dividendYield ?? null;
    if (dy === null || dy === undefined) {
      return 50; // Neutral default if missing (fail-closed)
    }

    // Yield thresholds for Brazilian real estate funds
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

  private static calculateFiiOutlook(input: OpportunityAssetInput): number {
    let score = 65; // Base neutral outlook

    if (input.fiiSegment) {
      const seg = input.fiiSegment.toLowerCase();
      // Defensive logistics, prime offices, and infrastructure credit
      if (seg.includes('log') || seg.includes('papel') || seg.includes('infra') || seg.includes('agro')) {
        score += 10;
      }
    }

    if (input.corporateEventsCount && input.corporateEventsCount > 0) {
      score += 5;
    }

    return Math.max(20, Math.min(95, score));
  }
}
