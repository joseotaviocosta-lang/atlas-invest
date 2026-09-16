import { describe, it, expect } from 'vitest';
import { PortfolioScenarioBuilder } from '../scenario-builder';
import { NegativePositionError } from '../../../packages/portfolio-engine/src';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1C: Realized Gain/Loss & Return Percentage', () => {
  it('should compute realized profit: BUY 100 @ 10, SELL 40 @ 15 -> gain = +200, return = 50%', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const d = result.state.realizedDisposals[0]!;

    expect(d.grossProceeds.amount).toBe('600');
    expect(d.netProceeds.amount).toBe('600');
    expect(d.costBasisRemoved?.amount).toBe('400');
    expect(d.realizedGainLoss?.amount).toBe('200');
    expect(d.realizedReturnPercentage?.value).toBe('50');
    expect(d.realizedReturnPercentage?.toString()).toBe('50%');

    // Check account-level realized summary
    const defaultAccountId = result.appliedTransactions[0]!.accountId;
    const accountState = result.state.accounts.get(String(defaultAccountId))!;
    const accSummary = accountState.realizedSummary.get('BRL')!;
    expect(accSummary.grossProceeds.amount).toBe('600');
    expect(accSummary.netProceeds.amount).toBe('600');
    expect(accSummary.costBasisRemoved?.amount).toBe('400');
    expect(accSummary.realizedGainLoss?.amount).toBe('200');
    expect(accSummary.realizedReturnPercentage?.value).toBe('50');
    expect(accSummary.disposalCount).toBe(1);

    // Check portfolio-level realized summary
    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.grossProceeds.amount).toBe('600');
    expect(portSummary.netProceeds.amount).toBe('600');
    expect(portSummary.costBasisRemoved?.amount).toBe('400');
    expect(portSummary.realizedGainLoss?.amount).toBe('200');
    expect(portSummary.realizedReturnPercentage?.value).toBe('50');
  });

  it('should compute realized loss: BUY 100 @ 10, SELL 40 @ 8 -> loss = -80, return = -20%', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '8.00', tradeDate: '2026-01-15' })
      .replay();

    const d = result.state.realizedDisposals[0]!;
    expect(d.grossProceeds.amount).toBe('320');
    expect(d.netProceeds.amount).toBe('320');
    expect(d.costBasisRemoved?.amount).toBe('400');
    expect(d.realizedGainLoss?.amount).toBe('-80');
    expect(d.realizedReturnPercentage?.value).toBe('-20');
    expect(d.realizedReturnPercentage?.toString()).toBe('-20%');

    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.realizedGainLoss?.amount).toBe('-80');
    expect(portSummary.realizedReturnPercentage?.value).toBe('-20');
  });

  it('should compute break-even: BUY 100 @ 10, SELL 40 @ 10 -> gain = 0, return = 0%', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '10.00', tradeDate: '2026-01-15' })
      .replay();

    const d = result.state.realizedDisposals[0]!;
    expect(d.grossProceeds.amount).toBe('400');
    expect(d.netProceeds.amount).toBe('400');
    expect(d.costBasisRemoved?.amount).toBe('400');
    expect(d.realizedGainLoss?.amount).toBe('0');
    expect(d.realizedReturnPercentage?.value).toBe('0');
    expect(d.realizedReturnPercentage?.toString()).toBe('0%');

    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.realizedGainLoss?.amount).toBe('0');
    expect(portSummary.realizedReturnPercentage?.value).toBe('0');
  });

  it('should preserve remaining position state on partial SELL while recording realized results', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .replay();

    // Remaining position verification (Section 17)
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.toString()).toBe('60');
    expect(pos.totalCost?.amount).toBe('600');
    expect(pos.averageCost?.amount).toBe('10');
    expect(pos.costBasisStatus).toBe('KNOWN');

    // Realized disposal verification
    expect(result.state.realizedDisposals).toHaveLength(1);
    expect(result.state.realizedDisposals[0]!.realizedGainLoss?.amount).toBe('200');
  });

  it('should omit position on full SELL while preserving realized result in history', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .replay();

    // Position omitted (Section 18 & ADR-039)
    expect(result.state.assets.has(String(ASSET_PETR4))).toBe(false);

    // Realized disposal preserved
    expect(result.state.realizedDisposals).toHaveLength(1);
    const d = result.state.realizedDisposals[0]!;
    expect(d.quantity.toString()).toBe('100');
    expect(d.grossProceeds.amount).toBe('1500');
    expect(d.costBasisRemoved?.amount).toBe('1000');
    expect(d.realizedGainLoss?.amount).toBe('500');
    expect(d.realizedReturnPercentage?.value).toBe('50');
  });

  it('should isolate subsequent rebuy after full sell without memory contamination', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .buy({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '20.00', tradeDate: '2026-01-20' })
      .replay();

    // Past realized disposal preserved in derived history (Section 19)
    expect(result.state.realizedDisposals).toHaveLength(1);
    expect(result.state.realizedDisposals[0]!.realizedGainLoss?.amount).toBe('500');

    // New active position is clean and starts fresh cost basis
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.toString()).toBe('50');
    expect(pos.totalCost?.amount).toBe('1000');
    expect(pos.averageCost?.amount).toBe('20');
  });

  it('should record multiple SELLs independently and aggregate cumulative results', () => {
    // Canonical Example Section 20-21:
    // BUY 100 @ 10
    // SELL 20 @ 12 -> gain = +40 (net 240 - cost 200)
    // SELL 30 @ 8  -> gain = -60 (net 240 - cost 300)
    // Total realized = -20
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '20', unitPrice: '12.00', tradeDate: '2026-01-15' })
      .sell({ assetId: ASSET_PETR4, quantity: '30', unitPrice: '8.00', tradeDate: '2026-01-20' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(2);

    const sale1 = result.state.realizedDisposals[0]!;
    expect(sale1.quantity.toString()).toBe('20');
    expect(sale1.realizedGainLoss?.amount).toBe('40');
    expect(sale1.realizedReturnPercentage?.value).toBe('20'); // 40 / 200 = 20%

    const sale2 = result.state.realizedDisposals[1]!;
    expect(sale2.quantity.toString()).toBe('30');
    expect(sale2.realizedGainLoss?.amount).toBe('-60');
    expect(sale2.realizedReturnPercentage?.value).toBe('-20'); // -60 / 300 = -20%

    // Cumulative summary: gross = 240 + 240 = 480, cost = 200 + 300 = 500, gain = -20
    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.grossProceeds.amount).toBe('480');
    expect(portSummary.costBasisRemoved?.amount).toBe('500');
    expect(portSummary.realizedGainLoss?.amount).toBe('-20');
    expect(portSummary.realizedReturnPercentage?.value).toBe('-4'); // -20 / 500 = -4%
    expect(portSummary.disposalCount).toBe(2);

    // Remaining position: 100 - 20 - 30 = 50 @ avg 10 = cost 500
    const remaining = result.state.assets.get(String(ASSET_PETR4))!;
    expect(remaining.quantity.toString()).toBe('50');
    expect(remaining.totalCost?.amount).toBe('500');
    expect(remaining.averageCost?.amount).toBe('10');
  });

  it('should enforce strict chronological ordering on same-day trades and reject SELL before BUY', () => {
    // If tradeDate is same day, order by createdAt/id: BUY first, then SELL
    const sameDay = '2026-01-10';
    const result = new PortfolioScenarioBuilder()
      .buy({
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '10.00',
        tradeDate: sameDay,
        createdAt: new Date('2026-01-10T10:00:00Z'),
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '20',
        unitPrice: '15.00',
        tradeDate: sameDay,
        createdAt: new Date('2026-01-10T11:00:00Z'),
      })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    expect(result.state.realizedDisposals[0]!.realizedGainLoss?.amount).toBe('100');

    // But if ordering puts SELL before BUY on same day, throw NegativePositionError (Section 24)
    expect(() => {
      new PortfolioScenarioBuilder()
        .sell({
          assetId: ASSET_PETR4,
          quantity: '20',
          unitPrice: '15.00',
          tradeDate: sameDay,
          createdAt: new Date('2026-01-10T09:00:00Z'), // earlier than buy!
        })
        .buy({
          assetId: ASSET_PETR4,
          quantity: '50',
          unitPrice: '10.00',
          tradeDate: sameDay,
          createdAt: new Date('2026-01-10T10:00:00Z'),
        })
        .replay();
    }).toThrow(NegativePositionError);
  });

  it('should satisfy property invariant: netProceeds - costBasisRemoved === realizedGainLoss for any valid disposal', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '33.45', tradeDate: '2026-01-10' })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '37',
        unitPrice: '42.18',
        fees: '3.50',
        taxes: '0.85',
        tradeDate: '2026-01-15',
      })
      .replay();

    const d = result.state.realizedDisposals[0]!;
    const calculatedGain = d.netProceeds.subtract(d.costBasisRemoved!);
    expect(d.realizedGainLoss?.equals(calculatedGain)).toBe(true);
  });
});
