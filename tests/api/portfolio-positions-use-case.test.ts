import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAccountRepository } from '@atlas/database';
import { Portfolio, Account, TransactionFactory } from '@atlas/domain';
import { GetPortfolioPositionsUseCase } from '../../apps/api/src/application/portfolios/get-portfolio-positions.use-case';

describe('GetPortfolioPositionsUseCase (Phase 1G)', () => {
  let portfolioRepo: IPortfolioRepository;
  let transactionRepo: ITransactionRepository;
  let accountRepo: IAccountRepository;
  let useCase: GetPortfolioPositionsUseCase;

  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const otherPortfolioId = 'c0000000-0000-4000-8000-000000000002';
  const accountId1 = 'd0000000-0000-4000-8000-000000000001';
  const accountId2 = 'd0000000-0000-4000-8000-000000000002';
  const assetId = 'e0000000-0000-4000-8000-000000000001';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Test Portfolio',
    baseCurrency: 'BRL',
  });

  const account1 = Account.create({
    id: accountId1,
    portfolioId,
    institutionId: 'f0000000-0000-4000-8000-000000000001',
    name: 'Account 1',
    currency: 'BRL',
  });

  const foreignAccount = Account.create({
    id: accountId2,
    portfolioId: otherPortfolioId, // Belongs to different portfolio!
    institutionId: 'f0000000-0000-4000-8000-000000000001',
    name: 'Foreign Account',
    currency: 'BRL',
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
    useCase = new GetPortfolioPositionsUseCase(portfolioRepo, transactionRepo, accountRepo);
  });

  it('should throw NotFoundException (404) if account does not belong to portfolio', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);
    vi.mocked(accountRepo.findById).mockResolvedValue(foreignAccount);

    await expect(useCase.execute({ portfolioId, userId, accountId: accountId2 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return consolidated positions when accountId is not provided', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);

    const tx = TransactionFactory.createBuy({
      portfolioId,
      accountId: accountId1,
      assetId,
      quantity: '100',
      unitPrice: '20.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    vi.mocked(transactionRepo.findByPortfolioId).mockResolvedValue([tx]);

    const result = await useCase.execute({ portfolioId, userId });

    expect(result.portfolioId).toBe(portfolioId);
    expect(result.accountId).toBeNull();
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].quantity).toBe('100');
  });

  it('should return account-scoped positions when valid accountId is provided', async () => {
    vi.mocked(portfolioRepo.findById).mockResolvedValue(samplePortfolio);
    vi.mocked(accountRepo.findById).mockResolvedValue(account1);

    const tx = TransactionFactory.createBuy({
      portfolioId,
      accountId: accountId1,
      assetId,
      quantity: '100',
      unitPrice: '20.00',
      currency: 'BRL',
      tradeDate: '2026-01-10',
    });
    vi.mocked(transactionRepo.findByPortfolioId).mockResolvedValue([tx]);

    const result = await useCase.execute({ portfolioId, userId, accountId: accountId1 });

    expect(result.portfolioId).toBe(portfolioId);
    expect(result.accountId).toBe(accountId1);
    expect(result.positions).toHaveLength(1);
  });
});
