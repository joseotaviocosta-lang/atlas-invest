import {
  NewsEventType,
  NewsFreshness,
  NewsImportance,
  NewsMateriality,
  NewsProvider,
  NewsSentiment,
  NewsSourceRef,
  NewsSourceType,
  PortfolioNewsEvent,
  RawNewsInput,
  SentimentMethod,
  SourceTrustLevel,
} from './portfolio-news.types';
import { classifyNewsMateriality } from './news-materiality';

/**
 * Classifies the provenance and trust tier of a news source.
 * Separates verified official entities from media and aggregators.
 */
export function classifySourceTrust(raw: {
  provider?: string;
  sourceType?: string;
  sourceName?: string;
  url?: string;
  official?: boolean;
}): SourceTrustLevel {
  const provider = (raw.provider || '').toUpperCase().trim();
  const sourceType = (raw.sourceType || '').toUpperCase().trim();
  const sourceName = (raw.sourceName || '').toLowerCase().trim();
  const url = (raw.url || '').toLowerCase().trim();

  // 1. Explicit domain check if URL is provided
  let isOfficialDomain = false;
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'cvm.gov.br' ||
        host.endsWith('.cvm.gov.br') ||
        host === 'b3.com.br' ||
        host.endsWith('.b3.com.br') ||
        host.startsWith('ri.') ||
        host.includes('.ri.') ||
        host.includes('riweb.') ||
        host.includes('rad.cvm.gov.br')
      ) {
        isOfficialDomain = true;
      }
    } catch {
      // ignore invalid URL
    }
  }

  // Explicit official source names
  const isOfficialSourceName =
    sourceName === 'cvm' ||
    sourceName === 'b3' ||
    sourceName === 'ri' ||
    sourceName.startsWith('ri ') ||
    sourceName.endsWith(' ri') ||
    sourceName.includes('relações com investidores') ||
    sourceName.includes('relacoes com investidores');

  // Explicit official providers and sourceTypes
  const isOfficialProvider =
    provider === 'CVM' ||
    provider === 'B3' ||
    provider === 'CORPORATE_IR' ||
    provider === 'FUND_MANAGER_IR' ||
    provider === 'OFFICIAL_REGULATORY';

  const isOfficialSourceType =
    sourceType === 'OFFICIAL_REGULATORY' ||
    sourceType === 'CORPORATE_IR';

  // An item from an aggregator (Google News, BRAPI aggregated) must NOT be marked OFFICIAL
  // unless its sourceName or URL domain explicitly proves an official publisher!
  const isAggregatorContainer =
    provider === 'GOOGLE_NEWS' ||
    provider === 'BRAPI_NEWS' ||
    sourceType === 'GOOGLE_NEWS_RSS_FALLBACK' ||
    sourceType === 'BRAPI_NEWS_AGGREGATED' ||
    sourceType === 'AGGREGATOR';

  if (isAggregatorContainer) {
    if (isOfficialDomain || isOfficialSourceName) {
      return 'OFFICIAL';
    }
  } else if (isOfficialProvider || isOfficialSourceType || isOfficialDomain || isOfficialSourceName) {
    return 'OFFICIAL';
  }

  // 2. Trusted Financial Media
  const trustedMediaNames = [
    'infomoney',
    'valor',
    'valor econômico',
    'valor economico',
    'suno',
    'suno notícias',
    'suno noticias',
    'exame',
    'reuters',
    'bloomberg',
    'broadcast',
    'money times',
    'brazil journal',
    'neofeed',
    'investnews',
    'investidor10',
    'fiis',
    'seu dinheiro',
    'agência estado',
    'agencia estado',
    'estadao',
    'folha',
    'oglobo',
    'o globo',
    'globo',
  ];

  if (
    sourceType === 'TRUSTED_FINANCIAL_MEDIA' ||
    provider === 'FINANCIAL_MEDIA' ||
    trustedMediaNames.some((name) => sourceName.includes(name))
  ) {
    return 'TRUSTED_MEDIA';
  }

  // 3. Aggregators
  if (isAggregatorContainer || sourceName.includes('google')) {
    return 'AGGREGATOR';
  }

  return 'UNKNOWN';
}

/**
 * Validates whether an incoming raw news article originates from a verified official source.
 * Strict: Never trusts raw.official without compatible provenance evidence.
 * Never infers officiality from headline event types (e.g. "fato relevante" in InfoMoney).
 */
export function isTrustedOfficialSource(raw: {
  provider?: string;
  sourceType?: string;
  sourceName?: string;
  url?: string;
  official?: boolean;
}): boolean {
  return classifySourceTrust(raw) === 'OFFICIAL';
}

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
 * When official === true and verified, tags method as OFFICIAL_EVENT_RULE.
 * When official === false (e.g. from financial media), tags method as EVENT_HEADLINE_RULE.
 */
