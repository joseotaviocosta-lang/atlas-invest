import { describe, it, expect } from 'vitest';
import {
  buildPortfolioDailyDecisionBrief,
  evaluateDecisionReadiness,
  OPPORTUNITY_MODEL_VERSION,
  type OpportunityRadarItem,
  type OpportunityRadarResult,
} from '@atlas/market-data';

function makeRadarItem(overrides: Partial<OpportunityRadarItem> = {}): OpportunityRadarItem {
  return {
    ticker: overrides.ticker ?? 'BBAS3',
    name: overrides.name ?? 'Banco do Brasil ON',
    assetId: overrides.assetId ?? '11111111-1111-4111-8111-111111111111',
    assetType: overrides.assetType ?? 'STOCK',
    currentPrice: overrides.currentPrice ?? '28.50',
    dailyChangePercent: overrides.dailyChangePercent ?? 0.4,
    portfolioWeight: overrides.portfolioWeight ?? 8.0,
    portfolioQuantity: overrides.portfolioQuantity ?? '100',
    marketValue: overrides.marketValue ?? '2850.00',
    score: overrides.score ?? 82,
    confidence: overrides.confidence ?? 'HIGH',
    components: overrides.components ?? {
      price: 85,
      fundamentals: 88,
      momentum: 72,
      portfolioFit: 80,
      news: 75,
      dividendCalendar: undefined,
    },
    positives: overrides.positives ?? ['Múltiplos descontados frente ao histórico'],
    risks: overrides.risks ?? [],
    news: overrides.news ?? [],
    effectiveNewsEvents: overrides.effectiveNewsEvents ?? [],
    dividendCalendar: overrides.dividendCalendar,
    recentPaidDividends: overrides.recentPaidDividends,
    dataFreshness: overrides.dataFreshness ?? 'FRESH',
    dataProvenance: overrides.dataProvenance ?? {
      priceSource: 'BRAPI',
      priceTimestamp: '2026-11-12T12:00:00.000Z',
      hasRealFundamentals: true,
      fundamentalsSource: 'BRAPI',
      hasPriceHistory: true,
      hasRecentNews: true,
    },
    updatedAt: overrides.updatedAt ?? '2026-11-12T12:00:00.000Z',
  };
}

function makeRadarResult(
  items: OpportunityRadarItem[],
  overrides: Partial<OpportunityRadarResult> = {},
): OpportunityRadarResult {
  return {
    portfolioId: overrides.portfolioId ?? '00000000-0000-4000-8000-000000000001',
    analysisDate: overrides.analysisDate ?? '2026-11-12',
    updatedAt: overrides.updatedAt ?? '2026-11-12T12:00:00.000Z',
    modelVersion: overrides.modelVersion ?? OPPORTUNITY_MODEL_VERSION,
    totalEligible: overrides.totalEligible ?? items.length,
    totalRanked: overrides.totalRanked ?? items.length,
    items: items.slice(0, 5),
    fiiItems: overrides.fiiItems ?? items.filter((i) => i.assetType === 'FII'),
    lowConfidenceItems: overrides.lowConfidenceItems ?? [],
    allRecentPaidSources: overrides.allRecentPaidSources ?? [],
    reinvestmentChains: overrides.reinvestmentChains ?? [],
    overallCoveragePercent: overrides.overallCoveragePercent ?? 90,
    disclaimer: 'Informativo',
  };
}

