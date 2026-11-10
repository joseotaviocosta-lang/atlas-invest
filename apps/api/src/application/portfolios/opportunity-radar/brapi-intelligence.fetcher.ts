import { OpportunityNewsItem } from '@atlas/market-data';

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
  news: OpportunityNewsItem[];
  analystConsensus?: 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null;
}

/**
 * Fetches fundamentals and news for a ticker from BRAPI (APP-16F PARTE G, H, I, AK).
 *
 * Privacy Invariant:
 * Receives ONLY the ticker symbol. Never sends user quantities, cost, balances,
 * CPF, portfolioId or identity to third-party endpoints.
 *
 * Fail-closed:
 * Network errors, 401s, 429s, or missing modules fail gracefully to empty/neutral values.
 */
export async function fetchBrapiAssetIntelligence(params: {
  ticker: string;
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

  const headers: Record<string, string> = {
    'User-Agent': 'Atlas-Invest/0.1.0',
    Accept: 'application/json',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  // 1. Fetch Quote with Modules (fundamentals & range)
  try {
    const quoteUrl = new URL(`${baseUrl}/quote/${encodeURIComponent(params.ticker)}`);
    quoteUrl.searchParams.set('modules', 'summaryProfile,financialData,defaultKeyStatistics');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(quoteUrl.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeout);

    if (res && res.ok) {
      const data = (await res.json().catch(() => null)) as {
        results?: Array<{
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
          priceEarnings?: number;
          defaultKeyStatistics?: {
            priceToBook?: number;
            dividendYield?: number;
          };
          financialData?: {
            returnOnEquity?: number;
            debtToEquity?: number;
            recommendationKey?: string;
          };
          summaryProfile?: {
            sector?: string;
            industry?: string;
            listingSegment?: string;
          };
        }>;
      };

      if (data && data.results && data.results.length > 0) {
        const item = data.results[0];
        if (item) {
          result.fiftyTwoWeekHigh = item.fiftyTwoWeekHigh ?? null;
          result.fiftyTwoWeekLow = item.fiftyTwoWeekLow ?? null;
          result.priceEarnings = item.priceEarnings ?? null;

          if (item.defaultKeyStatistics) {
            result.priceToBook = item.defaultKeyStatistics.priceToBook ?? null;
            result.fiiPriceToBook = item.defaultKeyStatistics.priceToBook ?? null;

            if (item.defaultKeyStatistics.dividendYield !== undefined && item.defaultKeyStatistics.dividendYield !== null) {
              // BRAPI dividendYield might be decimal (0.08) or percent (8.0)
              const dy = item.defaultKeyStatistics.dividendYield;
              const normalizedDy = dy <= 1.0 && dy > 0 ? dy * 100 : dy;
              result.dividendYield = normalizedDy;
              result.fiiDividendYield = normalizedDy;
            }
          }

          if (item.financialData) {
            if (item.financialData.returnOnEquity !== undefined && item.financialData.returnOnEquity !== null) {
              const roe = item.financialData.returnOnEquity;
              result.returnOnEquity = roe <= 1.0 && roe > 0 ? roe * 100 : roe;
            }
            result.debtToEquity = item.financialData.debtToEquity ?? null;

            const rec = item.financialData.recommendationKey?.toLowerCase();
            if (rec?.includes('buy') || rec?.includes('outperform')) {
              result.analystConsensus = 'BUY';
            } else if (rec?.includes('sell') || rec?.includes('underperform')) {
              result.analystConsensus = 'SELL';
            } else if (rec?.includes('hold') || rec?.includes('neutral')) {
              result.analystConsensus = 'HOLD';
            }
          }

          if (item.summaryProfile) {
            result.fiiSegment =
              item.summaryProfile.listingSegment || item.summaryProfile.sector || item.summaryProfile.industry || null;
          }
        }
      }
    }
  } catch {
    // Fail closed to neutral
  }

  // 2. Fetch News (if token is available)
  if (token && token.trim()) {
    try {
      const newsUrl = new URL(`${baseUrl}/quote/news/${encodeURIComponent(params.ticker)}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(newsUrl.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeout);

      if (res && res.ok) {
        const data = (await res.json().catch(() => null)) as {
          results?: Array<{
            title?: string;
            description?: string;
            source?: string;
            publishedAt?: string;
            url?: string;
            sentiment?: string;
          }>;
        };

        if (data && data.results && Array.isArray(data.results)) {
          for (let i = 0; i < Math.min(5, data.results.length); i++) {
            const n = data.results[i];
            if (!n || !n.title) continue;

            let sentiment: OpportunityNewsItem['sentiment'] = 'NEUTRAL';
            const sentLower = (n.sentiment || '').toLowerCase();
            const textLower = `${n.title} ${n.description || ''}`.toLowerCase();

            if (
              sentLower.includes('pos') ||
              textLower.includes('lucro') ||
              textLower.includes('alta') ||
              textLower.includes('dividendo') ||
              textLower.includes('recorde') ||
              textLower.includes('aquisi') ||
              textLower.includes('eleva')
            ) {
              sentiment = 'POSITIVE';
            } else if (
              sentLower.includes('neg') ||
              textLower.includes('queda') ||
              textLower.includes('prejuízo') ||
              textLower.includes('investig') ||
              textLower.includes('multa') ||
              textLower.includes('rombo') ||
              textLower.includes('rebaixa')
            ) {
              sentiment = 'NEGATIVE';
            }

            result.news.push({
              id: `brapi-news-${params.ticker}-${i}`,
              headline: n.title,
              source: n.source || 'BRAPI / Mercado',
              publishedAt: n.publishedAt || new Date().toISOString(),
              canonicalUrl: n.url,
              sentiment,
              relevance: 1.0,
            });
          }
        }
      }
    } catch {
      // Fail closed to empty news
    }
  }

  return result;
}
