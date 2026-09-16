import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { IncompleteAmortizationCostError } from '@atlas/portfolio-engine';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Portfolio Engine Core: Corporate Actions on Incomplete Cost Basis Positions', () => {
  it('SPLIT on position with INCOMPLETE cost basis: adjusts quantity, keeps status INCOMPLETE and cost undefined', () => {
    // Incomplete position created via transfer-in without cost basis
    const result = scenario()
      .transferIn({ quantity: '100', tradeDate: '2026-01-10' })
      .split({ factor: '2', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.value).toBe('200');
    expect(petr4.totalCost).toBeUndefined();
    expect(petr4.averageCost).toBeUndefined();
    expect(petr4.costBasisStatus).toBe('INCOMPLETE');

    // Audit record reflects INCOMPLETE status
    expect(result.state.appliedCorporateActions).toHaveLength(1);
    expect(result.state.appliedCorporateActions[0].status).toBe('INCOMPLETE');
  });

  it('REVERSE_SPLIT on position with INCOMPLETE cost basis: adjusts quantity, keeps status INCOMPLETE', () => {
    const result = scenario()
      .transferIn({ quantity: '100', tradeDate: '2026-01-10' })
      .reverseSplit({ factor: '10', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.value).toBe('10');
    expect(petr4.totalCost).toBeUndefined();
    expect(petr4.averageCost).toBeUndefined();
    expect(petr4.costBasisStatus).toBe('INCOMPLETE');
  });

  it('BONUS on position with INCOMPLETE cost basis: increases quantity, status remains INCOMPLETE even if bonus has cost', () => {
    const result = scenario()
      .transferIn({ quantity: '100', tradeDate: '2026-01-10' })
      .bonus({ quantity: '20', assignedCost: '200.00', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.value).toBe('120');
    expect(petr4.totalCost).toBeUndefined();
    expect(petr4.averageCost).toBeUndefined();
    expect(petr4.costBasisStatus).toBe('INCOMPLETE');
  });

  it('AMORTIZATION on position with INCOMPLETE cost basis: throws IncompleteAmortizationCostError', () => {
    expect(() =>
      scenario()
        .transferIn({ quantity: '100', tradeDate: '2026-01-10' })
        .amortization({ amount: '200.00', tradeDate: '2026-01-20' })
        .replay(),
    ).toThrow(IncompleteAmortizationCostError);
  });
});
