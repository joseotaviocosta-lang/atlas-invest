import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository } from '@atlas/database';
import { Portfolio, TransactionFactory } from '@atlas/domain';
import { GetPortfolioStateUseCase } from '../../apps/api/src/application/portfolios/get-portfolio-state.use-case';

describe('GetPortfolioStateUseCase (Phase 1G)', () => {
  let portfolioRepo: IPortfolioRepository;
  let transactionRepo: ITransactionRepository;
  let useCase: GetPortfolioStateUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
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
    useCase = new GetPortfolioStateUseCase(portfolioRepo, transactionRepo);
  });

  it('should throw NotFoundException (404) when portfolio does not exist', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ portfolioId, userId })).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException (404) when portfolio belongs to another user (ownership privacy)', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    await expect(useCase.execute({ portfolioId, userId: otherUserId })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException (400) when asOf date format is invalid', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    await expect(
      useCase.execute({ portfolioId, userId, asOfDate: 'invalid-date' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException (400) when asOf date is an invalid civil calendar day (e.g. 2026-02-30)', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    await expect(useCase.execute({ portfolioId, userId, asOfDate: '2026-02-30' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should successfully replay and return portfolio state read model', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    const tx = TransactionFactory.createBuy({
      portfolioId,
      accountId,
      assetId,
      quantity: '100',
      unitPrice: '25.50',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    vi.mocked(transactionRepo.findByPortfolioId).mockResolvedValue([tx]);

    const result = await useCase.execute({ portfolioId, userId, asOfDate: '2026-01-15' });

    expect(result.portfolioId).toBe(portfolioId);
    expect(result.asOfDate).toBe('2026-01-15');
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].quantity).toBe('100');
    expect(result.positions[0].totalCost).toEqual({ amount: '2550', currency: 'BRL' });
    expect(result.positions[0].averageCost).toEqual({ amount: '25.5', currency: 'BRL' });
  });

  it('should throw UnprocessableEntityException (422) if transaction ledger is corrupt (e.g. negative position)', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    // Corrupted ledger: SELL without prior BUY
    const sellTx = TransactionFactory.createSell({
      portfolioId,
      accountId,
      assetId,
      quantity: '50',
      unitPrice: '30.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    vi.mocked(transactionRepo.findByPortfolioId).mockResolvedValue([sellTx]);

    await expect(useCase.execute({ portfolioId, userId })).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});
