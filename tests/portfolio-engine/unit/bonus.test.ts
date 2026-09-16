import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import {
  InvalidBonusQuantityError,
  EmptyPositionCorporateActionError,
  CurrencyMismatchError,
  createPortfolioReplayEngine,
} from '@atlas/portfolio-engine';
import { ASSET_PETR4, ACCOUNT_XP, PORTFOLIO_DEFAULT } from '../fixtures/assets';
import { Money, Quantity, LocalDate, BonusTransaction, createTransactionId } from '@atlas/domain';

describe('Portfolio Engine Core: BONUS Corporate Action', () => {
  it('should increase quantity, add explicit assigned cost, and recalculate weighted average cost', () => {
    // 100 shares @ R$ 10.00 (cost: R$ 1,000.00) + 20 bonus shares with explicit assignedCost R$ 200.00
    // Total cost = 1200.00, Total quantity = 120, New average cost = 10.00
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .bonus({ quantity: '20', assignedCost: '200.00', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('120'))).toBe(true);
    expect(petr4.totalCost?.equals(Money.from('1200.00', 'BRL'))).toBe(true);
    expect(petr4.averageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(petr4.costBasisStatus).toBe('KNOWN');

    // Audit record verification
    expect(result.state.appliedCorporateActions).toHaveLength(1);
    const ca = result.state.appliedCorporateActions[0];
    expect(ca.type).toBe('BONUS');
    expect(ca.beforeQuantity.equals(Quantity.from('100'))).toBe(true);
    expect(ca.afterQuantity.equals(Quantity.from('120'))).toBe(true);
    expect(ca.beforeTotalCost?.equals(Money.from('1000.00', 'BRL'))).toBe(true);
    expect(ca.afterTotalCost?.equals(Money.from('1200.00', 'BRL'))).toBe(true);
    expect(ca.beforeAverageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(ca.afterAverageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(ca.status).toBe('KNOWN');

    // No realized disposal
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('should transition costBasisStatus to INCOMPLETE when bonus lacks explicit assigned cost (never assumes zero cost)', () => {
    const result = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .bonus({ quantity: '20', tradeDate: '2026-01-20' }) // No assignedCost
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('120'))).toBe(true);
    expect(petr4.totalCost).toBeUndefined();
    expect(petr4.averageCost).toBeUndefined();
    expect(petr4.costBasisStatus).toBe('INCOMPLETE');

    // Audit record reflects INCOMPLETE status
    expect(result.state.appliedCorporateActions).toHaveLength(1);
    expect(result.state.appliedCorporateActions[0].status).toBe('INCOMPLETE');
    expect(result.state.appliedCorporateActions[0].afterTotalCost).toBeUndefined();
  });

  it('should reject non-positive bonus quantity in engine with InvalidBonusQuantityError', () => {
    const engine = createPortfolioReplayEngine();
    const buy = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .build()[0]!;

    const rawBonus: BonusTransaction = {
      id: createTransactionId('55555555-5555-4555-8555-555555555553'),
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      assetId: ASSET_PETR4,
      type: 'BONUS',
      quantity: Quantity.from('0'),
      currency: 'BRL',
      tradeDate: LocalDate.from('2026-01-20'),
      source: 'MANUAL',
      createdAt: new Date(),
    };

    expect(() =>
      engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [buy, rawBonus],
      }),
    ).toThrow(InvalidBonusQuantityError);
  });

  it('should reject currency mismatch in assignedCost with CurrencyMismatchError', () => {
    expect(() =>
      scenario()
        .buy({ quantity: '100', unitPrice: '10.00', currency: 'BRL', tradeDate: '2026-01-10' })
        .bonus({ quantity: '20', assignedCost: '100.00', currency: 'USD', tradeDate: '2026-01-20' })
        .replay(),
    ).toThrow(CurrencyMismatchError);
  });

  it('should reject BONUS when account holds no active position for the asset', () => {
    expect(() => scenario().bonus({ quantity: '20', tradeDate: '2026-01-20' }).replay()).toThrow(
      EmptyPositionCorporateActionError,
    );
  });
});
