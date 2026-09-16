import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';
import { Money, Quantity } from '@atlas/domain';

describe('Portfolio Engine Core: Corporate Actions Interaction with Subsequent Realized Sales', () => {
  it('SPLIT then SELL: subsequent sale uses post-split average cost to compute cost basis removed and realized gain', () => {
    // Buy 100 @ R$ 10.00 (cost 1000.00, avg 10.00)
    // Split 2:1 -> qty 200, cost 1000.00, avg 5.00
    // Sell 50 @ R$ 8.00 -> gross 400.00, costRemoved 50 * 5 = 250.00, realizedGain 150.00, return 60%
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .split({ factor: '2', tradeDate: '2026-01-20' })
      .sell({ quantity: '50', unitPrice: '8.00', tradeDate: '2026-01-25' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0];
    expect(disposal.grossProceeds.equals(Money.from('400.00', 'BRL'))).toBe(true);
    expect(disposal.costBasisRemoved?.equals(Money.from('250.00', 'BRL'))).toBe(true);
    expect(disposal.realizedGainLoss?.equals(Money.from('150.00', 'BRL'))).toBe(true);
    expect(disposal.realizedReturnPercentage?.value).toBe('60');
    expect(disposal.status).toBe('KNOWN');

    // Remaining position: 150 shares @ avg R$ 5.00, totalCost R$ 750.00
    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(petr4.totalCost?.equals(Money.from('750.00', 'BRL'))).toBe(true);
    expect(petr4.averageCost?.equals(Money.from('5.00', 'BRL'))).toBe(true);
  });

  it('REVERSE_SPLIT then SELL: subsequent sale uses post-consolidation average cost', () => {
    // Buy 1000 @ R$ 10.00 (cost 10000.00, avg 10.00)
    // Reverse split 10:1 -> qty 100, cost 10000.00, avg 100.00
    // Sell 20 @ R$ 120.00 -> gross 2400.00, costRemoved 2000.00, realizedGain 400.00, return 20%
    const result = scenario()
      .buy({ quantity: '1000', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .reverseSplit({ factor: '10', tradeDate: '2026-01-20' })
      .sell({ quantity: '20', unitPrice: '120.00', tradeDate: '2026-01-25' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0];
    expect(disposal.grossProceeds.equals(Money.from('2400.00', 'BRL'))).toBe(true);
    expect(disposal.costBasisRemoved?.equals(Money.from('2000.00', 'BRL'))).toBe(true);
    expect(disposal.realizedGainLoss?.equals(Money.from('400.00', 'BRL'))).toBe(true);
    expect(disposal.realizedReturnPercentage?.value).toBe('20');
  });

  it('BONUS with explicit cost then SELL: subsequent sale incorporates bonus cost basis', () => {
    // Buy 100 @ R$ 10.00 (cost 1000.00)
    // Bonus 20 with assignedCost R$ 200.00 -> qty 120, cost 1200.00, avg 10.00
    // Sell 60 @ R$ 12.00 -> gross 720.00, costRemoved 600.00, realizedGain 120.00, return 20%
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .bonus({ quantity: '20', assignedCost: '200.00', tradeDate: '2026-01-20' })
      .sell({ quantity: '60', unitPrice: '12.00', tradeDate: '2026-01-25' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0];
    expect(disposal.costBasisRemoved?.equals(Money.from('600.00', 'BRL'))).toBe(true);
    expect(disposal.realizedGainLoss?.equals(Money.from('120.00', 'BRL'))).toBe(true);
    expect(disposal.realizedReturnPercentage?.value).toBe('20');
  });

  it('BONUS without cost then SELL: subsequent sale respects INCOMPLETE status and does not fabricate gain', () => {
    // Buy 100 @ R$ 10.00 (cost 1000.00)
    // Bonus 20 without cost -> qty 120, costBasisStatus = INCOMPLETE
    // Sell 50 @ R$ 12.00 -> disposal status INCOMPLETE, costBasisRemoved/gain undefined
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .bonus({ quantity: '20', tradeDate: '2026-01-20' })
      .sell({ quantity: '50', unitPrice: '12.00', tradeDate: '2026-01-25' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0];
    expect(disposal.grossProceeds.equals(Money.from('600.00', 'BRL'))).toBe(true);
    expect(disposal.costBasisRemoved).toBeUndefined();
    expect(disposal.realizedGainLoss).toBeUndefined();
    expect(disposal.realizedReturnPercentage).toBeUndefined();
    expect(disposal.status).toBe('INCOMPLETE');
  });

  it('AMORTIZATION then SELL: subsequent sale uses reduced cost basis', () => {
    // Buy 100 @ R$ 10.00 (cost 1000.00, avg 10.00)
    // Amortize R$ 200.00 -> qty 100, cost 800.00, avg 8.00
    // Sell 50 @ R$ 10.00 -> gross 500.00, costRemoved 50 * 8 = 400.00, realizedGain 100.00, return 25%
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .amortization({ amount: '200.00', tradeDate: '2026-01-20' })
      .sell({ quantity: '50', unitPrice: '10.00', tradeDate: '2026-01-25' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0];
    expect(disposal.grossProceeds.equals(Money.from('500.00', 'BRL'))).toBe(true);
    expect(disposal.costBasisRemoved?.equals(Money.from('400.00', 'BRL'))).toBe(true);
    expect(disposal.realizedGainLoss?.equals(Money.from('100.00', 'BRL'))).toBe(true);
    expect(disposal.realizedReturnPercentage?.value).toBe('25');
  });

  it('AMORTIZATION to ZERO then SELL: subsequent sale has zero cost basis removed and undefined return percentage', () => {
    // Buy 100 @ R$ 10.00 (cost 1000.00, avg 10.00)
    // Amortize R$ 1000.00 -> qty 100, cost 0.00, avg 0.00 (KNOWN)
    // Sell 50 @ R$ 5.00 -> gross 250.00, costRemoved 0.00, realizedGain 250.00, return undefined (cost basis is zero)
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .amortization({ amount: '1000.00', tradeDate: '2026-01-20' })
      .sell({ quantity: '50', unitPrice: '5.00', tradeDate: '2026-01-25' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0];
    expect(disposal.grossProceeds.equals(Money.from('250.00', 'BRL'))).toBe(true);
    expect(disposal.costBasisRemoved?.equals(Money.from('0.00', 'BRL'))).toBe(true);
    expect(disposal.realizedGainLoss?.equals(Money.from('250.00', 'BRL'))).toBe(true);
    expect(disposal.realizedReturnPercentage).toBeUndefined(); // costBasisRemoved is 0 -> return % is undefined
    expect(disposal.status).toBe('KNOWN');
  });
});
