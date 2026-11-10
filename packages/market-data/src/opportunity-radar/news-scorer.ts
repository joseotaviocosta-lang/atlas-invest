import { OpportunityNewsItem } from './types';

export interface NewsScoreResult {
  score: number | null; // null if UNKNOWN / no news
  effectiveItemCount: number;
}

/**
 * Deduplicates news headlines based on normalized token similarity.
 */
function deduplicateNews(items: OpportunityNewsItem[]): OpportunityNewsItem[] {
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
 * Calculates news score (0..100) with temporal weighting and sentiment analysis (APP-16F / APP-16G).
 *
 * Temporal decay:
 * - 0–2 days (<= 48 hours): weight 1.0
 * - 3–7 days (<= 168 hours): weight 0.8
 * - 8–30 days (<= 720 hours): weight 0.5
 * - > 30 days: weight 0.2
 * - > 90 days: excluded (stale news discarded)
 *
 * Invariant (APP-16G):
 * If NO news is available, returns score: null (UNKNOWN), NOT 50 (neutral).
 * True 50 is reserved for genuinely balanced/neutral sentiment in verified news.
 */
export function calculateNewsScore(
  newsItems: OpportunityNewsItem[] | undefined,
  referenceDate: Date = new Date(),
): NewsScoreResult {
  if (!newsItems || newsItems.length === 0) {
    return { score: null, effectiveItemCount: 0 };
  }

  const deduplicated = deduplicateNews(newsItems);
  if (deduplicated.length === 0) {
    return { score: null, effectiveItemCount: 0 };
  }

  let totalWeight = 0;
  let weightedSentimentSum = 0;
  let effectiveCount = 0;

  for (const item of deduplicated) {
    const published = new Date(item.publishedAt);
    if (isNaN(published.getTime())) continue;

    const diffHours = (referenceDate.getTime() - published.getTime()) / (1000 * 60 * 60);

    // Filter out items older than 90 days completely
    if (diffHours > 90 * 24) continue;

    let timeWeight = 0.2;
    if (diffHours <= 48) {
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
    return { score: null, effectiveItemCount: 0 };
  }

  // Map sentiment onto range with base 50, scaled by average temporal weight
  const avgWeight = totalWeight / effectiveCount;
  const normalizedSentiment = (weightedSentimentSum / totalWeight) * avgWeight;
  const rawScore = 50 + normalizedSentiment * 35;
  const clampedScore = Math.max(15, Math.min(95, Math.round(rawScore)));

  return { score: clampedScore, effectiveItemCount: effectiveCount };
}
