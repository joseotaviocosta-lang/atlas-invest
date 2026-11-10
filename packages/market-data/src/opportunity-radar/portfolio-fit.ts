/**
 * Calculates Portfolio Fit score (0..100) and concentration penalties (APP-16F PARTE D).
 *
 * Assets with lower current portfolio weight have higher capacity for new contributions
 * without inducing concentration risk.
 *
 * Heavy concentration thresholds:
 * - Portfolio weight > 10%: mild penalty begins
 * - Portfolio weight > 15%: aggressive concentration penalty
 * - Class weight > 30%: class concentration penalty
 */
export function calculatePortfolioFitScore(input: {
  portfolioWeight: number; // 0..100 (%)
  classWeight: number; // 0..100 (%)
  targetWeight?: number; // 0..100 (%)
}): { score: number; concentrationPenalty: number } {
  const weight = Math.max(0, input.portfolioWeight);
  const classWeight = Math.max(0, input.classWeight);

  let concentrationPenalty = 0;

  // 1. Portfolio-level concentration penalty
  if (weight > 15) {
    concentrationPenalty += 20 + (weight - 15) * 4;
  } else if (weight > 10) {
    concentrationPenalty += (weight - 10) * 3;
  }

  // 2. Class-level concentration penalty
  if (classWeight > 35) {
    concentrationPenalty += (classWeight - 35) * 1.5;
  }

  concentrationPenalty = Math.min(50, Math.round(concentrationPenalty));

  // 3. Base capacity score
  // Low weights (e.g. 1% to 5%) score 85..95
  // Moderate weights (e.g. 5% to 10%) score 65..80
  // High weights (> 15%) score < 45
  let baseScore = 95 - weight * 3.5;
  if (input.targetWeight && input.targetWeight > 0) {
    // If under target allocation, boost fit
    const diff = input.targetWeight - weight;
    if (diff > 0) {
      baseScore += Math.min(15, diff * 2);
    } else {
      baseScore -= Math.min(20, Math.abs(diff) * 2);
    }
  }

  const finalScore = Math.max(10, Math.min(100, Math.round(baseScore - concentrationPenalty)));

  return { score: finalScore, concentrationPenalty };
}
