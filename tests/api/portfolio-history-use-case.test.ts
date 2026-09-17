import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAccountRepository } from '@atlas/database';
import { Portfolio, TransactionFactory } from '@atlas/domain';
import { GetPortfolioHistoryUseCase } from '../../apps/api/src/application/portfolios/get-portfolio-history.use-case';

describe('GetPortfolioHistoryUseCase (Phase 1G)', () => {
  let portfolioRepo: IPortfolioRepository;
  let transactionRepo: ITransactionRepository;
  let accountRepo: IAccountRepository;
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
    useCase = new GetPortfolioHistoryUseCase(portfolioRepo, transactionRepo, accountRepo);
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
  });
});
