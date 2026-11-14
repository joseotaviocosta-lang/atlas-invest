import { describe, it, expect } from 'vitest';
import {
  deriveContributionPlanActuals,
  ContributionPlanSnapshot,
  TransactionInputForTracking,
} from '../../packages/market-data/src/opportunity-radar/contribution-tracking';
import { OPPORTUNITY_MODEL_VERSION } from '../../packages/market-data/src/opportunity-radar/types';

describe('APP-16W: Contribution Plan Tracking & Actual-vs-Planned Progress', () => {
  const basePlan: ContributionPlanSnapshot = {
    portfolioId: 'port-1',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    plannedCents: 200000,
    plannedAmount: '2000.00',
    currency: 'BRL',
    source: 'USER_SIMULATION',
    allocations: [
      {
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        name: 'Bradespar PN',
        assetType: 'STOCK',
        plannedCents: 80000,
        plannedAmount: '800.00',
        plannedPercent: 40.0,
      },
      {
        assetId: 'asset-itsa4',
        ticker: 'ITSA4',
        name: 'Itaúsa PN',
        assetType: 'STOCK',
        plannedCents: 70000,
        plannedAmount: '700.00',
        plannedPercent: 35.0,
      },
      {
        assetId: 'asset-mxrf11',
        ticker: 'MXRF11',
        name: 'Maxi Renda FII',
        assetType: 'FII',
        plannedCents: 50000,
        plannedAmount: '500.00',
        plannedPercent: 25.0,
      },
    ],
  };

  it('PARTE CA: first critical test (planned vs actual matching)', () => {
    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '600.00',
      },
      {
        id: 'tx-2',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-itsa4',
        ticker: 'ITSA4',
        type: 'BUY',
        tradeDate: '2026-11-10',
        amount: '700.00',
      },
      {
        id: 'tx-3',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-mxrf11',
        ticker: 'MXRF11',
        type: 'BUY',
        tradeDate: '2026-11-12',
        amount: '50.00',
      },
    ];

    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions,
    });

    expect(result.overall.plannedCents).toBe(200000);
    expect(result.overall.actualCents).toBe(135000);
    expect(result.overall.remainingCents).toBe(65000);
    expect(result.overall.overPlanCents).toBe(0);
    expect(result.overall.completionPercent).toBe(67.5);
    expect(result.overall.status).toBe('PARTIAL');

    // Asset status checks
    const brap4 = result.assets.find((a) => a.ticker === 'BRAP4')!;
    expect(brap4.plannedCents).toBe(80000);
    expect(brap4.actualCents).toBe(60000);
    expect(brap4.remainingCents).toBe(20000);
    expect(brap4.status).toBe('PARTIAL');
    expect(brap4.completionPercent).toBe(75.0);

    const itsa4 = result.assets.find((a) => a.ticker === 'ITSA4')!;
    expect(itsa4.plannedCents).toBe(70000);
    expect(itsa4.actualCents).toBe(70000);
    expect(itsa4.remainingCents).toBe(0);
    expect(itsa4.status).toBe('COMPLETE');
    expect(itsa4.completionPercent).toBe(100.0);

    const mxrf11 = result.assets.find((a) => a.ticker === 'MXRF11')!;
    expect(mxrf11.plannedCents).toBe(50000);
    expect(mxrf11.actualCents).toBe(5000);
    expect(mxrf11.remainingCents).toBe(45000);
    expect(mxrf11.status).toBe('PARTIAL');
    expect(mxrf11.completionPercent).toBe(10.0);
  });

  it('PARTE CB: test overplan handling', () => {
    const singleAssetPlan: ContributionPlanSnapshot = {
      portfolioId: 'port-1',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      plannedCents: 100000,
      plannedAmount: '1000.00',
      currency: 'BRL',
      source: 'USER_SIMULATION',
      allocations: [
        {
          assetId: 'asset-itsa4',
          ticker: 'ITSA4',
          name: 'Itaúsa PN',
          assetType: 'STOCK',
          plannedCents: 100000,
          plannedAmount: '1000.00',
          plannedPercent: 100.0,
        },
      ],
    };

    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-itsa4',
        ticker: 'ITSA4',
        type: 'BUY',
        tradeDate: '2026-11-10',
        amount: '1200.00',
      },
    ];

    const result = deriveContributionPlanActuals({
      plan: singleAssetPlan,
      transactions,
    });

    expect(result.overall.plannedCents).toBe(100000);
    expect(result.overall.actualCents).toBe(120000);
    expect(result.overall.remainingCents).toBe(0);
    expect(result.overall.overPlanCents).toBe(20000);
    expect(result.overall.status).toBe('OVER_PLAN');

    const itsa4 = result.assets[0]!;
    expect(itsa4.status).toBe('OVER_PLAN');
    expect(itsa4.remainingCents).toBe(0);
    expect(itsa4.overPlanCents).toBe(20000);
    expect(itsa4.completionPercent).toBe(120.0);
    expect(itsa4.cappedCompletionPercent).toBe(100.0);
  });

  it('PARTE CC: test unplanned purchases shown separately', () => {
    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-vale3',
        ticker: 'VALE3',
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '350.00',
      },
    ];

    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions,
    });

    expect(result.unplannedAssets).toHaveLength(1);
    expect(result.unplannedAssets[0]!.ticker).toBe('VALE3');
    expect(result.unplannedAssets[0]!.actualCents).toBe(35000);
    expect(result.unplannedAssets[0]!.status).toBe('UNPLANNED');

    // Base plan assets remain not started
    expect(result.assets.every((a) => a.status === 'NOT_STARTED')).toBe(true);
    expect(result.overall.actualCents).toBe(35000);
    expect(result.overall.remainingCents).toBe(200000);
  });

  it('PARTE CD: test SELL transactions do not increase actual', () => {
    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'SELL',
        tradeDate: '2026-11-05',
        amount: '500.00',
      },
      {
        id: 'tx-2',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-11-06',
        amount: '600.00',
      },
    ];

    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions,
    });

    const brap4 = result.assets.find((a) => a.ticker === 'BRAP4')!;
    expect(brap4.actualCents).toBe(60000);
    expect(result.dataQuality.excludedSellCount).toBe(1);
  });

  it('PARTE CE: test transactions outside period are ignored', () => {
    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-10-31', // Prior month
        amount: '800.00',
      },
      {
        id: 'tx-2',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-12-01', // Next month
        amount: '800.00',
      },
    ];

    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions,
    });

    const brap4 = result.assets.find((a) => a.ticker === 'BRAP4')!;
    expect(brap4.actualCents).toBe(0);
    expect(brap4.status).toBe('NOT_STARTED');
    expect(result.dataQuality.excludedOutOfPeriodCount).toBe(2);
  });

  it('PARTE CF: test closed position historical buy is still tracked', () => {
    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '600.00',
      },
    ];

    // Baseline positions do not contain BRAP4 (e.g. was sold later or 0 balance)
    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions,
      baselinePositions: [],
    });

    const brap4 = result.assets.find((a) => a.ticker === 'BRAP4')!;
    expect(brap4.actualCents).toBe(60000);
    expect(brap4.status).toBe('PARTIAL');
  });

  it('PARTE CG: test multi-account aggregation sums correctly without duplication', () => {
    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-broker-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '300.00',
      },
      {
        id: 'tx-2',
        portfolioId: 'port-1',
        accountId: 'acc-broker-2',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-11-08',
        amount: '500.00',
      },
    ];

    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions,
    });

    const brap4 = result.assets.find((a) => a.ticker === 'BRAP4')!;
    expect(brap4.actualCents).toBe(80000);
    expect(brap4.tradeCount).toBe(2);
    expect(brap4.status).toBe('COMPLETE');
  });

  it('PARTE CJ: test exact cents arithmetic with fractional amounts', () => {
    const fractionalPlan: ContributionPlanSnapshot = {
      portfolioId: 'port-1',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      plannedCents: 44333,
      plannedAmount: '443.33',
      currency: 'BRL',
      source: 'USER_SIMULATION',
      allocations: [
        {
          assetId: 'asset-1',
          ticker: 'AST1',
          name: 'Asset 1',
          assetType: 'STOCK',
          plannedCents: 33333,
          plannedAmount: '333.33',
          plannedPercent: 75.19,
        },
        {
          assetId: 'asset-2',
          ticker: 'AST2',
          name: 'Asset 2',
          assetType: 'STOCK',
          plannedCents: 11000,
          plannedAmount: '110.00',
          plannedPercent: 24.81,
        },
      ],
    };

    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-1',
        ticker: 'AST1',
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '333.33',
      },
      {
        id: 'tx-2',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-2',
        ticker: 'AST2',
        type: 'BUY',
        tradeDate: '2026-11-06',
        amount: '10.01',
      },
      {
        id: 'tx-3',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-2',
        ticker: 'AST2',
        type: 'BUY',
        tradeDate: '2026-11-07',
        amount: '99.99',
      },
    ];

    const result = deriveContributionPlanActuals({
      plan: fractionalPlan,
      transactions,
    });

    expect(result.overall.plannedCents).toBe(44333);
    expect(result.overall.actualCents).toBe(44333);
    expect(result.overall.remainingCents).toBe(0);
    expect(result.overall.status).toBe('COMPLETE');
    expect(result.overall.completionPercent).toBe(100.0);
  });

  it('PARTE CK: test determinism over 100 runs', () => {
    const transactions: TransactionInputForTracking[] = [
      {
        id: 'tx-1',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-brap4',
        ticker: 'BRAP4',
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '600.00',
      },
      {
        id: 'tx-2',
        portfolioId: 'port-1',
        accountId: 'acc-1',
        assetId: 'asset-itsa4',
        ticker: 'ITSA4',
        type: 'BUY',
        tradeDate: '2026-11-10',
        amount: '700.00',
      },
    ];

    const first = JSON.stringify(
      deriveContributionPlanActuals({
        plan: basePlan,
        transactions,
        referenceDate: new Date('2026-11-13T12:00:00Z'),
      }),
    );

    for (let i = 0; i < 100; i++) {
      const next = JSON.stringify(
        deriveContributionPlanActuals({
          plan: basePlan,
          transactions,
          referenceDate: new Date('2026-11-13T12:00:00Z'),
        }),
      );
      expect(next).toBe(first);
    }
  });

  it('PARTE CL: test partial valuation qualifier', () => {
    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions: [],
      baselinePositions: [
        {
          assetId: 'asset-brap4',
          ticker: 'BRAP4',
          assetType: 'STOCK',
          quantity: '100',
          valuationStatus: 'VALUED',
          isValued: true,
          marketValueCents: 200000,
        },
        {
          assetId: 'asset-unknown',
          ticker: 'UNKN3',
          assetType: 'STOCK',
          quantity: '50',
          valuationStatus: 'NO_QUOTE',
          isValued: false,
          marketValueCents: null,
        },
      ],
    });

    expect(result.dataQuality.valuationQuality).toBe('VALUED_POSITIONS_ONLY');
    expect(result.dataQuality.isPartialValuation).toBe(true);
    expect(result.dataQuality.incompletePositions).toBe(1);
    expect(result.warnings.some((w) => w.includes('posições avaliadas'))).toBe(true);
  });

  it('PARTE CM: test no targets available maintains monetary tracking without claims', () => {
    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions: [],
      classTargetWeights: {},
    });

    expect(result.structuralProgress.hasTargetContext).toBe(false);
    expect(result.overall.plannedCents).toBe(200000);
    expect(result.overall.actualCents).toBe(0);
  });

  it('PARTE CN & CO: test empty plan and no transactions', () => {
    const emptyPlan: ContributionPlanSnapshot = {
      portfolioId: 'port-1',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      plannedCents: 0,
      plannedAmount: '0.00',
      currency: 'BRL',
      source: 'USER_SIMULATION',
      allocations: [],
    };

    const result = deriveContributionPlanActuals({
      plan: emptyPlan,
      transactions: [],
    });

    expect(result.overall.plannedCents).toBe(0);
    expect(result.overall.actualCents).toBe(0);
    expect(result.overall.remainingCents).toBe(0);
    expect(result.overall.completionPercent).toBe(0);
    expect(result.assets).toHaveLength(0);
  });

  it('PARTE CV: opportunity model version preserved intact', () => {
    const result = deriveContributionPlanActuals({
      plan: basePlan,
      transactions: [],
    });
    expect(result.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');
  });
});
