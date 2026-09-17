import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Subscription on INCOMPLETE Cost Basis Position', () => {
  it('should maintain INCOMPLETE cost basis status when subscription is exercised on an incomplete position', () => {
    // Position with INCOMPLETE status (via TRANSFER_IN without carried cost)
    // Then SUBSCRIPTION is exercised
    const result = scenario()
      .transferIn({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-05' })
      .subscription({
        assetId: ASSET_PETR4,
        quantity: '20',
        unitPrice: '15.00',
        tradeDate: '2026-01-10',
      })
      .replay();

    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.value).toBe('120');
    // Status must remain INCOMPLETE (cannot invent total cost without knowing initial transfer cost)
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.totalCost).toBeUndefined();
    expect(pos.averageCost).toBeUndefined();
  });

  it('should properly dispose position with INCOMPLETE status after subscription', () => {
    const result = scenario()
      .transferIn({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-05' })
      .subscription({
        assetId: ASSET_PETR4,
        quantity: '20',
        unitPrice: '15.00',
        tradeDate: '2026-01-10',
      })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '25.00', tradeDate: '2026-01-15' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(1);
    const d = result.state.realizedDisposals[0]!;
    expect(d.status).toBe('INCOMPLETE');
    expect(d.grossProceeds.amount).toBe('1000');
    expect(d.costBasisRemoved).toBeUndefined();
    expect(d.realizedGainLoss).toBeUndefined();
  });
});
