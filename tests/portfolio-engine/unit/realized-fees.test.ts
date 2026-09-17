import { describe, it, expect } from 'vitest';
import { PortfolioScenarioBuilder } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1C: Realized Disposals with Fees & No Heuristic Matching', () => {
  it('should compute net proceeds, realized gain/loss, and return with fees: BUY 100 @ 10, SELL 40 @ 15, fees = 5, taxes = 1', () => {
    // Canonical Example Section 62:
    // BUY 100 @ 10
    // SELL 40 @ 15, fees = 5, taxes = 1
    // gross = 600, sellingCosts = 6, net = 594, costBasisRemoved = 400, realizedGainLoss = 194, return = 48.5%
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '40',
        unitPrice: '15.00',
        fees: '5.00',
        taxes: '1.00',
        tradeDate: '2026-01-15',
      })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const d = result.state.realizedDisposals[0]!;

    expect(d.grossProceeds.amount).toBe('600');
    expect(d.sellingCosts.amount).toBe('6');
    expect(d.netProceeds.amount).toBe('594');
    expect(d.costBasisRemoved?.amount).toBe('400');
    expect(d.realizedGainLoss?.amount).toBe('194');
    expect(d.realizedReturnPercentage?.value).toBe('48.5');
    expect(d.realizedReturnPercentage?.toString()).toBe('48.5%');

    // Portfolio summary
    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.grossProceeds.amount).toBe('600');
    expect(portSummary.sellingCosts.amount).toBe('6');
    expect(portSummary.netProceeds.amount).toBe('594');
    expect(portSummary.costBasisRemoved?.amount).toBe('400');
    expect(portSummary.realizedGainLoss?.amount).toBe('194');
    expect(portSummary.realizedReturnPercentage?.value).toBe('48.5');
  });

  it('should handle full SELL with fees: BUY 100 @ 10, SELL 100 @ 15, fees = 10, taxes = 2', () => {
    // Section 63: Full sell with fees
    // gross = 1500, costs = 12, net = 1488, costRemoved = 1000, gain = 488, return = 48.8%
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '15.00',
        fees: '10.00',
        taxes: '2.00',
        tradeDate: '2026-01-15',
      })
      .replay();

    expect(result.state.assets.has(String(ASSET_PETR4))).toBe(false);

    const d = result.state.realizedDisposals[0]!;
    expect(d.grossProceeds.amount).toBe('1500');
    expect(d.sellingCosts.amount).toBe('12');
    expect(d.netProceeds.amount).toBe('1488');
    expect(d.costBasisRemoved?.amount).toBe('1000');
    expect(d.realizedGainLoss?.amount).toBe('488');
    expect(d.realizedReturnPercentage?.value).toBe('48.8');
  });

  it('should NEVER match standalone FEE or TAX transactions to a SELL by heuristic', () => {
    // Section 9-10:
    // BUY 100 @ 10
    // SELL 40 @ 15 (no explicit fees on transaction)
    // Independent FEE transaction on same tradeDate, same account
    // Independent TAX transaction on same tradeDate, same account
    // Expected:
    // Disposal netProceeds remains 600 (not reduced to 590 by separate FEE/TAX)
    // Separate FEE and TAX remain deferred in deferredEvents
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '15.00', tradeDate: '2026-01-15' })
      .fee({ amount: '8.00', tradeDate: '2026-01-15' })
      .tax({ amount: '2.00', tradeDate: '2026-01-15' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const d = result.state.realizedDisposals[0]!;
    expect(d.grossProceeds.amount).toBe('600');
    expect(d.sellingCosts.amount).toBe('0');
    expect(d.netProceeds.amount).toBe('600');
    expect(d.costBasisRemoved?.amount).toBe('400');
    expect(d.realizedGainLoss?.amount).toBe('200');

    // Standalone FEE and TAX are recorded as cash flow outflows, NOT matched to disposal
    expect(result.deferredEvents).toHaveLength(0);
    expect(result.state.cashFlowEvents).toHaveLength(2);
    expect(result.state.cashFlowEvents[0]!.type).toBe('FEE');
    expect(result.state.cashFlowEvents[0]!.direction).toBe('OUTFLOW');
    expect(result.state.cashFlowEvents[1]!.type).toBe('TAX');
    expect(result.state.cashFlowEvents[1]!.direction).toBe('OUTFLOW');
  });
});
