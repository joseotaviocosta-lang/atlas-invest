import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ACCOUNT_XP, ACCOUNT_NU } from '../fixtures/assets';

/**
 * VIVT3 April-2025 grouping/split validation (official event, ex-date
 * 2025-04-15): REVERSE_SPLIT factor 40 then SPLIT factor 80.
 * 200 → 5 → 400, exact multiples, zero fractions. Harness only, no writes.
 */
describe('VIVT3 2025 split validation', () => {
  it('200 reverse-split 40 → 5, then split 80 → 400 (INCOMPLETE preserved)', () => {
    const result = scenario()
      .transferIn({ quantity: '200', tradeDate: '2024-12-31' })
      .reverseSplit({ factor: '40', tradeDate: '2025-04-15' })
      .split({ factor: '80', tradeDate: '2025-04-15' })
      .replay();
    const [assetId] = [...result.state.assets.keys()];
    const pos = result.state.assets.get(assetId!)!;
    expect(pos.quantity.value).toBe('400');
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.totalCost).toBeUndefined();
    expect(pos.averageCost).toBeUndefined();
    expect(result.state.realizedDisposals).toHaveLength(0);
    expect(result.state.incomeEvents).toHaveLength(0);
    expect(result.totalProcessedCount).toBe(3);
    const types = result.state.appliedCorporateActions.map((ca) => ca.type);
    expect(types).toEqual(['REVERSE_SPLIT', 'SPLIT']);
  });

  it('same-day legs are order-invariant for exact multiples (either input order → 400)', () => {
    const forward = scenario()
      .transferIn({ quantity: '200', tradeDate: '2024-12-31' })
      .reverseSplit({ factor: '40', tradeDate: '2025-04-15' })
      .split({ factor: '80', tradeDate: '2025-04-15' })
      .replay();
    // Forced reverse order via explicit createdAt: SPLIT replays first.
    const reversed = scenario()
      .transferIn({ quantity: '200', tradeDate: '2024-12-31' })
      .split({
        factor: '80',
        tradeDate: '2025-04-15',
        createdAt: new Date('2025-04-15T00:00:00.000Z'),
      })
      .reverseSplit({
        factor: '40',
        tradeDate: '2025-04-15',
        createdAt: new Date('2025-04-15T00:00:01.000Z'),
      })
      .replay();
    for (const result of [forward, reversed]) {
      const [assetId] = [...result.state.assets.keys()];
      expect(result.state.assets.get(assetId!)!.quantity.value).toBe('400');
      expect(result.state.realizedDisposals).toHaveLength(0);
    }
  });

  it('KNOWN total cost is invariant across both legs (200 @ 10 → 400 @ 5)', () => {
    const result = scenario()
      .buy({ quantity: '200', unitPrice: '10.00', tradeDate: '2024-12-31' })
      .reverseSplit({ factor: '40', tradeDate: '2025-04-15' })
      .split({ factor: '80', tradeDate: '2025-04-15' })
      .replay();
    const [assetId] = [...result.state.assets.keys()];
    const pos = result.state.assets.get(assetId!)!;
    expect(pos.quantity.value).toBe('400');
    expect(pos.costBasisStatus).toBe('KNOWN');
    expect(pos.totalCost?.amount).toBe('2000');
    expect(pos.averageCost?.amount).toBe('5');
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('split composes with matched loan-roll transfers (economic qty transformed)', () => {
    const result = scenario()
      .transferIn({ quantity: '200', tradeDate: '2024-12-31', accountId: ACCOUNT_XP })
      .reverseSplit({ factor: '40', tradeDate: '2025-04-15', accountId: ACCOUNT_XP })
      .split({ factor: '80', tradeDate: '2025-04-15', accountId: ACCOUNT_XP })
      .transfer({
        fromAccountId: ACCOUNT_XP,
        toAccountId: ACCOUNT_NU,
        quantity: '400',
        tradeDate: '2025-11-27',
      })
      .replay();
    const [assetId] = [...result.state.assets.keys()];
    expect(result.state.assets.get(assetId!)!.quantity.value).toBe('400');
    expect(result.state.realizedDisposals).toHaveLength(0);
  });
});
