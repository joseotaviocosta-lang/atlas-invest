import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import {
  AmortizationExceedsCostError,
  EmptyPositionCorporateActionError,
  CurrencyMismatchError,
} from '@atlas/portfolio-engine';
import { ASSET_PETR4 } from '../fixtures/assets';
import { Money, Quantity } from '@atlas/domain';

describe('Portfolio Engine Core: AMORTIZATION Corporate Action', () => {
  it('should reduce carried total cost without altering quantity and recalculate average cost', () => {
    // 100 shares @ R$ 10.00 (cost: R$ 1,000.00), amortize R$ 200.00 -> cost: R$ 800.00, avg: R$ 8.00, qty: 100
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .amortization({ amount: '200.00', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('100'))).toBe(true); // Quantity unchanged (Invariant 5)
    expect(petr4.totalCost?.equals(Money.from('800.00', 'BRL'))).toBe(true);
    expect(petr4.averageCost?.equals(Money.from('8.00', 'BRL'))).toBe(true);
    expect(petr4.costBasisStatus).toBe('KNOWN');

    // Audit record verification
    expect(result.state.appliedCorporateActions).toHaveLength(1);
    const ca = result.state.appliedCorporateActions[0];
    expect(ca.type).toBe('AMORTIZATION');
    expect(ca.beforeQuantity.equals(Quantity.from('100'))).toBe(true);
    expect(ca.afterQuantity.equals(Quantity.from('100'))).toBe(true);
    expect(ca.beforeTotalCost?.equals(Money.from('1000.00', 'BRL'))).toBe(true);
    expect(ca.afterTotalCost?.equals(Money.from('800.00', 'BRL'))).toBe(true);
    expect(ca.beforeAverageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(ca.afterAverageCost?.equals(Money.from('8.00', 'BRL'))).toBe(true);
    expect(ca.status).toBe('KNOWN');

    // No realized disposal
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('should allow amortization reducing total cost exactly to zero, setting average cost to zero with KNOWN status', () => {
    // 100 shares @ R$ 10.00 (cost: R$ 1,000.00), amortize R$ 1,000.00 -> cost: R$ 0.00, avg: R$ 0.00, status: KNOWN
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .amortization({ amount: '1000.00', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(petr4.totalCost?.equals(Money.from('0.00', 'BRL'))).toBe(true);
    expect(petr4.averageCost?.equals(Money.from('0.00', 'BRL'))).toBe(true);
    expect(petr4.costBasisStatus).toBe('KNOWN'); // Known zero is distinct from INCOMPLETE
  });

  it('should reject amortization amount exceeding current carried total cost with AmortizationExceedsCostError', () => {
    expect(() =>
      scenario()
        .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
        .amortization({ amount: '1200.00', tradeDate: '2026-01-20' })
        .replay(),
    ).toThrow(AmortizationExceedsCostError);
  });

  it('should reject currency mismatch in amortization with CurrencyMismatchError', () => {
    expect(() =>
      scenario()
        .buy({ quantity: '100', unitPrice: '10.00', currency: 'BRL', tradeDate: '2026-01-10' })
        .amortization({ amount: '200.00', currency: 'USD', tradeDate: '2026-01-20' })
        .replay(),
    ).toThrow(CurrencyMismatchError);
  });

  it('should reject AMORTIZATION when account holds no active position for the asset', () => {
    expect(() =>
      scenario().amortization({ amount: '200.00', tradeDate: '2026-01-20' }).replay(),
    ).toThrow(EmptyPositionCorporateActionError);
  });
});
