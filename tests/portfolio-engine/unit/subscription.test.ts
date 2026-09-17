import { describe, it, expect } from 'vitest';
import { Money, Quantity, Transaction } from '@atlas/domain';
import {
  replayPortfolio,
  SubscriptionCostBasisError,
  CurrencyMismatchError,
} from '@atlas/portfolio-engine';
import { scenario } from '../scenario-builder';
import { PORTFOLIO_DEFAULT, ACCOUNT_XP, ASSET_PETR4 } from '../fixtures/assets';

describe('Phase 1E: Subscription Semantics (Exercised Acquisition)', () => {
  it('should increase quantity and carried cost with weighted average cost calculation', () => {
    // Initial BUY: 100 shares @ 20.00 = 2000.00
    // SUBSCRIPTION: 50 shares @ 14.00 = 700.00
    // Result: 150 shares, total cost 2700.00, average cost 18.00
    const result = scenario()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-10' })
      .subscription({
        assetId: ASSET_PETR4,
        quantity: '50',
        unitPrice: '14.00',
        tradeDate: '2026-01-20',
      })
      .replay();

    expect(result.appliedTransactions).toHaveLength(2);
    expect(result.deferredEvents).toHaveLength(0);

    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.value).toBe('150');
    expect(pos.totalCost?.amount).toBe('2700');
    expect(pos.averageCost?.amount).toBe('18');
    expect(pos.costBasisStatus).toBe('KNOWN');

    // Never emits a RealizedDisposal
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('should support initial acquisition via SUBSCRIPTION on an empty position', () => {
    // Starting directly with exercised subscription: 100 shares @ 15.00 = 1500.00
    const result = scenario()
      .subscription({
        assetId: ASSET_PETR4,
        quantity: '100',
        unitPrice: '15.00',
        tradeDate: '2026-01-10',
      })
      .replay();

    expect(result.appliedTransactions).toHaveLength(1);
    const pos = result.state.assets.get(String(ASSET_PETR4))!;
    expect(pos.quantity.value).toBe('100');
    expect(pos.totalCost?.amount).toBe('1500');
    expect(pos.averageCost?.amount).toBe('15');
    expect(pos.costBasisStatus).toBe('KNOWN');
  });

  it('should reject zero subscription unitPrice (free allocations belong to BONUS)', () => {
    const invalidTx = {
      id: 'tx-sub-zero-price',
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      assetId: ASSET_PETR4,
      type: 'SUBSCRIPTION' as const,
      quantity: Quantity.from('20'),
      unitPrice: Money.from('0.00', 'BRL'),
      currency: 'BRL' as const,
      tradeDate: '2026-01-15',
      source: 'MANUAL' as const,
      createdAt: new Date(),
    };

    expect(() => {
      replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [invalidTx as unknown as Transaction],
      });
    }).toThrow(SubscriptionCostBasisError);
  });

  it('should reject negative subscription unitPrice with SubscriptionCostBasisError', () => {
    const invalidTx = {
      id: 'tx-sub-neg-price',
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      assetId: ASSET_PETR4,
      type: 'SUBSCRIPTION' as const,
      quantity: Quantity.from('10'),
      unitPrice: Money.from('-5.00', 'BRL'),
      currency: 'BRL' as const,
      tradeDate: '2026-01-15',
      source: 'MANUAL' as const,
      createdAt: new Date(),
    };

    expect(() => {
      replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [invalidTx as unknown as Transaction],
      });
    }).toThrow(SubscriptionCostBasisError);
  });

  it('should reject non-positive subscription quantity with SubscriptionCostBasisError', () => {
    const invalidTx = {
      id: 'tx-sub-zero-qty',
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      assetId: ASSET_PETR4,
      type: 'SUBSCRIPTION' as const,
      quantity: Quantity.zero(),
      unitPrice: Money.from('10.00', 'BRL'),
      currency: 'BRL' as const,
      tradeDate: '2026-01-15',
      source: 'MANUAL' as const,
      createdAt: new Date(),
    };

    expect(() => {
      replayPortfolio({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [invalidTx as unknown as Transaction],
      });
    }).toThrow(SubscriptionCostBasisError);
  });

  it('should reject currency mismatch between subscription transaction and asset position', () => {
    const result = scenario().buy({
      assetId: ASSET_PETR4,
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });

    expect(() => {
      result
        .subscription({
          assetId: ASSET_PETR4,
          quantity: '20',
          unitPrice: '10.00',
          currency: 'USD',
          tradeDate: '2026-01-15',
        })
        .replay();
    }).toThrow(CurrencyMismatchError);
  });
});