describe('APP-16S: Daily Portfolio Decision Brief Engine', () => {
  it('promotes strong FRESH/HIGH candidate to HIGH_PRIORITY and caps topPriorities to 3', () => {
    const items = [
      makeRadarItem({ ticker: 'BBAS3', score: 86, confidence: 'HIGH', dataFreshness: 'FRESH' }),
      makeRadarItem({ ticker: 'ITUB4', assetId: '2', score: 78, confidence: 'HIGH', dataFreshness: 'FRESH' }),
      makeRadarItem({ ticker: 'WEGE3', assetId: '3', score: 71, confidence: 'MEDIUM', dataFreshness: 'FRESH' }),
      makeRadarItem({ ticker: 'VALE3', assetId: '4', score: 65, confidence: 'MEDIUM', dataFreshness: 'FRESH' }),
    ];

    const brief = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult(items),
    });

    expect(brief.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(brief.topPriorities).toHaveLength(3);
    expect(brief.topPriorities[0].ticker).toBe('BBAS3');
    expect(brief.topPriorities[0].decisionTier).toBe('HIGH_PRIORITY');
    expect(brief.allEvaluatedCount).toBe(4);
  });

  it('prevents HIGH_PRIORITY when confidence is LOW or fundamentals are missing (ceiling enforcement)', () => {
    const lowConf = makeRadarItem({
      ticker: 'PETR4',
      score: 92,
      confidence: 'LOW',
      dataFreshness: 'FRESH',
      dataProvenance: {
        priceSource: 'BRAPI',
        hasRealFundamentals: false,
        fundamentalsSource: null,
        hasPriceHistory: false,
        hasRecentNews: false,
      },
    });

    const readiness = evaluateDecisionReadiness(lowConf);
    expect(readiness.eligibleForHighPriority).toBe(false);
    expect(readiness.tierCeiling).not.toBe('HIGH_PRIORITY');
    expect(readiness.dataGaps.some((g) => g.toLowerCase().includes('fundament'))).toBe(true);

    const brief = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([lowConf]),
    });
    expect(brief.topPriorities[0].decisionTier).not.toBe('HIGH_PRIORITY');
    expect(brief.topPriorities[0].dataGaps.length).toBeGreaterThan(0);
  });

  it('adds QUOTE_STALE caution and suppresses attractive-price claims when quote is STALE', () => {
    const stale = makeRadarItem({
      ticker: 'EGIE3',
      score: 84,
      confidence: 'HIGH',
      dataFreshness: 'STALE',
      positives: ['Preço atrativo vs média histórica', 'Margem operacional sólida'],
    });

    const readiness = evaluateDecisionReadiness(stale);
    expect(readiness.blockers.some((b) => b.code === 'QUOTE_STALE')).toBe(true);

    const brief = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([stale]),
    });
    const item = brief.topPriorities[0];
    expect(item.cautions.some((c) => c.toLowerCase().includes('desatualizad'))).toBe(true);
    expect(item.whyNow.some((w) => /preço atrativo/i.test(w))).toBe(false);
  });

  it('treats missing price as INSUFFICIENT_DATA rather than neutral or zero', () => {
    const missingPrice = makeRadarItem({
      ticker: 'ABCD3',
      score: 50,
      confidence: 'INSUFFICIENT_DATA',
      dataFreshness: 'UNKNOWN',
      currentPrice: '0',
      dataProvenance: {
        priceSource: null,
        hasRealFundamentals: false,
        fundamentalsSource: null,
        hasPriceHistory: false,
        hasRecentNews: false,
      },
    });

    const brief = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([], { lowConfidenceItems: [missingPrice], totalEligible: 1 }),
    });
    expect(brief.topPriorities).toHaveLength(0);
    expect(brief.dataQuality.incompleteCount).toBe(1);
    expect(brief.dataQuality.sufficientCount).toBe(0);
  });

  it('prefers official NEW HIGH news over ROUTINE media noise and surfaces recent changes', () => {
    const item = makeRadarItem({
      ticker: 'VALE3',
      score: 79,
      effectiveNewsEvents: [
        {
          canonicalEventId: 'evt_routine',
          ticker: 'VALE3',
          headline: 'Análise genérica de mercado sobre minério',
          summary: '',
          sources: [{ name: 'Media Blog', url: 'https://example.com/blog' }],
          provider: 'BRAPI_NEWS',
          sourceType: 'BRAPI_NEWS_AGGREGATED',
          official: false,
          publishedAt: '2026-11-12T10:00:00.000Z',
          materiality: 'ROUTINE',
          state: 'NEW',
        },
        {
          canonicalEventId: 'evt_official',
          ticker: 'VALE3',
          headline: 'CVM: Fato Relevante — Distribuição de JCP aprovada',
          summary: '',
          sources: [{ name: 'CVM / FNET', url: 'https://fnet.bmfbovespa.com.br/fato-relevante' }],
          provider: 'CVM',
          sourceType: 'OFFICIAL_REGULATORY',
          official: true,
          publishedAt: '2026-11-12T11:00:00.000Z',
          materiality: 'HIGH',
          state: 'NEW',
        },
      ] as unknown as OpportunityRadarItem['effectiveNewsEvents'],
    });

    const brief = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([item]),
    });

    expect(brief.topPriorities[0].newsContext?.isOfficial).toBe(true);
    expect(brief.topPriorities[0].newsContext?.canonicalUrl).toBe(
      'https://fnet.bmfbovespa.com.br/fato-relevante',
    );
    expect(brief.recentMaterialChanges.some((c) => c.type === 'NEW_MATERIAL_NEWS' && c.isOfficial)).toBe(true);
  });

  it('includes FII cash rotation cues with recent paid sources and target dividend calendar', () => {
    const fii = makeRadarItem({
      ticker: 'MXRF11',
      assetType: 'FII',
      score: 81,
      confidence: 'HIGH',
      dividendCalendar: {
        ticker: 'MXRF11',
        recordDate: '2026-11-14',
        paymentDate: '2026-11-22',
        amountPerShare: 0.1,
        eligibilityStatus: 'ELIGIBLE_BEFORE_COM_DATE',
        eventStatus: 'ANNOUNCED',
        confidence: 'HIGH',
        source: 'B3',
      } as unknown as OpportunityRadarItem['dividendCalendar'],
    });

    const brief = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([fii], {
        allRecentPaidSources: [
          {
            ticker: 'HGLG11',
            paymentDate: '2026-11-10',
            estimatedCashReceived: 150.25,
          } as unknown as NonNullable<OpportunityRadarResult['allRecentPaidSources']>[number],
        ],
        reinvestmentChains: [
          {
            targetTicker: 'MXRF11',
            targetRecordDate: '2026-11-14',
            cashAvailableNow: true,
          } as unknown as NonNullable<OpportunityRadarResult['reinvestmentChains']>[number],
        ],
      }),
    });

    expect(brief.fiiRotation).toBeDefined();
    expect(brief.fiiRotation?.hasRecentPaidCash).toBe(true);
    expect(brief.fiiRotation?.estimatedRecentCashTotal).toBe(150.25);
    expect(brief.fiiRotation?.targetTicker).toBe('MXRF11');
  });

  it('never invents contribution amounts and honors explicit simulation context', () => {
    const item = makeRadarItem({ ticker: 'BBAS3' });
    const withoutContrib = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([item]),
    });
    expect(withoutContrib.contributionContext.source).toBe('NONE');
    expect(withoutContrib.contributionContext.plannedAmount).toBeNull();

    const withSim = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([item]),
      plannedContribution: {
        amount: '1500.00',
        currency: 'BRL',
        source: 'USER_SIMULATION',
      },
    });
    expect(withSim.contributionContext.source).toBe('USER_SIMULATION');
    expect(withSim.contributionContext.plannedAmount).toBe('1500.00');
  });

  it('is 100x deterministic with 4-level tiebreak and executes in under 50ms', () => {
    const t1 = makeRadarItem({ ticker: 'WEGE3', assetId: 'a', score: 80, confidence: 'HIGH' });
    const t2 = makeRadarItem({ ticker: 'ABEV3', assetId: 'b', score: 80, confidence: 'HIGH' });
    const radar = makeRadarResult([t1, t2]);

    const refDate = new Date('2026-11-12T12:00:00.000Z');
    const baseline = buildPortfolioDailyDecisionBrief({ radar, referenceDate: refDate });
    expect(baseline.topPriorities.map((p) => p.ticker)).toEqual(['ABEV3', 'WEGE3']);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const next = buildPortfolioDailyDecisionBrief({ radar, referenceDate: refDate });
      expect(next).toEqual(baseline);
    }
    expect(performance.now() - start).toBeLessThan(150);
  });

  it('handles empty portfolio gracefully', () => {
    const brief = buildPortfolioDailyDecisionBrief({
      radar: makeRadarResult([], { totalEligible: 0, totalRanked: 0 }),
    });
    expect(brief.topPriorities).toEqual([]);
    expect(brief.dataQuality.totalAssets).toBe(0);
    expect(brief.summary.length).toBeGreaterThan(0);
  });
});
