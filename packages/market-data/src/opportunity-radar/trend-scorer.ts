/**
 * Calculates Trend / Momentum and Price Opportunity scores (APP-16F / APP-16G).
 *
 * Rules (APP-16G):
 * - If historical trend data is missing, returns momentumScore: null (UNKNOWN), not 50.
 * - If 52-week range and drawdown are missing, returns priceOpportunityScore: null (UNKNOWN), not 50.
 * - Anti-trap: An isolated single-day crash does NOT get rewarded blindly.
 * - Medium-term trend (21d, 63d) stabilization provides true momentum confirmation.
 * - Price opportunity evaluates discount from 52-week highs and reasonable range position.
 */

export interface TrendAnalysisResult {
  momentumScore: number | null; // null if UNKNOWN
  priceOpportunityScore: number | null; // null if UNKNOWN
  trendDirection: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'RECOVERY' | 'UNKNOWN';
}

export function calculateTrendAndPriceScores(input: {
  dailyChangePercent?: number | null;
  change5dPercent?: number | null;
  change21dPercent?: number | null;
  change63dPercent?: number | null;
  drawdownFromHighPercent?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  currentPrice: string;
}): TrendAnalysisResult {
  const currentPriceNum = parseFloat(input.currentPrice) || 0;
  const d1 = input.dailyChangePercent ?? null;
  const d5 = input.change5dPercent ?? null;
  const d21 = input.change21dPercent ?? null;
  const d63 = input.change63dPercent ?? null;

  // 1. Momentum / Trend evaluation
  let momentumScore: number | null = null;
  let trendDirection: TrendAnalysisResult['trendDirection'] = 'UNKNOWN';

  const hasTrendData = d21 !== null || d63 !== null || d5 !== null || d1 !== null;

  if (hasTrendData) {
    const medTerm = d21 ?? (d63 !== null ? d63 / 3 : (d5 ?? (d1 ?? 0) * 5) * 4);
    const shortTerm = d5 ?? (d1 ?? 0) * 5;

    if (medTerm > 5 && shortTerm > 0) {
      trendDirection = 'BULLISH';
      momentumScore = 75 + Math.min(20, medTerm * 0.5);
    } else if (medTerm < -5 && shortTerm > 2) {
      trendDirection = 'RECOVERY';
      momentumScore = 65 + Math.min(15, shortTerm * 1.5);
    } else if (medTerm < -15 && shortTerm < -2) {
      trendDirection = 'BEARISH';
      momentumScore = Math.max(15, 45 - Math.abs(medTerm) * 0.8);
    } else {
      trendDirection = 'NEUTRAL';
      momentumScore = 50 + shortTerm * 1.2;
    }

    // Anti-trap penalty for isolated crash:
    if (d1 !== null && d1 < -3 && (d21 === null || d21 < -10)) {
      momentumScore = Math.max(20, momentumScore - 15);
    }

    momentumScore = Math.max(10, Math.min(100, Math.round(momentumScore)));
  }

  // 2. Price Opportunity evaluation (discount vs 52-week range and drawdown)
  let priceOpportunityScore: number | null = null;

  const high52 = input.fiftyTwoWeekHigh ?? null;
  const low52 = input.fiftyTwoWeekLow ?? null;

  if (high52 && low52 && high52 > low52 && currentPriceNum > 0) {
    // 0 = at 52w low, 1.0 = at 52w high
    const rangePosition = (currentPriceNum - low52) / (high52 - low52);

    if (rangePosition >= 0.15 && rangePosition <= 0.45) {
      // Attractive lower third with margin of safety
      priceOpportunityScore = 80 + (0.45 - rangePosition) * 40;
    } else if (rangePosition < 0.15) {
      // Near 52w low: good price if not collapsing, but needs slight risk discount
      priceOpportunityScore = 75;
    } else if (rangePosition > 0.85) {
      // Trading near 52-week peak
      priceOpportunityScore = 35 + (1.0 - rangePosition) * 50;
    } else {
      // Mid-range
      priceOpportunityScore = 60 + (0.5 - Math.abs(rangePosition - 0.5)) * 20;
    }
  } else if (input.drawdownFromHighPercent !== null && input.drawdownFromHighPercent !== undefined) {
    const dd = Math.abs(input.drawdownFromHighPercent);
    if (dd >= 10 && dd <= 25) {
      priceOpportunityScore = 75 + (dd - 10);
    } else if (dd > 25) {
      priceOpportunityScore = 65;
    } else {
      priceOpportunityScore = 45;
    }
  }

  if (priceOpportunityScore !== null) {
    priceOpportunityScore = Math.max(10, Math.min(100, Math.round(priceOpportunityScore)));
  }

  return {
    momentumScore,
    priceOpportunityScore,
    trendDirection,
  };
}
