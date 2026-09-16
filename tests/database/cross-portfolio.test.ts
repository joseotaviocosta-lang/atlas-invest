import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { TransactionFactory, Portfolio, Account, Institution } from '@atlas/domain';
import { cleanDatabase, getTestPrismaClient, disconnectTestDatabase } from './setup';
import {
  TransactionRepository,
  PortfolioRepository,
  AccountRepository,
  InstitutionRepository,
  CrossPortfolioIntegrityError,
} from '../../packages/database/src';

describe('Database Integration: Cross-Portfolio Foreign Key Protection', () => {
  const prisma = getTestPrismaClient();
  const txRepo = new TransactionRepository(prisma);
  const portfolioRepo = new PortfolioRepository(prisma);
  const accountRepo = new AccountRepository(prisma);
  const instRepo = new InstitutionRepository(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('should reject transaction when account belongs to a different portfolio', async () => {
    // 1. Create User
    const user = await prisma.user.create({
      data: {
        id: '12121212-1212-4212-8212-121212121212',
        email: 'multi-portfolio@atlas.dev',
        name: 'Multi Portfolio User',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    // 2. Create Institution
    const inst = await instRepo.create(
      Institution.create({
        name: 'Broker Test',
        type: 'BROKER',
        country: 'BR',
      }),
    );

    // 3. Create Portfolio A and Account A
    const portfolioA = await portfolioRepo.create(
      Portfolio.create({
        userId: user.id,
        name: 'Portfolio Alpha',
        baseCurrency: 'BRL',
      }),
    );
    const accountA = await accountRepo.create(
      Account.create({
        portfolioId: portfolioA.id,
        institutionId: inst.id,
        name: 'Account Alpha',
        currency: 'BRL',
      }),
    );

    // 4. Create Portfolio B and Account B
    const portfolioB = await portfolioRepo.create(
      Portfolio.create({
        userId: user.id,
        name: 'Portfolio Beta',
        baseCurrency: 'BRL',
      }),
    );
    const _accountB = await accountRepo.create(
      Account.create({
        portfolioId: portfolioB.id,
        institutionId: inst.id,
        name: 'Account Beta',
        currency: 'BRL',
      }),
    );

    // 5. Attempt cross-portfolio transaction:
    // Create transaction in Portfolio B but pass Account A!
    const crossTx = TransactionFactory.createCashMovement({
      portfolioId: portfolioB.id,
      accountId: accountA.id, // Account from Portfolio A!
      type: 'DEPOSIT',
      amount: '1000.00',
      currency: 'BRL',
      tradeDate: '2026-05-01',
    });

    await expect(txRepo.create(crossTx)).rejects.toThrow(CrossPortfolioIntegrityError);
  });
});
