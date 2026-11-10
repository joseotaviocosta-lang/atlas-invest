import { OpportunityNewsItem } from './types';

export interface NewsScoreResult {
  score: number | null; // null if UNKNOWN / no news
  effectiveItemCount: number;
}

/**
 * Canonical temporal decay policy for news scoring (APP-16G-R3).
 *
 * Temporal decay:
 * - 0–2 days (<= 48 hours): weight 1.0
 * - 3–7 days (<= 168 hours): weight 0.8
 * - 8–30 days (<= 720 hours): weight 0.5
 * - 31–90 days (<= 2160 hours): weight 0.2
 * - > 90 days: weight 0.0 (EXCLUDED from score, confidence, coverage and display)
 */
export const NEWS_TEMPORAL_POLICY = {
  WEIGHT_0_TO_2_DAYS: 1.0,
  WEIGHT_3_TO_7_DAYS: 0.8,
  WEIGHT_8_TO_30_DAYS: 0.5,
  WEIGHT_31_TO_90_DAYS: 0.2,
  CUTOFF_DAYS: 90,
} as const;

/**
 * Calculates temporal decay weight based on news age in hours relative to referenceDate.
 * Returns 0.0 for items older than 90 days (excluded).
 */
export function getNewsTimeWeight(
  publishedAt: string | Date,
  referenceDate: Date = new Date(),
): number {
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  if (!published || isNaN(published.getTime())) {
    return 0.0;
  }

  const diffHours = (referenceDate.getTime() - published.getTime()) / (1000 * 60 * 60);

  // If published in the slight future due to clock skew, treat as ultra-fresh (1.0)
  if (diffHours < 0 && diffHours > -24) {
    return NEWS_TEMPORAL_POLICY.WEIGHT_0_TO_2_DAYS;
  }

  // Older than 90 days is strictly excluded
  if (diffHours > NEWS_TEMPORAL_POLICY.CUTOFF_DAYS * 24) {
    return 0.0;
  }

  if (diffHours <= 48) {
    return NEWS_TEMPORAL_POLICY.WEIGHT_0_TO_2_DAYS;
  }
  if (diffHours <= 7 * 24) {
    return NEWS_TEMPORAL_POLICY.WEIGHT_3_TO_7_DAYS;
  }
  if (diffHours <= 30 * 24) {
    return NEWS_TEMPORAL_POLICY.WEIGHT_8_TO_30_DAYS;
  }
  return NEWS_TEMPORAL_POLICY.WEIGHT_31_TO_90_DAYS;
}

/**
 * Deduplicates news headlines based on normalized token similarity.
 */
export function deduplicateNews(items: OpportunityNewsItem[]): OpportunityNewsItem[] {
  const seenHeadlines = new Set<string>();
  const deduplicated: OpportunityNewsItem[] = [];

  for (const item of items) {
    if (!item.headline) continue;
    const head = item.headline || '';
    const clean = (head
      .split(/\s*[-–|]\s*(?:InfoMoney|Money Times|Bora Investir|Valor|Fiis|Investidor10|Seu Dinheiro)/i)[0] || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 32);

    if (seenHeadlines.has(clean)) {
      continue;
    }
    seenHeadlines.add(clean);
    deduplicated.push(item);
  }

  return deduplicated;
}

/**
 * Returns the canonical Effective News set (APP-16G-R3).
 *
 * Filters news through:
 * 1. Deduplication
 * 2. Relevance check (relevance > 0, headline non-empty)
 * 3. Freshness cutoff (age <= 90 days relative to referenceDate)
 *
 * This identical set MUST feed:
 * - news score
 * - confidence assessment
 * - coverage percent
 * - provenance sources
 * - displayed news list in UI
 */
export function filterEffectiveNews(
  newsItems: OpportunityNewsItem[] | undefined,
  referenceDate: Date = new Date(),
): OpportunityNewsItem[] {
  if (!newsItems || newsItems.length === 0) {
    return [];
  }

  const deduplicated = deduplicateNews(newsItems);

  return deduplicated.filter((item) => {
    if (!item.headline || item.headline.trim().length === 0) {
      return false;
    }
    if (item.relevance <= 0) {
      return false;
    }
    const weight = getNewsTimeWeight(item.publishedAt, referenceDate);
    return weight > 0;
  });
}

/**
 * Calculates news score (0..100) with temporal weighting and sentiment analysis (APP-16F / APP-16G / APP-16G-R3).
 *
 * Invariant (APP-16G-R3):
 * If NO effective news is available (all older than 90 days or empty),
 * returns score: null (UNKNOWN), NOT 50 (neutral).
 * True 50 is reserved for genuinely balanced/neutral sentiment in verified fresh news.
 */
export function calculateNewsScore(
  newsItems: OpportunityNewsItem[] | undefined,
  referenceDate: Date = new Date(),
): NewsScoreResult {
  const effectiveNews = filterEffectiveNews(newsItems, referenceDate);
  if (effectiveNews.length === 0) {
    return { score: null, effectiveItemCount: 0 };
  }

  let totalWeight = 0;
  let weightedSentimentSum = 0;
  let effectiveCount = 0;

  for (const item of effectiveNews) {
    const timeWeight = getNewsTimeWeight(item.publishedAt, referenceDate);
    if (timeWeight <= 0) continue;

    const relevance = item.relevance > 0 ? Math.min(item.relevance, 1.0) : 1.0;
    const finalWeight = timeWeight * relevance;

    let sentimentValue = 0;
    switch (item.sentiment) {
      case 'POSITIVE':
        sentimentValue = 1.0;
        break;
      case 'NEGATIVE':
        sentimentValue = -1.0;
        break;
      case 'NEUTRAL':
      case 'MIXED':
      case 'UNKNOWN':
      default:
        sentimentValue = 0;
        break;
    }

    weightedSentimentSum += sentimentValue * finalWeight;
    totalWeight += finalWeight;
    effectiveCount++;
  }

  if (totalWeight === 0 || effectiveCount === 0) {
    return { score: null, effectiveItemCount: 0 };
  }

  // Map sentiment onto range with base 50, scaled by average temporal weight
  const avgWeight = totalWeight / effectiveCount;
  const normalizedSentiment = (weightedSentimentSum / totalWeight) * avgWeight;
  const rawScore = 50 + normalizedSentiment * 35;
  const clampedScore = Math.max(15, Math.min(95, Math.round(rawScore)));

  return { score: clampedScore, effectiveItemCount: effectiveCount };
}
