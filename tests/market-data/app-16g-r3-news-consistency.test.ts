import { describe, it, expect } from 'vitest';
import {
  OpportunityAssetInput,
  OpportunityRadarEngine,
  calculateNewsScore,
  filterEffectiveNews,
  getNewsTimeWeight,
  NEWS_TEMPORAL_POLICY,
  assessOpportunityConfidence,
} from '../../packages/market-data/src/opportunity-radar';

describe('PROJECT ATLAS — APP-16G-R3: News Scoring & Display Consistency', () => {
  const referenceDate = new Date('2026-11-10T12:00:00.000Z');

  // PARTE B & L: FESA4 Reproduction Case (> 90 days)
  it('1. FESA4 reproduction: news from 2026-06-12 on 2026-11-10 (>150 days) is strictly excluded', () => {
    const fesaNews = [
      {
        id: 'fesa-old-1',
        headline: 'Ferbasa aprova pagamento de juros sobre capital próprio no 2T26',
        source: 'InfoMoney',
        publishedAt: '2026-06-12T10:00:00.000Z',
        sentiment: 'POSITIVE' as const,
        relevance: 1.0,
      },
    ];

    const weight = getNewsTimeWeight(fesaNews[0].publishedAt, referenceDate);
    expect(weight).toBe(0.0);

    const effective = filterEffectiveNews(fesaNews, referenceDate);
    expect(effective).toHaveLength(0);

    const res = calculateNewsScore(fesaNews, referenceDate);
    expect(res.score).toBeNull();
    expect(res.effectiveItemCount).toBe(0);
  });

  // PARTE M: Mixed Age Case with Canonical Temporal Policy
  it('2. mixed age case: applies canonical weights for 1d, 6d, 25d, 75d, and excludes 151d', () => {
    // 1 day ago: 24h <= 48h -> 1.0
    const d1 = new Date('2026-11-09T12:00:00.000Z');
    // 6 days ago: 144h <= 168h -> 0.8
    const d6 = new Date('2026-11-04T12:00:00.000Z');
    // 25 days ago: 600h <= 720h -> 0.5
    const d25 = new Date('2026-10-16T12:00:00.000Z');
    // 75 days ago: 1800h <= 2160h -> 0.2
    const d75 = new Date('2026-08-27T12:00:00.000Z');
    // 151 days ago: 3624h > 2160h -> 0.0 (excluded)
    const d151 = new Date('2026-06-12T12:00:00.000Z');

    expect(getNewsTimeWeight(d1, referenceDate)).toBe(NEWS_TEMPORAL_POLICY.WEIGHT_0_TO_2_DAYS); // 1.0
    expect(getNewsTimeWeight(d6, referenceDate)).toBe(NEWS_TEMPORAL_POLICY.WEIGHT_3_TO_7_DAYS); // 0.8
    expect(getNewsTimeWeight(d25, referenceDate)).toBe(NEWS_TEMPORAL_POLICY.WEIGHT_8_TO_30_DAYS); // 0.5
    expect(getNewsTimeWeight(d75, referenceDate)).toBe(NEWS_TEMPORAL_POLICY.WEIGHT_31_TO_90_DAYS); // 0.2
    expect(getNewsTimeWeight(d151, referenceDate)).toBe(0.0);

    const mixedNews = [
      { id: '1', headline: 'Notícia de ontem', source: 'A', publishedAt: d1.toISOString(), sentiment: 'POSITIVE' as const, relevance: 1.0 },
      { id: '2', headline: 'Notícia de 6 dias', source: 'B', publishedAt: d6.toISOString(), sentiment: 'POSITIVE' as const, relevance: 1.0 },
      { id: '3', headline: 'Notícia de 25 dias', source: 'C', publishedAt: d25.toISOString(), sentiment: 'POSITIVE' as const, relevance: 1.0 },
      { id: '4', headline: 'Notícia de 75 dias', source: 'D', publishedAt: d75.toISOString(), sentiment: 'POSITIVE' as const, relevance: 1.0 },
      { id: '5', headline: 'Notícia de 151 dias expirada', source: 'E', publishedAt: d151.toISOString(), sentiment: 'POSITIVE' as const, relevance: 1.0 },
    ];

    const effective = filterEffectiveNews(mixedNews, referenceDate);
    expect(effective).toHaveLength(4);
    expect(effective.map((n) => n.id)).toEqual(['1', '2', '3', '4']);
    expect(effective.some((n) => n.id === '5')).toBe(false);

    const scoreRes = calculateNewsScore(mixedNews, referenceDate);
    expect(scoreRes.score).not.toBeNull();
    expect(scoreRes.effectiveItemCount).toBe(4);
  });

  // PARTE N: Expired news does NOT increase Confidence or Coverage
  it('3. expired news does NOT increase confidence, coverage, or inject news provenance', () => {
    const expiredAsset: OpportunityAssetInput = {
      assetId: '11111111-1111-4111-8111-111111111111',
      ticker: 'FESA4',
      name: 'Ferbasa PN',
      assetType: 'STOCK',
      currency: 'BRL',
      quantity: '100',
      marketValue: '1000',
      portfolioWeight: 2.0,
      classWeight: 2.0,
      currentPrice: '10.00',
      dailyChangePercent: 0.5,
      // No 21d history or real fundamentals to isolate news impact
      recentNews: [
        {
          id: 'exp1',
          headline: 'Notícia antiga expirada de 2026-06-12',
          source: 'InfoMoney',
          publishedAt: '2026-06-12T10:00:00.000Z',
          sentiment: 'POSITIVE',
          relevance: 1.0,
        },
      ],
    };

    const assessedWithExpired = assessOpportunityConfidence(expiredAsset, referenceDate);
    // News dimension should NOT be verified
    expect(assessedWithExpired.provenance.hasVerifiedNews).toBe(false);
    expect(assessedWithExpired.provenance.sources).not.toContain('Google News RSS (Agregador)');
    expect(assessedWithExpired.provenance.sources).not.toContain('InfoMoney');

    // Fresh asset with identical structure but recent news
    const freshAsset: OpportunityAssetInput = {
      ...expiredAsset,
      recentNews: [
        {
          id: 'fresh1',
          headline: 'Notícia recente fresca de hoje',
          source: 'InfoMoney',
          publishedAt: '2026-11-10T08:00:00.000Z',
          sentiment: 'POSITIVE',
          relevance: 1.0,
        },
      ],
    };

    const assessedWithFresh = assessOpportunityConfidence(freshAsset, referenceDate);
    expect(assessedWithFresh.provenance.hasVerifiedNews).toBe(true);
    expect(assessedWithFresh.provenance.sources).toContain('Google News RSS (Agregador)');
    expect(assessedWithFresh.provenance.sources).toContain('InfoMoney');
    expect(assessedWithFresh.provenance.coveragePercent).toBeGreaterThan(
      assessedWithExpired.provenance.coveragePercent,
    );
  });

  // PARTE D & E: OpportunityRadarEngine emits ONLY effectiveNews in item.news
  it('4. OpportunityRadarEngine: item.news contains strictly effective news <= 90 days', () => {
    const asset: OpportunityAssetInput = {
      assetId: '11111111-1111-4111-8111-111111111111',
      ticker: 'FESA4',
      name: 'Ferbasa PN',
      assetType: 'STOCK',
      currency: 'BRL',
      quantity: '100',
      marketValue: '1000',
      portfolioWeight: 2.0,
      classWeight: 2.0,
      currentPrice: '10.00',
      dailyChangePercent: 0.5,
      change21dPercent: 1.5,
      priceEarnings: 6.0,
      priceToBook: 0.9,
      recentNews: [
        {
          id: 'fesa-stale-1',
          headline: 'Ferbasa fato relevante antigo de junho',
          source: 'Valor',
          publishedAt: '2026-06-12T10:00:00.000Z', // 151 days ago -> EXCLUDED
          sentiment: 'POSITIVE',
          relevance: 1.0,
        },
      ],
    };

    const result = OpportunityRadarEngine.evaluate({
      portfolioId: 'p-1',
      assets: [asset],
      referenceDate,
      maxResults: 5,
    });

    const evaluated = result.items[0] ?? result.lowConfidenceItems?.[0];
    expect(evaluated).toBeDefined();
    expect(evaluated.ticker).toBe('FESA4');

    // Score for news must be null
    expect(evaluated.components.news).toBeNull();

    // news collection in result MUST be empty (effectiveNews = 0)
    expect(evaluated.news).toHaveLength(0);
  });

  // PARTE I: Determinism with referenceDate
  it('5. deterministic replay: same referenceDate produces 100% identical effectiveNews and scores', () => {
    const asset: OpportunityAssetInput = {
      assetId: '22222222-2222-4222-8222-222222222222',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      assetType: 'STOCK',
      currency: 'BRL',
      quantity: '200',
      marketValue: '7000',
      portfolioWeight: 8.0,
      classWeight: 8.0,
      currentPrice: '35.00',
      dailyChangePercent: -0.5,
      change21dPercent: 3.2,
      priceEarnings: 4.0,
      dividendYield: 14.5,
      recentNews: [
        {
          id: 'petr-1',
          headline: 'Petrobras assina contrato de fornecimento de gás natural',
          source: 'InfoMoney',
          publishedAt: '2026-11-08T14:00:00.000Z', // 2 days ago -> 1.0 weight
          sentiment: 'POSITIVE',
          relevance: 1.0,
        },
      ],
    };

    const run1 = OpportunityRadarEngine.evaluate({
      portfolioId: 'p-det',
      assets: [asset],
      referenceDate,
      maxResults: 5,
    });

    const run2 = OpportunityRadarEngine.evaluate({
      portfolioId: 'p-det',
      assets: [asset],
      referenceDate,
      maxResults: 5,
    });

    expect(run1.items[0].score).toBe(run2.items[0].score);
    expect(run1.items[0].components.news).toBe(run2.items[0].components.news);
    expect(run1.items[0].news).toEqual(run2.items[0].news);
    expect(run1.items[0].components.news).toBeGreaterThan(50);
  });
});
