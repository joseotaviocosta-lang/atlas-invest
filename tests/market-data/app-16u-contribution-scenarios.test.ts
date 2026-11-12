import { describe, it, expect } from 'vitest';
import {
  buildPortfolioDailyDecisionBrief,
  buildContributionAllocationSimulation,
  buildContributionScenarioComparison,
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

function makeDecisionPriorityItem(overrides: Partial<any> = {}): any {
  return {
    rank: overrides.rank ?? 1,
    assetId: overrides.assetId ?? '11111111-1111-4111-8111-111111111111',
    ticker: overrides.ticker ?? 'BBAS3',
    name: overrides.name ?? 'Banco do Brasil ON',
    assetType: overrides.assetType ?? 'STOCK',
    opportunityScore: overrides.opportunityScore ?? 80,
    confidence: overrides.confidence ?? 'HIGH',
    decisionTier: overrides.decisionTier ?? 'HIGH_PRIORITY',
    whyNow: overrides.whyNow ?? ['Tese sólida'],
    cautions: overrides.cautions ?? [],
    dataGaps: overrides.dataGaps ?? [],
    recentChanges: overrides.recentChanges ?? [],
    allocationContext: overrides.allocationContext,
    dividendContext: overrides.dividendContext,
    newsContext: overrides.newsContext ?? {
      headline: 'Notícia',
      source: 'Fonte',
      isOfficial: false,
    },
    readiness: overrides.readiness ?? {
      eligibleForHighPriority: true,
      tierCeiling: 'HIGH_PRIORITY',
      blockers: [],
      cautions: [],
      dataGaps: [],
    },
  };
}

function makeDecisionBriefWithItems(
  items: any[],
  portfolioId = '00000000-0000-4000-8000-000000000001',
  summary: string[] = ['Resumo'],
): any {
  return {
    portfolioId,
    asOf: '2026-11-12',
    generatedAt: '2026-11-12T12:00:00.000Z',
    modelVersion: OPPORTUNITY_MODEL_VERSION,
    comparisonBasis: 'INITIAL_BASELINE',
    summary,
    topPriorities: items,
    allEvaluatedCount: items.length,
    recentMaterialChanges: [],
    contributionContext: {
      plannedAmount: null,
      currency: 'BRL',
      source: 'NONE',
      simulationNote: null,
    },
    dataQuality: {
      label: 'BOA',
      sufficientCount: items.length,
      incompleteCount: 0,
      totalAssets: items.length,
      priceCoveragePercent: 100,
    },
  };
}

describe('APP-16U: Contribution Scenario Comparison Engine', () => {
  it('TEST BJ: BALANCED scenario strictly matches standard simulation output (Regression contract)', () => {
    const item1 = makeDecisionPriorityItem({
      rank: 1,
      ticker: 'BBAS3',
      opportunityScore: 85,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
    });
    const item2 = makeDecisionPriorityItem({
      rank: 2,
      ticker: 'ITSA4',
      opportunityScore: 78,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
    });
    const brief = makeDecisionBriefWithItems([item1, item2]);

    const standardSim = buildContributionAllocationSimulation({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '2000.00',
      decisionBrief: brief,
    });

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '2000.00',
      decisionBrief: brief,
    });

    const balancedScenario = comparison.scenarios.find((s) => s.id === 'BALANCED');
    expect(balancedScenario).toBeDefined();
    expect(balancedScenario?.allocatedCents).toBe(standardSim.allocatedCents);
    expect(balancedScenario?.unallocatedCents).toBe(standardSim.unallocatedCents);
    expect(balancedScenario?.allocations.length).toBe(standardSim.allocations.length);

    for (let i = 0; i < standardSim.allocations.length; i++) {
      expect(balancedScenario?.allocations[i]?.ticker).toBe(standardSim.allocations[i]?.ticker);
      expect(balancedScenario?.allocations[i]?.targetCents).toBe(standardSim.allocations[i]?.targetCents);
      expect(balancedScenario?.allocations[i]?.allocationPercent).toBe(standardSim.allocations[i]?.allocationPercent);
    }
  });

  it('TEST BK & BL: All 3 scenarios conserve exact total cents and respect concentration cap', () => {
    const item1 = makeDecisionPriorityItem({ rank: 1, ticker: 'BRAP4', opportunityScore: 90, confidence: 'HIGH' });
    const item2 = makeDecisionPriorityItem({ rank: 2, ticker: 'ITSA4', opportunityScore: 75, confidence: 'HIGH' });
    const item3 = makeDecisionPriorityItem({ rank: 3, ticker: 'MXRF11', opportunityScore: 68, confidence: 'HIGH' });
    const brief = makeDecisionBriefWithItems([item1, item2, item3]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '1500.00',
      decisionBrief: brief,
    });

    expect(comparison.scenarios.length).toBe(3);
    const maxAllowedCents = Math.floor(150000 * 0.5);

    for (const s of comparison.scenarios) {
      expect(s.totalCents).toBe(150000);
      expect(s.allocatedCents + s.unallocatedCents).toBe(150000);

      for (const alloc of s.allocations) {
        expect(alloc.targetCents).toBeLessThanOrEqual(maxAllowedCents);
      }
    }
  });

  it('TEST BM, BN & BO: Common eligibility floor excludes LOW, WATCH, and INSUFFICIENT_DATA in all 3 scenarios', () => {
    const itemGood = makeDecisionPriorityItem({ rank: 1, ticker: 'VALE3', opportunityScore: 82, confidence: 'HIGH' });
    const itemLow = makeDecisionPriorityItem({ rank: 2, ticker: 'PETR4', opportunityScore: 95, confidence: 'LOW' });
    const itemWatch = makeDecisionPriorityItem({ rank: 3, ticker: 'B3SA3', decisionTier: 'WATCH', confidence: 'HIGH' });
    const itemIncomplete = makeDecisionPriorityItem({ rank: 4, ticker: 'MGLU3', decisionTier: 'INSUFFICIENT_DATA' });
    const brief = makeDecisionBriefWithItems([itemGood, itemLow, itemWatch, itemIncomplete]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '1000.00',
      decisionBrief: brief,
    });

    for (const s of comparison.scenarios) {
      const tickers = s.allocations.map((a) => a.ticker);
      expect(tickers).toContain('VALE3');
      expect(tickers).not.toContain('PETR4');
      expect(tickers).not.toContain('B3SA3');
      expect(tickers).not.toContain('MGLU3');

      const excludedTickers = s.excludedAssets.map((e) => e.ticker);
      expect(excludedTickers).toContain('PETR4');
      expect(excludedTickers).toContain('B3SA3');
      expect(excludedTickers).toContain('MGLU3');
    }
  });

  it('TEST BP: CAUTIOUS scenario gives higher relative allocation to HIGH confidence vs MEDIUM', () => {
    // 3 assets so cap (50%) does not force 50/50:
    // A: HIGH confidence, score 75
    // B: MEDIUM confidence, score 75
    // C: HIGH confidence, score 60
    const itemHigh = makeDecisionPriorityItem({
      rank: 1,
      ticker: 'ASSET_HIGH',
      opportunityScore: 75,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
    });
    const itemMed = makeDecisionPriorityItem({
      rank: 2,
      ticker: 'ASSET_MED',
      opportunityScore: 75,
      confidence: 'MEDIUM',
      decisionTier: 'HIGH_PRIORITY',
    });
    const itemBase = makeDecisionPriorityItem({
      rank: 3,
      ticker: 'ASSET_BASE',
      opportunityScore: 60,
      confidence: 'HIGH',
      decisionTier: 'REVIEW',
    });
    const brief = makeDecisionBriefWithItems([itemHigh, itemMed, itemBase]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '3000.00',
      decisionBrief: brief,
    });

    const cautious = comparison.scenarios.find((s) => s.id === 'CAUTIOUS')!;
    const balanced = comparison.scenarios.find((s) => s.id === 'BALANCED')!;

    const cHigh = cautious.allocations.find((a) => a.ticker === 'ASSET_HIGH')!;
    const cMed = cautious.allocations.find((a) => a.ticker === 'ASSET_MED')!;
    const bHigh = balanced.allocations.find((a) => a.ticker === 'ASSET_HIGH')!;
    const bMed = balanced.allocations.find((a) => a.ticker === 'ASSET_MED')!;

    // Ratio of High to Med in CAUTIOUS should be strictly greater than in BALANCED
    const ratioCautious = cHigh.targetCents / cMed.targetCents;
    const ratioBalanced = bHigh.targetCents / bMed.targetCents;
    expect(ratioCautious).toBeGreaterThan(ratioBalanced);
  });

  it('TEST BQ: OPPORTUNITY_FOCUS gives higher relative weight to higher score', () => {
    // 3 assets so cap (50%) does not force equal split
    const item90 = makeDecisionPriorityItem({
      rank: 1,
      ticker: 'SCORE_90',
      opportunityScore: 90,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
    });
    const item70 = makeDecisionPriorityItem({
      rank: 2,
      ticker: 'SCORE_70',
      opportunityScore: 70,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
    });
    const item60 = makeDecisionPriorityItem({
      rank: 3,
      ticker: 'SCORE_60',
      opportunityScore: 60,
      confidence: 'HIGH',
      decisionTier: 'REVIEW',
    });
    const brief = makeDecisionBriefWithItems([item90, item70, item60]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '3000.00',
      decisionBrief: brief,
    });

    const opp = comparison.scenarios.find((s) => s.id === 'OPPORTUNITY_FOCUS')!;
    const bal = comparison.scenarios.find((s) => s.id === 'BALANCED')!;

    const opp90 = opp.allocations.find((a) => a.ticker === 'SCORE_90')!;
    const opp70 = opp.allocations.find((a) => a.ticker === 'SCORE_70')!;
    const bal90 = bal.allocations.find((a) => a.ticker === 'SCORE_90')!;
    const bal70 = bal.allocations.find((a) => a.ticker === 'SCORE_70')!;

    const ratioOpp = opp90.targetCents / opp70.targetCents;
    const ratioBal = bal90.targetCents / bal70.targetCents;
    expect(ratioOpp).toBeGreaterThan(ratioBal);
  });

  it('TEST BR: Allocation gap deficit increases weight in gap-aware scenarios', () => {
    // 3 assets so cap does not force 50/50
    const itemWithGap = makeDecisionPriorityItem({
      rank: 1,
      ticker: 'GAP_ASSET',
      opportunityScore: 75,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
      allocationContext: { gapPercent: 4.5 },
    });
    const itemNoGap = makeDecisionPriorityItem({
      rank: 2,
      ticker: 'NOGAP_ASSET',
      opportunityScore: 75,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
      allocationContext: { gapPercent: 0 },
    });
    const itemThird = makeDecisionPriorityItem({
      rank: 3,
      ticker: 'THIRD_ASSET',
      opportunityScore: 65,
      confidence: 'HIGH',
      decisionTier: 'REVIEW',
    });
    const brief = makeDecisionBriefWithItems([itemWithGap, itemNoGap, itemThird]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '3000.00',
      decisionBrief: brief,
    });

    const bal = comparison.scenarios.find((s) => s.id === 'BALANCED')!;
    const allocGap = bal.allocations.find((a) => a.ticker === 'GAP_ASSET')!;
    const allocNoGap = bal.allocations.find((a) => a.ticker === 'NOGAP_ASSET')!;

    expect(allocGap.targetCents).toBeGreaterThan(allocNoGap.targetCents);
  });

  it('TEST BS: CAUTIOUS penalizes stale quote without modifying raw Opportunity Score', () => {
    // 3 assets
    const freshItem = makeDecisionPriorityItem({
      rank: 1,
      ticker: 'FRESH1',
      opportunityScore: 75,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
    });
    const staleItem = makeDecisionPriorityItem({
      rank: 2,
      ticker: 'STALE1',
      opportunityScore: 75,
      confidence: 'HIGH',
      decisionTier: 'HIGH_PRIORITY',
      cautions: ['Cotação desatualizada há 3 dias.'],
    });
    const thirdItem = makeDecisionPriorityItem({
      rank: 3,
      ticker: 'THIRD1',
      opportunityScore: 65,
      confidence: 'HIGH',
      decisionTier: 'REVIEW',
    });
    const radarFresh = makeRadarItem({ ticker: 'FRESH1', dataFreshness: 'FRESH' });
    const radarStale = makeRadarItem({ ticker: 'STALE1', dataFreshness: 'STALE' });
    const radarThird = makeRadarItem({ ticker: 'THIRD1', dataFreshness: 'FRESH' });

    const brief = makeDecisionBriefWithItems([freshItem, staleItem, thirdItem]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '3000.00',
      decisionBrief: brief,
      radarItems: [radarFresh, radarStale, radarThird],
    });

    const cautious = comparison.scenarios.find((s) => s.id === 'CAUTIOUS')!;
    const cFresh = cautious.allocations.find((a) => a.ticker === 'FRESH1')!;
    const cStale = cautious.allocations.find((a) => a.ticker === 'STALE1')!;

    // Fresh should get higher allocation than stale in CAUTIOUS
    expect(cFresh.targetCents).toBeGreaterThan(cStale.targetCents);
    // Raw Opportunity Score remains intact at 75
    expect(cFresh.opportunityScore).toBe(75);
    expect(cStale.opportunityScore).toBe(75);
  });

  it('TEST BT: Stale quote sets estimatedUnits to null in all 3 scenarios', () => {
    const item = makeDecisionPriorityItem({
      rank: 1,
      ticker: 'STALE_QUOTE',
      opportunityScore: 85,
      confidence: 'HIGH',
    });
    const radar = makeRadarItem({
      ticker: 'STALE_QUOTE',
      dataFreshness: 'STALE',
      currentPrice: '30.00',
    });
    const brief = makeDecisionBriefWithItems([item]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '1000.00',
      decisionBrief: brief,
      radarItems: [radar],
    });

    for (const s of comparison.scenarios) {
      expect(s.allocations[0]?.estimatedUnits).toBeNull();
    }
  });

  it('TEST BU: Odd cents (R$ 333,33 = 33333 cents) conserved exactly across all 3 scenarios', () => {
    const item1 = makeDecisionPriorityItem({ rank: 1, ticker: 'ASSET1', opportunityScore: 85, confidence: 'HIGH' });
    const item2 = makeDecisionPriorityItem({ rank: 2, ticker: 'ASSET2', opportunityScore: 75, confidence: 'HIGH' });
    const brief = makeDecisionBriefWithItems([item1, item2]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '333.33',
      decisionBrief: brief,
    });

    for (const s of comparison.scenarios) {
      expect(s.totalCents).toBe(33333);
      expect(s.allocatedCents + s.unallocatedCents).toBe(33333);
    }
  });

  it('TEST BV: Single eligible asset allocates 100% with concentration warning across all 3 scenarios', () => {
    const item = makeDecisionPriorityItem({
      rank: 1,
      ticker: 'ONLY_ONE',
      opportunityScore: 82,
      confidence: 'HIGH',
    });
    const brief = makeDecisionBriefWithItems([item]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '1000.00',
      decisionBrief: brief,
    });

    for (const s of comparison.scenarios) {
      expect(s.allocatedCents).toBe(100000);
      expect(s.unallocatedCents).toBe(0);
      expect(s.allocations.length).toBe(1);
      expect(s.allocations[0]?.allocationPercent).toBe(100);
      expect(s.warnings.some((w) => w.includes('apenas um ativo'))).toBe(true);
    }
  });

  it('TEST BW: Zero eligible assets results in allocated = 0 and unallocated = total', () => {
    const itemWatch = makeDecisionPriorityItem({ rank: 1, ticker: 'W1', decisionTier: 'WATCH' });
    const brief = makeDecisionBriefWithItems([itemWatch]);

    const comparison = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '1000.00',
      decisionBrief: brief,
    });

    for (const s of comparison.scenarios) {
      expect(s.allocatedCents).toBe(0);
      expect(s.unallocatedCents).toBe(100000);
      expect(s.allocations.length).toBe(0);
    }
    expect(comparison.comparisonInsights[0]).toContain('Nenhum ativo atingiu os critérios');
  });

  it('TEST BX: Determinism across 100 runs', () => {
    const item1 = makeDecisionPriorityItem({ rank: 1, ticker: 'BRAP4', opportunityScore: 88, confidence: 'HIGH' });
    const item2 = makeDecisionPriorityItem({ rank: 2, ticker: 'ITSA4', opportunityScore: 78, confidence: 'HIGH' });
    const item3 = makeDecisionPriorityItem({ rank: 3, ticker: 'MXRF11', opportunityScore: 72, confidence: 'HIGH' });
    const brief = makeDecisionBriefWithItems([item1, item2, item3]);

    const baseline = JSON.stringify(
      buildContributionScenarioComparison({
        portfolioId: '00000000-0000-4000-8000-000000000001',
        contributionAmount: '2000.00',
        decisionBrief: brief,
      }),
    );

    for (let i = 0; i < 100; i++) {
      const run = JSON.stringify(
        buildContributionScenarioComparison({
          portfolioId: '00000000-0000-4000-8000-000000000001',
          contributionAmount: '2000.00',
          decisionBrief: brief,
        }),
      );
      expect(run).toBe(baseline);
    }
  });

  it('TEST BY & BZ: Comparison insights are derived and indicate identical distribution when appropriate', () => {
    // Single asset: all 3 scenarios give 100% to the single asset
    const item = makeDecisionPriorityItem({ rank: 1, ticker: 'SINGLE', opportunityScore: 80, confidence: 'HIGH' });
    const briefSingle = makeDecisionBriefWithItems([item]);

    const compSingle = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '1000.00',
      decisionBrief: briefSingle,
    });

    expect(compSingle.comparisonInsights).toContain(
      'Os três cenários resultaram na mesma distribuição com os dados atuais.',
    );

    // Multi-asset with differences (3 assets so not capped at 50/50): insights mention spread or specific preferences
    const item1 = makeDecisionPriorityItem({ rank: 1, ticker: 'BBAS3', opportunityScore: 92, confidence: 'HIGH', decisionTier: 'HIGH_PRIORITY' });
    const item2 = makeDecisionPriorityItem({ rank: 2, ticker: 'ITSA4', opportunityScore: 75, confidence: 'MEDIUM', decisionTier: 'HIGH_PRIORITY' });
    const item3 = makeDecisionPriorityItem({ rank: 3, ticker: 'WEGE3', opportunityScore: 65, confidence: 'HIGH', decisionTier: 'REVIEW' });
    const briefMulti = makeDecisionBriefWithItems([item1, item2, item3]);

    const compMulti = buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '3000.00',
      decisionBrief: briefMulti,
    });

    expect(compMulti.comparisonInsights.length).toBeGreaterThan(0);
    expect(compMulti.comparisonInsights.some((i) => i.includes('BBAS3') || i.includes('ITSA4') || i.includes('WEGE3'))).toBe(true);
  });

  it('TEST CL: Derivation latency is strictly under 50ms for 3 scenarios', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeDecisionPriorityItem({
        rank: i + 1,
        ticker: `TK${i.toString().padStart(2, '0')}`,
        opportunityScore: 60 + (i % 35),
        confidence: i % 2 === 0 ? 'HIGH' : 'MEDIUM',
        decisionTier: i % 3 === 0 ? 'HIGH_PRIORITY' : 'REVIEW',
      }),
    );
    const brief = makeDecisionBriefWithItems(items);

    const start = performance.now();
    buildContributionScenarioComparison({
      portfolioId: '00000000-0000-4000-8000-000000000001',
      contributionAmount: '50000.00',
      decisionBrief: brief,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
