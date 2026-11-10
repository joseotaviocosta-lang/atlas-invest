import { OpportunityAssetInput, OpportunityConfidence, OpportunityDataProvenance } from './types';

export interface ConfidenceAssessment {
  confidence: OpportunityConfidence;
  provenance: OpportunityDataProvenance;
}

/**
 * Calculates deterministic confidence score and provenance for an asset analysis (APP-16F / APP-16G).
 *
 * Tracks 5 essential data dimensions:
 * 1. Quote: valid price & daily change
 * 2. History: multi-day historical movements (5d, 21d, or 63d)
 * 3. Fundamentals: P/L, 52w range, P/VP, or DY
 * 4. Portfolio: custody quantity & portfolio weight
 * 5. News / Events: verified news or corporate filings with source provenance
 *
 * Confidence Floor Invariant (APP-16G):
 * - HIGH: Quote + History >= 21d + Fundamentals + (News or Corporate Events)
 * - MEDIUM: Quote + History >= 5d + (Fundamentals OR Price Opportunity from 52w range)
 * - LOW: Only 1 analytical dimension known (e.g. only portfolio fit)
 * - INSUFFICIENT_DATA: Missing quote or no valid pricing data
 */
export function calculateOpportunityConfidence(input: OpportunityAssetInput): OpportunityConfidence {
  return assessOpportunityConfidence(input).confidence;
}

export function assessOpportunityConfidence(input: OpportunityAssetInput): ConfidenceAssessment {
  let availableDimensions = 0;
  const totalDimensions = 5;
  const sources: string[] = ['B3'];

  // 1. Quote
  const hasPrice = Boolean(input.currentPrice && input.currentPrice !== '0');
  const hasDailyChange = input.dailyChangePercent !== null && input.dailyChangePercent !== undefined;
  if (hasPrice && hasDailyChange) {
    availableDimensions++;
  }

  // 2. History
  const hasHistory21d = (input.change21dPercent !== null && input.change21dPercent !== undefined) ||
                        (input.change63dPercent !== null && input.change63dPercent !== undefined);
  const hasHistory5d = input.change5dPercent !== null && input.change5dPercent !== undefined;
  if (hasHistory21d || hasHistory5d) {
    availableDimensions++;
  }

  // 3. Fundamentals
  const hasEquityFundamentals =
    (input.priceEarnings !== null && input.priceEarnings !== undefined) ||
    (input.priceToBook !== null && input.priceToBook !== undefined) ||
    (input.dividendYield !== null && input.dividendYield !== undefined) ||
    (input.fiftyTwoWeekHigh !== null && input.fiftyTwoWeekHigh !== undefined);

  const hasFiiFundamentals =
    (input.fiiPriceToBook !== null && input.fiiPriceToBook !== undefined) ||
    (input.fiiDividendYield !== null && input.fiiDividendYield !== undefined) ||
    (input.fiftyTwoWeekHigh !== null && input.fiftyTwoWeekHigh !== undefined);

  const hasFundamentals = input.assetType === 'STOCK' ? hasEquityFundamentals : hasFiiFundamentals;
  if (hasFundamentals) {
    availableDimensions++;
    sources.push('BRAPI');
  }

  // 4. Portfolio Context
  const hasPortfolioContext =
    Boolean(input.quantity && input.quantity !== '0') &&
    input.portfolioWeight !== undefined &&
    input.portfolioWeight >= 0;
  if (hasPortfolioContext) {
    availableDimensions++;
    sources.push('Ledger');
  }

  // 5. News / Corporate Events
  const hasNewsOrEvents =
    (input.recentNews && input.recentNews.length > 0) ||
    (input.corporateEventsCount !== null &&
      input.corporateEventsCount !== undefined &&
      input.corporateEventsCount > 0);
  if (hasNewsOrEvents) {
    availableDimensions++;
    if (input.recentNews && input.recentNews.length > 0) {
      sources.push('RSS Financeiro');
    }
  }

  // Determine Confidence
  let confidence: OpportunityConfidence = 'INSUFFICIENT_DATA';
  if (!hasPrice) {
    confidence = 'INSUFFICIENT_DATA';
  } else if (hasPrice && hasHistory21d && hasFundamentals && hasNewsOrEvents) {
    confidence = 'HIGH';
  } else if (hasPrice && (hasFundamentals || hasHistory5d || hasHistory21d) && (hasNewsOrEvents || hasFundamentals)) {
    confidence = 'MEDIUM';
  } else if (availableDimensions >= 2) {
    confidence = 'LOW';
  } else {
    confidence = 'INSUFFICIENT_DATA';
  }

  const coveragePercent = Math.round((availableDimensions / totalDimensions) * 100);

  return {
    confidence,
    provenance: {
      sources: Array.from(new Set(sources)),
      coveragePercent,
      knownDimensionsCount: availableDimensions,
      totalDimensionsCount: totalDimensions,
    },
  };
}
