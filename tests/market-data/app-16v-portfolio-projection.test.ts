import { describe, it, expect } from 'vitest';
import {
  OpportunityAssetType,
  OpportunityRadarItem,
  QuoteFreshness,
  buildProjectedPortfolioAfterContribution,
  buildProjectedPortfolioScenarioComparison,
} from '../../packages/market-data/src/opportunity-radar';
import {
  buildContributionAllocationSimulation,
  buildContributionScenarioComparison,
  ContributionAllocationSimulation,
} from '../../packages/market-data/src/opportunity-radar/contribution-simulator';
import {
  PortfolioDailyDecisionBrief,
  PortfolioDecisionPriorityItem,
} from '../../packages/market-data/src/opportunity-radar/decision-brief';

describe('APP-16V: Portfolio Projection After Contribution Engine', () => {
  const baseAssetA: OpportunityRadarItem = {
    assetId: 'asset-a',
    ticker: 'TEST3',
    name: 'Test Stock A',
    assetType: 'EQUITY' as OpportunityAssetType,
    currentPrice: '10.00',
    opportunityScore: 80,
    confidence: 'HIGH',
    currentWeightPercent: 60,
    currentValue: '6000.00',
    currentQuantity: '600',
    breakdown: { valuationScore: 80, momentumScore: 70, financialHealthScore: 85 },
    reasons: ['Strong score'],
    cautions: [],
    marketValue: '6000.00',
    portfolioWeight: 60,
    quantity: '600',
    currency: 'BRL',
    score: 80,
    dataFreshness: 'FRESH',
  } as any;

  const baseAssetB: OpportunityRadarItem = {
    assetId: 'asset-b',
    ticker: 'TEST4',
    name: 'Test Stock B',
    assetType: 'EQUITY' as OpportunityAssetType,
    currentPrice: '20.00',
    opportunityScore: 90,
    confidence: 'HIGH',
    currentWeightPercent: 40,
    currentValue: '4000.00',
    currentQuantity: '200',
    breakdown: { valuationScore: 90, momentumScore: 80, financialHealthScore: 90 },
    reasons: ['Top opportunity'],
    cautions: [],
    marketValue: '4000.00',
    portfolioWeight: 40,
    quantity: '200',
    currency: 'BRL',
    score: 90,
    dataFreshness: 'FRESH',
  } as any;

  const baseDecisionBrief: any = {
    portfolioId: 'port-1',
    asOf: '2026-11-12',
    modelVersion: 'opportunity-v2.3.1',
    marketStatus: 'OPEN',
    topPriorities: [
      {
        rank: 1,
        assetId: 'asset-b',
        ticker: 'TEST4',
        name: 'Test Stock B',
        assetType: 'EQUITY',
        decisionTier: 'HIGH_PRIORITY',
        opportunityScore: 90,
        confidence: 'HIGH',
        reasons: ['Top priority'],
        cautions: [],
        hasMaterialAlert: false,
        newsHeadlines: [],
        fiiContext: null,
      },
      {
        rank: 2,
        assetId: 'asset-a',
        ticker: 'TEST3',
        name: 'Test Stock A',
        assetType: 'EQUITY',
        decisionTier: 'ANALYSIS_DESIRED',
        opportunityScore: 80,
        confidence: 'HIGH',
        reasons: ['Second priority'],
        cautions: [],
        hasMaterialAlert: false,
        newsHeadlines: [],
        fiiContext: null,
      },
    ],
    readiness: {
      status: 'READY',
      reasons: [],
      warnings: [],
      actionable: true,
      evaluatedAt: '2026-11-12T10:00:00.000Z',
    },
    topFiiRadar: [],
    recentMaterialAlerts: [],
    contributionSimulation: {
      suggestedContributionAmount: '2000.00',
      allocations: [],
      rationale: 'Base',
    },
    summaryNarrative: 'Decision brief ready',
    highlights: [],
    dataQuality: {
      label: 'COMPLETO',
      description: 'Dados íntegros',
      staleAssetsCount: 0,
    },
  };

  // TEST 1 (BT): Simple 2 assets (A=60, B=40, aporte B+20 -> 50/50)
  it('TEST 1 (BT): projects weights correctly for simple 2 assets (A=60, B=40, B gets 20 -> 50/50)', () => {
    // 6000 + 4000 = 10000 before. Aporte 2000 in B -> A=6000 (50%), B=6000 (50%), total 12000.
    const simBOnly: ContributionAllocationSimulation = {
      portfolioId: 'port-1',
      asOf: '2026-11-12',
      contributionAmount: '2000.00',
      allocatedAmount: '2000.00',
      unallocatedAmount: '0.00',
      allocatedCents: 200000,
      unallocatedCents: 0,
      totalCents: 200000,
      allocations: [
        {
          rank: 1,
          assetId: 'asset-b',
          ticker: 'TEST4',
          name: 'Test Stock B',
          assetType: 'EQUITY' as OpportunityAssetType,
          decisionTier: 'HIGH_PRIORITY' as any,
          opportunityScore: 90,
          confidence: 'HIGH' as const,
          targetAmount: '2000.00',
          targetCents: 200000,
          allocationPercent: 100,
          estimatedUnits: 100,
          unitPrice: '20.00',
          roundingResidualCents: 0,
          reasons: [],
          cautions: [],
        },
      ],
      excludedAssets: [],
      assumptions: [],
      warnings: [],
      dataQuality: { eligibleAssetsCount: 2, allocatedAssetsCount: 1, excludedAssetsCount: 0, priceUsableCount: 2 },
      modelVersion: 'opportunity-v2.3.1',
    };

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: simBOnly,
      radarItems: [baseAssetA, baseAssetB],
    });

    expect(projection.before.investedAssetCents).toBe(1000000); // 10,000.00
    expect(projection.after.investedAssetCents).toBe(1200000); // 12,000.00
    expect(projection.allocatedCents).toBe(200000);
    expect(projection.unallocatedCents).toBe(0);

    const assetA = projection.assetProjection.find((a) => a.ticker === 'TEST3')!;
    const assetB = projection.assetProjection.find((a) => a.ticker === 'TEST4')!;

    expect(assetA.beforeWeightPercent).toBe(60);
    expect(assetA.afterWeightPercent).toBe(50);
    expect(assetA.deltaWeightPercent).toBe(-10);

    expect(assetB.beforeWeightPercent).toBe(40);
    expect(assetB.afterWeightPercent).toBe(50);
    expect(assetB.deltaWeightPercent).toBe(10);
  });

  // TEST 2 (BU): Money conservation (after = before + allocated)
  it('TEST 2 (BU): satisfies money conservation (afterInvestedCents == beforeInvestedCents + totalAllocatedCents)', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '1500.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    expect(projection.after.investedAssetCents).toBe(
      projection.before.investedAssetCents + projection.allocatedCents,
    );
  });

  // TEST 3 (BV): Unallocated excluded from after invested value
  it('TEST 3 (BV): unallocated amount is NOT added to afterInvestedCents', () => {
    // Construct simulation where unallocated = 500.00
    const simWithUnallocated: ContributionAllocationSimulation = {
      portfolioId: 'port-1',
      asOf: '2026-11-12',
      contributionAmount: '1000.00',
      allocatedAmount: '500.00',
      unallocatedAmount: '500.00',
      allocatedCents: 50000,
      unallocatedCents: 50000,
      totalCents: 100000,
      allocations: [
        {
          rank: 1,
          assetId: 'asset-b',
          ticker: 'TEST4',
          name: 'Test Stock B',
          assetType: 'EQUITY' as OpportunityAssetType,
          decisionTier: 'HIGH_PRIORITY' as any,
          opportunityScore: 90,
          confidence: 'HIGH' as const,
          targetAmount: '500.00',
          targetCents: 50000,
          allocationPercent: 50,
          estimatedUnits: 25,
          unitPrice: '20.00',
          roundingResidualCents: 0,
          reasons: [],
          cautions: [],
        },
      ],
      excludedAssets: [],
      assumptions: [],
      warnings: [],
      dataQuality: { eligibleAssetsCount: 2, allocatedAssetsCount: 1, excludedAssetsCount: 0, priceUsableCount: 2 },
      modelVersion: 'opportunity-v2.3.1',
    };

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: simWithUnallocated,
      radarItems: [baseAssetA, baseAssetB],
    });

    expect(projection.before.investedAssetCents).toBe(1000000);
    // afterInvestedCents must be 1000000 + 50000 = 1050000 (NOT 1100000)
    expect(projection.after.investedAssetCents).toBe(1050000);
    expect(projection.unallocatedCents).toBe(50000);
    expect(projection.unallocatedAmount).toBe('500.00');
  });

  // TEST 4 (BW): Gap improvement (class below target receives allocation -> absolute distance reduces -> IMPROVED)
  it('TEST 4 (BW): marks class as IMPROVED when allocation reduces distance to target', () => {
    // 2 classes: EQUITY (before=6000, 60%), REAL_ESTATE (before=4000, 40%). Target: REAL_ESTATE=50%, EQUITY=50%.
    const fiiAsset: OpportunityRadarItem = {
      assetId: 'fii-1',
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      assetType: 'REAL_ESTATE',
      currentPrice: '100.00',
      opportunityScore: 85,
      confidence: 'HIGH',
      currentWeightPercent: 40,
      currentValue: '4000.00',
      currentQuantity: '40',
      breakdown: { valuationScore: 85, momentumScore: 70, financialHealthScore: 80 },
      reasons: [],
      cautions: [],
      marketValue: '4000.00',
      portfolioWeight: 40,
      quantity: '40',
      currency: 'BRL',
      score: 85,
      dataFreshness: 'FRESH',
    } as any;

    const sim: ContributionAllocationSimulation = {
      portfolioId: 'port-1',
      asOf: '2026-11-12',
      contributionAmount: '2000.00',
      allocatedAmount: '2000.00',
      unallocatedAmount: '0.00',
      allocatedCents: 200000,
      unallocatedCents: 0,
      totalCents: 200000,
      allocations: [
        {
          rank: 1,
          assetId: 'fii-1',
          ticker: 'HGLG11',
          name: 'CSHG Logística',
          assetType: 'REAL_ESTATE' as OpportunityAssetType,
          decisionTier: 'HIGH_PRIORITY' as any,
          opportunityScore: 85,
          confidence: 'HIGH' as const,
          targetAmount: '2000.00',
          targetCents: 200000,
          allocationPercent: 100,
          estimatedUnits: 20,
          unitPrice: '100.00',
          roundingResidualCents: 0,
          reasons: [],
          cautions: [],
        },
      ],
      excludedAssets: [],
      assumptions: [],
      warnings: [],
      dataQuality: { eligibleAssetsCount: 2, allocatedAssetsCount: 1, excludedAssetsCount: 0, priceUsableCount: 2 },
      modelVersion: 'opportunity-v2.3.1',
    };

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, fiiAsset],
      classTargetWeights: { REAL_ESTATE: 50, EQUITY: 50 },
    });

    const fiiClass = projection.classProjection.find((c) => c.classId === 'REAL_ESTATE')!;
    // before: 40%, target: 50% -> beforeGap: 50 - 40 = +10%.
    // after: 6000 / 12000 = 50%, target: 50% -> afterGap: 0%.
    // distance before = 10, distance after = 0 -> improvement = 10.
    expect(fiiClass.beforeWeightPercent).toBe(40);
    expect(fiiClass.afterWeightPercent).toBe(50);
    expect(fiiClass.beforeGapPercent).toBe(10);
    expect(fiiClass.afterGapPercent).toBe(0);
    expect(fiiClass.gapImprovementPercent).toBe(10);
    expect(fiiClass.status).toBe('IMPROVED');
  });

  // TEST 5 (BX): Gap worsening (class above target receives allocation -> absolute distance increases -> WORSENED)
  it('TEST 5 (BX): marks class as WORSENED when allocation increases distance from target', () => {
    const fiiAsset: OpportunityRadarItem = {
      assetId: 'fii-1',
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      assetType: 'REAL_ESTATE',
      currentPrice: '100.00',
      opportunityScore: 85,
      confidence: 'HIGH',
      currentWeightPercent: 40,
      currentValue: '4000.00',
      currentQuantity: '40',
      breakdown: { valuationScore: 85, momentumScore: 70, financialHealthScore: 80 },
      reasons: [],
      cautions: [],
      marketValue: '4000.00',
      portfolioWeight: 40,
      quantity: '40',
      currency: 'BRL',
      score: 85,
      dataFreshness: 'FRESH',
    } as any;

    const sim: ContributionAllocationSimulation = {
      portfolioId: 'port-1',
      asOf: '2026-11-12',
      contributionAmount: '2000.00',
      allocatedAmount: '2000.00',
      unallocatedAmount: '0.00',
      allocatedCents: 200000,
      unallocatedCents: 0,
      totalCents: 200000,
      allocations: [
        {
          rank: 1,
          assetId: 'asset-a',
          ticker: 'TEST3',
          name: 'Test Stock A',
          assetType: 'EQUITY' as OpportunityAssetType,
          decisionTier: 'HIGH_PRIORITY' as any,
          opportunityScore: 80,
          confidence: 'HIGH' as const,
          targetAmount: '2000.00',
          targetCents: 200000,
          allocationPercent: 100,
          estimatedUnits: 200,
          unitPrice: '10.00',
          roundingResidualCents: 0,
          reasons: [],
          cautions: [],
        },
      ],
      excludedAssets: [],
      assumptions: [],
      warnings: [],
      dataQuality: { eligibleAssetsCount: 2, allocatedAssetsCount: 1, excludedAssetsCount: 0, priceUsableCount: 2 },
      modelVersion: 'opportunity-v2.3.1',
    };

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, fiiAsset],
      classTargetWeights: { REAL_ESTATE: 50, EQUITY: 50 },
    });

    const equityClass = projection.classProjection.find((c) => c.classId === 'EQUITY')!;
    expect(equityClass.status).toBe('WORSENED');
    expect(equityClass.gapImprovementPercent).toBeLessThan(0);
  });

  // TEST 6 (BY): No target -> status = 'NO_TARGET', no fake gaps
  it('TEST 6 (BY): returns NO_TARGET and null gaps when no target is set for the class', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '1000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
      // no classTargetWeights passed
    });

    for (const cls of projection.classProjection) {
      expect(cls.status).toBe('NO_TARGET');
      expect(cls.targetWeightPercent).toBeUndefined();
      expect(cls.beforeGapPercent).toBeUndefined();
      expect(cls.afterGapPercent).toBeUndefined();
      expect(cls.gapImprovementPercent).toBeUndefined();
    }
    expect(projection.targetProgress.improvedCount).toBe(0);
    expect(projection.targetProgress.worsenedCount).toBe(0);
  });

  // TEST 7 (BZ): Concentration: largest asset before/after
  it('TEST 7 (BZ): calculates largest asset weight before and after correctly', () => {
    const sim: ContributionAllocationSimulation = {
      portfolioId: 'port-1',
      asOf: '2026-11-12',
      contributionAmount: '4000.00',
      allocatedAmount: '4000.00',
      unallocatedAmount: '0.00',
      allocatedCents: 400000,
      unallocatedCents: 0,
      totalCents: 400000,
      allocations: [
        {
          rank: 1,
          assetId: 'asset-b',
          ticker: 'TEST4',
          name: 'Test Stock B',
          assetType: 'EQUITY' as OpportunityAssetType,
          decisionTier: 'HIGH_PRIORITY' as any,
          opportunityScore: 90,
          confidence: 'HIGH' as const,
          targetAmount: '4000.00',
          targetCents: 400000,
          allocationPercent: 100,
          estimatedUnits: 200,
          unitPrice: '20.00',
          roundingResidualCents: 0,
          reasons: [],
          cautions: [],
        },
      ],
      excludedAssets: [],
      assumptions: [],
      warnings: [],
      dataQuality: { eligibleAssetsCount: 2, allocatedAssetsCount: 1, excludedAssetsCount: 0, priceUsableCount: 2 },
      modelVersion: 'opportunity-v2.3.1',
    };

    // Before: A=6000 (60%), B=4000 (40%) -> largest is A (60%).
    // After: A=6000 (42.86%), B=8000 (57.14%) -> largest is B (57.14%).
    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    expect(projection.concentration.largestAssetTickerBefore).toBe('TEST3');
    expect(projection.concentration.largestAssetWeightBefore).toBe(60);
    expect(projection.concentration.largestAssetTickerAfter).toBe('TEST4');
    expect(projection.concentration.largestAssetWeightAfter).toBeCloseTo(57.14, 1);
  });

  // TEST 8 (CA): Top 3 weight before/after
  it('TEST 8 (CA): calculates top 3 weight before and after correctly', () => {
    const assetC: OpportunityRadarItem = {
      assetId: 'asset-c',
      ticker: 'TEST5',
      name: 'Test Stock C',
      assetType: 'EQUITY',
      currentPrice: '10.00',
      opportunityScore: 70,
      confidence: 'MEDIUM',
      currentWeightPercent: 10,
      currentValue: '1000.00',
      currentQuantity: '100',
      breakdown: { valuationScore: 70, momentumScore: 70, financialHealthScore: 70 },
      reasons: [],
      cautions: [],
      marketValue: '1000.00',
      portfolioWeight: 8.33,
      quantity: '100',
      currency: 'BRL',
      score: 70,
      dataFreshness: 'FRESH',
    } as any;
    const assetD: OpportunityRadarItem = {
      assetId: 'asset-d',
      ticker: 'TEST6',
      name: 'Test Stock D',
      assetType: 'EQUITY',
      currentPrice: '10.00',
      opportunityScore: 65,
      confidence: 'MEDIUM',
      currentWeightPercent: 10,
      currentValue: '1000.00',
      currentQuantity: '100',
      breakdown: { valuationScore: 65, momentumScore: 65, financialHealthScore: 65 },
      reasons: [],
      cautions: [],
      marketValue: '1000.00',
      portfolioWeight: 8.33,
      quantity: '100',
      currency: 'BRL',
      score: 65,
      dataFreshness: 'FRESH',
    } as any;

    const sim: ContributionAllocationSimulation = {
      portfolioId: 'port-1',
      asOf: '2026-11-12',
      contributionAmount: '0.00',
      allocatedAmount: '0.00',
      unallocatedAmount: '0.00',
      allocatedCents: 0,
      unallocatedCents: 0,
      totalCents: 0,
      allocations: [],
      excludedAssets: [],
      assumptions: [],
      warnings: [],
      dataQuality: { eligibleAssetsCount: 4, allocatedAssetsCount: 0, excludedAssetsCount: 0, priceUsableCount: 4 },
      modelVersion: 'opportunity-v2.3.1',
    };

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB, assetC, assetD],
    });

    expect(projection.concentration.top3WeightBefore).toBeCloseTo(91.67, 1);
    expect(projection.concentration.top3WeightAfter).toBeCloseTo(91.67, 1);
  });

  // TEST 9 (CB): Zero allocation -> before == after, zero improved classes
  it('TEST 9 (CB): handles zero allocation cleanly (before == after, zero changes)', () => {
    const sim: ContributionAllocationSimulation = {
      portfolioId: 'port-1',
      asOf: '2026-11-12',
      contributionAmount: '1000.00',
      allocatedAmount: '0.00',
      unallocatedAmount: '1000.00',
      allocatedCents: 0,
      unallocatedCents: 100000,
      totalCents: 100000,
      allocations: [],
      excludedAssets: [],
      assumptions: [],
      warnings: [],
      dataQuality: { eligibleAssetsCount: 2, allocatedAssetsCount: 0, excludedAssetsCount: 2, priceUsableCount: 2 },
      modelVersion: 'opportunity-v2.3.1',
    };

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
      classTargetWeights: { EQUITY: 50 },
    });

    expect(projection.before.investedAssetCents).toBe(projection.after.investedAssetCents);
    expect(projection.targetProgress.improvedCount).toBe(0);
    expect(projection.targetProgress.worsenedCount).toBe(0);
    expect(projection.targetProgress.unchangedCount).toBe(1);
  });

  // TEST 10 (CC): Stale quote emits data quality warning
  it('TEST 10 (CC): emits data quality warning when quotes are STALE', () => {
    const staleAssetA = { ...baseAssetA, dataFreshness: 'STALE' as QuoteFreshness };
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '1000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [staleAssetA, baseAssetB],
    });

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [staleAssetA, baseAssetB],
    });

    expect(projection.dataQuality.quoteStaleCount).toBe(1);
    expect(projection.warnings.some((w) => w.includes('desatualizada'))).toBe(true);
    const assetA = projection.assetProjection.find((a) => a.ticker === 'TEST3')!;
    expect(assetA.dataFreshness).toBe('STALE');
  });

  // TEST 11 (CD): Partial valuation sets projectionComplete = false
  it('TEST 11 (CD): sets projectionComplete = false and emits warning if some assets lack valuation', () => {
    const unpricedAsset: OpportunityRadarItem = {
      assetId: 'asset-unpriced',
      ticker: 'TEST99',
      name: 'Unpriced Asset',
      assetType: 'EQUITY',
      currentPrice: '0.00',
      opportunityScore: 50,
      confidence: 'LOW',
      currentWeightPercent: 0,
      currentValue: '0.00',
      currentQuantity: '100',
      breakdown: { valuationScore: 50, momentumScore: 50, financialHealthScore: 50 },
      reasons: [],
      cautions: [],
      marketValue: '0',
      portfolioWeight: 0,
      quantity: '100',
      currency: 'BRL',
      score: 50,
      dataFreshness: 'FRESH',
    } as any;

    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '1000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB, unpricedAsset],
    });

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB, unpricedAsset],
    });

    expect(projection.dataQuality.projectionComplete).toBe(false);
    expect(projection.warnings.some((w) => w.includes('Valuation parcial'))).toBe(true);
  });

  // TEST 12 (CE): Full valuation weights sum to ~100%
  it('TEST 12 (CE): weights sum to ~100% before and after in full valuation', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '1000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    const sumBefore = projection.assetProjection.reduce((sum, a) => sum + a.beforeWeightPercent, 0);
    const sumAfter = projection.assetProjection.reduce((sum, a) => sum + a.afterWeightPercent, 0);

    expect(sumBefore).toBeCloseTo(100, 1);
    expect(sumAfter).toBeCloseTo(100, 1);
  });

  // TEST 13 (CF): Scenario comparison shares identical before baseline, distinct after states
  it('TEST 13 (CF): scenario comparison shares identical before baseline and distinct after states', () => {
    const scenarios = buildContributionScenarioComparison({
      portfolioId: 'port-1',
      contributionAmount: '2000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
      concentrationCapPercent: 50,
    });

    const comparison = buildProjectedPortfolioScenarioComparison({
      portfolioId: 'port-1',
      scenarioComparison: scenarios,
      radarItems: [baseAssetA, baseAssetB],
    });

    // Before baseline must match across all 3 scenarios
    const cautious = comparison.scenarios.find((s) => s.scenarioId === 'CAUTIOUS')!;
    const balanced = comparison.scenarios.find((s) => s.scenarioId === 'BALANCED')!;
    const focus = comparison.scenarios.find((s) => s.scenarioId === 'OPPORTUNITY_FOCUS')!;

    expect(cautious.projection.before.investedAssetCents).toBe(
      balanced.projection.before.investedAssetCents,
    );
    expect(balanced.projection.before.investedAssetCents).toBe(
      focus.projection.before.investedAssetCents,
    );

    // After states must exist for all 3
    expect(cautious.projection.after.investedAssetCents).toBeGreaterThan(0);
    expect(balanced.projection.after.investedAssetCents).toBeGreaterThan(0);
    expect(focus.projection.after.investedAssetCents).toBeGreaterThan(0);
    expect(comparison.comparisonInsights.length).toBeGreaterThan(0);
  });

  // TEST 14 (CG): Same allocations produce same projections
  it('TEST 14 (CG): same allocations produce identical projections', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '1000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const p1 = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    const p2 = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    expect(p1).toEqual(p2);
  });

  // TEST 15 (CH): 100 iterations determinism
  it('TEST 15 (CH): deterministic output over 100 iterations', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '1234.56',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const baseline = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    for (let i = 0; i < 100; i++) {
      const res = buildProjectedPortfolioAfterContribution({
        portfolioId: 'port-1',
        contributionSimulation: sim,
        radarItems: [baseAssetA, baseAssetB],
      });
      expect(res).toEqual(baseline);
    }
  });

  // TEST 19 (CL): Exact cents conservation with odd amounts (e.g. 333.33)
  it('TEST 19 (CL): exact cents conservation with odd contribution amounts (e.g. 333.33)', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '333.33',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    expect(projection.after.investedAssetCents).toBe(
      projection.before.investedAssetCents + projection.allocatedCents,
    );
    expect(projection.allocatedCents + projection.unallocatedCents).toBe(33333);
  });

  // TEST 20 (CM): Class after totals equal total after invested cents
  it('TEST 20 (CM): sum of class afterCents equals after.investedAssetCents', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '2000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const projection = buildProjectedPortfolioAfterContribution({
      portfolioId: 'port-1',
      contributionSimulation: sim,
      radarItems: [baseAssetA, baseAssetB],
    });

    const sumClassAfter = projection.classProjection.reduce((sum, c) => sum + c.afterCents, 0);
    expect(sumClassAfter).toBe(projection.after.investedAssetCents);
  });

  // TEST Performance (CN): Execution < 20 ms
  it('TEST Performance (CN): execution completes in under 20ms', () => {
    const sim = buildContributionAllocationSimulation({
      portfolioId: 'port-1',
      contributionAmount: '2000.00',
      decisionBrief: baseDecisionBrief,
      radarItems: [baseAssetA, baseAssetB],
    });

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      buildProjectedPortfolioAfterContribution({
        portfolioId: 'port-1',
        contributionSimulation: sim,
        radarItems: [baseAssetA, baseAssetB],
      });
    }
    const duration = (performance.now() - start) / 50;
    expect(duration).toBeLessThan(20);
  });
});
