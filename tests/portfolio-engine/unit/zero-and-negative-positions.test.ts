import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import { ASSET_PETR4, ACCOUNT_XP, PORTFOLIO_DEFAULT } from '../fixtures/assets';
import { NegativePositionError } from '@atlas/portfolio-engine';

describe('Portfolio Engine Core: Zero and Negative Position Policies', () => {
  it('Zero Position Policy: when asset is fully liquidated, it is omitted from active positions', () => {
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-20' })
      .replay();

    expect(result.appliedTransactions).toHaveLength(2);

    // The account remains registered because transactions occurred in it
    const account = result.state.accounts.get(String(ACCOUNT_XP));
    expect(account).toBeDefined();
    // But the asset position is omitted because its quantity is zero
    expect(account?.assets.has(String(ASSET_PETR4))).toBe(false);
    expect(account?.assets.size).toBe(0);

    // And in the portfolio aggregated view, the zero position is omitted
    expect(result.state.assets.has(String(ASSET_PETR4))).toBe(false);
    expect(result.state.assets.size).toBe(0);
  });

  it('Long-only Policy: oversell must throw NegativePositionError', () => {
    const s = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '101', tradeDate: '2026-01-20' });

    expect(() => s.replay()).toThrow(NegativePositionError);

    try {
      s.replay();
    } catch (err) {
      expect(err).toBeInstanceOf(NegativePositionError);
      const posErr = err as NegativePositionError;
      expect(posErr.code).toBe('PORTFOLIO_ENGINE.NEGATIVE_POSITION');
      expect(posErr.portfolioId).toBe(String(PORTFOLIO_DEFAULT));
      expect(posErr.accountId).toBe(String(ACCOUNT_XP));
      expect(posErr.assetId).toBe(String(ASSET_PETR4));
      expect(posErr.currentQuantity).toBe('100');
      expect(posErr.attemptedDeduction).toBe('101');
      expect(posErr.resultingQuantity).toBe('-1');
    }
  });

  it('Long-only Policy: selling an asset without prior holding must throw NegativePositionError', () => {
    const s = scenario().sell({ assetId: ASSET_PETR4, quantity: '10', tradeDate: '2026-01-10' });

    expect(() => s.replay()).toThrow(NegativePositionError);
  });
});
