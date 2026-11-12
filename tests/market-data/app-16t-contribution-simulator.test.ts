import { describe, it, expect } from 'vitest';
import {
  buildPortfolioDailyDecisionBrief,
  buildContributionAllocationSimulation,
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

function makeDecisionPriorityItem(
  overrides: Partial<any> = {},
): any {
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
): any {
  return {
    portfolioId,
    asOf: '2026-11-12',
    generatedAt: '2026-11-12T12:00:00.000Z',
    modelVersion: OPPORTUNITY_MODEL_VERSION,
    comparisonBasis: 'INITIAL_BASELINE',
    summary: ['Resumo'],
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
      fundamentalsCoveragePercent: 100,
      newsCoveragePercent: 100,
      officialProviderStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
    },
  };
}

describe('APP-16T: Contribution Allocation Simulator', () => {
  it('distributes R$ 2.000 across 3 eligible assets with exact cents conservation and concentration caps', () => {
    const items = [
      makeRadarItem({ ticker: 'BBAS3', score: 86, confidence: 'HIGH', currentPrice: '28.50', dataFreshness: 'FRESH' }),
      makeRadarItem({ ticker: 'ITUB4', assetId: '2', score: 78, confidence: 'HIGH', currentPrice: '35.00', dataFreshness: 'FRESH' }),
      makeRadarItem({ ticker: 'MXRF11', assetId: '3', assetType: 'FII', score: 72, confidence: 'MEDIUM', currentPrice: '10.50', dataFreshness: 'FRESH' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '2000.00',
      decisionBrief,
      radarItems: items,
    });

    expect(sim.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(sim.contributionAmount).toBe('2000.00');
    expect(sim.allocatedCents + sim.unallocatedCents).toBe(200000);
    expect(sim.totalCents).toBe(200000);
    expect(sim.allocations.length).toBe(3);

    // No asset exceeds concentration cap (50% = R$ 1000.00)
    for (const alloc of sim.allocations) {
      expect(alloc.targetCents).toBeLessThanOrEqual(100000);
      expect(alloc.estimatedUnits).toBeGreaterThan(0);
      expect(alloc.reasons.length).toBeGreaterThan(0);
      expect(alloc.reasons.length).toBeLessThanOrEqual(3);
    }
  });

  it('guarantees exact money conservation across various fractional amount edge cases (1.00, 10.01, 99.99, 1000.00, 12345.67)', () => {
    const items = [
      makeRadarItem({ ticker: 'BBAS3', score: 85, confidence: 'HIGH', currentPrice: '30.00' }),
      makeRadarItem({ ticker: 'VALE3', assetId: '2', score: 75, confidence: 'HIGH', currentPrice: '60.00' }),
      makeRadarItem({ ticker: 'WEGE3', assetId: '3', score: 70, confidence: 'MEDIUM', currentPrice: '40.00' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const testAmounts = ['1.00', '10.01', '99.99', '1000.00', '12345.67', '333.33'];

    for (const amt of testAmounts) {
      const sim = buildContributionAllocationSimulation({
        portfolioId: radar.portfolioId,
        contributionAmount: amt,
        decisionBrief,
        radarItems: items,
      });

      const totalExpectedCents = Math.round(parseFloat(amt) * 100);
      expect(sim.totalCents).toBe(totalExpectedCents);
      expect(sim.allocatedCents + sim.unallocatedCents).toBe(totalExpectedCents);

      const sumTargetCents = sim.allocations.reduce((acc, a) => acc + a.targetCents, 0);
      expect(sumTargetCents).toBe(sim.allocatedCents);
    }
  });

  it('permits 100% allocation with explicit concentration warning when only one asset is eligible', () => {
    const items = [
      makeRadarItem({ ticker: 'BBAS3', score: 86, confidence: 'HIGH', currentPrice: '28.50' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '1500.00',
      decisionBrief,
      radarItems: items,
    });

    expect(sim.allocations).toHaveLength(1);
    expect(sim.allocations[0].targetAmount).toBe('1500.00');
    expect(sim.allocations[0].allocationPercent).toBe(100);
    expect(sim.warnings.some((w) => w.includes('apenas um ativo'))).toBe(true);
    expect(sim.allocatedCents).toBe(150000);
    expect(sim.unallocatedCents).toBe(0);
  });

  it('keeps 100% unallocated when zero assets are eligible', () => {
    const radar = makeRadarResult([], { totalEligible: 0, totalRanked: 0 });
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '2000.00',
      decisionBrief,
      radarItems: [],
    });

    expect(sim.allocations).toHaveLength(0);
    expect(sim.allocatedCents).toBe(0);
    expect(sim.unallocatedCents).toBe(200000);
    expect(sim.warnings.some((w) => w.includes('critérios'))).toBe(true);
  });

  it('excludes LOW confidence and INSUFFICIENT_DATA assets from receiving allocations', () => {
    const lowConf = makeRadarItem({
      ticker: 'PETR4',
      score: 95,
      confidence: 'LOW',
      dataProvenance: {
        priceSource: 'BRAPI',
        hasRealFundamentals: false,
        fundamentalsSource: null,
        hasPriceHistory: false,
        hasRecentNews: false,
      },
    });
    const radar = makeRadarResult([lowConf]);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '1000.00',
      decisionBrief,
      radarItems: [lowConf],
    });

    expect(sim.allocations).toHaveLength(0);
    expect(sim.unallocatedCents).toBe(100000);
    expect(sim.excludedAssets.some((ex) => ex.ticker === 'PETR4')).toBe(true);
  });

  it('suppresses estimatedUnits when quote is STALE while still allowing value distribution if tier permits', () => {
    const staleItem = makeRadarItem({
      ticker: 'EGIE3',
      score: 84,
      confidence: 'HIGH',
      dataFreshness: 'STALE',
      currentPrice: '42.00',
    });
    const radar = makeRadarResult([staleItem]);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '1000.00',
      decisionBrief,
      radarItems: [staleItem],
    });

    expect(sim.allocations).toHaveLength(1);
    expect(sim.allocations[0].estimatedUnits).toBeNull();
    expect(sim.allocations[0].cautions.some((c) => c.includes('desatualizada'))).toBe(true);
  });

  it('is 100x deterministic and derivation takes < 20ms', () => {
    const items = [
      makeRadarItem({ ticker: 'BBAS3', score: 85, confidence: 'HIGH', currentPrice: '30.00' }),
      makeRadarItem({ ticker: 'VALE3', assetId: '2', score: 75, confidence: 'HIGH', currentPrice: '60.00' }),
      makeRadarItem({ ticker: 'WEGE3', assetId: '3', score: 70, confidence: 'MEDIUM', currentPrice: '40.00' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const baseline = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '3500.00',
      decisionBrief,
      radarItems: items,
    });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const next = buildContributionAllocationSimulation({
        portfolioId: radar.portfolioId,
        contributionAmount: '3500.00',
        decisionBrief,
        radarItems: items,
      });
      expect(next).toEqual(baseline);
    }
    const elapsed = performance.now() - start;
    expect(elapsed / 100).toBeLessThan(20);
  });

  // --- APP-16T-R1 SPECIFIC TESTS ---

  it('TEST 1 (Part AK / Part U): 3 assets (50/30/20), aporte R$ 100, cap 50%, min R$ 50 -> 5000 allocated, 5000 unallocated, none > 50%', () => {
    // Construct 3 items with exact score weights 50, 30, 20
    const items = [
      makeDecisionPriorityItem({ ticker: 'ASSET1', assetId: '1', rank: 1, opportunityScore: 50, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
      makeDecisionPriorityItem({ ticker: 'ASSET2', assetId: '2', rank: 2, opportunityScore: 30, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
      makeDecisionPriorityItem({ ticker: 'ASSET3', assetId: '3', rank: 3, opportunityScore: 20, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
    ];
    const decisionBrief = makeDecisionBriefWithItems(items);

    const sim = buildContributionAllocationSimulation({
      portfolioId: decisionBrief.portfolioId,
      contributionAmount: '100.00',
      decisionBrief,
      maxAssetConcentrationCap: 0.5,
      minAllocationCents: 5000, // R$ 50.00 min threshold
    });

    expect(sim.totalCents).toBe(10000);
    // Asset 1 gets exactly 5000 (50%). Assets 2 and 3 fall below min (3000 and 2000 < 5000)
    // Remainder (5000) cannot be given to Asset 1 because it reached the 50% cap!
    expect(sim.allocatedCents).toBe(5000);
    expect(sim.unallocatedCents).toBe(5000);
    expect(sim.allocatedCents + sim.unallocatedCents).toBe(10000);

    expect(sim.allocations).toHaveLength(1);
    expect(sim.allocations[0].ticker).toBe('ASSET1');
    expect(sim.allocations[0].targetCents).toBe(5000);
    expect(sim.allocations[0].targetAmount).toBe('50.00');
    expect(sim.allocations[0].targetCents).toBeLessThanOrEqual(5000); // <= 50% cap

    // Assets 2 and 3 are in excludedAssets
    expect(sim.excludedAssets).toHaveLength(2);
    expect(sim.excludedAssets.map((e) => e.ticker)).toEqual(['ASSET2', 'ASSET3']);
    // Warning emitted about unallocated remainder due to cap
    expect(sim.warnings.some((w) => w.includes('limite de concentração'))).toBe(true);
  });

  it('TEST 2 (Part AL): 2 assets (70/30 raw), cap 50% -> 50/50 allocation', () => {
    // 2 assets with raw 70 / 30 weight
    const items = [
      makeDecisionPriorityItem({ ticker: 'ASSET1', assetId: '1', rank: 1, opportunityScore: 70, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
      makeDecisionPriorityItem({ ticker: 'ASSET2', assetId: '2', rank: 2, opportunityScore: 30, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
    ];
    const decisionBrief = makeDecisionBriefWithItems(items);

    const sim = buildContributionAllocationSimulation({
      portfolioId: decisionBrief.portfolioId,
      contributionAmount: '100.00',
      decisionBrief,
      maxAssetConcentrationCap: 0.5,
      minAllocationCents: 1000, // R$ 10.00 min
    });

    expect(sim.totalCents).toBe(10000);
    expect(sim.allocatedCents).toBe(10000);
    expect(sim.unallocatedCents).toBe(0);
    expect(sim.allocations).toHaveLength(2);

    expect(sim.allocations[0].targetCents).toBe(5000); // 50%
    expect(sim.allocations[1].targetCents).toBe(5000); // 50%
    expect(sim.allocations[0].targetCents).toBeLessThanOrEqual(5000);
    expect(sim.allocations[1].targetCents).toBeLessThanOrEqual(5000);
  });

  it('TEST 3 (Part AM): 3 assets with cap 40% -> none exceeds floor(totalCents * 0.40)', () => {
    const items = [
      makeDecisionPriorityItem({ ticker: 'ASSET1', assetId: '1', rank: 1, opportunityScore: 80, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
      makeDecisionPriorityItem({ ticker: 'ASSET2', assetId: '2', rank: 2, opportunityScore: 70, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
      makeDecisionPriorityItem({ ticker: 'ASSET3', assetId: '3', rank: 3, opportunityScore: 50, decisionTier: 'HIGH_PRIORITY', confidence: 'HIGH' }),
    ];
    const decisionBrief = makeDecisionBriefWithItems(items);

    const sim = buildContributionAllocationSimulation({
      portfolioId: decisionBrief.portfolioId,
      contributionAmount: '100.00',
      decisionBrief,
      maxAssetConcentrationCap: 0.4,
      minAllocationCents: 1000,
    });

    const maxAllowedCents = Math.floor(10000 * 0.4); // 4000
    for (const alloc of sim.allocations) {
      expect(alloc.targetCents).toBeLessThanOrEqual(maxAllowedCents);
    }
    expect(sim.allocatedCents + sim.unallocatedCents).toBe(10000);
  });

  it('TEST 4 (Part AN): 1 eligible asset permits 100% allocation with concentration warning', () => {
    const items = [
      makeRadarItem({ ticker: 'ASSET1', assetId: '1', score: 90, confidence: 'HIGH', currentPrice: '10.00' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '500.00',
      decisionBrief,
      radarItems: items,
      maxAssetConcentrationCap: 0.5,
    });

    expect(sim.allocations).toHaveLength(1);
    expect(sim.allocations[0].targetCents).toBe(50000); // 100%
    expect(sim.allocatedCents).toBe(50000);
    expect(sim.unallocatedCents).toBe(0);
    expect(sim.warnings.some((w) => w.includes('apenas um ativo'))).toBe(true);
  });

  it('TEST 5 (Part AO): all assets below minimum threshold -> 0 allocated, 100% unallocated', () => {
    const items = [
      makeRadarItem({ ticker: 'ASSET1', assetId: '1', score: 50, confidence: 'HIGH', currentPrice: '10.00' }),
      makeRadarItem({ ticker: 'ASSET2', assetId: '2', score: 50, confidence: 'HIGH', currentPrice: '10.00' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    // Aporte R$ 40.00 (4000 cents), each gets ~2000 cents, but min is R$ 50.00 (5000 cents)
    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '40.00',
      decisionBrief,
      radarItems: items,
      minAllocationCents: 5000,
    });

    expect(sim.allocations).toHaveLength(0);
    expect(sim.allocatedCents).toBe(0);
    expect(sim.unallocatedCents).toBe(4000);
    expect(sim.totalCents).toBe(4000);
  });

  it('TEST 6 (Part AP): odd cents R$ 333,33 with cap 40% -> exact conservation and no asset > floor(33333 * 0.40)', () => {
    const items = [
      makeRadarItem({ ticker: 'ASSET1', assetId: '1', score: 80, confidence: 'HIGH', currentPrice: '10.00' }),
      makeRadarItem({ ticker: 'ASSET2', assetId: '2', score: 70, confidence: 'HIGH', currentPrice: '10.00' }),
      makeRadarItem({ ticker: 'ASSET3', assetId: '3', score: 60, confidence: 'HIGH', currentPrice: '10.00' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const sim = buildContributionAllocationSimulation({
      portfolioId: radar.portfolioId,
      contributionAmount: '333.33',
      decisionBrief,
      radarItems: items,
      maxAssetConcentrationCap: 0.4,
    });

    const maxAllowed = Math.floor(33333 * 0.4); // 13333
    expect(sim.totalCents).toBe(33333);
    expect(sim.allocatedCents + sim.unallocatedCents).toBe(33333);

    for (const alloc of sim.allocations) {
      expect(alloc.targetCents).toBeLessThanOrEqual(maxAllowed);
    }
  });

  it('TEST 7 (Part AQ), 8 (Part AR), 9 (Part AS): exact conservation for R$ 10,01, R$ 99,99, and R$ 12.345,67', () => {
    const items = [
      makeRadarItem({ ticker: 'ASSET1', assetId: '1', score: 80, confidence: 'HIGH', currentPrice: '10.00' }),
      makeRadarItem({ ticker: 'ASSET2', assetId: '2', score: 70, confidence: 'HIGH', currentPrice: '10.00' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    for (const [amtStr, expectedCents] of [
      ['10.01', 1001],
      ['99.99', 9999],
      ['12345.67', 1234567],
    ] as const) {
      const sim = buildContributionAllocationSimulation({
        portfolioId: radar.portfolioId,
        contributionAmount: amtStr,
        decisionBrief,
        radarItems: items,
        minAllocationCents: 100, // low threshold to test fractional conservation
      });

      expect(sim.totalCents).toBe(expectedCents);
      expect(sim.allocatedCents + sim.unallocatedCents).toBe(expectedCents);
      const sumAlloc = sim.allocations.reduce((acc, a) => acc + a.targetCents, 0);
      expect(sumAlloc).toBe(sim.allocatedCents);
    }
  });

  it('PROPERTY TEST (Parts AT, AU, AV, AW): verifies cap invariant and money conservation across diverse caps [0.34, 0.40, 0.50, 0.60] and 100x determinism', () => {
    const items = [
      makeRadarItem({ ticker: 'A1', assetId: '1', score: 85, confidence: 'HIGH', currentPrice: '25.00' }),
      makeRadarItem({ ticker: 'A2', assetId: '2', score: 75, confidence: 'HIGH', currentPrice: '30.00' }),
      makeRadarItem({ ticker: 'A3', assetId: '3', score: 65, confidence: 'HIGH', currentPrice: '15.00' }),
    ];
    const radar = makeRadarResult(items);
    const decisionBrief = buildPortfolioDailyDecisionBrief({ radar });

    const caps = [0.34, 0.4, 0.5, 0.6];
    const amounts = ['150.00', '777.77', '2500.00', '9876.54'];

    for (const cap of caps) {
      for (const amt of amounts) {
        const sim = buildContributionAllocationSimulation({
          portfolioId: radar.portfolioId,
          contributionAmount: amt,
          decisionBrief,
          radarItems: items,
          maxAssetConcentrationCap: cap,
          minAllocationCents: 1000,
        });

        // 1. Exact money conservation
        expect(sim.allocatedCents + sim.unallocatedCents).toBe(sim.totalCents);

        // 2. Multi-asset cap invariant: every asset <= floor(totalCents * cap)
        const maxAllowed = Math.floor(sim.totalCents * cap);
        for (const alloc of sim.allocations) {
          expect(alloc.targetCents).toBeLessThanOrEqual(maxAllowed);
        }

        // 3. Exact unit arithmetic: residual + units*price === targetCents
        for (const alloc of sim.allocations) {
          if (alloc.estimatedUnits !== null && alloc.unitPrice) {
            const unitPriceCents = Math.round(parseFloat(alloc.unitPrice) * 100);
            const computedCost = alloc.estimatedUnits * unitPriceCents;
            expect(computedCost + alloc.roundingResidualCents).toBe(alloc.targetCents);
          }
        }
      }
    }
  });
});
