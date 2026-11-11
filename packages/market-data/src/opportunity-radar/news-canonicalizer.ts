import {
  NewsEventType,
  NewsFreshness,
  NewsImportance,
  NewsProvider,
  NewsSentiment,
  NewsSourceRef,
  NewsSourceType,
  PortfolioNewsEvent,
  RawNewsInput,
  SentimentMethod,
} from './portfolio-news.types';

/**
 * Strips publisher tails from headlines (e.g. " - InfoMoney", " | Valor Econômico").
 */
export function stripPublisherTail(headline: string): string {
  if (!headline) return '';
  return headline.split(/\s*[-–|]\s*(?:InfoMoney|Money Times|Bora Investir|Valor|Fiis|Investidor10|Seu Dinheiro|Reuters|Bloomberg|Broadcast|Agência Estado|Exame|Suno|Investing\.com|NeoFeed|Brazil Journal)/i)[0]?.trim() ?? headline.trim();
}

/**
 * Normalizes text for similarity and deduplication matching.
 */
export function normalizeHeadlineForMatch(headline: string): string {
  const stripped = stripPublisherTail(headline);
  return stripped
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifies the official event type based on headline keywords and patterns.
 */
export function classifyNewsEventType(headline: string, summary: string = ''): NewsEventType {
  const text = `${headline} ${summary}`.toLowerCase();

  if (/fato\s+relevante/i.test(text)) {
    return 'FACT_RELEVANT';
  }
  if (/comunicado\s+ao\s+mercado/i.test(text) || /aviso\s+aos\s+acionistas/i.test(text) || /aviso\s+aos\s+cotistas/i.test(text)) {
    return 'MARKET_NOTICE';
  }
  if (/(?:resultado|balan[cç]o|lucro|preju[ií]zo|ebitda|receita|dre|trimestre|[1-4]t\d\d)\b/i.test(text) && !/dividendo|provento/i.test(text)) {
    return 'EARNINGS';
  }
  if (/(?:dividendo|jcp|juros\s+sobre\s+capital|rendimento|provento|data-com|data\s+com|data-ex|data\s+ex|distribui[cç][aã]o\s+de\s+lucro)/i.test(text)) {
    return 'DIVIDEND';
  }
  if (/(?:aumento\s+de\s+capital|subscri[cç][aã]o|bonifica[cç][aã]o|desdobramento|grupamento|recompra\s+de\s+a[cç][oõ]es)/i.test(text)) {
    return 'CAPITAL_EVENT';
  }
  if (/(?:adquire|aquisi[cç][aã]o|compra\s+de|funde|fus[aã]o|m&a|assume\s+controle)/i.test(text)) {
    return 'ACQUISITION';
  }
  if (/(?:venda\s+de|aliena[cç][aã]o|desinvestimento|desfaz|vende)/i.test(text)) {
    return 'SALE';
  }
  if (/(?:assembleia|age|ago|vota[cç][aã]o\s+de\s+cotistas)/i.test(text)) {
    return 'ASSEMBLY';
  }
  if (/(?:relat[oó]rio\s+gerencial|informe\s+mensal|l[aâ]mina)/i.test(text)) {
    return 'MANAGEMENT_REPORT';
  }
  if (/(?:cvm|b3|delibera[cç][aã]o|investiga[cç][aã]o|multa|processo\s+sancionador|suspens[aã]o)/i.test(text)) {
    return 'REGULATORY';
  }

  return 'OTHER';
}

/**
 * Determines importance level (1..5) from event type, official status, and keywords.
 */
export function classifyNewsImportance(
  eventType: NewsEventType,
  headline: string,
  official: boolean,
): NewsImportance {
  const text = headline.toLowerCase();

  // Urgent corporate transformations or high-impact official events
  if (eventType === 'FACT_RELEVANT' || /recupera[cç][aã]o\s+judicial|fal[eê]ncia|fraude|interven[cç][aã]o|oferta\s+p[uú]blica|opa\b/i.test(text)) {
    return 5;
  }

  // Major earnings, big M&A, capital restructuring, major dividends
  if (eventType === 'EARNINGS' || eventType === 'ACQUISITION' || eventType === 'CAPITAL_EVENT') {
    return 4;
  }

  // Official market notices, dividends, sales, management reports
  if (official || eventType === 'DIVIDEND' || eventType === 'MARKET_NOTICE' || eventType === 'SALE' || eventType === 'ASSEMBLY') {
    return 3;
  }

  // Standard news
  if (/(?:alta|queda|dispara|tomba|recomend|pre[cç]o-alvo|rating)/i.test(text)) {
    return 2;
  }

  // Minor daily chatter, day trade mentions
  return 1;
}

/**
 * Classifies sentiment and method using official event heuristics and headline keywords.
 */
export function classifyNewsSentiment(
  headline: string,
  summary: string = '',
  _eventType: NewsEventType = 'OTHER',
): { sentiment: NewsSentiment; score: number; method: SentimentMethod } {
  const text = `${headline} ${summary}`.toLowerCase();

  // Official rules for specific event types
  if (/(?:aumento\s+de\s+dividendos|lucro\s+(?:sobe|salta|cresce|recorde|supera|dispara)|forte\s+alta|recompra\s+de\s+a[cç][oõ]es|upgrade|eleva\s+recomenda[cç][aã]o|supera\s+consenso|aprova\s+dividendos)/i.test(text)) {
    return { sentiment: 'POSITIVE', score: 0.8, method: 'OFFICIAL_EVENT_RULE' };
  }

  if (/(?:preju[ií]zo|lucro\s+(?:cai|recua|desaba|despenca)|corte\s+de\s+dividendos|rebaix|downgrade|recupera[cç][aã]o\s+judicial|calote|inadimpl[eê]ncia|processo|investiga[cç][aã]o|fraude|multa)/i.test(text)) {
    return { sentiment: 'NEGATIVE', score: -0.8, method: 'OFFICIAL_EVENT_RULE' };
  }

  // Standard headline heuristics
  const positiveKeywords = [
    'alta', 'lucro', 'avanço', 'cresce', 'crescimento', 'salto', 'otimismo',
    'positivo', 'ganhos', 'valoriza', 'acordo', 'expansão', 'dividendo', 'jcp',
    'rendimento', 'compra', 'supera', 'oportunidade', 'lidera', 'recorde',
  ];

  const negativeKeywords = [
    'queda', 'prejuízo', 'recuo', 'despenca', 'cai', 'tomba', 'baixa',
    'derrete', 'risco', 'pressão', 'crise', 'rebaixa', 'corte', 'recessão',
    'pessimismo', 'preocupação', 'desacelera', 'venda', 'desinvestimento', 'rombo',
  ];

  let posCount = 0;
  let negCount = 0;

  for (const w of positiveKeywords) {
    if (text.includes(w)) posCount++;
  }
  for (const w of negativeKeywords) {
    if (text.includes(w)) negCount++;
  }

  if (posCount > negCount) {
    return { sentiment: 'POSITIVE', score: 0.6, method: 'HEADLINE_KEYWORD_HEURISTIC' };
  }
  if (negCount > posCount) {
    return { sentiment: 'NEGATIVE', score: -0.6, method: 'HEADLINE_KEYWORD_HEURISTIC' };
  }
  if (posCount > 0 && posCount === negCount) {
    return { sentiment: 'NEUTRAL', score: 0.0, method: 'HEADLINE_KEYWORD_HEURISTIC' };
  }

  return { sentiment: 'UNKNOWN', score: 0.0, method: 'UNKNOWN' };
}

/**
 * Calculates freshness category and deterministic decay weight based on age in days.
 *
 * Decay policy:
 * <= 1d:  1.00 (BREAKING)
 * <= 3d:  0.90 (VERY_RECENT)
 * <= 7d:  0.75 (RECENT)
 * <= 14d: 0.50 (CURRENT)
 * <= 30d: 0.25 (CURRENT)
 * <= 90d: 0.05 (CONTEXT)
 * > 90d:  0.00 (EXPIRED)
 */
export function classifyFreshness(
  publishedAt: string | Date,
  referenceDate: Date = new Date(),
): { freshness: NewsFreshness; decayWeight: number } {
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  if (!published || isNaN(published.getTime())) {
    return { freshness: 'EXPIRED', decayWeight: 0.0 };
  }

  const ageMs = referenceDate.getTime() - published.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Future slight clock skew (< 24h) treated as breaking
  if (ageDays < 0 && ageDays > -1) {
    return { freshness: 'BREAKING', decayWeight: 1.0 };
  }

  if (ageDays <= 1.0) {
    return { freshness: 'BREAKING', decayWeight: 1.0 };
  }
  if (ageDays <= 3.0) {
    return { freshness: 'VERY_RECENT', decayWeight: 0.90 };
  }
  if (ageDays <= 7.0) {
    return { freshness: 'RECENT', decayWeight: 0.75 };
  }
  if (ageDays <= 14.0) {
    return { freshness: 'CURRENT', decayWeight: 0.50 };
  }
  if (ageDays <= 30.0) {
    return { freshness: 'CURRENT', decayWeight: 0.25 };
  }
  if (ageDays <= 90.0) {
    return { freshness: 'CONTEXT', decayWeight: 0.05 };
  }

  return { freshness: 'EXPIRED', decayWeight: 0.0 };
}

/**
 * Determines whether the ticker is PRIMARY (central subject) or SECONDARY (passing mention).
 */
export function determineAssetRelevance(headline: string, ticker: string): 'PRIMARY' | 'SECONDARY' {
  const text = headline.toLowerCase();
  const tick = ticker.toLowerCase();
  const baseSymbol = tick.replace(/\d+$/, '');

  // If headline starts with ticker or company name or clearly centers on it
  const startsWithTicker = new RegExp(`^\\s*(?:\\[?\\w+\\]?\\s*[-–|:]?\\s*)?(?:${tick}|${baseSymbol})\\b`, 'i');
  if (startsWithTicker.test(text)) {
    return 'PRIMARY';
  }

  // If headline contains "Ticker: ..." or "Empresa (Ticker)" in first half
  const halfLen = Math.floor(headline.length / 2);
  const firstHalf = headline.slice(0, halfLen).toLowerCase();
  if (firstHalf.includes(tick) || (baseSymbol.length >= 4 && firstHalf.includes(baseSymbol))) {
    return 'PRIMARY';
  }

  return 'SECONDARY';
}

/**
 * Computes Jaccard similarity between two sets of word tokens.
 */
function jaccardSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(textA.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(textB.split(/\s+/).filter(t => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Generates a deterministic canonical event ID.
 */
function generateCanonicalEventId(primaryTicker: string, eventType: string, dateBucket: string, headlineKey: string): string {
  const raw = `${primaryTicker}:${eventType}:${dateBucket}:${headlineKey.slice(0, 30)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `evt_${Math.abs(hash).toString(16)}`;
}

/**
 * Canonicalizes and deduplicates an arbitrary list of raw news articles
 * into distinct, multi-source PortfolioNewsEvents.
 */
export function canonicalizeNewsEvents(
  rawArticles: RawNewsInput[],
  referenceDate: Date = new Date(),
): PortfolioNewsEvent[] {
  if (!rawArticles || rawArticles.length === 0) {
    return [];
  }

  // Filter out invalid items
  const validArticles = rawArticles.filter(a => a.headline && a.headline.trim().length > 0 && a.ticker);

  interface EventCluster {
    canonicalId: string;
    headline: string;
    summary: string;
    publishedAt: Date;
    eventType: NewsEventType;
    importance: NewsImportance;
    sentiment: NewsSentiment;
    sentimentScore: number;
    sentimentMethod: SentimentMethod;
    primaryTickers: Set<string>;
    secondaryTickers: Set<string>;
    sources: Map<string, NewsSourceRef>;
    provider: NewsProvider;
    sourceType: NewsSourceType;
    official: boolean;
    normalizedMatch: string;
  }

  const clusters: EventCluster[] = [];

  for (const raw of validArticles) {
    const pubDate = typeof raw.publishedAt === 'string' ? new Date(raw.publishedAt) : raw.publishedAt;
    if (!pubDate || isNaN(pubDate.getTime())) continue;

    const { freshness } = classifyFreshness(pubDate, referenceDate);
    // Discard expired items (> 90 days)
    if (freshness === 'EXPIRED') continue;

    const cleanedHeadline = stripPublisherTail(raw.headline);
    const normMatch = normalizeHeadlineForMatch(cleanedHeadline);
    const eventType = classifyNewsEventType(cleanedHeadline, raw.summary || '');
    const isOfficial = raw.official ?? (eventType === 'FACT_RELEVANT' || eventType === 'MARKET_NOTICE' || raw.sourceType === 'OFFICIAL_REGULATORY');
    const importance = raw.importance ?? classifyNewsImportance(eventType, cleanedHeadline, isOfficial);
    const sentimentInfo = raw.sentiment && raw.sentimentMethod
      ? { sentiment: raw.sentiment, score: raw.sentiment === 'POSITIVE' ? 0.8 : raw.sentiment === 'NEGATIVE' ? -0.8 : 0, method: raw.sentimentMethod }
      : classifyNewsSentiment(cleanedHeadline, raw.summary || '', eventType);

    const relevance = determineAssetRelevance(cleanedHeadline, raw.ticker);
    const sourceName = raw.sourceName || (raw.provider === 'BRAPI_NEWS' ? 'BRAPI News' : 'Imprensa');
    const sourceRef: NewsSourceRef = {
      name: sourceName,
      url: raw.url || '',
      publishedAt: pubDate.toISOString(),
    };

    // Check if this article matches an existing cluster
    let matchedCluster: EventCluster | null = null;
    for (const c of clusters) {
      // Must share at least one ticker or belong to same base ticker
      const hasSharedTicker = c.primaryTickers.has(raw.ticker) || c.secondaryTickers.has(raw.ticker);
      if (!hasSharedTicker) continue;

      // Time gap within 48 hours
      const timeDiffHours = Math.abs(c.publishedAt.getTime() - pubDate.getTime()) / (1000 * 60 * 60);
      if (timeDiffHours > 48) continue;

      // Headline similarity or exact matching eventType with moderate similarity
      const sim = jaccardSimilarity(c.normalizedMatch, normMatch);
      const sameEventType = c.eventType === eventType && eventType !== 'OTHER';

      if (sim >= 0.40 || (sameEventType && sim >= 0.25)) {
        matchedCluster = c;
        break;
      }
    }

    if (matchedCluster) {
      // Merge into existing cluster
      matchedCluster.sources.set(sourceRef.name + sourceRef.url, sourceRef);
      if (relevance === 'PRIMARY') {
        matchedCluster.primaryTickers.add(raw.ticker);
      } else {
        matchedCluster.secondaryTickers.add(raw.ticker);
      }
      // Upgrade importance / official if this source is official
      if (isOfficial) {
        matchedCluster.official = true;
        if (importance > matchedCluster.importance) {
          matchedCluster.importance = importance;
        }
      }
      // Keep earlier publication date if older, or later if fresh
      if (pubDate.getTime() > matchedCluster.publishedAt.getTime()) {
        matchedCluster.publishedAt = pubDate;
      }
      // Upgrade summary if richer
      if ((raw.summary?.length ?? 0) > matchedCluster.summary.length) {
        matchedCluster.summary = raw.summary || '';
      }
    } else {
      // Create new cluster
      const dateBucket = pubDate.toISOString().slice(0, 10);
      const canonicalId = generateCanonicalEventId(raw.ticker, eventType, dateBucket, normMatch);
      const sourceMap = new Map<string, NewsSourceRef>();
      sourceMap.set(sourceRef.name + sourceRef.url, sourceRef);

      const cluster: EventCluster = {
        canonicalId,
        headline: cleanedHeadline,
        summary: raw.summary || '',
        publishedAt: pubDate,
        eventType,
        importance,
        sentiment: sentimentInfo.sentiment,
        sentimentScore: sentimentInfo.score,
        sentimentMethod: sentimentInfo.method,
        primaryTickers: new Set(relevance === 'PRIMARY' ? [raw.ticker] : []),
        secondaryTickers: new Set(relevance === 'SECONDARY' ? [raw.ticker] : []),
        sources: sourceMap,
        provider: raw.provider || 'GOOGLE_NEWS',
        sourceType: raw.sourceType || (isOfficial ? 'OFFICIAL_REGULATORY' : 'GOOGLE_NEWS_RSS_FALLBACK'),
        official: isOfficial,
        normalizedMatch: normMatch,
      };

      clusters.push(cluster);
    }
  }

  // Convert clusters to final canonical events
  const result: PortfolioNewsEvent[] = clusters.map(c => {
    const { freshness, decayWeight } = classifyFreshness(c.publishedAt, referenceDate);
    const primaryArr = Array.from(c.primaryTickers);
    const secondaryArr = Array.from(c.secondaryTickers).filter(t => !c.primaryTickers.has(t));
    const allAssets = Array.from(new Set([...primaryArr, ...secondaryArr]));

    return {
      id: c.canonicalId,
      canonicalEventId: c.canonicalId,
      headline: c.headline,
      summary: c.summary,
      publishedAt: c.publishedAt.toISOString(),
      updatedAt: referenceDate.toISOString(),
      importance: c.importance,
      sentiment: c.sentiment,
      sentimentScore: c.sentimentScore,
      sentimentMethod: c.sentimentMethod,
      eventType: c.eventType,
      assets: allAssets,
      primaryTickers: primaryArr,
      secondaryTickers: secondaryArr,
      sources: Array.from(c.sources.values()),
      provider: c.provider,
      sourceType: c.sourceType,
      official: c.official,
      freshness,
      decayWeight,
    };
  });

  // Sort deterministically:
  // 1. Freshness / Recency (publishedAt desc)
  // 2. Importance desc
  // 3. Official first
  result.sort((a, b) => {
    const timeA = new Date(a.publishedAt).getTime();
    const timeB = new Date(b.publishedAt).getTime();
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    if (b.official !== a.official) {
      return b.official ? 1 : -1;
    }
    return timeB - timeA;
  });

  return result;
}
