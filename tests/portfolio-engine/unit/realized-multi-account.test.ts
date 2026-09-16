import { describe, it, expect } from 'vitest';
import { PortfolioScenarioBuilder } from '../scenario-builder';
import { createAccountId } from '@atlas/domain';
import { ASSET_PETR4, ASSET_VALE3 } from '../fixtures/assets';

describe('Phase 1C: Multi-Account Realized Aggregation & Currency Safety', () => {
  const ACCOUNT_XP = createAccountId('11111111-1111-4111-8111-111111111111');
  const ACCOUNT_NU = createAccountId('22222222-2222-4222-8222-222222222222');

  it('should correctly aggregate realized results from multiple accounts and compute weighted return without averaging percentages', () => {
    // Canonical Example Section 67:
    // Account XP:
    // BUY 100 @ 10 -> cost 1000
    // SELL 50 @ 15 -> gross 750, costRemoved 500, gain = +250, return = 50%
    // Account NU:
    // BUY 100 @ 20 -> cost 2000
    // SELL 50 @ 18 -> gross 900, costRemoved 1000, gain = -100, return = -10%
    // Portfolio:
    // grossProceeds = 750 + 900 = 1650
    // costBasisRemoved = 500 + 1000 = 1500
    // realizedGainLoss = 250 + (-100) = 150
    // portfolioReturn = 150 / 1500 * 100 = 10%
    // (Notice: simple average of (50% + (-10%))/2 = 20% is mathematically WRONG)
    const result = new PortfolioScenarioBuilder()
      // Account XP trades
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        accountId: ACCOUNT_XP,
        tradeDate: '2026-01-10',
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '15.00',
        accountId: ACCOUNT_XP,
        tradeDate: '2026-01-15',
      })
      // Account NU trades
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '20.00',
        accountId: ACCOUNT_NU,
        tradeDate: '2026-01-12',
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '18.00',
        accountId: ACCOUNT_NU,
        tradeDate: '2026-01-18',
      })
      .replay();

    // 1. Verify Account XP state
    const stateXP = result.state.accounts.get(String(ACCOUNT_XP))!;
    expect(stateXP.realizedDisposals).toHaveLength(1);
    const summaryXP = stateXP.realizedSummary.get('BRL')!;
    expect(summaryXP.grossProceeds.amount).toBe('750');
    expect(summaryXP.costBasisRemoved?.amount).toBe('500');
    expect(summaryXP.realizedGainLoss?.amount).toBe('250');
    expect(summaryXP.realizedReturnPercentage?.value).toBe('50');

    // 2. Verify Account NU state
    const stateNU = result.state.accounts.get(String(ACCOUNT_NU))!;
    expect(stateNU.realizedDisposals).toHaveLength(1);
    const summaryNU = stateNU.realizedSummary.get('BRL')!;
    expect(summaryNU.grossProceeds.amount).toBe('900');
    expect(summaryNU.costBasisRemoved?.amount).toBe('1000');
    expect(summaryNU.realizedGainLoss?.amount).toBe('-100');
    expect(summaryNU.realizedReturnPercentage?.value).toBe('-10');

    // 3. Verify Portfolio Consolidate (Section 15, 16, 112)
    expect(result.state.realizedDisposals).toHaveLength(2);
    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.grossProceeds.amount).toBe('1650'); // 750 + 900
    expect(portSummary.costBasisRemoved?.amount).toBe('1500'); // 500 + 1000
    expect(portSummary.realizedGainLoss?.amount).toBe('150'); // 250 - 100
    expect(portSummary.realizedReturnPercentage?.value).toBe('10'); // 150 / 1500 * 100 = 10%
    expect(portSummary.realizedReturnPercentage?.value).not.toBe('20'); // NOT average of averages!

    // Invariant: sum(account realized) === portfolio realized
    const sumAccountGains = summaryXP.realizedGainLoss!.add(summaryNU.realizedGainLoss!);
    expect(portSummary.realizedGainLoss?.equals(sumAccountGains)).toBe(true);
  });

  it('should maintain multi-currency separation without FX mixing across currencies', () => {
    // Account XP in BRL, Account NU in USD
    const result = new PortfolioScenarioBuilder()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '10.00',
        currency: 'BRL',
        accountId: ACCOUNT_XP,
        tradeDate: '2026-01-10',
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '15.00',
        currency: 'BRL',
        accountId: ACCOUNT_XP,
        tradeDate: '2026-01-15',
      })
      .buy({
        assetId: ASSET_VALE3,
        quantity: '10',
        unitPrice: '20.00',
        currency: 'USD',
        accountId: ACCOUNT_NU,
        tradeDate: '2026-01-10',
      })
      .sell({
        assetId: ASSET_VALE3,
        quantity: '5',
        unitPrice: '24.00',
        currency: 'USD',
        accountId: ACCOUNT_NU,
        tradeDate: '2026-01-15',
      })
      .replay();

    // Portfolio summaries must be segregated per currency (Section 31-32)
    const brlSummary = result.state.realizedSummary.get('BRL')!;
    expect(brlSummary.currency).toBe('BRL');
    expect(brlSummary.realizedGainLoss?.amount).toBe('250');
    expect(brlSummary.realizedGainLoss?.currency).toBe('BRL');

    const usdSummary = result.state.realizedSummary.get('USD')!;
    expect(usdSummary.currency).toBe('USD');
    expect(usdSummary.realizedGainLoss?.amount).toBe('20'); // 5 * 24 - 5 * 20 = 120 - 100 = 20
    expect(usdSummary.realizedGainLoss?.currency).toBe('USD');
  });
});
