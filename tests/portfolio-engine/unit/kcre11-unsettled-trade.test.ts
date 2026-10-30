import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';

/**
 * KCRE11 unsettled-trade projection (PART O): opening 120 @ 31/12/2024
 * (26/12 leg, settled) + BUY 80 @ 27/12/2024 (settled 02/01/2025) +
 * Jan-2025 BUYs 96 + 4. Mirrors the proven equation
 * 120 + 80 + 96 + 4 = 300 with zero sells. No ledger writes (harness only).
 */
describe('KCRE11 pre-baseline unsettled trade projection', () => {
  function kcre11Scenario() {
    return scenario()
      .transferIn({ quantity: '120', tradeDate: '2024-12-31' })
      .buy({ quantity: '80', unitPrice: '8.45', tradeDate: '2024-12-27' })
      .buy({ quantity: '96', unitPrice: '7.99', tradeDate: '2025-01-24' })
      .buy({ quantity: '4', unitPrice: '7.98', tradeDate: '2025-01-24' });
  }

  it('projects current 300 with INCOMPLETE aggregate and zero disposals', () => {
    const result = kcre11Scenario().replay();
    const [assetId] = [...result.state.assets.keys()];
    const pos = result.state.assets.get(assetId!)!;
    expect(pos.quantity.value).toBe('300');
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.totalCost).toBeUndefined();
    expect(pos.averageCost).toBeUndefined();
    expect(result.state.realizedDisposals).toHaveLength(0);
    expect(result.totalProcessedCount).toBe(4);
  });

  it('documents the trade-date vs settled-custody asOf divergence at 31/12/2024', () => {
    const historical = kcre11Scenario().asOf('2024-12-31').replay();
    const [assetId] = [...historical.state.assets.keys()];
    // Trade-date economics recognize the 27/12 entitlement (120 + 80),
    // while the B3 settled-custody snapshot reports 120. Legitimate,
    // documented divergence — converges to exact match at every later asOf.
    expect(historical.state.assets.get(assetId!)!.quantity.value).toBe('200');
    const later = kcre11Scenario().asOf('2025-12-31').replay();
    expect(later.state.assets.get(assetId!)!.quantity.value).toBe('300');
  });
});
