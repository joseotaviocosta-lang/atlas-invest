import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { uuidFor } from '../tax-engine/helpers';

const prisma = getTestPrismaClient();

async function buildApp(today: string): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(FISCAL_CLOCK)
    .useValue({ today: () => today })
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

async function session(userId: string): Promise<string> {
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@atlas.dev`,
      name: 'Scale',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
    },
  });
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

async function seedPortfolioWithTransactions(
  userId: string,
  tag: string,
  ticker: string,
  dividendCount: number,
): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-scale-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-scale-${tag}`), name: `B ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-scale-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `A ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-scale-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  const txs = Array.from({ length: dividendCount }, (_, i) => ({
    id: uuidFor(`tx-scale-${tag}-${i}`),
    portfolioId: portfolio.id,
    accountId: account.id,
    assetId: asset.id,
    type: 'DIVIDEND' as const,
    tradeDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
    settlementDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-15T00:00:00Z`),
    quantity: '0',
    unitPrice: '0',
    amount: '1000.00',
    currency: 'BRL',
  }));
  await prisma.transaction.createMany({ data: txs });
}

const URL = (year: number) => `/api/v1/fiscal/annual/${year}`;

describe('Phase 4J.1 — Unified Annual scale & boundedness', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2027-04-10');
  });
  afterAll(async () => app.close());
  beforeEach(async () => cleanDatabase());

  it('payload size is bounded (O(modules + requirements)) and independent of transaction count', async () => {
    const smallUser = uuidFor('u-scale-small');
    const smallToken = await session(smallUser);
    await seedPortfolioWithTransactions(smallUser, 'small', 'PETR4', 2);

    const largeUser = uuidFor('u-scale-large');
    const largeToken = await session(largeUser);
    await seedPortfolioWithTransactions(largeUser, 'large', 'VALE3', 200);

    const small = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${smallToken}`)
      .expect(200);
    const large = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${largeToken}`)
      .expect(200);

    // Always exactly five module summaries regardless of ledger size.
    expect(small.body.data.modules).toHaveLength(5);
    expect(large.body.data.modules).toHaveLength(5);

    // The payload must not grow proportionally with the 100x larger ledger:
    // its structure is O(modules + requirements), independent of transaction
    // count. Allow only a small absolute delta (status strings / fingerprints),
    // never a multiple of the 100x ledger-size ratio.
    const smallSize = JSON.stringify(small.body.data).length;
    const largeSize = JSON.stringify(large.body.data).length;
    expect(Math.abs(largeSize - smallSize)).toBeLessThan(2000);
  });

  it('positions fan-out across many portfolios still returns a bounded 5-module payload', async () => {
    const userId = uuidFor('u-scale-multi');
    const token = await session(userId);
    for (let i = 0; i < 6; i++) {
      await seedPortfolioWithTransactions(userId, `multi-${i}`, `TICK${i}`, 1);
    }
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.modules).toHaveLength(5);
    const positions = res.body.data.modules.find(
      (m: { module: string }) => m.module === 'ANNUAL_POSITIONS',
    );
    expect(positions).toBeDefined();
  });
});
