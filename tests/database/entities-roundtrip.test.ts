import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Asset, Institution, Portfolio, Account } from '@atlas/domain';
import { cleanDatabase, getTestPrismaClient, disconnectTestDatabase } from './setup';
import {
  AssetRepository,
  InstitutionRepository,
  PortfolioRepository,
  AccountRepository,
} from '../../packages/database/src';

describe('Database Integration: Entities Round-Trip', () => {
  const prisma = getTestPrismaClient();
  const assetRepo = new AssetRepository(prisma);
  const instRepo = new InstitutionRepository(prisma);
  const portfolioRepo = new PortfolioRepository(prisma);
  const accountRepo = new AccountRepository(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('should round-trip Asset entity and maintain equality by AssetId', async () => {
    const asset = Asset.create({
      ticker: 'PETR4',
      name: 'Petrobras PN',
      type: 'EQUITY',
      currency: 'BRL',
      exchange: 'BVMF',
    });

    const saved = await assetRepo.create(asset);
    expect(saved.equals(asset)).toBe(true);
    expect(saved.ticker).toBe('PETR4');
    expect(saved.exchange).toBe('BVMF');

    const byId = await assetRepo.findById(asset.id);
    expect(byId).not.toBeNull();
    expect(byId?.name).toBe('Petrobras PN');

    const byTicker = await assetRepo.findByTicker('petr4');
    expect(byTicker).not.toBeNull();
    expect(byTicker?.id).toBe(asset.id);

    const byTickerAndExchange = await assetRepo.findByTickerAndExchange('PETR4', 'BVMF');
    expect(byTickerAndExchange).not.toBeNull();
  });

  it('should round-trip Institution entity', async () => {
    const inst = Institution.create({
      name: 'Banco BTG Pactual',
      type: 'BANK',
      country: 'BR',
    });

    const saved = await instRepo.create(inst);
    expect(saved.equals(inst)).toBe(true);

    const found = await instRepo.findById(inst.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Banco BTG Pactual');
    expect(found?.type).toBe('BANK');

    const all = await instRepo.list();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('Banco BTG Pactual');
  });

  it('should round-trip Portfolio and Account entities with updates', async () => {
    // Setup a user directly in DB
    const user = await prisma.user.create({
      data: {
        id: '99999999-9999-4999-8999-999999999999',
        email: 'portfolio-owner@atlas.dev',
        name: 'Portfolio Owner',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const inst = await instRepo.create(
      Institution.create({
        name: 'XP',
        type: 'BROKER',
        country: 'BR',
      }),
    );

    const portfolio = Portfolio.create({
      userId: user.id,
      name: 'Acoes Brasil',
      baseCurrency: 'BRL',
      type: 'PERSONAL',
    });

    const savedPortfolio = await portfolioRepo.create(portfolio);
    expect(savedPortfolio.name).toBe('Acoes Brasil');
    expect(savedPortfolio.equals(portfolio)).toBe(true);

    const account = Account.create({
      portfolioId: portfolio.id,
      institutionId: inst.id,
      name: 'Conta XP Principal',
      currency: 'BRL',
    });

    const savedAccount = await accountRepo.create(account);
    expect(savedAccount.name).toBe('Conta XP Principal');
    expect(savedAccount.portfolioId).toBe(portfolio.id);

    // Update account
    const updatedAccount = Account.create({
      id: account.id,
      portfolioId: portfolio.id,
      institutionId: inst.id,
      name: 'Conta XP Renomeada',
      currency: 'BRL',
      status: 'ARCHIVED',
    });
    await accountRepo.update(updatedAccount);

    const reloadedAccount = await accountRepo.findById(account.id);
    expect(reloadedAccount?.name).toBe('Conta XP Renomeada');
    expect(reloadedAccount?.status).toBe('ARCHIVED');
  });

  it('should round-trip Portfolio entity with SIMULATION type', async () => {
    const user = await prisma.user.create({
      data: {
        id: '88888888-8888-4888-8888-888888888888',
        email: 'simulation-owner@atlas.dev',
        name: 'Simulation User',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const simulationPortfolio = Portfolio.create({
      userId: user.id,
      name: 'Carteira Simulada 2026',
      baseCurrency: 'BRL',
      type: 'SIMULATION',
    });

    const saved = await portfolioRepo.create(simulationPortfolio);
    expect(saved.type).toBe('SIMULATION');
    expect(saved.name).toBe('Carteira Simulada 2026');

    const fetched = await portfolioRepo.findById(saved.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.type).toBe('SIMULATION');
    expect(fetched?.equals(simulationPortfolio)).toBe(true);

    const userPortfolios = await portfolioRepo.findByUserId(user.id);
    expect(userPortfolios.some((p) => p.id === saved.id && p.type === 'SIMULATION')).toBe(true);
  });

  it('should round-trip Session and PasswordResetToken persistence', async () => {
    const user = await prisma.user.create({
      data: {
        id: '77777777-7777-4777-8777-777777777777',
        email: 'session-user@atlas.dev',
        name: 'Session User',
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    // 1. Session roundtrip
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'hash-abc-123',
        expiresAt,
        userAgent: 'Mozilla/5.0 Vitest',
        deviceName: 'TestDevice',
      },
    });

    expect(session.userId).toBe(user.id);
    expect(session.refreshTokenHash).toBe('hash-abc-123');
    expect(session.revokedAt).toBeNull();

    // 2. Password reset token roundtrip
    const resetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const resetToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: 'reset-hash-xyz-456',
        expiresAt: resetExpiresAt,
      },
    });

    expect(resetToken.userId).toBe(user.id);
    expect(resetToken.tokenHash).toBe('reset-hash-xyz-456');
    expect(resetToken.usedAt).toBeNull();

    const loadedReset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: 'reset-hash-xyz-456' },
    });
    expect(loadedReset?.id).toBe(resetToken.id);
  });
});
