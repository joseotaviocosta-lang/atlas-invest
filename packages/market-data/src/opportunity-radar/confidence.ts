import { OpportunityAssetInput, OpportunityConfidence, OpportunityDataProvenance } from './types';
import { filterEffectiveNews } from './news-scorer';

export interface ConfidenceAssessment {
  confidence: OpportunityConfidence;
  provenance: OpportunityDataProvenance;
}

/**
 * Calculates deterministic confidence score and honest provenance for an asset analysis (APP-16G-R1 / APP-16G-R3).
 *
 * Tracks 5 essential data dimensions:
 * 1. Quote: valid price & daily movement (Source: B3)
 * 2. History: multi-day price series (>= 21d or >= 5d)
 * 3. True Fundamentals:
 *    - Equities: P/L, P/VP, DY, ROE, D/E (Source: BRAPI)
 *    - FIIs: P/VP, DY
 *    * Invariant: 52-week high/low is market price range, NEVER a fundamental metric.
 * 4. Portfolio Context: custody quantity & portfolio weight (Source: Ledger)
 * 5. News / Events: verified recent news articles with honest aggregator/publisher provenance,
 *    strictly filtered through freshness cutoff (<= 90 days).
 *
 * Confidence Floor Rules:
 * - HIGH:
 *     Quote + History >= 21d + Real Fundamental Metric + Portfolio Context
 *     + (at least 1 effective news item OR multiple fundamental metrics).
 *     * An asset WITHOUT real fundamentals can NEVER reach HIGH.
 *     * An asset WITHOUT >= 21d history can NEVER reach HIGH.
 * - MEDIUM:
 *     Quote + Portfolio Context + at least 1 analytical dimension (History, Fundamentals, News, or 52w Range Opportunity).
 *     Accepts partial useful data honestly.
 * - LOW:
 *     Only Quote + Portfolio Context without history, fundamentals, or news.
 * - INSUFFICIENT_DATA:
 *     Missing quote or zero price.
 */
export function calculateOpportunityConfidence(
  input: OpportunityAssetInput,
  referenceDate: Date = new Date(),
): OpportunityConfidence {
  return assessOpportunityConfidence(input, referenceDate).confidence;
}

export function assessOpportunityConfidence(
  input: OpportunityAssetInput,
  referenceDate: Date = new Date(),
): ConfidenceAssessment {
  let availableDimensions = 0;
  const totalDimensions = 5;
  const sources: string[] = ['B3'];

  // 1. Quote
  const hasPrice = Boolean(input.currentPrice && input.currentPrice !== '0');
  const hasDailyChange = input.dailyChangePercent !== null && input.dailyChangePercent !== undefined;
  if (hasPrice && hasDailyChange) {
    availableDimensions++;
  }

  // 2. History (Market Data: 5d, 21d, 63d)
  const hasHistory21d =
    (input.change21dPercent !== null && input.change21dPercent !== undefined) ||
    (input.change63dPercent !== null && input.change63dPercent !== undefined);
  const hasHistory5d = input.change5dPercent !== null && input.change5dPercent !== undefined;
  const hasPriceHistory = hasHistory21d || hasHistory5d;
  if (hasPriceHistory) {
    availableDimensions++;
  }

  // 3. True Fundamentals (Strict: 52w range is NEVER a fundamental)
  let equityFundamentalsCount = 0;
  if (input.priceEarnings !== null && input.priceEarnings !== undefined) equityFundamentalsCount++;
  if (input.priceToBook !== null && input.priceToBook !== undefined) equityFundamentalsCount++;
  if (input.dividendYield !== null && input.dividendYield !== undefined) equityFundamentalsCount++;
  if (input.returnOnEquity !== null && input.returnOnEquity !== undefined) equityFundamentalsCount++;
  if (input.debtToEquity !== null && input.debtToEquity !== undefined) equityFundamentalsCount++;

  let fiiFundamentalsCount = 0;
  if (input.fiiPriceToBook !== null && input.fiiPriceToBook !== undefined) fiiFundamentalsCount++;
  if (input.fiiDividendYield !== null && input.fiiDividendYield !== undefined) fiiFundamentalsCount++;

  const hasEquityFundamentals = input.assetType === 'STOCK' && equityFundamentalsCount > 0;
  const hasFiiFundamentals = input.assetType === 'FII' && fiiFundamentalsCount > 0;
  const hasRealFundamentals = hasEquityFundamentals || hasFiiFundamentals;
  const fundamentalsCount = input.assetType === 'STOCK' ? equityFundamentalsCount : fiiFundamentalsCount;

  if (hasRealFundamentals) {
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

  // 5. News / Corporate Events (Strict Effective News: <= 90 days)
  const effectiveNews = filterEffectiveNews(input.recentNews, referenceDate);
  const effectiveV2Events = input.portfolioNewsEvents
    ? input.portfolioNewsEvents.filter((e) => e.assets.includes(input.ticker) && e.freshness !== 'EXPIRED')
    : [];

  const hasVerifiedNews =
    effectiveNews.length > 0 ||
    effectiveV2Events.length > 0 ||
    (input.corporateEventsCount !== null &&
      input.corporateEventsCount !== undefined &&
      input.corporateEventsCount > 0);

  if (hasVerifiedNews) {
    availableDimensions++;
    let hasGoogleNews = false;
    let hasBrapiNews = false;
    for (const n of effectiveNews) {
      if (n.aggregator === 'GOOGLE_NEWS_RSS' || !n.aggregator) {
        hasGoogleNews = true;
      }
      if (n.source && n.source !== 'Mercado' && !sources.includes(n.source)) {
        sources.push(n.source);
      }
    }
    for (const ev of effectiveV2Events) {
      if (ev.provider === 'BRAPI_NEWS') {
        hasBrapiNews = true;
      } else if (ev.provider === 'GOOGLE_NEWS') {
        hasGoogleNews = true;
      }
      for (const s of ev.sources) {
        if (s.name && !sources.includes(s.name)) {
          sources.push(s.name);
        }
      }
    }
    if (hasBrapiNews && !sources.includes('BRAPI News')) {
      sources.push('BRAPI News');
    }
    if (hasGoogleNews && !sources.includes('Google News RSS (Agregador)')) {
      sources.push('Google News RSS (Agregador)');
    }
  }

  const hasDividendCalendar = Boolean(
    input.dividendCalendar && input.dividendCalendar.eventStatus !== 'UNKNOWN',
  );
  if (hasDividendCalendar && input.dividendCalendar?.source) {
    sources.push(input.dividendCalendar.source);
  }

  // Determine Confidence (APP-16G-R1 Rules)
  let confidence: OpportunityConfidence = 'INSUFFICIENT_DATA';

  if (!hasPrice) {
    confidence = 'INSUFFICIENT_DATA';
  } else if (
    hasPrice &&
    hasHistory21d &&
    hasRealFundamentals &&
    hasPortfolioContext &&
    (hasVerifiedNews || fundamentalsCount >= 2)
  ) {
    // High confidence requires both strong price history AND verified true fundamentals
    confidence = 'HIGH';
  } else if (
    hasPrice &&
    hasPortfolioContext &&
    (hasPriceHistory || hasRealFundamentals)
  ) {
    // Medium confidence requires analytical basis (price history or true fundamentals)
    confidence = 'MEDIUM';
  } else if (hasPrice && availableDimensions >= 2) {
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
      hasRealFundamentals,
      hasPriceHistory,
      hasVerifiedNews,
      hasDividendCalendar,
    },
  };
}
