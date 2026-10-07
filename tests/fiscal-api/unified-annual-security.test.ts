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
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Sec User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

async function seedDividendPortfolio(userId: string, tag: string, ticker: string): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-sec-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-sec-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-sec-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-sec-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-sec-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'DIVIDEND',
      tradeDate: new Date('2026-05-15T00:00:00Z'),
      settlementDate: new Date('2026-05-15T00:00:00Z'),
      quantity: '0',
      unitPrice: '0',
      amount: '987654.32',
      currency: 'BRL',
    },
  });
}

const URL = (year: number) => `/api/v1/fiscal/annual/${year}`;

describe('API Security: Unified Annual IRPF Orchestration (Phase 4J.1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2027-03-15');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('unauthenticated -> 401, never leaks data', async () => {
    await request(app.getHttpServer()).get(URL(2026)).expect(401);
  });

  it('malformed JWT -> 401', async () => {
    await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('cross-user isolation: user B never sees user A payers/fingerprints', async () => {
    const userA = uuidFor('u-sec-a');
    const tokenA = await session(userA);
    await seedDividendPortfolio(userA, 'a', 'PETR4');
    const resA = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const userB = uuidFor('u-sec-b');
    const tokenB = await session(userB);
    const resB = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(resB.body.data.status).toBe('NO_ACTIVITY');
    // B's annual fingerprint must differ from A's populated state.
    expect(resB.body.data.annualFingerprint).not.toBe(resA.body.data.annualFingerprint);
    expect(JSON.stringify(resB.body.data)).not.toContain('PETR4');
  });

  it('no client subject id is accepted — query/body subject is ignored (ownership server-derived)', async () => {
    const userA = uuidFor('u-sec-owner-a');
    await session(userA); // ensure user A + data exist (A's token is intentionally unused)
    await seedDividendPortfolio(userA, 'owner', 'VALE3');

    const userB = uuidFor('u-sec-owner-b');
    const tokenB = await session(userB);
    // B tries to pass A's id via query — must be ignored (B sees empty state).
    const res = await request(app.getHttpServer())
      .get(`${URL(2026)}?taxSubjectId=${userA}&portfolioId=${uuidFor('pf-sec-owner')}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.data.status).toBe('NO_ACTIVITY');
    expect(JSON.stringify(res.body.data)).not.toContain('VALE3');
  });

  it('tampered year -> 400 with no internal detail', async () => {
    const token = await session(uuidFor('u-sec-tamper'));
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/not-a-year')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/stack/i);
    expect(body).not.toMatch(/\.ts:\d+|node_modules/);
  });

  it('serialized body carries no DB UUID / raw amount / token / stack', async () => {
    const userId = uuidFor('u-sec-leak');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'leak', 'ITUB4');
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = JSON.stringify(res.body.data);
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(body).not.toContain('987654.32');
    expect(body).not.toMatch(/stack/i);
    expect(body).not.toContain(token);
  });
});
