import { OpportunityNewsItem } from '@atlas/market-data';

export interface FetchedDividendEvent {
  paymentDate?: string | null;
  rate?: number | null;
  relatedTo?: string | null;
  approvedOn?: string | null;
  lastDatePrior?: string | null;
}

export interface FetchedAssetIntelligence {
  priceEarnings?: number | null;
  priceToBook?: number | null;
  dividendYield?: number | null;
  returnOnEquity?: number | null;
  debtToEquity?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  fiiSegment?: string | null;
  fiiPriceToBook?: number | null;
  fiiDividendYield?: number | null;
  historicalPrices?: Array<{
    date: number;
    close: number;
    adjustedClose?: number;
  }>;
  news: OpportunityNewsItem[];
  analystConsensus?: 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null;
  dividendEvent?: FetchedDividendEvent | null;
}

/**
 * Normalizes title for deduplication without truncating distinct headlines (APP-16G-R1).
 */
function normalizeHeadlineForDedupe(title: string): string {
  // Strip common publisher tails (e.g. " - InfoMoney", " - Money Times")
  const withoutPublisher = title.split(/\s*[-–|]\s*(?:InfoMoney|Money Times|Bora Investir|Valor|Fiis|Investidor10|Seu Dinheiro|Reuters|Bloomberg)/i)[0] ?? title;
  return withoutPublisher.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks whether an article headline is legitimately relevant to the ticker (APP-16G-R1 PARTE R).
 */
function isHeadlineRelevantToTicker(headline: string, ticker: string): boolean {
  const textLower = headline.toLowerCase();
  const tickerLower = ticker.toLowerCase();
  if (textLower.includes(tickerLower)) {
    return true;
  }
  // Base symbol without digit (e.g. PETR for PETR4, HGLG for HGLG11)
  const baseSymbol = tickerLower.replace(/\d+$/, '');
  if (baseSymbol.length >= 3 && textLower.includes(baseSymbol)) {
    return true;
  }
  return false;
}

/**
 * Fetches fundamentals, price history, and news for a ticker (APP-16F / APP-16G / APP-16G-R1).
 *
 * Security Invariant (APP-16G-R1 PARTE A & B):
 * BRAPI API token is sent EXCLUSIVELY via HTTP Authorization: Bearer header.
 * Token is NEVER appended as a URL query parameter (zero token in URL).
 *
 * Privacy Invariant:
 * Receives ONLY the ticker symbol. Never sends user quantities, cost, balances,
 * CPF, portfolioId or identity to third-party endpoints.
 *
 * Fail-closed:
 * Network errors, rate limits, or missing endpoints fail gracefully to empty/neutral values.
 */
export async function fetchBrapiAssetIntelligence(params: {
  ticker: string;
  isFii?: boolean;
  token?: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<FetchedAssetIntelligence> {
  const result: FetchedAssetIntelligence = {
    news: [],
  };

  const baseUrl = (params.baseUrl ?? process.env.BRAPI_BASE_URL ?? 'https://brapi.dev/api').replace(/\/+$/, '');
  const timeoutMs = params.timeoutMs ?? 5000;
  const token = params.token ?? process.env.BRAPI_API_KEY ?? process.env.MARKET_DATA_API_TOKEN;

  // Security: Token passed ONLY via Authorization header
  const headers: Record<string, string> = {
    'User-Agent': 'Atlas-Invest/0.1.0',
    Accept: 'application/json',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  // 1. Fetch Quote with SummaryProfile, DividendsData, and 3-month history (ZERO token in URL)
  try {
    const quoteUrl = new URL(`${baseUrl}/quote/${encodeURIComponent(params.ticker)}`);
    quoteUrl.searchParams.set('modules', 'summaryProfile,dividendsData');
    quoteUrl.searchParams.set('range', '3mo');
    quoteUrl.searchParams.set('interval', '1d');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res = await fetch(quoteUrl.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeout);

    // If modules=summaryProfile,dividendsData failed (403/400), fallback to standard quote with range (ZERO token in URL)
    if (!res || !res.ok) {
      const fallbackUrl = new URL(`${baseUrl}/quote/${encodeURIComponent(params.ticker)}`);
      fallbackUrl.searchParams.set('range', '3mo');
      fallbackUrl.searchParams.set('interval', '1d');

      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), timeoutMs);
      res = await fetch(fallbackUrl.toString(), {
        method: 'GET',
        headers,
        signal: c2.signal,
      }).catch(() => null);
      clearTimeout(t2);
    }

    if (res && res.ok) {
      const data = (await res.json().catch(() => null)) as {
        results?: Array<{
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
          priceEarnings?: number;
          earningsPerShare?: number;
          summaryProfile?: {
            sector?: string;
            industry?: string;
            listingSegment?: string;
          };
          historicalDataPrice?: Array<{
            date: number;
            close: number;
            adjustedClose?: number;
          }>;
          dividendsData?: {
            cashDividends?: Array<{
              paymentDate?: string;
              rate?: number | string;
              relatedTo?: string;
              approvedOn?: string;
              lastDatePrior?: string;
            }>;
          };
        }>;
      };

      if (data && data.results && data.results.length > 0) {
        const item = data.results[0];
        if (item) {
          result.fiftyTwoWeekHigh = item.fiftyTwoWeekHigh ?? null;
          result.fiftyTwoWeekLow = item.fiftyTwoWeekLow ?? null;
          result.priceEarnings = item.priceEarnings ?? null;

          if (item.summaryProfile) {
            result.fiiSegment =
              item.summaryProfile.listingSegment ||
              item.summaryProfile.sector ||
              item.summaryProfile.industry ||
              null;
          }

          if (item.historicalDataPrice && Array.isArray(item.historicalDataPrice)) {
            result.historicalPrices = item.historicalDataPrice;
          }

          // Process dividend calendar if available (APP-16I)
          if (item.dividendsData?.cashDividends && Array.isArray(item.dividendsData.cashDividends)) {
            const divs = item.dividendsData.cashDividends;
            const todayStr = new Date().toISOString().slice(0, 10);
            const upcoming = divs.find(
              (d) => d.lastDatePrior && d.lastDatePrior.slice(0, 10) >= todayStr,
            );
            const chosen = upcoming ?? divs[0];
            if (chosen) {
              result.dividendEvent = {
                paymentDate: chosen.paymentDate ?? null,
                rate: chosen.rate !== undefined && chosen.rate !== null ? Number(chosen.rate) : null,
                relatedTo: chosen.relatedTo ?? null,
                approvedOn: chosen.approvedOn ?? null,
                lastDatePrior: chosen.lastDatePrior ?? null,
              };
            }
          }
        }
      }
    }
  } catch {
    // Fail closed to neutral
  }

  // 2. Fetch Aggregated News via Google News RSS (Aggregator honesty: APP-16G-R1 PARTE D, E, F)
  try {
    const isFii = params.isFii ?? false;
    const query = encodeURIComponent(`${params.ticker} ${isFii ? 'FII OR dividendo OR rendimento' : 'B3 OR dividendo OR balanço'}`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const rssRes = await fetch(rssUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      },
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeout);

    if (rssRes && rssRes.ok) {
      const xml = await rssRes.text().catch(() => '');
      if (xml && xml.includes('<item>')) {
        const items = xml.split('<item>').slice(1, 6);
        const seenHeadlines = new Set<string>();

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item) continue;
          const titleMatch = item.match(/<title>(.*?)<\/title>/);
          const pubMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
          const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/);

          const title = titleMatch && titleMatch[1] ? titleMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim() : '';
          if (!title) continue;

          // PARTE R: Filter out news that does NOT mention the ticker or company
          if (!isHeadlineRelevantToTicker(title, params.ticker)) {
            continue;
          }

          // PARTE S: Full normalized string deduplication without premature truncation
          const normKey = normalizeHeadlineForDedupe(title);
          if (seenHeadlines.has(normKey)) continue;
          seenHeadlines.add(normKey);

          const publisher = sourceMatch && sourceMatch[1] ? sourceMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim() : 'Mercado';
          const pubDate = pubMatch && pubMatch[1] ? new Date(pubMatch[1]).toISOString() : new Date().toISOString();

          const textLower = title.toLowerCase();
          let sentiment: OpportunityNewsItem['sentiment'] = 'NEUTRAL';
          let relevance = 0.7; // Standard media relevance
          let sourceType: OpportunityNewsItem['sourceType'] = 'FINANCIAL_MEDIA';

          // PARTE F: Only assign OFFICIAL_REGULATORY if source publisher is verified official
          const pubLower = publisher.toLowerCase();
          const isOfficialSource = pubLower.includes('cvm') || pubLower.includes('b3') || pubLower.includes('ri ');
          if (isOfficialSource) {
            sourceType = 'OFFICIAL_REGULATORY';
            relevance = 1.0;
          } else if (
            textLower.includes('fato relevante') ||
            textLower.includes('aviso aos acionistas') ||
            textLower.includes('comunicado ao mercado') ||
            textLower.includes('relatório gerencial')
          ) {
            // Media covering a corporate event: increased relevance but NOT false official
            relevance = 0.85;
          }

          // PARTE G: Explicitly document heuristic classification
          if (
            textLower.includes('lucro') ||
            textLower.includes('alta') ||
            textLower.includes('dividendo') ||
            textLower.includes('rendimento') ||
            textLower.includes('recorde') ||
            textLower.includes('aquisi') ||
            textLower.includes('eleva') ||
            textLower.includes('supera')
          ) {
            sentiment = 'POSITIVE';
          } else if (
            textLower.includes('queda') ||
            textLower.includes('prejuízo') ||
            textLower.includes('investig') ||
            textLower.includes('multa') ||
            textLower.includes('rebaixa') ||
            textLower.includes('rombo') ||
            textLower.includes('risco')
          ) {
            sentiment = 'NEGATIVE';
          }

          result.news.push({
            id: `rss-news-${params.ticker}-${i}`,
            headline: title,
            source: publisher,
            aggregator: 'GOOGLE_NEWS_RSS',
            publishedAt: pubDate,
            sentiment,
            sentimentMethod: 'HEADLINE_KEYWORD_HEURISTIC',
            sourceType,
            relevance,
          });
        }
      }
    }
  } catch {
    // Fail closed to empty news
  }

  return result;
}
