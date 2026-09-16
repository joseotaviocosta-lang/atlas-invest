import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import {
  InvalidCorporateActionFactorError,
  EmptyPositionCorporateActionError,
  createPortfolioReplayEngine,
} from '@atlas/portfolio-engine';
import { ASSET_PETR4, ACCOUNT_XP, PORTFOLIO_DEFAULT } from '../fixtures/assets';
import { Money, Quantity, LocalDate, SplitTransaction, createTransactionId } from '@atlas/domain';

describe('Portfolio Engine Core: REVERSE_SPLIT Corporate Action', () => {
  it('should transform quantity, preserve total cost, and recalculate average cost on basic 10:1 reverse split', () => {
    const result = scenario()
      .buy({ quantity: '1000', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .reverseSplit({ factor: '10', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(petr4.totalCost?.equals(Money.from('10000.00', 'BRL'))).toBe(true); // Total cost unchanged (Invariant 2)
    expect(petr4.averageCost?.equals(Money.from('100.00', 'BRL'))).toBe(true);
    expect(petr4.costBasisStatus).toBe('KNOWN');

    // Applied corporate action audit record
    expect(result.state.appliedCorporateActions).toHaveLength(1);
    const ca = result.state.appliedCorporateActions[0];
    expect(ca.type).toBe('REVERSE_SPLIT');
    expect(ca.beforeQuantity.equals(Quantity.from('1000'))).toBe(true);
    expect(ca.afterQuantity.equals(Quantity.from('100'))).toBe(true);
    expect(ca.beforeTotalCost?.equals(Money.from('10000.00', 'BRL'))).toBe(true);
    expect(ca.afterTotalCost?.equals(Money.from('10000.00', 'BRL'))).toBe(true);
    expect(ca.beforeAverageCost?.equals(Money.from('10.00', 'BRL'))).toBe(true);
    expect(ca.afterAverageCost?.equals(Money.from('100.00', 'BRL'))).toBe(true);
    expect(ca.status).toBe('KNOWN');

    // No realized disposal generated
    expect(result.state.realizedDisposals).toHaveLength(0);
  });

  it('should preserve exact fractional result without silent rounding (e.g. 15 / 10 = 1.5)', () => {
    const result = scenario()
      .buy({ quantity: '15', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .reverseSplit({ factor: '10', tradeDate: '2026-01-20' })
      .replay();

    const petr4 = result.state.assets.get(String(ASSET_PETR4))!;
    expect(petr4.quantity.equals(Quantity.from('1.5'))).toBe(true);
    expect(petr4.totalCost?.equals(Money.from('150.00', 'BRL'))).toBe(true);
    expect(petr4.averageCost?.equals(Money.from('100.00', 'BRL'))).toBe(true);
  });

  it('should reject factor = 1 (no-op) with InvalidCorporateActionFactorError', () => {
    expect(() =>
      scenario()
        .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
        .reverseSplit({ factor: '1', tradeDate: '2026-01-20' })
        .replay(),
    ).toThrow(InvalidCorporateActionFactorError);
  });

  it('should reject non-positive factor in engine with InvalidCorporateActionFactorError', () => {
    const engine = createPortfolioReplayEngine();
    const buy = scenario()
      .buy({ quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .build()[0]!;

    const rawReverseSplit: SplitTransaction = {
      id: createTransactionId('55555555-5555-4555-8555-555555555552'),
      portfolioId: PORTFOLIO_DEFAULT,
      accountId: ACCOUNT_XP,
      assetId: ASSET_PETR4,
      type: 'REVERSE_SPLIT',
      factor: Quantity.from('0'),
      currency: 'BRL',
      tradeDate: LocalDate.from('2026-01-20'),
      source: 'MANUAL',
      createdAt: new Date(),
    };

    expect(() =>
      engine.replay({
        portfolioId: PORTFOLIO_DEFAULT,
        transactions: [buy, rawReverseSplit],
      }),
    ).toThrow(InvalidCorporateActionFactorError);
  });

  it('should reject REVERSE_SPLIT when account holds no active position for the asset', () => {
    expect(() =>
      scenario().reverseSplit({ factor: '10', tradeDate: '2026-01-20' }).replay(),
    ).toThrow(EmptyPositionCorporateActionError);
  });
});
