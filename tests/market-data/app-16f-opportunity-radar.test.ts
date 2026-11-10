import { describe, it, expect } from 'vitest';
import {
  OpportunityRadarEngine,
  EquityOpportunityScorer,
  FiiOpportunityScorer,
  calculateOpportunityConfidence,
  calculateNewsScore,
  calculatePortfolioFitScore,
  calculateTrendAndPriceScores,
  generateExplainabilitySynthesis,
  OPPORTUNITY_MODEL_VERSION,
  OpportunityAssetInput,
} from '@atlas/market-data';

describe('APP-16F: Daily Opportunity Radar Engine & Scorers', () => {
  const baseEquity: OpportunityAssetInput = {
    assetId: '11111111-1111-4111-8111-111111111111',
    ticker: 'BBAS3',
    name: 'Banco do Brasil ON',
    assetType: 'STOCK',
    currency: 'BRL',
    quantity: '100',
    marketValue: '2800',
    portfolioWeight: 4.5,
    classWeight: 12.0,
    currentPrice: '28.00',
    dailyChangePercent: 0.5,
    change5dPercent: 1.2,
    change21dPercent: 4.8,
    change63dPercent: 8.5,
    fiftyTwoWeekHigh: 32.0,
    fiftyTwoWeekLow: 24.0,
    priceEarnings: 4.5,
    priceToBook: 0.85,
    dividendYield: 9.8,
    returnOnEquity: 21.0,
    recentNews: [
      {
        id: 'n1',
        headline: 'Banco do Brasil reporta lucro líquido recorde e eleva guidance',
        source: 'InfoMoney',
        publishedAt: new Date().toISOString(),
        sentiment: 'POSITIVE',
        relevance: 1.0,
      },
    ],
  };

  const baseFii: OpportunityAssetInput = {
    assetId: '22222222-2222-4222-8222-222222222222',
    ticker: 'HGLG11',
    name: 'CSHG Logística FII',
    assetType: 'FII',
    currency: 'BRL',
    quantity: '50',
    marketValue: '8000',
    portfolioWeight: 5.0,
    classWeight: 15.0,
    currentPrice: '160.00',
    dailyChangePercent: -0.2,
    change5dPercent: 0.8,
    change21dPercent: 2.5,
    fiiPriceToBook: 0.94,
    fiiDividendYield: 9.2,
    fiiSegment: 'Logística',
    recentNews: [
      {
        id: 'n2',
        headline: 'CSHG Logística anuncia locação de novo módulo em galpão de Betim',
        source: 'Clube FII',
        publishedAt: new Date().toISOString(),
        sentiment: 'POSITIVE',
        relevance: 0.9,
      },
    ],
  };

  // 1. Ranking determinístico
  it('1. ranking is strictly deterministic across 100 iterations', () => {
    const assets = [
      { ...baseEquity, ticker: 'VALE3', portfolioWeight: 3.0 },
      { ...baseEquity, ticker: 'PETR4', portfolioWeight: 14.0 },
      { ...baseFii, ticker: 'MXRF11', portfolioWeight: 2.0 },
      { ...baseFii, ticker: 'KNIP11', portfolioWeight: 8.0 },
      { ...baseEquity, ticker: 'ITSA4', portfolioWeight: 5.0 },
      { ...baseEquity, ticker: 'WEGE3', portfolioWeight: 1.5 },
    ];

    const refDate = new Date('2026-11-10T12:00:00.000Z');
    const firstRun = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets,
      referenceDate: refDate,
    });

    for (let i = 0; i < 100; i++) {
      // Shuffle array to ensure sort determinism
      const shuffled = [...assets].sort(() => Math.random() - 0.5);
      const res = OpportunityRadarEngine.evaluate({
        portfolioId: 'test-port',
        assets: shuffled,
        referenceDate: refDate,
      });

      expect(res.items.map((it) => it.ticker)).toEqual(firstRun.items.map((it) => it.ticker));
      expect(res.items.map((it) => it.score)).toEqual(firstRun.items.map((it) => it.score));
    }
  });

  // 2. Concentração penaliza Portfolio Fit
  it('2. heavy concentration (> 15% portfolio weight) imposes heavy penalty', () => {
    const lowConcentration = calculatePortfolioFitScore({ portfolioWeight: 3.5, classWeight: 10.0 });
    const heavyConcentration = calculatePortfolioFitScore({ portfolioWeight: 18.0, classWeight: 45.0 });

    expect(lowConcentration.concentrationPenalty).toBe(0);
    expect(lowConcentration.score).toBeGreaterThanOrEqual(80);

    expect(heavyConcentration.concentrationPenalty).toBeGreaterThan(20);
    expect(heavyConcentration.score).toBeLessThan(45);
  });

  // 3. Queda diária sem tendência (anti-trap)
  it('3. isolated daily fall (-5%) without medium-term trend does NOT trigger high momentum', () => {
    const isolatedDrop = calculateTrendAndPriceScores({
      currentPrice: '20.00',
      dailyChangePercent: -5.0,
      change21dPercent: -15.0, // downtrend
      change63dPercent: -25.0,
    });

    const stabilizingRecovery = calculateTrendAndPriceScores({
      currentPrice: '20.00',
      dailyChangePercent: 1.5,
      change21dPercent: 6.0,
      change63dPercent: 10.0,
    });

    expect(isolatedDrop.momentumScore).toBeLessThan(40);
    expect(stabilizingRecovery.momentumScore).toBeGreaterThanOrEqual(75);
  });

  // 4. Missing data fails to null (UNKNOWN) and downgrades confidence
  it('4. missing fundamental data fails closed to null (UNKNOWN) and downgrades confidence, never 0 or fake 50', () => {
    const assetWithoutFundamentals: OpportunityAssetInput = {
      assetId: '33333333-3333-4333-8333-333333333333',
      ticker: 'TEST3',
      name: 'Test Sem Fundamentos',
      assetType: 'STOCK',
      currency: 'BRL',
      quantity: '100',
      marketValue: '1000',
      portfolioWeight: 2.0,
      classWeight: 5.0,
      currentPrice: '10.00',
      dailyChangePercent: 0.0,
      // no P/L, no P/VP, no DY, no ROE
    };

    const res = EquityOpportunityScorer.score(assetWithoutFundamentals);
    expect(res.components.valuation).toBeNull(); // explicit null / UNKNOWN, never fake 50
    expect(res.score).toBeGreaterThan(0);

    const conf = calculateOpportunityConfidence(assetWithoutFundamentals);
    expect(conf).not.toBe('HIGH');
  });

  // 5. Positive news aumenta score
  it('5. recent positive news increases news component score', () => {
    const res = calculateNewsScore([
      {
        id: '1',
        headline: 'Lucro cresce 40% com forte rentabilidade',
        source: 'Valor',
        publishedAt: new Date().toISOString(),
        sentiment: 'POSITIVE',
        relevance: 1.0,
      },
    ]);
    expect(res.score).toBeGreaterThanOrEqual(75);
  });

  // 6. Negative news reduz score
  it('6. recent negative news reduces news component score', () => {
    const res = calculateNewsScore([
      {
        id: '2',
        headline: 'CVM abre investigação e autua diretores por irregularidades',
        source: 'CVM',
        publishedAt: new Date().toISOString(),
        sentiment: 'NEGATIVE',
        relevance: 1.0,
      },
    ]);
    expect(res.score).toBeLessThanOrEqual(30);
  });

  // 7. Stale news perde peso temporal
  it('7. stale news (> 45 days) loses temporal impact compared to fresh news (< 24h)', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    const freshNegative = [
      {
        id: 'f1',
        headline: 'Queda de receita',
        source: 'News',
        publishedAt: new Date('2026-11-10T08:00:00.000Z').toISOString(), // 4h ago
        sentiment: 'NEGATIVE' as const,
        relevance: 1.0,
      },
    ];
    const staleNegative = [
      {
        id: 's1',
        headline: 'Queda de receita passada',
        source: 'News',
        publishedAt: new Date('2026-09-15T08:00:00.000Z').toISOString(), // 56 days ago
        sentiment: 'NEGATIVE' as const,
        relevance: 1.0,
      },
    ];

    const freshRes = calculateNewsScore(freshNegative, now);
    const staleRes = calculateNewsScore(staleNegative, now);

    // Stale negative news should have much less negative penalty (closer to 50 neutral)
    expect(freshRes.score).toBeLessThan(staleRes.score);
  });

  // 8. FII model vs Equity model
  it('8. FII model emphasizes P/VP and Income Quality (DY) while Equity model evaluates P/L & ROE', () => {
    const equityRes = EquityOpportunityScorer.score(baseEquity);
    const fiiRes = FiiOpportunityScorer.score(baseFii);

    expect(equityRes.components).toHaveProperty('valuation');
    expect(fiiRes.components).toHaveProperty('priceOpportunity'); // maps income quality
    expect(equityRes.score).toBeGreaterThan(0);
    expect(fiiRes.score).toBeGreaterThan(0);
  });

  // 9. Confidence scoring
  it('9. confidence reflects coverage of data dimensions (HIGH vs LOW)', () => {
    const highConf = calculateOpportunityConfidence(baseEquity);
    expect(highConf).toBe('HIGH');

    const lowDataAsset: OpportunityAssetInput = {
      assetId: '44444444-4444-4444-8444-444444444444',
      ticker: 'POOR3',
      name: 'Poucos Dados',
      assetType: 'STOCK',
      currency: 'BRL',
      quantity: '10',
      marketValue: '100',
      portfolioWeight: 0.5,
      classWeight: 2.0,
      currentPrice: '10.00',
      dailyChangePercent: null, // missing daily change
      // no history, no fundamentals, no news
    };
    const lowConf = calculateOpportunityConfidence(lowDataAsset);
    expect(['LOW', 'INSUFFICIENT_DATA']).toContain(lowConf);
  });

  // 10. Top 5 selection
  it('10. returns at most 5 items in top ranking', () => {
    const assets: OpportunityAssetInput[] = Array.from({ length: 12 }, (_, i) => ({
      ...baseEquity,
      assetId: `00000000-0000-4000-8000-0000000000${(i + 10).toString()}`,
      ticker: `TICK${i + 1}`,
      portfolioWeight: 2.0 + i * 0.5,
    }));

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets,
    });

    expect(result.items.length).toBe(5);
    expect(result.totalEligible).toBe(12);
    expect(result.totalRanked).toBe(5);
  });

  // 11. Menos de 5 quando ativos insuficientes
  it('11. returns fewer than 5 when eligible universe has fewer assets', () => {
    const assets = [baseEquity, baseFii];
    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets,
    });

    expect(result.items.length).toBe(2);
    expect(result.totalRanked).toBe(2);
  });

  // 12. Explainability synthesis provides positives and risks
  it('12. explainability generates 2-3 positives and 1-3 risks grounded in data', () => {
    const synthesis = generateExplainabilitySynthesis(
      baseEquity,
      {
        portfolioFit: 85,
        valuation: 80,
        momentum: 75,
        priceOpportunity: 70,
        news: 80,
        outlook: 70,
      },
      'HIGH',
      0,
    );

    expect(synthesis.positives.length).toBeGreaterThanOrEqual(2);
    expect(synthesis.positives.length).toBeLessThanOrEqual(3);
    expect(synthesis.risks.length).toBeGreaterThanOrEqual(1);
    expect(synthesis.risks.length).toBeLessThanOrEqual(3);
  });

  // 13. Model version is frozen to opportunity-v1
  it('13. engine output specifies modelVersion as opportunity-v1', () => {
    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [baseEquity],
    });
    expect(result.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(result.modelVersion).toBe('opportunity-v1');
    expect(result.disclaimer).toContain('Radar informativo');
  });

  // 14. Assets with missing price are excluded
  it('14. assets with missing or zero price are safely excluded from radar', () => {
    const unpricedAsset: OpportunityAssetInput = {
      ...baseEquity,
      ticker: 'UNPR3',
      currentPrice: '0',
    };
    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [baseEquity, unpricedAsset],
    });

    expect(result.items.some((it) => it.ticker === 'UNPR3')).toBe(false);
  });

  // 15. Concentration risk explicitly appears in risks when concentrated
  it('15. concentration risk appears in explainability risks when portfolio weight > 10%', () => {
    const concentratedEquity: OpportunityAssetInput = {
      ...baseEquity,
      portfolioWeight: 14.5,
    };
    const synthesis = generateExplainabilitySynthesis(
      concentratedEquity,
      {
        portfolioFit: 40,
        valuation: 70,
        momentum: 70,
        priceOpportunity: 60,
        news: 50,
        outlook: 60,
      },
      'HIGH',
      15,
    );

    const hasConcentrationRisk = synthesis.risks.some((r) => r.toLowerCase().includes('carteira'));
    expect(hasConcentrationRisk).toBe(true);
  });

  // 16. Tie-breaking by ticker is alphabetical
  it('16. tie-breaking with identical score and confidence resolves alphabetically by ticker', () => {
    const assetA: OpportunityAssetInput = {
      ...baseEquity,
      ticker: 'BBDC4',
    };
    const assetB: OpportunityAssetInput = {
      ...baseEquity,
      ticker: 'ABEV3',
    };

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [assetA, assetB],
    });

    expect(result.items[0].ticker).toBe('ABEV3');
    expect(result.items[1].ticker).toBe('BBDC4');
  });

  // 17. APP-16G: Quality floor gate excludes LOW confidence from items to lowConfidenceItems
  it('17. APP-16G: quality floor gate excludes LOW confidence assets from top items', () => {
    const lowConfAsset: OpportunityAssetInput = {
      assetId: '55555555-5555-5555-8555-555555555555',
      ticker: 'POOR3',
      name: 'Poucos Dados',
      assetType: 'STOCK',
      currency: 'BRL',
      quantity: '10',
      marketValue: '100',
      portfolioWeight: 0.2, // very low weight
      classWeight: 1.0,
      currentPrice: '10.00',
      dailyChangePercent: null,
      // no history, no fundamentals, no news
    };

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [baseEquity, baseFii, lowConfAsset],
    });

    // POOR3 should NOT be in primary items because confidence is LOW/INSUFFICIENT
    expect(result.items.some((it) => it.ticker === 'POOR3')).toBe(false);
    expect(result.items.length).toBe(2); // Top 2, not padded to 3!
    expect(result.lowConfidenceItems?.some((it) => it.ticker === 'POOR3')).toBe(true);
  });

  // 18. APP-16G: News deduplication and temporal decay
  it('18. APP-16G: news deduplication merges identical headlines', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    const duplicateNews = [
      {
        id: '1',
        headline: 'Petrobras anuncia dividendos extraordinários de R$ 10 bi - InfoMoney',
        source: 'InfoMoney',
        publishedAt: now.toISOString(),
        sentiment: 'POSITIVE' as const,
        relevance: 1.0,
      },
      {
        id: '2',
        headline: 'Petrobras anuncia dividendos extraordinários de R$ 10 bi - Money Times',
        source: 'Money Times',
        publishedAt: now.toISOString(),
        sentiment: 'POSITIVE' as const,
        relevance: 1.0,
      },
    ];

    const res = calculateNewsScore(duplicateNews, now);
    // Deduplication should result in 1 effective item
    expect(res.effectiveItemCount).toBe(1);
    expect(res.score).toBeGreaterThanOrEqual(75);
  });

  // 19. APP-16G: Missing news returns score null (UNKNOWN), never 50
  it('19. APP-16G: missing news returns score null (UNKNOWN), not fake 50', () => {
    const res = calculateNewsScore([]);
    expect(res.score).toBeNull();
    expect(res.effectiveItemCount).toBe(0);
  });

  // 20. APP-16G: Data provenance and overall coverage
  it('20. APP-16G: engine output includes data provenance and overall coverage percent', () => {
    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [baseEquity, baseFii],
    });

    expect(result.overallCoveragePercent).toBeGreaterThan(70);
    expect(result.items[0].dataProvenance).toBeDefined();
    expect(result.items[0].dataProvenance?.sources).toContain('B3');
    expect(result.items[0].dataProvenance?.sources).toContain('BRAPI');
  });
});
