import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import {
  ACCOUNT_XP,
  ACCOUNT_NU,
  ASSET_PETR4,
  ASSET_VALE3,
  PORTFOLIO_DEFAULT,
} from '../fixtures/assets';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { LocalDate } from '@atlas/domain';

describe('Portfolio Engine: Prefix & Append Consistency and Permutation Invariance (Phase 1F)', () => {
  it('should guarantee prefix consistency: replay(fullLedger, asOf) equals replay(ledger.filter(tradeDate <= asOf))', () => {
    const s = scenario()
      .deposit({ amount: '50000.00', tradeDate: '2026-01-01' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .buy({ assetId: ASSET_VALE3, quantity: '50', unitPrice: '60.00', tradeDate: '2026-01-10' })
      .dividend({ assetId: ASSET_PETR4, amount: '100.00', tradeDate: '2026-01-15' })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '40',
        transferGroupId: 'tg-prefix-1',
        tradeDate: '2026-01-20',
      })
      .split({ accountId: ACCOUNT_NU, assetId: ASSET_PETR4, factor: '2', tradeDate: '2026-01-25' })
      .sell({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '30',
        unitPrice: '8.00',
        tradeDate: '2026-02-01',
      });

    const cutoffs = [
      '2026-01-01',
      '2026-01-05',
      '2026-01-12',
      '2026-01-20',
      '2026-01-25',
      '2026-02-01',
    ];

    for (const cutoff of cutoffs) {
      const asOfDate = LocalDate.from(cutoff);

      // Replay full ledger filtered by asOfDate
      const replayAsOf = s.asOf(cutoff).replay();

      // Explicitly manually pre-filter array to tradeDate <= asOfDate
      const allTx = s.buildTransactions();
      const manuallyFiltered = allTx.filter((tx) => tx.tradeDate.compare(asOfDate) <= 0);
      const replayManual = replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: manuallyFiltered,
      });

      // Assert total consistency
      expect(replayAsOf.appliedTransactions.length).toBe(replayManual.appliedTransactions.length);
      expect(replayAsOf.state.assets.size).toBe(replayManual.state.assets.size);

      for (const [assetId, assetState] of replayAsOf.state.assets.entries()) {
        const manualAssetState = replayManual.state.assets.get(assetId)!;
        expect(assetState.quantity.value).toBe(manualAssetState.quantity.value);
        expect(assetState.totalCost?.amount).toBe(manualAssetState.totalCost?.amount);
        expect(assetState.averageCost?.amount).toBe(manualAssetState.averageCost?.amount);
        expect(assetState.costBasisStatus).toBe(manualAssetState.costBasisStatus);
      }
    }
  });

  it('should guarantee append consistency when a new transaction is appended to the ledger', () => {
    const s1 = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .buy({ assetId: ASSET_VALE3, quantity: '50', unitPrice: '60.00', tradeDate: '2026-01-10' });

    const res1 = s1.replay();

    // Append a third transaction on PETR4
    const s2 = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .buy({ assetId: ASSET_VALE3, quantity: '50', unitPrice: '60.00', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-15' });

    const res2 = s2.replay();

    // VALE3 state must be 100% bit-for-bit identical between res1 and res2
    const vale1 = res1.state.assets.get(String(ASSET_VALE3))!;
    const vale2 = res2.state.assets.get(String(ASSET_VALE3))!;
    expect(vale1.quantity.value).toBe(vale2.quantity.value);
    expect(vale1.totalCost?.amount).toBe(vale2.totalCost?.amount);
    expect(vale1.averageCost?.amount).toBe(vale2.averageCost?.amount);

    // PETR4 must reflect the append delta: 100 @ 10 + 100 @ 20 = 200 @ 15 (cost 3000)
    const petr2 = res2.state.assets.get(String(ASSET_PETR4))!;
    expect(petr2.quantity.value).toBe('200');
    expect(petr2.totalCost?.amount).toBe('3000');
    expect(petr2.averageCost?.amount).toBe('15');
  });

  it('should maintain 100% deterministic result across 100 random input permutations of the transaction ledger', () => {
    const s = scenario()
      .deposit({ amount: '100000.00', tradeDate: '2026-01-01' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-02' })
      .buy({ assetId: ASSET_VALE3, quantity: '100', unitPrice: '50.00', tradeDate: '2026-01-03' })
      .split({ accountId: ACCOUNT_XP, assetId: ASSET_PETR4, factor: '2', tradeDate: '2026-01-04' })
      .dividend({ assetId: ASSET_PETR4, amount: '200.00', tradeDate: '2026-01-05' })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '80',
        transferGroupId: 'tg-perm-1',
        tradeDate: '2026-01-06',
      })
      .sell({
        accountId: ACCOUNT_NU,
        assetId: ASSET_PETR4,
        quantity: '40',
        unitPrice: '15.00',
        tradeDate: '2026-01-07',
      })
      .amortization({
        accountId: ACCOUNT_XP,
        assetId: ASSET_VALE3,
        amount: '500.00',
        tradeDate: '2026-01-08',
      })
      .fee({ amount: '25.00', tradeDate: '2026-01-09' })
      .tax({ amount: '50.00', tradeDate: '2026-01-10' });

    const baseline = s.replay();
    const allTransactions = s.buildTransactions();

    // Fisher-Yates shuffle with deterministic pseudo-random seed
    let seed = 123456789;
    function deterministicRandom(): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    for (let iteration = 0; iteration < 100; iteration++) {
      const shuffled = [...allTransactions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(deterministicRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const permResult = replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: shuffled,
      });

      // Assert deep structural and numerical equality with baseline
      expect(permResult.appliedTransactions.length).toBe(baseline.appliedTransactions.length);
      expect(permResult.state.realizedDisposals.length).toBe(
        baseline.state.realizedDisposals.length,
      );
      expect(permResult.state.incomeEvents.length).toBe(baseline.state.incomeEvents.length);
      expect(permResult.state.cashFlowEvents.length).toBe(baseline.state.cashFlowEvents.length);
      expect(permResult.state.appliedTransfers.length).toBe(baseline.state.appliedTransfers.length);

      for (const [assetId, baseAsset] of baseline.state.assets.entries()) {
        const permAsset = permResult.state.assets.get(assetId)!;
        expect(permAsset.quantity.value).toBe(baseAsset.quantity.value);
        expect(permAsset.totalCost?.amount).toBe(baseAsset.totalCost?.amount);
        expect(permAsset.averageCost?.amount).toBe(baseAsset.averageCost?.amount);
      }
    }
  });
});
