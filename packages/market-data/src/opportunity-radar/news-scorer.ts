import { OpportunityNewsItem } from './types';

/**
 * Calculates news score (0..100) with temporal weighting and sentiment analysis (APP-16F PARTE K, L).
 *
 * Temporal decay:
 * - < 24 hours: weight 1.0
 * - <= 7 days: weight 0.8
 * - <= 30 days: weight 0.5
 * - > 30 days: weight 0.2 (stale news loses impact)
 *
 * Base score is 50 (neutral).
 * If no news is available, returns 50 (fail-closed neutral; does not punish or invent).
 */
export function calculateNewsScore(
  newsItems: OpportunityNewsItem[] | undefined,
  referenceDate: Date = new Date(),
): { score: number; effectiveItemCount: number } {
  if (!newsItems || newsItems.length === 0) {
    return { score: 50, effectiveItemCount: 0 };
  }

  let totalWeight = 0;
  let weightedSentimentSum = 0;
  let effectiveCount = 0;

  for (const item of newsItems) {
    const published = new Date(item.publishedAt);
    if (isNaN(published.getTime())) continue;

    const diffHours = (referenceDate.getTime() - published.getTime()) / (1000 * 60 * 60);

    // Filter out items older than 90 days completely
    if (diffHours > 90 * 24) continue;

    let timeWeight = 0.2;
    if (diffHours <= 24) {
      timeWeight = 1.0;
    } else if (diffHours <= 7 * 24) {
      timeWeight = 0.8;
    } else if (diffHours <= 30 * 24) {
      timeWeight = 0.5;
    }

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
    return { score: 50, effectiveItemCount: 0 };
  }

  // Map sentiment onto range with base 50, scaled by average temporal weight
  const avgWeight = totalWeight / effectiveCount; // 1.0 down to 0.2
  const normalizedSentiment = (weightedSentimentSum / totalWeight) * avgWeight; // -1 to +1 scaled by time
  const rawScore = 50 + normalizedSentiment * 35;
  const clampedScore = Math.max(15, Math.min(95, Math.round(rawScore)));

  return { score: clampedScore, effectiveItemCount: effectiveCount };
}
