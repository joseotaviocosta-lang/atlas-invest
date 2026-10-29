import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { NegativePositionError } from '@atlas/portfolio-engine';
import { ASSET_PETR4 } from '../fixtures/assets';
import { Quantity } from '@atlas/domain';

describe('Historical Baseline & Movement Reconstruction Principles (Step 31)', () => {
  it('1. Opening qty permits later sell: baseline custody prevents NegativePositionError', () => {
    // Simulates establishing baseline custody of 700 units on 2024-12-31, then selling 700 on 2025-09-12
    const result = scenario()
      .transferIn({
        assetId: ASSET_PETR4,
        quantity: '700',
        tradeDate: '2024-12-31',
      })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '700',
        unitPrice: '14.35',
        tradeDate: '2025-09-12',
      })
      .replay();

    expect(result.appliedTransactions).toHaveLength(2);
    // After selling 700 out of 700, the position is exactly 0 and omitted per Zero Position Policy (ADR-039)
    expect(result.state.assets.has(String(ASSET_PETR4))).toBe(false);
  });

  it('2. Missing opening triggers NegativePositionError with diagnostic fields', () => {
    // Selling without prior custody must fail long-only invariant
    const s = scenario().sell({
      assetId: ASSET_PETR4,
      quantity: '700',
      unitPrice: '14.35',
      tradeDate: '2025-09-12',
    });

    try {
      s.replay();
      expect.unreachable('Should have thrown NegativePositionError');
    } catch (err) {
      expect(err).toBeInstanceOf(NegativePositionError);
      const posErr = err as NegativePositionError;
      expect(posErr.assetId).toBe(String(ASSET_PETR4));
      expect(posErr.attemptedDeduction).toBe('700');
      expect(posErr.currentQuantity).toBe('0');
      expect(posErr.tradeDate).toBe('2025-09-12');
    }
  });

  it('3. Quantity known / cost unknown: TRANSFER_IN without cost establishes quantity but flags INCOMPLETE cost basis', () => {
    const result = scenario()
      .transferIn({
        assetId: ASSET_PETR4,
        quantity: '1000',
        tradeDate: '2024-12-31',
      })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('1000'))).toBe(true);
    // Cost basis is INCOMPLETE because no cost was provided with the opening transfer
    expect(petr4.costBasisStatus).toBe('INCOMPLETE');
    expect(petr4.totalCost).toBeUndefined();
  });

  it('4. Bonus corporate action increases quantity without being a trade BUY', () => {
    // ITSA4 bonus shares: 1000 shares + 23.54 bonus shares
    const result = scenario()
      .transferIn({
        assetId: ASSET_PETR4,
        quantity: '1000',
        tradeDate: '2024-12-31',
      })
      .bonus({
        assetId: ASSET_PETR4,
        quantity: '23.54',
        tradeDate: '2025-12-22',
      })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('1023.54'))).toBe(true);
  });

  it('5. Dividend cash event does not alter quantity', () => {
    const result = scenario()
      .transferIn({
        assetId: ASSET_PETR4,
        quantity: '500',
        tradeDate: '2024-12-31',
      })
      .dividend({
        assetId: ASSET_PETR4,
        amount: '150.00',
        tradeDate: '2025-04-15',
      })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('500'))).toBe(true);
    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.state.incomeEvents).toHaveLength(1);
    expect(result.state.incomeEvents[0].type).toBe('DIVIDEND');
  });

  it('6. JCP cash event does not alter quantity', () => {
    const result = scenario()
      .transferIn({
        assetId: ASSET_PETR4,
        quantity: '500',
        tradeDate: '2024-12-31',
      })
      .jcp({
        assetId: ASSET_PETR4,
        amount: '75.00',
        tradeDate: '2025-06-30',
      })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('500'))).toBe(true);
    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.state.incomeEvents).toHaveLength(1);
    expect(result.state.incomeEvents[0].type).toBe('JCP');
  });
});
