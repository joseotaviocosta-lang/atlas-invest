import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset, LocalDate } from '@atlas/domain';
import { PrismaMarketQuoteRepository } from '../../packages/database/src/repositories/market-quote.repository';

describe('Phase 5A-I1-R1: Historical Backfill & Boundary Safety', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let marketQuoteRepo: PrismaMarketQuoteRepository;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    marketQuoteRepo = new PrismaMarketQuoteRepository(prisma);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function ensureUser(userId: string): Promise<void> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Backfill Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
  }

  async function setupPortfolioWithPetr4(userId: string): Promise<{
    portfolioId: string;
    token: string;
    petr4AssetId: string;
  }> {
    await ensureUser(userId);
    const { token } = await createAuthenticatedUserSession(userId);

    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carteira Backfill', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;

    const institutionRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'BTG Pactual', type: 'BANK', country: 'BR' })
      .expect(201);
    const institutionId = institutionRes.body.data.id;

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name: 'Conta Principal', currency: 'BRL' })
      .expect(201);
    const accountId = accountRes.body.data.id;

    const petr4 = Asset.create({
      ticker: 'PETR4',
      name: 'Petrobras PN',
      type: 'STOCK',
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: petr4.id,
        ticker: petr4.ticker,
        name: petr4.name,
        type: petr4.type,
        currency: petr4.currency,
        exchange: petr4.exchange,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId: petr4.id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '35.00',
        totalAmount: '3500.00',
        currency: 'BRL',
        tradeDate: '2026-01-10',
        provider: 'B3',
      })
      .expect(201);

    return { portfolioId, token, petr4AssetId: petr4.id };
  }

  it('Section 5: Backfills 3 deterministic trading dates for PETR4 with correct counts and idempotency', async () => {
    const userId = randomUUID();
    const { portfolioId, token, petr4AssetId } = await setupPortfolioWithPetr4(userId);

    // Initial backfill over 3 dates (2026-10-13 to 2026-10-15)
    const res1 = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        from: '2026-10-13',
        to: '2026-10-15',
        providerOverride: 'IN_MEMORY',
      })
      .expect(200);

    const receipt1 = res1.body.data;
    expect(receipt1.requestedAssets).toBe(1);
    expect(receipt1.quotesFetched).toBe(3);
    expect(receipt1.quotesInserted).toBe(3);
    expect(receipt1.quotesUnchanged).toBe(0);
    expect(receipt1.status).toBe('COMPLETED');

    // Confirm quotes exist in DB
    const q1 = await marketQuoteRepo.findByAssetDate(petr4AssetId, LocalDate.from('2026-10-13'));
    const q2 = await marketQuoteRepo.findByAssetDate(petr4AssetId, LocalDate.from('2026-10-14'));
    const q3 = await marketQuoteRepo.findByAssetDate(petr4AssetId, LocalDate.from('2026-10-15'));
    expect(q1?.close.toString()).toBe('38');
    expect(q2?.close.toString()).toBe('38.25');
    expect(q3?.close.toString()).toBe('38.5');

    // Idempotent re-run over exact same range
    const res2 = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        from: '2026-10-13',
        to: '2026-10-15',
        providerOverride: 'IN_MEMORY',
      })
      .expect(200);

    const receipt2 = res2.body.data;
    expect(receipt2.quotesFetched).toBe(3);
    expect(receipt2.quotesInserted).toBe(0);
    expect(receipt2.quotesUnchanged).toBe(3);
    expect(receipt2.status).toBe('COMPLETED');
  });

  it('Section 6: Enforces boundary safety — rejects invalid range (from > to)', async () => {
    const userId = randomUUID();
    const { portfolioId, token } = await setupPortfolioWithPetr4(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        from: '2026-10-15',
        to: '2026-10-13',
        providerOverride: 'IN_MEMORY',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION.INVALID_DATE_RANGE');
  });

  it('Section 6: Enforces boundary safety — rejects range exceeding 5 years', async () => {
    const userId = randomUUID();
    const { portfolioId, token } = await setupPortfolioWithPetr4(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/market-data/update`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        from: '2020-01-01',
        to: '2026-01-01',
        providerOverride: 'IN_MEMORY',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION.RANGE_TOO_LARGE');
  });
});
