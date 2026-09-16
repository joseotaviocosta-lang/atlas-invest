import { describe, it, expect } from 'vitest';
import { PortfolioScenarioBuilder } from '../scenario-builder';
import { ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1C: Incomplete Cost Basis Policy & Non-Disposal Exclusions', () => {
  it('should mark realized disposal and summaries as INCOMPLETE without fabricating fake gain/loss when cost basis is unknown', () => {
    // Section 25-28, 70-72, 98, 113:
    // TRANSFER_IN establishes position with costBasisStatus: 'INCOMPLETE' (ADR-043)
    // Then SELL 40 @ 25:
    // Quantity reduces by 40 (remaining = 60)
    // RealizedDisposal is created:
    // status = 'INCOMPLETE'
    // grossProceeds = 1000, netProceeds = 1000
    // costBasisRemoved = undefined
    // realizedGainLoss = undefined
    // realizedReturnPercentage = undefined
    const result = new PortfolioScenarioBuilder()
      .transferIn({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '25.00', tradeDate: '2026-01-15' })
      .replay();

    // 1. Quantity is reduced and remaining position remains INCOMPLETE
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.toString()).toBe('60');
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.totalCost).toBeUndefined();
    expect(pos.averageCost).toBeUndefined();

    // 2. Disposal is registered but explicitly marked INCOMPLETE (Section 26)
    expect(result.state.realizedDisposals).toHaveLength(1);
    const d = result.state.realizedDisposals[0]!;
    expect(d.status).toBe('INCOMPLETE');
    expect(d.grossProceeds.amount).toBe('1000');
    expect(d.netProceeds.amount).toBe('1000');
    expect(d.costBasisRemoved).toBeUndefined();
    expect(d.realizedGainLoss).toBeUndefined();
    expect(d.realizedReturnPercentage).toBeUndefined();

    // 3. Account summary propagates INCOMPLETE (Section 70-71: DO NOT PARTIALLY LIE)
    const defaultAccountId = result.appliedTransactions[0]!.accountId;
    const accSummary = result.state.accounts
      .get(String(defaultAccountId))!
      .realizedSummary.get('BRL')!;
    expect(accSummary.status).toBe('INCOMPLETE');
    expect(accSummary.grossProceeds.amount).toBe('1000');
    expect(accSummary.netProceeds.amount).toBe('1000');
    expect(accSummary.costBasisRemoved).toBeUndefined();
    expect(accSummary.realizedGainLoss).toBeUndefined();
    expect(accSummary.realizedReturnPercentage).toBeUndefined();

    // 4. Portfolio summary propagates INCOMPLETE
    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.status).toBe('INCOMPLETE');
    expect(portSummary.costBasisRemoved).toBeUndefined();
    expect(portSummary.realizedGainLoss).toBeUndefined();
  });

  it('should propagate INCOMPLETE to portfolio summary if any disposal in that currency has unknown cost basis', () => {
    // 2 sales in same account:
    // 1st sale on known cost basis (gain = +100)
    // 2nd sale on incomplete position (unknown cost)
    // Portfolio summary must be marked INCOMPLETE, not partially lying that total gain is +100
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '50', unitPrice: '10.00', tradeDate: '2026-01-05' })
      .sell({ assetId: ASSET_PETR4, quantity: '20', unitPrice: '15.00', tradeDate: '2026-01-08' })
      .transferIn({ assetId: ASSET_PETR4, quantity: '50', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '30', unitPrice: '20.00', tradeDate: '2026-01-15' })
      .replay();

    expect(result.state.realizedDisposals).toHaveLength(2);
    expect(result.state.realizedDisposals[0]!.status).toBe('KNOWN');
    expect(result.state.realizedDisposals[0]!.realizedGainLoss?.amount).toBe('100');
    expect(result.state.realizedDisposals[1]!.status).toBe('INCOMPLETE');
    expect(result.state.realizedDisposals[1]!.realizedGainLoss).toBeUndefined();

    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.status).toBe('INCOMPLETE');
    expect(portSummary.costBasisRemoved).toBeUndefined();
    expect(portSummary.realizedGainLoss).toBeUndefined();
    expect(portSummary.realizedReturnPercentage).toBeUndefined();
    // Known cash proceeds are still aggregated: 20 * 15 (300) + 30 * 20 (600) = 900
    expect(portSummary.grossProceeds.amount).toBe('900');
    expect(portSummary.netProceeds.amount).toBe('900');
  });

  it('should NEVER create a RealizedDisposal for TRANSFER_OUT, TRANSFER_IN, or BUY', () => {
    // Section 48, 49, 52, 97, 111 (Invariant 6):
    // TRANSFER_OUT removes quantity and cost basis from account, but TRANSFER_OUT != economic disposal
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .transferOut({ assetId: ASSET_PETR4, quantity: '40', tradeDate: '2026-01-15' })
      .transferIn({ assetId: ASSET_PETR4, quantity: '20', tradeDate: '2026-01-20' })
      .replay();

    // 3 transactions applied (BUY, TRANSFER_OUT, TRANSFER_IN)
    expect(result.appliedTransactions).toHaveLength(3);

    // Exactly ZERO realized disposals created (Section 111 Invariant 6)
    expect(result.state.realizedDisposals).toHaveLength(0);
    expect(result.state.realizedSummary.size).toBe(0);

    // Account position correctly reflects remaining shares
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.toString()).toBe('80'); // 100 - 40 + 20
  });
});