export function classifyNewsSentiment(
  headline: string,
  summary: string = '',
  context?:
    | {
        eventType?: NewsEventType;
        official?: boolean;
        sourceType?: NewsSourceType;
      }
    | NewsEventType,
): { sentiment: NewsSentiment; score: number; method: SentimentMethod } {
  const official = typeof context === 'object' && context !== null ? Boolean(context.official) : false;
  const text = `${headline} ${summary}`.toLowerCase();

  // Strong event-based rules
  if (/(?:aumento\s+de\s+dividendos|lucro\s+(?:sobe|salta|cresce|recorde|supera|dispara)|forte\s+alta|recompra\s+de\s+a[cç][oõ]es|upgrade|eleva\s+recomenda[cç][aã]o|supera\s+consenso|aprova\s+dividendos)/i.test(text)) {
    const method: SentimentMethod = official ? 'OFFICIAL_EVENT_RULE' : 'EVENT_HEADLINE_RULE';
    return { sentiment: 'POSITIVE', score: 0.8, method };
  }

  if (/(?:preju[ií]zo|lucro\s+(?:cai|recua|desaba|despenca)|corte\s+de\s+dividendos|rebaix|downgrade|recupera[cç][aã]o\s+judicial|calote|inadimpl[eê]ncia|processo|investiga[cç][aã]o|fraude|multa)/i.test(text)) {
    const method: SentimentMethod = official ? 'OFFICIAL_EVENT_RULE' : 'EVENT_HEADLINE_RULE';
    return { sentiment: 'NEGATIVE', score: -0.8, method };
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
    const trust = classifySourceTrust(raw);
    const isOfficial = isTrustedOfficialSource(raw);
    const importance = raw.importance ?? classifyNewsImportance(eventType, cleanedHeadline, isOfficial);
    const sentimentInfo = raw.sentiment && raw.sentimentMethod
      ? { sentiment: raw.sentiment, score: raw.sentiment === 'POSITIVE' ? 0.8 : raw.sentiment === 'NEGATIVE' ? -0.8 : 0, method: raw.sentimentMethod }
      : classifyNewsSentiment(cleanedHeadline, raw.summary || '', { eventType, official: isOfficial, sourceType: raw.sourceType });

    const relevance = determineAssetRelevance(cleanedHeadline, raw.ticker);
    const sourceName =
      raw.sourceName ||
      (raw.provider === 'CVM'
        ? 'CVM'
        : raw.provider === 'B3'
        ? 'B3'
        : raw.provider === 'BRAPI_NEWS'
        ? 'BRAPI News'
        : 'Imprensa');
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

      if (sim >= 0.30 || (sameEventType && sim >= 0.20)) {
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

      // Upgrade importance / official if this source is truly official
      if (isOfficial) {
        matchedCluster.official = true;
        matchedCluster.sourceType = raw.sourceType === 'CORPORATE_IR' ? 'CORPORATE_IR' : 'OFFICIAL_REGULATORY';
        if (importance > matchedCluster.importance) {
          matchedCluster.importance = importance;
        }
        if (matchedCluster.sentimentMethod === 'EVENT_HEADLINE_RULE') {
          matchedCluster.sentimentMethod = 'OFFICIAL_EVENT_RULE';
        }

        // Headline preference (Parte AE): if official headline is sufficiently descriptive, prefer it;
        // if official headline is too generic/short and existing media headline is informative, retain the informative headline
        if (cleanedHeadline.length >= 35 && !matchedCluster.headline.includes(' — ')) {
          matchedCluster.headline = cleanedHeadline;
        }
      } else {
        // If current cluster headline is bureaucratic/terse and incoming media headline is rich, use it for display
        if (matchedCluster.headline.length < 30 && cleanedHeadline.length >= 35) {
          matchedCluster.headline = cleanedHeadline;
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

      let resolvedSourceType: NewsSourceType;
      if (isOfficial) {
        resolvedSourceType = raw.sourceType === 'CORPORATE_IR' ? 'CORPORATE_IR' : 'OFFICIAL_REGULATORY';
      } else if (raw.sourceType && raw.sourceType !== 'OFFICIAL_REGULATORY' && raw.sourceType !== 'CORPORATE_IR') {
        resolvedSourceType = raw.sourceType;
      } else if (trust === 'TRUSTED_MEDIA') {
        resolvedSourceType = 'TRUSTED_FINANCIAL_MEDIA';
      } else if (raw.provider === 'BRAPI_NEWS') {
        resolvedSourceType = 'BRAPI_NEWS_AGGREGATED';
      } else {
        resolvedSourceType = 'GOOGLE_NEWS_RSS_FALLBACK';
      }

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
        provider: raw.provider || (isOfficial ? 'OFFICIAL_REGULATORY' : 'GOOGLE_NEWS'),
        sourceType: resolvedSourceType,
        official: isOfficial,
        normalizedMatch: normMatch,
      };

      clusters.push(cluster);
    }
  }

  // Convert clusters to final canonical events with deterministic materiality classification
  const result: PortfolioNewsEvent[] = clusters.map(c => {
    const { freshness, decayWeight } = classifyFreshness(c.publishedAt, referenceDate);
    const primaryArr = Array.from(c.primaryTickers);
    const secondaryArr = Array.from(c.secondaryTickers).filter(t => !c.primaryTickers.has(t));
    const allAssets = Array.from(new Set([...primaryArr, ...secondaryArr]));

    const materiality = classifyNewsMateriality({
      headline: c.headline,
      summary: c.summary,
      eventType: c.eventType,
      official: c.official,
      importance: c.importance,
      freshness,
      sourceType: c.sourceType,
    });

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
      materiality: materiality.level,
      materialityScore: materiality.score,
      materialityReason: materiality.primaryReason,
    };
  });

  // Sort deterministically:
  // 1. Materiality level (CRITICAL > HIGH > MEDIUM > LOW > ROUTINE)
  // 2. Freshness / Recency (publishedAt desc)
  // 3. Importance desc
  // 4. Official first
  const materialityWeight: Record<NewsMateriality, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    ROUTINE: 1,
  };

  result.sort((a, b) => {
    const matA = a.materiality ? materialityWeight[a.materiality] : 2;
    const matB = b.materiality ? materialityWeight[b.materiality] : 2;
    if (matB !== matA) {
      return matB - matA;
    }

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
