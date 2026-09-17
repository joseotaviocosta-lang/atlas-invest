import { describe, it, expect } from 'vitest';
import { replayPortfolio } from '@atlas/portfolio-engine';
import { TransactionFactory } from '@atlas/domain';
import { PortfolioReadModelMapper } from '../../apps/api/src/application/portfolios/mappers/portfolio-read-model.mapper';

describe('PortfolioReadModelMapper (Phase 1G)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const accountId2 = 'd0000000-0000-4000-8000-000000000002';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';
  const assetVale3 = 'e0000000-0000-4000-8000-000000000002';

  it('should map empty replay state to valid empty read model with zero summaries and COMPLETE status', () => {
    const replayResult = replayPortfolio({
      portfolioId,
      transactions: [],
    });

    const readModel = PortfolioReadModelMapper.toStateReadModel(replayResult, portfolioId);

    expect(readModel.portfolioId).toBe(portfolioId);
    expect(readModel.asOfDate).toBeNull();
    expect(readModel.engineVersion).toBe(replayResult.engineVersion);
    expect(readModel.completeness.costBasis).toBe('COMPLETE');
    expect(readModel.positions).toEqual([]);
    expect(readModel.accounts).toEqual([]);
    expect(readModel.realizedSummaries).toEqual([]);
    expect(readModel.incomeSummaries).toEqual([]);
    expect(readModel.cashFlowSummaries).toEqual([]);
    expect(readModel.replayMetadata).toEqual({
      engineVersion: replayResult.engineVersion,
      asOfDate: null,
      processedTransactionCount: 0,
      appliedTransactionCount: 0,
      deferredTransactionCount: 0,
      hasIncompleteCostBasis: false,
    });
  });

  it('should map known positions with exact string decimals and sorted assetIds', () => {
    const tx1 = TransactionFactory.createBuy({
      portfolioId,
      accountId: accountId1,
      assetId: assetVale3, // Vale3 inserted first
      quantity: '50',
      unitPrice: '60.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const tx2 = TransactionFactory.createBuy({
      portfolioId,
      accountId: accountId1,
      assetId: assetPetr4, // Petr4 inserted second
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
      tradeDate: '2026-01-11',
    });

    const replayResult = replayPortfolio({
      portfolioId,
      transactions: [tx1, tx2],
    });

    const readModel = PortfolioReadModelMapper.toStateReadModel(replayResult, portfolioId);

    expect(readModel.positions).toHaveLength(2);
    // Deterministically sorted by assetId ASC
    expect(readModel.positions[0].assetId).toBe(assetPetr4);
    expect(readModel.positions[0].quantity).toBe('100');
    expect(readModel.positions[0].costBasisStatus).toBe('KNOWN');
    expect(readModel.positions[0].totalCost).toEqual({ amount: '3000', currency: 'BRL' });
    expect(readModel.positions[0].averageCost).toEqual({ amount: '30', currency: 'BRL' });

    expect(readModel.positions[1].assetId).toBe(assetVale3);
    expect(readModel.positions[1].quantity).toBe('50');
    expect(readModel.positions[1].costBasisStatus).toBe('KNOWN');
    expect(readModel.positions[1].totalCost).toEqual({ amount: '3000', currency: 'BRL' });
    expect(readModel.positions[1].averageCost).toEqual({ amount: '60', currency: 'BRL' });
  });

  it('should serialize unknown cost basis as null (never 0 or "0") when position is INCOMPLETE', () => {
    const tx = TransactionFactory.createTransfer({
      portfolioId,
      accountId: accountId1,
      assetId: assetPetr4,
      type: 'TRANSFER_IN',
      quantity: '100',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });

    const replayResult = replayPortfolio({
      portfolioId,
      transactions: [tx],
    });

    const readModel = PortfolioReadModelMapper.toStateReadModel(replayResult, portfolioId);

    expect(readModel.completeness.costBasis).toBe('INCOMPLETE');
    expect(readModel.replayMetadata.hasIncompleteCostBasis).toBe(true);

    const pos = readModel.positions[0];
    expect(pos.costBasisStatus).toBe('INCOMPLETE');
    expect(pos.totalCost).toBeNull();
    expect(pos.averageCost).toBeNull();
    expect(pos.quantity).toBe('100');
  });

  it('should map realized summaries with string percentages and null for incomplete disposals', () => {
    // 1. Buy 100 @ 10
    const buyTx = TransactionFactory.createBuy({
      portfolioId,
      accountId: accountId1,
      assetId: assetPetr4,
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    // 2. Sell 40 @ 15
    const sellTx = TransactionFactory.createSell({
      portfolioId,
      accountId: accountId1,
      assetId: assetPetr4,
      quantity: '40',
      unitPrice: '15.00',
      currency: 'BRL',
      tradeDate: '2026-01-15',
    });

    const replayResult = replayPortfolio({
      portfolioId,
      transactions: [buyTx, sellTx],
    });

    const readModel = PortfolioReadModelMapper.toStateReadModel(replayResult, portfolioId);

    expect(readModel.realizedSummaries).toHaveLength(1);
    const summary = readModel.realizedSummaries[0];
    expect(summary.currency).toBe('BRL');
    expect(summary.status).toBe('KNOWN');
    expect(summary.grossProceeds).toEqual({ amount: '600', currency: 'BRL' });
    expect(summary.costBasisRemoved).toEqual({ amount: '400', currency: 'BRL' });
    expect(summary.realizedGainLoss).toEqual({ amount: '200', currency: 'BRL' });
    expect(summary.realizedReturnPercentage).toBe('50'); // 200/400 = 50%
    expect(summary.disposalCount).toBe(1);
  });

  it('should map income, cash flows, corporate actions, and transfers in history read model with cursor pagination', () => {
    const buyTx = TransactionFactory.createBuy({
      portfolioId,
      accountId: accountId1,
      assetId: assetPetr4,
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-05',
    });
    const dividendTx = TransactionFactory.createIncome({
      portfolioId,
      accountId: accountId1,
      assetId: assetPetr4,
      type: 'DIVIDEND',
      amount: '50.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const depositTx = TransactionFactory.createCashMovement({
      portfolioId,
      accountId: accountId1,
      type: 'DEPOSIT',
      amount: '1000.00',
      currency: 'BRL',
      tradeDate: '2026-01-12',
    });
    const transferOut = TransactionFactory.createTransfer({
      portfolioId,
      accountId: accountId1,
      assetId: assetPetr4,
      type: 'TRANSFER_OUT',
      quantity: '30',
      currency: 'BRL',
      transferGroupId: 'tg-hist-1',
      tradeDate: '2026-01-15',
    });
    const transferIn = TransactionFactory.createTransfer({
      portfolioId,
      accountId: accountId2,
      assetId: assetPetr4,
      type: 'TRANSFER_IN',
      quantity: '30',
      currency: 'BRL',
      transferGroupId: 'tg-hist-1',
      tradeDate: '2026-01-15',
    });

    const replayResult = replayPortfolio({
      portfolioId,
      transactions: [buyTx, dividendTx, depositTx, transferOut, transferIn],
    });

    // History: all events
    const history = PortfolioReadModelMapper.toHistoryReadModel(replayResult, { limit: 2 });
    expect(history.items).toHaveLength(2);
    expect(history.meta.totalCount).toBe(4); // 1 income + 1 cashflow + 2 transfers
    expect(history.meta.hasMore).toBe(true);
    expect(history.meta.nextCursor).toBeDefined();

    // Fetch next page
    const page2 = PortfolioReadModelMapper.toHistoryReadModel(replayResult, {
      cursor: history.meta.nextCursor!,
      limit: 2,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.meta.hasMore).toBe(false);
    expect(page2.meta.nextCursor).toBeNull();

    // Filter by type
    const incomeHistory = PortfolioReadModelMapper.toHistoryReadModel(replayResult, {
      type: 'income',
    });
    expect(incomeHistory.items).toHaveLength(1);
    expect(incomeHistory.items[0].kind).toBe('INCOME');
    expect(incomeHistory.items[0].tradeDate).toBe('2026-01-10');
  });
});
