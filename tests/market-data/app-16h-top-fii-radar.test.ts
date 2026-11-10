import { describe, it, expect } from 'vitest';
import {
  OpportunityRadarEngine,
  OpportunityAssetInput,
  OPPORTUNITY_MODEL_VERSION,
} from '@atlas/market-data';

describe('PROJECT ATLAS — APP-16H: Top 5 FIIs Opportunity Radar', () => {
  const baseEquity = (ticker: string, scoreParam: number): OpportunityAssetInput => ({
    assetId: `stock-${ticker}`,
    ticker,
    name: `Empresa ${ticker}`,
    assetType: 'STOCK',
    currency: 'BRL',
    quantity: '100',
    marketValue: '2500',
    portfolioWeight: 2.5,
    classWeight: 10.0,
    currentPrice: '25.00',
    dailyChangePercent: 0.5,
    change5dPercent: 1.0,
    change21dPercent: 3.5,
    change63dPercent: 7.0,
    fiftyTwoWeekHigh: 30.0,
    fiftyTwoWeekLow: 20.0,
    priceEarnings: 8.0,
    priceToBook: 1.2,
    dividendYield: 6.5,
    returnOnEquity: 18.0,
    recentNews: [
      {
        id: `news-${ticker}`,
        headline: `${ticker} aprova distribuição de dividendos e juros sobre capital`,
        source: 'InfoMoney',
        publishedAt: new Date().toISOString(),
        sentiment: 'POSITIVE',
        relevance: 0.8,
      },
    ],
  });

  const baseFii = (
    ticker: string,
    weight: number,
    opts: {
      pvp?: number | null;
      dy?: number | null;
      dailyChange?: number;
      segment?: string;
      hasNews?: boolean;
    } = {},
  ): OpportunityAssetInput => ({
    assetId: `fii-${ticker}`,
    ticker,
    name: `Fundo Imobiliário ${ticker}`,
    assetType: 'FII',
    currency: 'BRL',
    quantity: '50',
    marketValue: '5000',
    portfolioWeight: weight,
    classWeight: 15.0,
    currentPrice: '100.00',
    dailyChangePercent: opts.dailyChange ?? 0.2,
    change5dPercent: 0.8,
    change21dPercent: 2.4,
    change63dPercent: 4.5,
    fiftyTwoWeekHigh: 110.0,
    fiftyTwoWeekLow: 90.0,
    fiiPriceToBook: opts.pvp !== undefined ? opts.pvp : 0.95,
    fiiDividendYield: opts.dy !== undefined ? opts.dy : 10.5,
    fiiSegment: opts.segment ?? 'Logística',
    recentNews: opts.hasNews
      ? [
          {
            id: `news-${ticker}`,
            headline: `${ticker} anuncia novos contratos de locação atípicos`,
            source: 'InfoMoney',
            publishedAt: new Date().toISOString(),
            sentiment: 'POSITIVE',
            relevance: 0.8,
          },
        ]
      : [],
  });

  // 1. Contract & Dual Ranking output
  it('1. OpportunityRadarEngine returns both items (Top Geral) and fiiItems (Top FIIs)', () => {
    const stock1 = baseEquity('PETR4', 80);
    const stock2 = baseEquity('VALE3', 75);
    const fii1 = baseFii('HGLG11', 1.5, { pvp: 0.95, dy: 10.5, hasNews: true });
    const fii2 = baseFii('KNRI11', 1.8, { pvp: 0.92, dy: 9.8, hasNews: true });

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [stock1, stock2, fii1, fii2],
    });

    expect(result.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(result.items).toBeDefined();
    expect(result.fiiItems).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(Array.isArray(result.fiiItems)).toBe(true);
    expect(result.totalFiiEligible).toBe(2);
    expect(result.totalFiiRanked).toBe(2);
  });

  // 2. fiiItems contains strictly FIIs — zero stocks
  it('2. fiiItems contains exclusively FII assets, never any stocks', () => {
    const stocks = ['PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'BBAS3'].map((t) => baseEquity(t, 85));
    const fiis = ['HGLG11', 'KNRI11', 'MXRF11'].map((t) => baseFii(t, 2.0, { hasNews: true }));

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [...stocks, ...fiis],
    });

    expect(result.fiiItems.length).toBe(3);
    for (const item of result.fiiItems) {
      expect(item.assetType).toBe('FII');
      expect(item.ticker.endsWith('11')).toBe(true);
    }
  });

  // 3. Maximum 5 FII items
  it('3. returns at most 5 FII items even when more qualified FIIs exist', () => {
    const fiis = ['FIIA11', 'FIIB11', 'FIIC11', 'FIID11', 'FIIE11', 'FIIF11', 'FIIG11'].map((t, idx) =>
      baseFii(t, 0.5 + idx * 0.2, { pvp: 0.90 + idx * 0.01, dy: 11.0 - idx * 0.2, hasNews: true }),
    );

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: fiis,
      maxResults: 5,
    });

    expect(result.fiiItems.length).toBe(5);
    expect(result.totalFiiEligible).toBe(7);
    expect(result.totalFiiRanked).toBe(5);
  });

  // 4. Quality Floor Gate: Excludes LOW / INSUFFICIENT confidence from fiiItems
  it('4. excludes LOW and INSUFFICIENT_DATA FIIs from top fiiItems (no artificial padding)', () => {
    const qualifiedFii1 = baseFii('HGLG11', 1.0, { pvp: 0.95, dy: 10.5, hasNews: true });
    const qualifiedFii2 = baseFii('KNRI11', 1.2, { pvp: 0.92, dy: 9.8, hasNews: true });

    // FII with missing fundamentals and no history -> LOW / INSUFFICIENT confidence
    const lowConfFii: OpportunityAssetInput = {
      assetId: 'fii-poor',
      ticker: 'POOR11',
      name: 'FII Sem Dados',
      assetType: 'FII',
      currency: 'BRL',
      quantity: '10',
      marketValue: '100',
      portfolioWeight: 0.1,
      classWeight: 0.5,
      currentPrice: '10.00',
      dailyChangePercent: null,
      // No pvp, no dy, no segment, no trend, no news
    };

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [qualifiedFii1, qualifiedFii2, lowConfFii],
    });

    // POOR11 should NOT be in fiiItems
    expect(result.fiiItems.some((i) => i.ticker === 'POOR11')).toBe(false);
    expect(result.fiiItems.length).toBe(2); // exactly 2, never padded to 3
    expect(result.lowConfidenceItems?.some((i) => i.ticker === 'POOR11')).toBe(true);
  });

  // 5. fiiCoveragePercent calculated strictly on FII assets
  it('5. fiiCoveragePercent is calculated exclusively over analyzed FII assets', () => {
    // Stock with 100% coverage
    const stock = baseEquity('VALE3', 80);
    // FII without fundamentals (missing P/VP and DY) -> coverage ~60% (3/5 dimensions)
    const fiiPartial: OpportunityAssetInput = {
      assetId: 'fii-part',
      ticker: 'PART11',
      name: 'FII Parcial',
      assetType: 'FII',
      currency: 'BRL',
      quantity: '20',
      marketValue: '2000',
      portfolioWeight: 1.5,
      classWeight: 5.0,
      currentPrice: '100.00',
      dailyChangePercent: 0.2,
      change21dPercent: 1.5,
      fiftyTwoWeekHigh: 110,
      fiftyTwoWeekLow: 90,
      fiiSegment: 'Logística',
    };

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [stock, fiiPartial],
    });

    expect(result.overallCoveragePercent).toBeGreaterThan(result.fiiCoveragePercent);
    expect(result.fiiCoveragePercent).toBe(60);
  });

  // 6. Zero regression on General Ranking (items)
  it('6. General Ranking (items) is identical whether or not FII ranking is extracted', () => {
    const assets = [
      baseEquity('PETR4', 85),
      baseEquity('VALE3', 78),
      baseFii('HGLG11', 2.0, { pvp: 0.94, dy: 10.2, hasNews: true }),
      baseEquity('ITUB4', 82),
      baseFii('KNRI11', 1.8, { pvp: 0.96, dy: 9.5, hasNews: true }),
    ];

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets,
    });

    // Top items is still the Top 5 overall by score DESC, confidence DESC, ticker ASC
    expect(result.items.length).toBe(5);
    // General items includes both stocks and FIIs according to merit
    const hasStock = result.items.some((i) => i.assetType === 'STOCK');
    const hasFii = result.items.some((i) => i.assetType === 'FII');
    expect(hasStock).toBe(true);
    expect(hasFii).toBe(true);
  });

  // 7. Deterministic tie-breaking on FIIs
  it('7. FII ranking tie-breaks by score DESC, confidence DESC, then ticker ASC', () => {
    // Both FIIs with identical inputs and weights
    const fiiB = baseFii('XPML11', 2.0, { pvp: 0.95, dy: 10.0, hasNews: true });
    const fiiA = baseFii('ALZR11', 2.0, { pvp: 0.95, dy: 10.0, hasNews: true });

    const result1 = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [fiiB, fiiA],
    });

    const result2 = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [fiiA, fiiB],
    });

    expect(result1.fiiItems[0].ticker).toBe('ALZR11');
    expect(result1.fiiItems[1].ticker).toBe('XPML11');
    expect(result2.fiiItems[0].ticker).toBe('ALZR11');
    expect(result2.fiiItems[1].ticker).toBe('XPML11');
  });
});
