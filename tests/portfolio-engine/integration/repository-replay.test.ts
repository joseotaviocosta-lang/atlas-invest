import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Asset, TransactionFactory, Quantity, LocalDate } from '@atlas/domain';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
} from '../../database/setup';
import { TransactionRepository, AssetRepository } from '@atlas/database';
import { createPortfolioReplayEngine } from '@atlas/portfolio-engine';

describe('Portfolio Engine Integration: Repository Replay', () => {
  const prisma = getTestPrismaClient();
  const txRepo = new TransactionRepository(prisma);
  const assetRepo = new AssetRepository(prisma);
  const engine = createPortfolioReplayEngine();

  let portfolioId: string;
  let accountId: string;
  let assetPetr4Id: string;
  let assetVale3Id: string;

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;

    const petr4 = await assetRepo.create(
      Asset.create({
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );
    assetPetr4Id = petr4.id;

    const vale3 = await assetRepo.create(
      Asset.create({
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'EQUITY',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );
    assetVale3Id = vale3.id;
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('should replay a realistic sequence fetched from TransactionRepository', async () => {
    // 1. Persist transactions
    const tx1 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      quantity: '200',
      unitPrice: '32.50',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const tx2 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: assetVale3Id,
      quantity: '100',
      unitPrice: '68.00',
      currency: 'BRL',
      tradeDate: '2026-01-15',
    });
    const tx3 = TransactionFactory.createIncome({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      type: 'DIVIDEND',
      amount: '50.00',
      currency: 'BRL',
      tradeDate: '2026-01-20',
    });
    const tx4 = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      quantity: '50',
      unitPrice: '35.00',
      currency: 'BRL',
      tradeDate: '2026-01-25',
    });

    await txRepo.createMany([tx1, tx2, tx3, tx4]);

    // 2. Fetch transactions from repository
    const storedTxs = await txRepo.findByPortfolioId(portfolioId);
    expect(storedTxs).toHaveLength(4);

    // 3. Replay with PortfolioReplayEngine
    const result = engine.replay({
      portfolioId,
      transactions: storedTxs,
    });

    expect(result.totalProcessedCount).toBe(4);
    expect(result.appliedTransactions).toHaveLength(3);
    expect(result.deferredEvents).toHaveLength(1);
    expect(result.deferredEvents[0].type).toBe('DIVIDEND');

    // Verify derived positions with cost basis
    const petr4Position = result.state.assets.get(assetPetr4Id);
    expect(petr4Position).toBeDefined();
    expect(petr4Position?.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(petr4Position?.totalCost?.amount).toBe('4875');
    expect(petr4Position?.averageCost?.amount).toBe('32.5');
    expect(petr4Position?.costBasisStatus).toBe('KNOWN');

    const vale3Position = result.state.assets.get(assetVale3Id);
    expect(vale3Position).toBeDefined();
    expect(vale3Position?.quantity.equals(Quantity.from('100'))).toBe(true);
    expect(vale3Position?.totalCost?.amount).toBe('6800');
    expect(vale3Position?.averageCost?.amount).toBe('68');
    expect(vale3Position?.costBasisStatus).toBe('KNOWN');

    // Verify derived realized disposal (Section 134)
    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0]!;
    expect(disposal.grossProceeds.amount).toBe('1750'); // 50 * 35.00
    expect(disposal.netProceeds.amount).toBe('1750');
    expect(disposal.costBasisRemoved?.amount).toBe('1625'); // 50 * 32.50
    expect(disposal.realizedGainLoss?.amount).toBe('125'); // 1750 - 1625
    expect(disposal.status).toBe('KNOWN');

    const portSummary = result.state.realizedSummary.get('BRL')!;
    expect(portSummary.grossProceeds.amount).toBe('1750');
    expect(portSummary.netProceeds.amount).toBe('1750');
    expect(portSummary.costBasisRemoved?.amount).toBe('1625');
    expect(portSummary.realizedGainLoss?.amount).toBe('125');
    expect(portSummary.status).toBe('KNOWN');
  });

  it('should replay historical state with asOfDate from repository-fetched records', async () => {
    const tx1 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
      tradeDate: '2026-01-05',
    });
    const tx2 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      quantity: '100',
      unitPrice: '32.00',
      currency: 'BRL',
      tradeDate: '2026-01-15',
    });
    const tx3 = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      quantity: '50',
      unitPrice: '34.00',
      currency: 'BRL',
      tradeDate: '2026-01-25',
    });

    await txRepo.createMany([tx1, tx2, tx3]);

    const storedTxs = await txRepo.findByPortfolioId(portfolioId);

    // Replay as of 2026-01-15 (should only include tx1 and tx2)
    const result = engine.replay({
      portfolioId,
      transactions: storedTxs,
      asOfDate: LocalDate.from('2026-01-15'),
    });

    expect(result.totalProcessedCount).toBe(2);
    expect(result.appliedTransactions).toHaveLength(2);
    const petr4Position = result.state.assets.get(assetPetr4Id);
    expect(petr4Position?.quantity.equals(Quantity.from('200'))).toBe(true);
    expect(petr4Position?.totalCost?.amount).toBe('6200');
    expect(petr4Position?.averageCost?.amount).toBe('31');
    expect(petr4Position?.costBasisStatus).toBe('KNOWN');
  });

  it('should replay a corporate action sequence (BUY -> SPLIT -> SELL) fetched from TransactionRepository', async () => {
    const tx1 = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    const tx2 = TransactionFactory.createSplit({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      type: 'SPLIT',
      factor: '2',
      currency: 'BRL',
      tradeDate: '2026-01-18',
    });
    const tx3 = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId: assetPetr4Id,
      quantity: '50',
      unitPrice: '20.00',
      currency: 'BRL',
      tradeDate: '2026-01-25',
    });

    await txRepo.createMany([tx1, tx2, tx3]);

    const storedTxs = await txRepo.findByPortfolioId(portfolioId);
    expect(storedTxs).toHaveLength(3);

    const result = engine.replay({
      portfolioId,
      transactions: storedTxs,
    });

    expect(result.totalProcessedCount).toBe(3);
    expect(result.appliedTransactions).toHaveLength(3);
    expect(result.state.appliedCorporateActions).toHaveLength(1);

    const ca = result.state.appliedCorporateActions[0]!;
    expect(ca.type).toBe('SPLIT');
    expect(ca.assetId).toBe(assetPetr4Id);
    expect(ca.beforeQuantity.equals(Quantity.from('100'))).toBe(true);
    expect(ca.afterQuantity.equals(Quantity.from('200'))).toBe(true);
    expect(ca.beforeTotalCost?.amount).toBe('3000');
    expect(ca.afterTotalCost?.amount).toBe('3000');
    expect(ca.beforeAverageCost?.amount).toBe('30');
    expect(ca.afterAverageCost?.amount).toBe('15');
    expect(ca.status).toBe('KNOWN');

    const petr4Position = result.state.assets.get(assetPetr4Id);
    expect(petr4Position?.quantity.equals(Quantity.from('150'))).toBe(true);
    expect(petr4Position?.totalCost?.amount).toBe('2250');
    expect(petr4Position?.averageCost?.amount).toBe('15');
    expect(petr4Position?.costBasisStatus).toBe('KNOWN');

    expect(result.state.realizedDisposals).toHaveLength(1);
    const disposal = result.state.realizedDisposals[0]!;
    expect(disposal.grossProceeds.amount).toBe('1000');
    expect(disposal.costBasisRemoved?.amount).toBe('750');
    expect(disposal.realizedGainLoss?.amount).toBe('250');
  });
});
