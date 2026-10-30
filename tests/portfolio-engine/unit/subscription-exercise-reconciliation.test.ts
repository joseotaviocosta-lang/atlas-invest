import { describe, it, expect } from 'vitest';
import { createAssetId } from '@atlas/domain';
import { scenario } from '../scenario-builder';

/** Synthetic SNAG11-shaped asset id (UUID-typed, ticker-agnostic). */
const ASSET_SNAG11 = createAssetId('e0000000-0000-4000-8000-000000000011');

/**
 * SNAG11 synthetic reconciliation shape: an INCOMPLETE opening position plus
 * two priced subscription exercises reaches the B3 quantity (1646 + 200)
 * with cost honesty preserved (INCOMPLETE stays INCOMPLETE, zero disposals,
 * zero income). Mirrors the real SNAG11 case without touching the ledger.
 */
describe('Subscription exercise reconciliation (SNAG synthetic)', () => {
  it('adds exercised quantity with known price, emits no disposal, keeps INCOMPLETE', () => {
    const result = scenario()
      .transferIn({ assetId: ASSET_SNAG11, quantity: '1646', tradeDate: '2024-12-31' })
      .subscription({
        assetId: ASSET_SNAG11,
        quantity: '100',
        unitPrice: '10.50',
        tradeDate: '2026-03-27',
      })
      .subscription({
        assetId: ASSET_SNAG11,
        quantity: '100',
        unitPrice: '10.50',
        tradeDate: '2026-04-13',
      })
      .replay();
    const pos = result.state.assets.get(ASSET_SNAG11)!;
    expect(pos.quantity.value).toBe('1846');
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.totalCost).toBeUndefined();
    expect(pos.averageCost).toBeUndefined();
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('subscription on a KNOWN position folds acquisition cost without realizing gain', () => {
    const result = scenario()
      .buy({ assetId: ASSET_SNAG11, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .subscription({
        assetId: ASSET_SNAG11,
        quantity: '100',
        unitPrice: '10.50',
        tradeDate: '2026-03-27',
      })
      .replay();
    const pos = result.state.assets.get(ASSET_SNAG11)!;
    expect(pos.quantity.value).toBe('200');
    expect(pos.costBasisStatus).toBe('KNOWN');
    expect(pos.totalCost?.amount).toBe('2050');
    expect(result.state.realizedDisposals).toHaveLength(0);
  });
});
