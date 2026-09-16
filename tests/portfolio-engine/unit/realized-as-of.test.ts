import { describe, it, expect } from 'vitest';
import { PortfolioScenarioBuilder } from '../scenario-builder';
import { PortfolioReplayEngine } from '../../../packages/portfolio-engine/src';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1C: Realized Disposals As-Of Filtering & Determinism', () => {
  it('should correctly filter realized disposals and accumulate gains based on asOfDate', () => {
    // Canonical Example Section 44:
    // Jan: BUY 100 @ 10
    // Feb: SELL 40 @ 15 (gain = +200)
    // Mar: SELL 20 @ 8 (gain = -40, gross 160 - cost 200)

    // 1. As of Jan 31: No sells executed yet
    const asOfJan = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '15.00', tradeDate: '2026-02-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '20', unitPrice: '8.00', tradeDate: '2026-03-15' })
      .asOf('2026-01-31')
      .replay();
    expect(asOfJan.state.realizedDisposals).toHaveLength(0);
    expect(asOfJan.state.realizedSummary.size).toBe(0);

    // 2. As of Feb 28: Only Feb SELL executed -> realized = +200
    const asOfFeb = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '15.00', tradeDate: '2026-02-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '20', unitPrice: '8.00', tradeDate: '2026-03-15' })
      .asOf('2026-02-28')
      .replay();
    expect(asOfFeb.state.realizedDisposals).toHaveLength(1);
    expect(asOfFeb.state.realizedDisposals[0]!.realizedGainLoss?.amount).toBe('200');
    const febSummary = asOfFeb.state.realizedSummary.get('BRL')!;
    expect(febSummary.realizedGainLoss?.amount).toBe('200');
    expect(febSummary.realizedReturnPercentage?.value).toBe('50');

    // 3. As of Mar 31: Feb and Mar SELLs executed -> cumulative realized = +160
    const asOfMar = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '15.00', tradeDate: '2026-02-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '20', unitPrice: '8.00', tradeDate: '2026-03-15' })
      .asOf('2026-03-31')
      .replay();
    expect(asOfMar.state.realizedDisposals).toHaveLength(2);
    expect(asOfMar.state.realizedDisposals[0]!.realizedGainLoss?.amount).toBe('200');
    expect(asOfMar.state.realizedDisposals[1]!.realizedGainLoss?.amount).toBe('-40');
    const marSummary = asOfMar.state.realizedSummary.get('BRL')!;
    // Cumulative cost removed = 400 + 200 = 600
    // Cumulative net proceeds = 600 + 160 = 760
    // Cumulative gain = 760 - 600 = 160
    expect(marSummary.costBasisRemoved?.amount).toBe('600');
    expect(marSummary.grossProceeds.amount).toBe('760');
    expect(marSummary.realizedGainLoss?.amount).toBe('160');
    expect(marSummary.disposalCount).toBe(2);
  });

  it('should guarantee deterministic realized results regardless of input transaction ordering', () => {
    const builder = new PortfolioScenarioBuilder()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        tradeDate: '2026-01-10',
        createdAt: new Date('2026-01-10T08:00:00Z'),
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '30',
        unitPrice: '14.00',
        tradeDate: '2026-01-15',
        createdAt: new Date('2026-01-15T08:00:00Z'),
      })
      .buy({
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '12.00',
        tradeDate: '2026-01-20',
        createdAt: new Date('2026-01-20T08:00:00Z'),
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '40',
        unitPrice: '11.00',
        tradeDate: '2026-01-25',
        createdAt: new Date('2026-01-25T08:00:00Z'),
      });

    const canonicalTxList = builder.build();
    const engine = new PortfolioReplayEngine();
    const baseline = engine.replay({
      portfolioId: builder.portfolioId,
      transactions: canonicalTxList,
    });

    // Run 50 iterations with shuffled input arrays
    for (let i = 0; i < 50; i++) {
      const shuffled = [...canonicalTxList].sort(() => Math.random() - 0.5);
      const testResult = engine.replay({
        portfolioId: builder.portfolioId,
        transactions: shuffled,
      });

      expect(testResult.state.realizedDisposals).toHaveLength(
        baseline.state.realizedDisposals.length,
      );
      for (let j = 0; j < baseline.state.realizedDisposals.length; j++) {
        const baseD = baseline.state.realizedDisposals[j]!;
        const testD = testResult.state.realizedDisposals[j]!;
        expect(testD.transactionId).toBe(baseD.transactionId);
        expect(testD.grossProceeds.amount).toBe(baseD.grossProceeds.amount);
        expect(testD.netProceeds.amount).toBe(baseD.netProceeds.amount);
        expect(testD.costBasisRemoved?.amount).toBe(baseD.costBasisRemoved?.amount);
        expect(testD.realizedGainLoss?.amount).toBe(baseD.realizedGainLoss?.amount);
        expect(testD.realizedReturnPercentage?.value).toBe(baseD.realizedReturnPercentage?.value);
      }

      const baseSummary = baseline.state.realizedSummary.get('BRL')!;
      const testSummary = testResult.state.realizedSummary.get('BRL')!;
      expect(testSummary.realizedGainLoss?.amount).toBe(baseSummary.realizedGainLoss?.amount);
      expect(testSummary.costBasisRemoved?.amount).toBe(baseSummary.costBasisRemoved?.amount);
      expect(testSummary.grossProceeds.amount).toBe(baseSummary.grossProceeds.amount);
    }
  });
});
