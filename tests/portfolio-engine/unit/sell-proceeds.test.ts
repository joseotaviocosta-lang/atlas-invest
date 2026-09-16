import { describe, it, expect } from 'vitest';
import { PortfolioScenarioBuilder } from '../scenario-builder';
import {
  createPortfolioReplayEngine,
  CurrencyMismatchError,
  InvalidSellPriceError,
  InvalidSellingCostError,
  PORTFOLIO_ENGINE_VERSION,
} from '../../../packages/portfolio-engine/src';
import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  createTransactionId,
  LocalDate,
  Quantity,
  Money,
  TradeTransaction,
} from '@atlas/domain';
import { ASSET_PETR4, ASSET_VALE3 } from '../fixtures/assets';

describe('Phase 1C: SELL Proceeds Calculation & Validation', () => {
  it('should correctly calculate gross proceeds without selling costs', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '20.00', tradeDate: '2026-01-10' })
      .sell({ assetId: ASSET_PETR4, quantity: '40', unitPrice: '25.00', tradeDate: '2026-01-15' })
      .replay();

    expect(result.engineVersion).toBe(PORTFOLIO_ENGINE_VERSION);
    expect(result.state.realizedDisposals).toHaveLength(1);

    const disposal = result.state.realizedDisposals[0]!;
    expect(disposal.grossProceeds.amount).toBe('1000'); // 40 * 25
    expect(disposal.sellingCosts.amount).toBe('0');
    expect(disposal.netProceeds.amount).toBe('1000');
    expect(disposal.currency).toBe('BRL');
    expect(disposal.status).toBe('KNOWN');
  });

  it('should correctly deduct selling costs (fees and taxes) from gross proceeds to yield net proceeds', () => {
    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .sell({
        assetId: ASSET_PETR4,
        quantity: '40',
        unitPrice: '15.00',
        fees: '5.00',
        taxes: '1.00',
        tradeDate: '2026-01-15',
      })
      .replay();

    const disposal = result.state.realizedDisposals[0]!;
    expect(disposal.grossProceeds.amount).toBe('600'); // 40 * 15
    expect(disposal.sellingCosts.amount).toBe('6'); // 5 + 1
    expect(disposal.netProceeds.amount).toBe('594'); // 600 - 6
  });

  it('should reject SELL with unitPrice <= 0 with InvalidSellPriceError', () => {
    expect(() => {
      new PortfolioScenarioBuilder()
        .buy({ assetId: ASSET_PETR4, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
        .sell({
          assetId: ASSET_PETR4,
          quantity: '50',
          unitPrice: '0',
          tradeDate: '2026-01-15',
        })
        .replay();
    }).toThrow(InvalidSellPriceError);
  });

  it('should reject SELL with negative fees or negative taxes with InvalidSellingCostError', () => {
    const portfolioId = createPortfolioId('33333333-3333-4333-8333-333333333333');
    const accountId = createAccountId('11111111-1111-4111-8111-111111111111');
    const assetId = createAssetId(ASSET_PETR4);
    const engine = createPortfolioReplayEngine();

    const buyTx: TradeTransaction = {
      id: createTransactionId('44444444-4444-4444-8444-444444444441'),
      portfolioId,
      accountId,
      assetId,
      type: 'BUY',
      quantity: Quantity.from('100'),
      unitPrice: Money.from('10.00', 'BRL'),
      currency: 'BRL',
      tradeDate: LocalDate.from('2026-01-10'),
      source: 'MANUAL',
      createdAt: new Date('2026-01-10T10:00:00Z'),
    };

    const invalidFeeTx: TradeTransaction = {
      id: createTransactionId('44444444-4444-4444-8444-444444444442'),
      portfolioId,
      accountId,
      assetId,
      type: 'SELL',
      quantity: Quantity.from('50'),
      unitPrice: Money.from('15.00', 'BRL'),
      fees: Money.from('-2.50', 'BRL'),
      currency: 'BRL',
      tradeDate: LocalDate.from('2026-01-15'),
      source: 'MANUAL',
      createdAt: new Date('2026-01-15T10:00:00Z'),
    };

    expect(() => {
      engine.replay({
        portfolioId,
        transactions: [buyTx, invalidFeeTx],
      });
    }).toThrow(InvalidSellingCostError);
  });

  it('should reject currency mismatch between position and sell execution', () => {
    expect(() => {
      new PortfolioScenarioBuilder()
        .buy({
          assetId: ASSET_PETR4,
          quantity: '100',
          unitPrice: '10.00',
          currency: 'BRL',
          tradeDate: '2026-01-10',
        })
        .sell({
          assetId: ASSET_PETR4,
          quantity: '50',
          unitPrice: '15.00',
          currency: 'USD',
          tradeDate: '2026-01-15',
        })
        .replay();
    }).toThrow(CurrencyMismatchError);
  });

  it('should maintain operational decimal precision on fractional quantities and prices without IEEE 754 floats', () => {
    const qty = '0.123456789';
    const price = '123.456789123456789';

    const result = new PortfolioScenarioBuilder()
      .buy({ assetId: ASSET_VALE3, quantity: '1', unitPrice: '100.00', tradeDate: '2026-01-10' })
      .sell({
        assetId: ASSET_VALE3,
        quantity: qty,
        unitPrice: price,
        tradeDate: '2026-01-15',
      })
      .replay();

    const disposal = result.state.realizedDisposals[0]!;
    // Exact decimal multiplication: 0.123456789 * 123.456789123456789
    // Expected = 15.241578765432099750190521
    expect(disposal.grossProceeds.amount).toBe('15.241578765432099750190521');
    expect(disposal.netProceeds.amount).toBe('15.241578765432099750190521');
    expect(disposal.costBasisRemoved?.amount).toBe('12.3456789'); // 0.123456789 * 100
  });
});
