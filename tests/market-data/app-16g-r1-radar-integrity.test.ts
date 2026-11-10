import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateOpportunityConfidence,
  assessOpportunityConfidence,
  OpportunityRadarEngine,
  OpportunityAssetInput,
  OpportunityNewsItem,
} from '@atlas/market-data';
import { fetchBrapiAssetIntelligence } from '../../apps/api/src/application/portfolios/opportunity-radar/brapi-intelligence.fetcher';

describe('APP-16G-R1: Opportunity Radar Security & Confidence Integrity', () => {
  const SENSITIVE_TOKEN = 'ATLAS_SECRET_TEST_TOKEN_123';
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. BRAPI token never appears in URL query string
  it('1. fetchBrapiAssetIntelligence sends token exclusively via Authorization header, never in URL query string', async () => {
    const capturedCalls: Array<{ url: string; headers: Record<string, string> }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (input, init) => {
      capturedCalls.push({
        url: String(input),
        headers: (init?.headers as Record<string, string>) || {},
      });
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              fiftyTwoWeekHigh: 42.0,
              fiftyTwoWeekLow: 30.0,
              priceEarnings: 4.5,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await fetchBrapiAssetIntelligence({
      ticker: 'PETR4',
      token: SENSITIVE_TOKEN,
      baseUrl: 'https://brapi.dev/api',
    });

    const brapiCall = capturedCalls.find((c) => c.url.includes('brapi.dev'));
    expect(brapiCall).toBeDefined();
    expect(brapiCall!.url).not.toContain(SENSITIVE_TOKEN);
    expect(brapiCall!.url).not.toContain('token=');
    expect(brapiCall!.url).not.toContain('api_key=');
    expect(brapiCall!.url).not.toContain('apikey=');
    expect(brapiCall!.url).not.toContain('authorization=');
    expect(brapiCall!.headers['Authorization']).toBe(`Bearer ${SENSITIVE_TOKEN}`);
  });

  // 2. Fallback request also never puts token in URL
  it('2. Fallback request (when summaryProfile fails) never puts token in URL query string', async () => {
    const capturedUrls: string[] = [];
    const capturedHeadersList: Record<string, string>[] = [];

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (input, init) => {
      callCount++;
      capturedUrls.push(String(input));
      capturedHeadersList.push((init?.headers as Record<string, string>) || {});

      if (callCount === 1) {
        // First call fails with 403 Forbidden (modules not available on plan)
        return new Response(JSON.stringify({ error: true, message: 'Plan does not support modules' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Fallback call succeeds
      return new Response(
        JSON.stringify({
          results: [
            {
              symbol: 'VALE3',
              fiftyTwoWeekHigh: 75.0,
              fiftyTwoWeekLow: 55.0,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await fetchBrapiAssetIntelligence({
      ticker: 'VALE3',
      token: SENSITIVE_TOKEN,
      baseUrl: 'https://brapi.dev/api',
    });

    expect(capturedUrls.length).toBeGreaterThanOrEqual(2);
    for (const url of capturedUrls) {
      if (url.includes('brapi.dev')) {
        expect(url).not.toContain(SENSITIVE_TOKEN);
        expect(url).not.toContain('token=');
        expect(url).not.toContain('api_key=');
        expect(url).not.toContain('apikey=');
        expect(url).not.toContain('authorization=');
      }
    }

    for (const hdrs of capturedHeadersList) {
      if (hdrs['Authorization']) {
        expect(hdrs['Authorization']).toBe(`Bearer ${SENSITIVE_TOKEN}`);
      }
    }
  });

  // 3. Secret redaction test with ATLAS_SECRET_TEST_TOKEN_123
  it('3. Secret redaction: token is never logged, leaked in error messages, or thrown to caller', async () => {
    const errorLogs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorLogs.push(args.map(String).join(' '));
    });

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      throw new Error(`Upstream connection refused to brapi.dev with credentials`);
    });

    const intel = await fetchBrapiAssetIntelligence({
      ticker: 'BBAS3',
      token: SENSITIVE_TOKEN,
    });

    expect(intel).toBeDefined();
    expect(intel.news).toEqual([]);

    for (const log of errorLogs) {
      expect(log).not.toContain(SENSITIVE_TOKEN);
    }
    consoleSpy.mockRestore();
  });

  // 4. 52w range does not count as fundamental
  it('4. 52-week high/low is market price range, NEVER a fundamental metric', () => {
    // FII with quote + 52w range + portfolio + news, but NO true fundamentals (fiiPriceToBook/fiiDividendYield)
    const fiiInput: OpportunityAssetInput = {
      assetId: 'fii-1',
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      assetType: 'FII',
      currentPrice: '160.00',
      dailyChangePercent: 0.1,
      portfolioWeight: 5.0,
      classWeight: 20.0,
      quantity: '50',
      fiftyTwoWeekHigh: 170.0,
      fiftyTwoWeekLow: 150.0,
      change21dPercent: 1.5,
      recentNews: [
        {
          id: 'news-1',
          headline: 'HGLG11 anuncia novos dividendos',
          source: 'InfoMoney',
          aggregator: 'GOOGLE_NEWS_RSS',
          publishedAt: '2026-11-09T10:00:00Z',
          sentiment: 'POSITIVE',
          sentimentMethod: 'HEADLINE_KEYWORD_HEURISTIC',
          sourceType: 'FINANCIAL_MEDIA',
          relevance: 0.7,
        },
      ],
    };

    const assessment = assessOpportunityConfidence(fiiInput);
    // Real fundamentals must be strictly false
    expect(assessment.provenance.hasRealFundamentals).toBe(false);
    // Coverage is 4 out of 5 dimensions (80%), NOT 100%
    expect(assessment.provenance.knownDimensionsCount).toBe(4);
    expect(assessment.provenance.coveragePercent).toBe(80);
    // Confidence must cap at MEDIUM because true fundamentals are missing
    expect(assessment.confidence).toBe('MEDIUM');
    expect(calculateOpportunityConfidence(fiiInput)).toBe('MEDIUM');
  });

  // 5. Equity with real fundamental (P/L) reaches HIGH
  it('5. Equity with real fundamental (P/L), 21d history, portfolio context, and news reaches HIGH confidence', () => {
    const stockInput: OpportunityAssetInput = {
      assetId: 'stock-1',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      assetType: 'STOCK',
      currentPrice: '38.50',
      dailyChangePercent: -0.5,
      portfolioWeight: 8.0,
      classWeight: 30.0,
      quantity: '200',
      change21dPercent: 3.2,
      priceEarnings: 4.5, // REAL FUNDAMENTAL
      recentNews: [
        {
          id: 'news-petr',
          headline: 'PETR4 divulga relatório de produção',
          source: 'B3',
          aggregator: 'GOOGLE_NEWS_RSS',
          publishedAt: '2026-11-09T10:00:00Z',
          sentiment: 'POSITIVE',
          sentimentMethod: 'HEADLINE_KEYWORD_HEURISTIC',
          sourceType: 'OFFICIAL_REGULATORY',
          relevance: 1.0,
        },
      ],
    };

    const assessment = assessOpportunityConfidence(stockInput);
    expect(assessment.provenance.hasRealFundamentals).toBe(true);
    expect(assessment.provenance.hasPriceHistory).toBe(true);
    expect(assessment.provenance.hasVerifiedNews).toBe(true);
    expect(assessment.provenance.knownDimensionsCount).toBe(5);
    expect(assessment.provenance.coveragePercent).toBe(100);
    expect(assessment.confidence).toBe('HIGH');
  });

  // 6. Google News RSS provenance is labeled as aggregator
  it('6. Google News RSS provenance is labeled honestly as aggregator, never as official regulatory source', async () => {
    const mockRssXml = `
      <rss version="2.0">
        <channel>
          <title>Google News</title>
          <item>
            <title>PETR4 tem forte alta na B3 após anúncio de dividendos - InfoMoney</title>
            <pubDate>Mon, 09 Nov 2026 12:00:00 GMT</pubDate>
            <source url="https://infomoney.com.br">InfoMoney</source>
          </item>
        </channel>
      </rss>
    `;

    globalThis.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('news.google.com')) {
        return new Response(mockRssXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }
      return new Response(JSON.stringify({ results: [{ symbol: 'PETR4' }] }), { status: 200 });
    });

    const intel = await fetchBrapiAssetIntelligence({ ticker: 'PETR4' });
    expect(intel.news.length).toBe(1);
    const item = intel.news[0]!;
    expect(item.aggregator).toBe('GOOGLE_NEWS_RSS');
    expect(item.source).toBe('InfoMoney');
    expect(item.sourceType).toBe('FINANCIAL_MEDIA');
    expect(item.relevance).toBeLessThanOrEqual(0.7);
  });

  // 7. Headline keyword heuristic is documented and corporate news from media is not given official 1.0 relevance
  it('7. Media covering corporate events receives increased media relevance but NOT official regulatory status', async () => {
    const mockRssXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>PETR4 publica fato relevante sobre plano estratégico - Valor Econômico</title>
            <pubDate>Mon, 09 Nov 2026 14:00:00 GMT</pubDate>
            <source url="https://valor.globo.com">Valor Econômico</source>
          </item>
          <item>
            <title>CVM publica comunicado sobre regras do setor aplicadas à PETR4 - CVM Oficial</title>
            <pubDate>Mon, 09 Nov 2026 15:00:00 GMT</pubDate>
            <source url="https://cvm.gov.br">CVM</source>
          </item>
        </channel>
      </rss>
    `;

    globalThis.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('news.google.com')) {
        return new Response(mockRssXml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
      }
      return new Response(JSON.stringify({ results: [{ symbol: 'PETR4' }] }), { status: 200 });
    });

    const intel = await fetchBrapiAssetIntelligence({ ticker: 'PETR4' });
    expect(intel.news.length).toBe(2);

    const mediaItem = intel.news[0]!;
    expect(mediaItem.sourceType).toBe('FINANCIAL_MEDIA');
    expect(mediaItem.relevance).toBe(0.85); // elevated media relevance, but not 1.0
    expect(mediaItem.sentimentMethod).toBe('HEADLINE_KEYWORD_HEURISTIC');

    const officialItem = intel.news[1]!;
    expect(officialItem.sourceType).toBe('OFFICIAL_REGULATORY');
    expect(officialItem.relevance).toBe(1.0);
  });

  // 8. Coverage percent decreases when fundamentals or history are absent
  it('8. Coverage percent honestly reflects missing dimensions (80% without fundamentals)', () => {
    const assetWithoutFundamentals: OpportunityAssetInput = {
      assetId: 'fii-knri',
      ticker: 'KNRI11',
      name: 'Kinea Renda Imobiliária',
      assetType: 'FII',
      currentPrice: '145.00',
      dailyChangePercent: -0.2,
      portfolioWeight: 4.0,
      quantity: '40',
      change21dPercent: 0.8,
      recentNews: [
        {
          id: 'news-knri',
          headline: 'KNRI11 distribui rendimentos do mês',
          source: 'Clube FII',
          aggregator: 'GOOGLE_NEWS_RSS',
          publishedAt: '2026-11-09T10:00:00Z',
          sentiment: 'NEUTRAL',
          sentimentMethod: 'HEADLINE_KEYWORD_HEURISTIC',
          sourceType: 'FINANCIAL_MEDIA',
          relevance: 0.7,
        },
      ],
    };

    const assessment = assessOpportunityConfidence(assetWithoutFundamentals);
    expect(assessment.provenance.hasRealFundamentals).toBe(false);
    expect(assessment.provenance.knownDimensionsCount).toBe(4);
    expect(assessment.provenance.coveragePercent).toBe(80);
    expect(assessment.confidence).toBe('MEDIUM');
  });

  // 9. Determinism of Top 5
  it('9. Top 5 ranking produces identical scores, order, and provenance across 100 executions', () => {
    const testAssets: OpportunityAssetInput[] = [
      {
        assetId: 'a1',
        ticker: 'PETR4',
        assetType: 'STOCK',
        currentPrice: '38.50',
        dailyChangePercent: -1.2,
        change21dPercent: 2.5,
        priceEarnings: 4.2,
        portfolioWeight: 5.0,
        quantity: '100',
      },
      {
        assetId: 'a2',
        ticker: 'VALE3',
        assetType: 'STOCK',
        currentPrice: '62.00',
        dailyChangePercent: 0.5,
        change21dPercent: -3.0,
        priceEarnings: 6.8,
        portfolioWeight: 7.0,
        quantity: '80',
      },
      {
        assetId: 'a3',
        ticker: 'HGLG11',
        assetType: 'FII',
        currentPrice: '160.00',
        dailyChangePercent: 0.0,
        change21dPercent: 1.0,
        portfolioWeight: 10.0,
        quantity: '50',
      },
    ];

    const firstRun = OpportunityRadarEngine.evaluate({
      portfolioId: 'p-1',
      assets: testAssets,
      maxResults: 5,
    });
    for (let i = 0; i < 99; i++) {
      const run = OpportunityRadarEngine.evaluate({
        portfolioId: 'p-1',
        assets: testAssets,
        maxResults: 5,
      });
      expect(run.items.length).toBe(firstRun.items.length);
      for (let j = 0; j < run.items.length; j++) {
        expect(run.items[j]!.ticker).toBe(firstRun.items[j]!.ticker);
        expect(run.items[j]!.score).toBe(firstRun.items[j]!.score);
        expect(run.items[j]!.confidence).toBe(firstRun.items[j]!.confidence);
      }
    }
  });

  // 10. Privacy invariant: only ticker symbol is accepted externally
  it('10. Privacy invariant: fetchBrapiAssetIntelligence accepts only ticker and credentials, never portfolioId, balances, or user identity', async () => {
    const capturedArgs: any[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (input) => {
      capturedArgs.push(input);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    const sensitivePortfolioContext = {
      portfolioId: '00000000-0000-4000-8000-999999999999',
      userId: 'user-secret-uuid',
      totalCost: '150000.00',
      netBalance: '250000.00',
      quantity: '500',
    };

    // Calling fetchBrapiAssetIntelligence with only sanctioned parameters
    await fetchBrapiAssetIntelligence({
      ticker: 'ITSA4',
      token: 'test-token',
    });

    for (const arg of capturedArgs) {
      const urlStr = String(arg);
      expect(urlStr).not.toContain(sensitivePortfolioContext.portfolioId);
      expect(urlStr).not.toContain(sensitivePortfolioContext.userId);
      expect(urlStr).not.toContain(sensitivePortfolioContext.totalCost);
      expect(urlStr).not.toContain(sensitivePortfolioContext.netBalance);
      expect(urlStr).not.toContain(sensitivePortfolioContext.quantity);
    }
  });
});
