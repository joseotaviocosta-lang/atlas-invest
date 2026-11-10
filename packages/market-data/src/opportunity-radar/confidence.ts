import { OpportunityAssetInput, OpportunityConfidence } from './types';

/**
 * Calculates deterministic confidence score for an asset analysis (APP-16F PARTE P, Q).
 *
 * Tracks 5 essential data dimensions:
 * 1. Quote: valid price & daily change
 * 2. History: multi-day historical movements (5d, 21d, or 63d)
 * 3. Fundamentals: P/L, P/VP, or DY
 * 4. Portfolio: custody quantity & portfolio weight
 * 5. News / Events: verified news or events within temporal window
 *
 * Missing dimensions fail closed to UNKNOWN and downgrade confidence.
 */
export function calculateOpportunityConfidence(input: OpportunityAssetInput): OpportunityConfidence {
  let availableDimensions = 0;
  const totalDimensions = 5;

  // 1. Quote
  const hasPrice = Boolean(input.currentPrice && input.currentPrice !== '0');
  const hasDailyChange = input.dailyChangePercent !== null && input.dailyChangePercent !== undefined;
  if (hasPrice && hasDailyChange) {
    availableDimensions++;
  }

  // 2. History
  const hasHistory =
    (input.change5dPercent !== null && input.change5dPercent !== undefined) ||
    (input.change21dPercent !== null && input.change21dPercent !== undefined) ||
    (input.change63dPercent !== null && input.change63dPercent !== undefined);
  if (hasHistory) {
    availableDimensions++;
  }

  // 3. Fundamentals
  const hasEquityFundamentals =
    (input.priceEarnings !== null && input.priceEarnings !== undefined) ||
    (input.priceToBook !== null && input.priceToBook !== undefined) ||
    (input.dividendYield !== null && input.dividendYield !== undefined);
  const hasFiiFundamentals =
    (input.fiiPriceToBook !== null && input.fiiPriceToBook !== undefined) ||
    (input.fiiDividendYield !== null && input.fiiDividendYield !== undefined);

  if (input.assetType === 'STOCK' && hasEquityFundamentals) {
    availableDimensions++;
  } else if (input.assetType === 'FII' && hasFiiFundamentals) {
    availableDimensions++;
  }

  // 4. Portfolio Context
  const hasPortfolioContext =
    Boolean(input.quantity && input.quantity !== '0') &&
    input.portfolioWeight !== undefined &&
    input.portfolioWeight >= 0;
  if (hasPortfolioContext) {
    availableDimensions++;
  }

  // 5. News / Corporate Events
  const hasNewsOrEvents =
    (input.recentNews && input.recentNews.length > 0) ||
    (input.corporateEventsCount !== null &&
      input.corporateEventsCount !== undefined &&
      input.corporateEventsCount > 0);
  if (hasNewsOrEvents) {
    availableDimensions++;
  }

  const ratio = availableDimensions / totalDimensions;

  if (ratio >= 0.8) {
    return 'HIGH'; // 4 or 5 dimensions
  }
  if (ratio >= 0.6) {
    return 'MEDIUM'; // 3 dimensions
  }
  if (ratio >= 0.4) {
    return 'LOW'; // 2 dimensions
  }
  return 'INSUFFICIENT_DATA'; // 0 or 1 dimension
}
