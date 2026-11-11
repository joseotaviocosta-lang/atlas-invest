import { Injectable, Logger } from '@nestjs/common';
import {
  AssetNewsDailyStatus,
  OfficialComponentStatus,
  OfficialProviderStatus,
  PortfolioNewsInboxResult,
  RawNewsInput,
  canonicalizeNewsEvents,
  buildDailyNewsDigest,
  deriveAssetDailyNewsStatus,
  CvmOfficialNewsProvider,
} from '@atlas/market-data';

interface CachedNewsResult {
  result: PortfolioNewsInboxResult;
  timestamp: number;
}

@Injectable()
export class PortfolioNewsPipelineService {
  private readonly logger = new Logger(PortfolioNewsPipelineService.name);
  private readonly cvmProvider = new CvmOfficialNewsProvider();
  private cache: CachedNewsResult | null = null;
  private readonly CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

  /**
   * Fetches, canonicalizes and evaluates news across all portfolio assets (APP-16J).
   *
   * Security Invariants:
   * 1. Token passed EXCLUSIVELY via HTTP Authorization: Bearer header.
   * 2. ZERO token in URL query parameters.
   * 3. Zero sensitive portfolio information (no portfolioId, quantity, balance, userId) sent externally.
   *
   * Reliability Invariants:
   * 1. Fail-closed: network or upstream failures degrade gracefully to fallback or empty without crashing Radar.
   * 2. If BRAPI News requires a Pro plan (401/403), records BRAPI_NEWS_PRO_UNAVAILABLE and activates secondary pipeline.
   * 3. An asset with no news is classified as NO_RECENT_NEWS, which is a normal valid state, not an error.
   */
  async getPortfolioNews(params: {
    tickers: string[];
    token?: string;
    referenceDate?: Date;
    forceRefresh?: boolean;
  }): Promise<PortfolioNewsInboxResult> {
    const referenceDate = params.referenceDate ?? new Date();
    const now = Date.now();

    if (!params.forceRefresh && this.cache && now - this.cache.timestamp < this.CACHE_TTL_MS) {
      return this.cache.result;
    }

    const uniqueTickers = Array.from(new Set(params.tickers.map((t) => t.toUpperCase().trim()))).filter(Boolean);
    const rawArticles: RawNewsInput[] = [];
    const providersUsed: string[] = [];

    let brapiNewsAvailable = false;
    let brapiNewsStatus: 'BRAPI_NEWS_PRO_AVAILABLE' | 'BRAPI_NEWS_PRO_UNAVAILABLE' = 'BRAPI_NEWS_PRO_UNAVAILABLE';
    let fallbackActive = false;

    // 1. Discovery & Probe for BRAPI v2 News (Batched <= 20 tickers)
    const token = params.token ?? process.env.BRAPI_API_KEY ?? process.env.MARKET_DATA_API_TOKEN;
    if (token && token.trim().length > 0) {
      try {
        const batchSize = 20;
        const batches: string[][] = [];
        for (let i = 0; i < uniqueTickers.length; i += batchSize) {
          batches.push(uniqueTickers.slice(i, i + batchSize));
        }

        let allBatchesOk = true;
        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b]!;
          const url = `https://brapi.dev/api/v2/news?tickers=${encodeURIComponent(batch.join(','))}`;

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token.trim()}`,
              'User-Agent': 'Atlas-Invest/0.1.0',
              Accept: 'application/json',
            },
            signal: controller.signal,
          }).catch(() => null);
          clearTimeout(timer);

          if (resp && resp.ok) {
            const data = (await resp.json().catch(() => null)) as {
              news?: Array<{
                title?: string;
                headline?: string;
                description?: string;
                summary?: string;
                url?: string;
                link?: string;
                source?: string;
                publishedAt?: string;
                date?: string;
                tickers?: string[];
                assets?: string[];
              }>;
            };

            const items = data?.news || [];
            if (Array.isArray(items) && items.length > 0) {
              for (const it of items) {
                const headline = it.title || it.headline || '';
                if (!headline) continue;
                const itemTickers = it.tickers || it.assets || [];
                const matchedTicker = itemTickers.find((t) => batch.includes(t.toUpperCase())) || batch[0] || 'MKT';

                rawArticles.push({
                  headline,
                  summary: it.description || it.summary || '',
                  url: it.url || it.link || '',
                  sourceName: it.source || 'BRAPI News',
                  publishedAt: it.publishedAt || it.date || new Date().toISOString(),
                  ticker: matchedTicker,
                  provider: 'BRAPI_NEWS',
                  sourceType: 'BRAPI_NEWS_AGGREGATED',
                });
              }
            }
          } else {
            allBatchesOk = false;
            break;
          }
        }

        if (allBatchesOk && rawArticles.length > 0) {
          brapiNewsAvailable = true;
          brapiNewsStatus = 'BRAPI_NEWS_PRO_AVAILABLE';
          providersUsed.push('BRAPI News (v2)');
        } else {
          brapiNewsStatus = 'BRAPI_NEWS_PRO_UNAVAILABLE';
          fallbackActive = true;
        }
      } catch (err) {
        this.logger.warn(`BRAPI news probe failed: ${String(err)}`);
        brapiNewsStatus = 'BRAPI_NEWS_PRO_UNAVAILABLE';
        fallbackActive = true;
      }
    } else {
      brapiNewsStatus = 'BRAPI_NEWS_PRO_UNAVAILABLE';
      fallbackActive = true;
    }

    // 2. Secondary & Fallback Provider: Google News RSS for all portfolio assets
    if (fallbackActive || rawArticles.length === 0) {
      if (!providersUsed.includes('Google News RSS (Agregador)')) {
        providersUsed.push('Google News RSS (Agregador)');
      }

      // Concurrently fetch with chunked parallelism (concurrency = 6)
      const concurrency = 6;
      for (let i = 0; i < uniqueTickers.length; i += concurrency) {
        const slice = uniqueTickers.slice(i, i + concurrency);
        await Promise.all(
          slice.map(async (ticker) => {
            const articles = await this.fetchGoogleRssForTicker(ticker);
            rawArticles.push(...articles);
          }),
        );
      }
    }

    // 3. Official Regulatory Events Layer (CVM Dados Abertos & B3 Fundos.NET) — APP-16K-R1
    let officialStatus: OfficialProviderStatus = 'OFFICIAL_PROVIDER_AVAILABLE';
    let cvmStatus: OfficialComponentStatus = 'NOT_APPLICABLE';
    let fnetStatus: OfficialComponentStatus = 'NOT_APPLICABLE';
    let officialCoverageCount = 0;
    try {
      const officialRes = await this.cvmProvider.fetchOfficialEvents(uniqueTickers, referenceDate);
      officialCoverageCount = officialRes.resolvedCount;
      officialStatus = officialRes.overallStatus;
      cvmStatus = officialRes.cvm.status;
      fnetStatus = officialRes.fnet.status;

      if (officialRes.articles.length > 0) {
        rawArticles.push(...officialRes.articles);
        if (!providersUsed.includes('CVM / B3 Regulatório Oficial')) {
          providersUsed.unshift('CVM / B3 Regulatório Oficial');
        }
      }
    } catch (err) {
      this.logger.warn(`Official regulatory provider failure: ${String(err)}`);
      officialStatus = 'OFFICIAL_PROVIDER_UNAVAILABLE';
      cvmStatus = 'UNAVAILABLE';
      fnetStatus = 'UNAVAILABLE';
    }

    // 4. Deduplicate and Canonicalize
    const canonicalEvents = canonicalizeNewsEvents(rawArticles, referenceDate);

    // 5. Compute Metrics & Breakdown (APP-16L)
    const byAssetCount: Record<string, number> = {};
    for (const t of uniqueTickers) {
      byAssetCount[t] = 0;
    }

    let breakingCount = 0;
    let recentCount = 0;
    let officialCount = 0;
    let highImportanceCount = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let routineCount = 0;

    for (const ev of canonicalEvents) {
      if (ev.freshness === 'BREAKING') breakingCount++;
      if (ev.freshness === 'BREAKING' || ev.freshness === 'VERY_RECENT' || ev.freshness === 'RECENT') {
        recentCount++;
      }
      if (ev.official) officialCount++;
      if (ev.importance >= 4) highImportanceCount++;

      if (ev.materiality === 'CRITICAL') criticalCount++;
      else if (ev.materiality === 'HIGH') highCount++;
      else if (ev.materiality === 'MEDIUM') mediumCount++;
      else if (ev.materiality === 'ROUTINE') routineCount++;

      for (const asset of ev.assets) {
        if (byAssetCount[asset] !== undefined) {
          byAssetCount[asset]++;
        }
      }
    }

    let assetsWithNews = 0;
    let assetsWithoutNews = 0;
    for (const t of uniqueTickers) {
      if ((byAssetCount[t] ?? 0) > 0) {
        assetsWithNews++;
      } else {
        assetsWithoutNews++;
      }
    }

    // 6. Build Daily News Digest (Top 5-10 material events for today) — APP-16L
    const digest = buildDailyNewsDigest(canonicalEvents, {
      referenceDate,
      maxItems: 10,
    });

    // 7. Derive Asset Daily News Status for each portfolio asset — APP-16L
    const assetDailyStatus: Record<string, AssetNewsDailyStatus> = {};
    for (const t of uniqueTickers) {
      assetDailyStatus[t] = deriveAssetDailyNewsStatus(t, canonicalEvents, {
        officialStatus,
        fallbackActive,
      });
    }

    const result: PortfolioNewsInboxResult = {
      events: canonicalEvents,
      totalEvents: canonicalEvents.length,
      byAssetCount,
      digest,
      assetDailyStatus,
      metrics: {
        breakingCount,
        recentCount,
        officialCount,
        highImportanceCount,
        materialCount: criticalCount + highCount,
        criticalCount,
        highCount,
        mediumCount,
        routineCount,
        totalAuditedAssets: uniqueTickers.length,
        assetsWithNews,
        assetsWithoutNews,
        officialCoverageCount,
        providerStatus: {
          brapiNewsAvailable,
          brapiNewsStatus,
          officialStatus,
          cvmStatus,
          fnetStatus,
          fallbackActive,
          providersUsed,
        },
      },
      asOf: referenceDate.toISOString(),
    };

    this.cache = {
      result,
      timestamp: now,
    };

    return result;
  }

  /**
   * Helper to fetch RSS articles for an individual ticker with fail-closed behavior.
   */
  private async fetchGoogleRssForTicker(ticker: string): Promise<RawNewsInput[]> {
    const results: RawNewsInput[] = [];
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(ticker + ' B3')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timer);

      if (!res || !res.ok) {
        return [];
      }

      const xml = await res.text().catch(() => '');
      if (!xml) return [];

      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      const tickLower = ticker.toLowerCase();
      const baseSymbol = tickLower.replace(/\d+$/, '');

      for (let i = 0; i < Math.min(items.length, 12); i++) {
        const item = items[i];
        if (!item) continue;

        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
        const pubMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);

        const rawTitle = titleMatch ? titleMatch[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.trim() ?? '' : '';
        if (!rawTitle) continue;

        // Verify relevance to ticker
        const textLower = rawTitle.toLowerCase();
        if (!textLower.includes(tickLower) && (baseSymbol.length < 3 || !textLower.includes(baseSymbol))) {
          continue;
        }

        const link = linkMatch ? linkMatch[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.trim() ?? '' : '';
        const source = sourceMatch ? sourceMatch[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')?.trim() ?? 'Imprensa' : 'Imprensa';
        const pubDate = pubMatch && pubMatch[1] ? new Date(pubMatch[1]) : new Date();

        results.push({
          headline: rawTitle,
          url: link,
          sourceName: source,
          publishedAt: pubDate,
          ticker,
          provider: 'GOOGLE_NEWS',
          sourceType: 'GOOGLE_NEWS_RSS_FALLBACK',
        });
      }
    } catch {
      // Fail closed
    }
    return results;
  }

  /**
   * Clears the in-memory news cache (e.g. on manual refresh).
   */
  clearCache(): void {
    this.cache = null;
  }
}
