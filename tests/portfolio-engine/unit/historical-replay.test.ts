import { describe, it, expect } from 'vitest';
import { scenario } from '../scenario-builder';
import {
  createAccountId,
  createAssetId,
  createPortfolioId,
  TransactionFactory,
} from '@atlas/domain';
import { replayPortfolio, CrossPortfolioTransactionError } from '@atlas/portfolio-engine';

describe('Portfolio Engine: Historical Multi-Account & Multi-Asset Replay (Phase 1F)', () => {
  const PORTFOLIO_A = createPortfolioId('c0000000-0000-4000-8000-000000000010');
  const PORTFOLIO_B = createPortfolioId('c0000000-0000-4000-8000-000000000020');

  // 5 distinct accounts
  const ACC_XP = createAccountId('d0000000-0000-4000-8000-000000000011');
  const ACC_NU = createAccountId('d0000000-0000-4000-8000-000000000012');
  const ACC_BTG = createAccountId('d0000000-0000-4000-8000-000000000013');
  const ACC_CLEAR = createAccountId('d0000000-0000-4000-8000-000000000014');
  const ACC_INTER = createAccountId('d0000000-0000-4000-8000-000000000015');

  // 20+ distinct assets
  const ASSETS = Array.from({ length: 22 }, (_, i) => {
    const hex = (i + 1).toString().padStart(12, '0');
    return createAssetId(`e0000000-0000-4000-8000-${hex}`);
  });

  it('should replay a complex 5-year multi-account (5+ accounts) and multi-asset (20+ assets) historical ledger', () => {
    let s = scenario(PORTFOLIO_A, ACC_XP);

    // Year 1 (2022): Deposits and initial acquisitions across 20+ assets
    s = s.deposit({
      accountId: ACC_XP,
      amount: '500000.00',
      currency: 'BRL',
      tradeDate: '2022-01-02',
    });
    for (let i = 0; i < 20; i++) {
      s = s.buy({
        accountId: ACC_XP,
        assetId: ASSETS[i],
        quantity: '100',
        unitPrice: `${(i + 1) * 10}.00`,
        currency: 'BRL',
        tradeDate: `2022-01-${(i + 3).toString().padStart(2, '0')}`,
      });
    }

    // Year 2 (2023): Transfers across accounts (XP -> BTG, XP -> NU, BTG -> CLEAR, NU -> INTER)
    for (let i = 0; i < 5; i++) {
      s = s.transfer({
        fromAccountId: ACC_XP,
        toAccountId: ACC_BTG,
        assetId: ASSETS[i],
        quantity: '40',
        transferGroupId: `tg-2023-btg-${i}`,
        tradeDate: `2023-03-${(i + 1).toString().padStart(2, '0')}`,
      });
    }
    for (let i = 5; i < 10; i++) {
      s = s.transfer({
        fromAccountId: ACC_XP,
        toAccountId: ACC_NU,
        assetId: ASSETS[i],
        quantity: '50',
        transferGroupId: `tg-2023-nu-${i}`,
        tradeDate: `2023-04-${(i + 1).toString().padStart(2, '0')}`,
      });
    }

    // Year 3 (2024): Corporate actions, secondary transfers and income
    s = s.split({ accountId: ACC_BTG, assetId: ASSETS[0], factor: '2', tradeDate: '2024-02-10' });
    s = s.dividend({
      accountId: ACC_BTG,
      assetId: ASSETS[0],
      amount: '200.00',
      currency: 'BRL',
      tradeDate: '2024-03-15',
    });
    s = s.transfer({
      fromAccountId: ACC_BTG,
      toAccountId: ACC_CLEAR,
      assetId: ASSETS[0],
      quantity: '30',
      transferGroupId: 'tg-2024-clear-0',
      tradeDate: '2024-05-10',
    });
    s = s.transfer({
      fromAccountId: ACC_NU,
      toAccountId: ACC_INTER,
      assetId: ASSETS[5],
      quantity: '25',
      transferGroupId: 'tg-2024-inter-5',
      tradeDate: '2024-06-15',
    });

    // Year 4 (2025): Partial sells at destination accounts and subscriptions
    s = s.sell({
      accountId: ACC_CLEAR,
      assetId: ASSETS[0],
      quantity: '15',
      unitPrice: '25.00',
      tradeDate: '2025-01-10',
    });
    s = s.subscription({
      accountId: ACC_XP,
      assetId: ASSETS[20],
      quantity: '200',
      unitPrice: '15.00',
      currency: 'BRL',
      tradeDate: '2025-02-15',
    });

    // Year 5 (2026): Amortization, fees, and final withdrawal
    s = s.amortization({
      accountId: ACC_XP,
      assetId: ASSETS[1],
      amount: '200.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    s = s.fee({
      accountId: ACC_XP,
      amount: '50.00',
      currency: 'BRL',
      tradeDate: '2026-02-01',
    });
    s = s.withdrawal({
      accountId: ACC_XP,
      amount: '10000.00',
      currency: 'BRL',
      tradeDate: '2026-02-15',
    });

    const result = s.replay();

    // Verify multi-account structure
    expect(result.state.accounts.size).toBe(5);
    expect(result.state.accounts.has(String(ACC_XP))).toBe(true);
    expect(result.state.accounts.has(String(ACC_BTG))).toBe(true);
    expect(result.state.accounts.has(String(ACC_NU))).toBe(true);
    expect(result.state.accounts.has(String(ACC_CLEAR))).toBe(true);
    expect(result.state.accounts.has(String(ACC_INTER))).toBe(true);

    // Verify 20+ assets exist in consolidated portfolio
    expect(result.state.assets.size).toBeGreaterThanOrEqual(21);

    // Verify zero unhandled/deferred transactions
    expect(result.deferredEvents).toHaveLength(0);
    expect(result.totalProcessedCount).toBe(result.appliedTransactions.length);

    // Verify realized disposal occurred only on SELL in CLEAR
    expect(result.state.realizedDisposals).toHaveLength(1);
    expect(String(result.state.realizedDisposals[0].accountId)).toBe(String(ACC_CLEAR));
  });

  it('should strictly isolate different portfolios and reject cross-portfolio transactions', () => {
    const txA = TransactionFactory.createBuy({
      portfolioId: String(PORTFOLIO_A),
      accountId: String(ACC_XP),
      assetId: String(ASSETS[0]),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });

    const txB = TransactionFactory.createBuy({
      portfolioId: String(PORTFOLIO_B), // Different portfolio!
      accountId: String(ACC_NU),
      assetId: String(ASSETS[0]),
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });

    expect(() => {
      replayPortfolio({
        portfolioId: PORTFOLIO_A,
        transactions: [txA, txB],
      });
    }).toThrow(CrossPortfolioTransactionError);
  });

  it('should isolate distinct assets even if they share metadata/ticker string', () => {
    const asset1 = createAssetId('e0000000-0000-4000-8000-000000000098');
    const asset2 = createAssetId('e0000000-0000-4000-8000-000000000099');

    const result = scenario(PORTFOLIO_A, ACC_XP)
      .buy({ assetId: asset1, quantity: '100', unitPrice: '10.00', tradeDate: '2026-01-10' })
      .buy({ assetId: asset2, quantity: '50', unitPrice: '20.00', tradeDate: '2026-01-10' })
      .replay();

    expect(result.state.assets.has(String(asset1))).toBe(true);
    expect(result.state.assets.has(String(asset2))).toBe(true);
    expect(result.state.assets.get(String(asset1))!.quantity.value).toBe('100');
    expect(result.state.assets.get(String(asset2))!.quantity.value).toBe('50');
  });
});
