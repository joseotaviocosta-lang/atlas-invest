import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  IPortfolioRepository,
  ITransactionRepository,
  IAccountRepository,
  ITransactionRectificationRepository,
  IAssetRepository,
} from '@atlas/database';
import { Portfolio, TransactionFactory, Asset } from '@atlas/domain';
import { GetPortfolioHistoryUseCase } from '../../apps/api/src/application/portfolios/get-portfolio-history.use-case';

describe('GetPortfolioHistoryUseCase (Phase 1G)', () => {
  let portfolioRepo: IPortfolioRepository;
  let transactionRepo: ITransactionRepository;
  let accountRepo: IAccountRepository;
  let rectificationsRepo: ITransactionRectificationRepository;
  let assetRepo: IAssetRepository;
  let useCase: GetPortfolioHistoryUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';
  const assetId = 'e0000000-0000-4000-8000-000000000001';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Test Portfolio',
    baseCurrency: 'BRL',
  });

  beforeEach(() => {
    portfolioRepo = {
      findById: vi.fn(),
      findByIdAndUserId: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    transactionRepo = {
      create: vi.fn(),
      createMany: vi.fn(),
      findById: vi.fn(),
      findByPortfolioId: vi.fn(),
      findByExternalId: vi.fn(),
    };
    accountRepo = {
      findById: vi.fn(),
      findByPortfolioId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
    rectificationsRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByOriginalTransactionIds: vi.fn().mockResolvedValue([]),
      listByReplacementTransactionIds: vi.fn().mockResolvedValue([]),
      listByPortfolioId: vi.fn().mockResolvedValue([]),
      listRecentByPortfolioIds: vi.fn().mockResolvedValue([]),
    };
    assetRepo = {
      findById: vi.fn(),
      findByIds: vi.fn().mockResolvedValue([
        Asset.create({
          id: assetId,
          ticker: 'PETR4',
          name: 'Petrobras PN',
          type: 'STOCK',
          currency: 'BRL',
          exchange: 'BVMF',
        }),
      ]),
      findByTicker: vi.fn(),
      findByTickerAndExchange: vi.fn(),
      findAllByTicker: vi.fn(),
      create: vi.fn(),
      list: vi.fn(),
    };
    useCase = new GetPortfolioHistoryUseCase(
      portfolioRepo,
      transactionRepo,
      rectificationsRepo,
      accountRepo,
      assetRepo,
    );
  });

  it('should throw BadRequestException (400) when date range is inverted (from > to)', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    await expect(
      useCase.execute({
        portfolioId,
        userId,
        from: '2026-05-10',
        to: '2026-05-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException (400) when type filter is invalid', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    await expect(
      useCase.execute({
        portfolioId,
        userId,
        type: 'invalid-type' as unknown as 'realized',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return paginated history in reverse chronological order', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    const buyTx = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId,
      quantity: '100',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2026-01-05',
    });
    const sellTx = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId,
      quantity: '50',
      unitPrice: '15.00',
      currency: 'BRL',
      tradeDate: '2026-01-20',
    });

    vi.mocked(transactionRepo.findByPortfolioId).mockResolvedValue([buyTx, sellTx]);

    const result = await useCase.execute({
      portfolioId,
      userId,
      type: 'realized',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe('REALIZED_DISPOSAL');
    expect(result.items[0].tradeDate).toBe('2026-01-20');
    expect(result.items[0].assetTicker).toBe('PETR4');
    expect(result.items[0].assetName).toBe('Petrobras PN');
  });

  it('enriches opening position transfers with isOpeningPosition = true in details', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    const openingTx = TransactionFactory.createTransfer({
      portfolioId,
      accountId,
      assetId,
      type: 'TRANSFER_IN',
      quantity: '700',
      currency: 'BRL',
      tradeDate: '2024-12-31',
      notes: 'Importado de relatorio-consolidado-anual-2024.xlsx (linha 1) — Posição em 31/12/2024',
    });

    vi.mocked(transactionRepo.findByPortfolioId).mockResolvedValue([openingTx]);

    const result = await useCase.execute({
      portfolioId,
      userId,
      type: 'transfer',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe('TRANSFER');
    expect(result.items[0].assetTicker).toBe('PETR4');
    expect(result.items[0].details.isOpeningPosition).toBe(true);
  });

  it('never flags TRANSFER_OUT as an opening position even with baseline-like notes', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    const fundingBuy = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId,
      quantity: '700',
      unitPrice: '10.00',
      currency: 'BRL',
      tradeDate: '2024-12-30',
    });
    const outboundTx = TransactionFactory.createTransfer({
      portfolioId,
      accountId,
      assetId,
      type: 'TRANSFER_OUT',
      quantity: '700',
      currency: 'BRL',
      tradeDate: '2024-12-31',
      notes: 'Importado de relatorio-consolidado-anual-2024.xlsx (linha 1) — Posição em 31/12/2024',
    });

    vi.mocked(transactionRepo.findByPortfolioId).mockResolvedValue([fundingBuy, outboundTx]);

    const result = await useCase.execute({
      portfolioId,
      userId,
      type: 'transfer',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].kind).toBe('TRANSFER');
    expect(result.items[0].details.type).toBe('TRANSFER_OUT');
    expect(result.items[0].details.isOpeningPosition ?? false).toBe(false);
  });
});
