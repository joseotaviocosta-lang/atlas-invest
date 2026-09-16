import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, ACCOUNT_XP, ACCOUNT_NU } from '../fixtures/assets';
import { Quantity, Money } from '@atlas/domain';

describe('Portfolio Engine Core: Multi-Account Cost & Portfolio Weighted Aggregation', () => {
  it('Canonical Example 4: Accounts maintain independent average costs; portfolio derives weighted average', () => {
    // Account A (XP): BUY 100 @ 20 (cost: 2000, avg: 20)
    // Account B (NU): BUY 50 @ 40 (cost: 2000, avg: 40)
    // Portfolio: qty: 150, cost: 4000, avg: 4000/150 = 26.6666... (NOT (20+40)/2 = 30)
    const result = scenario()
      .buy({
        assetId: ASSET_PETR4,
        accountId: ACCOUNT_XP,
        quantity: '100',
        unitPrice: '20.00',
        tradeDate: '2026-01-10',
      })
      .buy({
        assetId: ASSET_PETR4,
        accountId: ACCOUNT_NU,
        quantity: '50',
        unitPrice: '40.00',
        tradeDate: '2026-01-15',
      })
      .replay();

    expect(result.totalProcessedCount).toBe(2);

    // Account XP verification
    const accountXp = result.state.accounts.get(String(ACCOUNT_XP));
    const assetXp = accountXp?.assets.get(String(ASSET_PETR4));
    expect(assetXp?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(assetXp?.totalCost?.equals(Money.from('2000.00', 'BRL'))).toBe(true);
    expect(assetXp?.averageCost?.equals(Money.from('20.00', 'BRL'))).toBe(true);

    // Account NU verification
    const accountNu = result.state.accounts.get(String(ACCOUNT_NU));
    const assetNu = accountNu?.assets.get(String(ASSET_PETR4));
    expect(assetNu?.quantity.equals(Quantity.from('50'))).toBe(true);
    expect(assetNu?.totalCost?.equals(Money.from('2000.00', 'BRL'))).toBe(true);
    expect(assetNu?.averageCost?.equals(Money.from('40.00', 'BRL'))).toBe(true);

    // Portfolio aggregated verification (ADR-042)
    const portfolioAsset = result.state.assets.get(String(ASSET_PETR4));
    expect(portfolioAsset).toBeDefined();
    expect(portfolioAsset?.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(portfolioAsset?.totalCost?.equals(Money.from('4000.00', 'BRL'))).toBe(true);

    // Invariant 6: sum(account costs) == portfolio cost
    const sumAccountCosts = assetXp!.totalCost!.add(assetNu!.totalCost!);
    expect(sumAccountCosts.equals(portfolioAsset!.totalCost!)).toBe(true);

    // Invariant 7: sum(account quantities) == portfolio quantity
    const sumAccountQty = assetXp!.quantity.add(assetNu!.quantity);
    expect(sumAccountQty.equals(portfolioAsset!.quantity)).toBe(true);

    // High precision weighted average (NOT simple average 30.00)
    expect(portfolioAsset?.averageCost?.amount.startsWith('26.6666666666666666')).toBe(true);
  });

  it('Account liquidates position while another maintains: omitted from account, preserved in portfolio', () => {
    // XP: BUY 100 @ 20, then SELL 100
    // NU: BUY 50 @ 40
    const result = scenario()
      .buy({
        assetId: ASSET_PETR4,
        accountId: ACCOUNT_XP,
        quantity: '100',
        unitPrice: '20.00',
        tradeDate: '2026-01-10',
      })
      .sell({
        assetId: ASSET_PETR4,
        accountId: ACCOUNT_XP,
        quantity: '100',
        unitPrice: '25.00',
        tradeDate: '2026-01-12',
      })
      .buy({
        assetId: ASSET_PETR4,
        accountId: ACCOUNT_NU,
        quantity: '50',
        unitPrice: '40.00',
        tradeDate: '2026-01-15',
      })
      .replay();

    // XP has zero positions, omitted
    const xp = result.state.accounts.get(String(ACCOUNT_XP));
    expect(xp?.assets.has(String(ASSET_PETR4))).toBe(false);

    // NU has active position
    const nu = result.state.accounts.get(String(ACCOUNT_NU));
    expect(nu?.assets.has(String(ASSET_PETR4))).toBe(true);

    // Portfolio matches NU
    const portAsset = result.state.assets.get(String(ASSET_PETR4));
    expect(portAsset?.quantity.equals(Quantity.from('50'))).toBe(true);
    expect(portAsset?.totalCost?.equals(Money.from('2000.00', 'BRL'))).toBe(true);
    expect(portAsset?.averageCost?.equals(Money.from('40.00', 'BRL'))).toBe(true);
  });

  it('Incomplete cost basis on TRANSFER_IN: unknown cost is NOT represented as zero (ADR-043)', () => {
    const result = scenario()
      .transferIn({
        assetId: ASSET_PETR4,
        accountId: ACCOUNT_XP,
        quantity: '100',
        tradeDate: '2026-01-10',
      })
      .replay();

    const asset = result.state.assets.get(String(ASSET_PETR4));
    expect(asset).toBeDefined();
    expect(asset?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(asset?.costBasisStatus).toBe('INCOMPLETE');
    // Unknown cost is undefined, NEVER fake zero
    expect(asset?.totalCost).toBeUndefined();
    expect(asset?.averageCost).toBeUndefined();
  });

  it('Section 40 Scenario: As-of historical cost replay produces exact historical cost basis', () => {
    // Jan BUY 100 @ 10
    // Feb BUY 100 @ 20
    // Mar SELL 50 @ 30
    const baseScenario = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-02-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '30.00', tradeDate: '2026-03-10' });

    // As-of Jan: qty 100, cost 1000, avg 10
    const janResult = baseScenario.asOf('2026-01-31').replay();
    const janAsset = janResult.state.assets.get(String(ASSET_PETR4));
    expect(janAsset?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(janAsset?.totalCost?.equals(Money.from('1000.00', 'BRL'))).toBe(true);
    expect(janAsset?.averageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);

    // As-of Feb: qty 200, cost 3000, avg 15
    const febResult = baseScenario.asOf('2026-02-28').replay();
    const febAsset = febResult.state.assets.get(String(ASSET_PETR4));
    expect(febAsset?.quantity.equals(Quantity.from('200'))).toBe(true);
    expect(febAsset?.totalCost?.equals(Money.from('3000.00', 'BRL'))).toBe(true);
    expect(febAsset?.averageCost?.equals(Money.from('15.00', 'BRL'))).toBe(true);

    // As-of Mar: qty 150, cost 2250, avg 15
    const marResult = baseScenario.asOf('2026-03-31').replay();
    const marAsset = marResult.state.assets.get(String(ASSET_PETR4));
    expect(marAsset?.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(marAsset?.totalCost?.equals(Money.from('2250.00', 'BRL'))).toBe(true);
    expect(marAsset?.averageCost?.equals(Money.from('15.00', 'BRL'))).toBe(true);
  });
});
