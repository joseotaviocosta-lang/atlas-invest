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
});
