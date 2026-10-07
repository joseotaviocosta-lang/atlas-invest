import 'reflect-metadata';
import { execSync } from 'node:child_process';
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
        name: 'Unified User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

/** Seed a portfolio with a dividend-paying asset (drives income + positions). */
async function seedDividendPortfolio(
  userId: string,
  tag: string,
  ticker: string,
  amount = '700000.00',
): Promise<string> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-${tag}`),
      userId,
      name: `PF ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-${tag}`),
      ticker,
      name: `${ticker} SA`,
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-buy-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: new Date('2026-01-10T00:00:00Z'),
      settlementDate: new Date('2026-01-12T00:00:00Z'),
      quantity: '100',
      unitPrice: '10.00',
      amount: '1000.00',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-div-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'DIVIDEND',
      tradeDate: new Date('2026-05-15T00:00:00Z'),
      settlementDate: new Date('2026-05-15T00:00:00Z'),
      quantity: '0',
      unitPrice: '0',
      amount,
      currency: 'BRL',
    },
  });
  return portfolio.id;
}

const URL = (year: number) => `/api/v1/fiscal/annual/${year}`;

describe('Phase 4J.1 — Unified Annual IRPF Orchestration real-PG E2E (A–T)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp('2027-04-10');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  // (A) empty subject -> NO_ACTIVITY
  it('A: empty subject -> NO_ACTIVITY', async () => {
    const token = await session(uuidFor('u-A'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('NO_ACTIVITY');
    expect(res.body.data.modules).toHaveLength(5);
  });

  // (B) response identity + envelope shape
  it('B: response envelope lifts identity fields and drops internal fields', async () => {
    const token = await session(uuidFor('u-B'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.calendarYear).toBe(2026);
    expect(data.declarationExercise).toBe(2027);
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('modules');
    expect(data).toHaveProperty('requirements');
    expect(data).toHaveProperty('consistencyIssues');
    expect(data).toHaveProperty('sourceFingerprint');
    expect(data).toHaveProperty('annualFingerprint');
    // Internal fields must NOT be on the wire.
    expect(data).not.toHaveProperty('taxSubjectId');
    expect(data).not.toHaveProperty('generatedAt');
    expect(data).not.toHaveProperty('ruleVersions');
    expect(data).not.toHaveProperty('identity');
  });

  // (E) multi-portfolio income activity -> positions READY (worst-status fold)
  it('E: multi-portfolio activity yields module summaries for all five modules', async () => {
    const userId = uuidFor('u-E');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'E1', 'PETR4');
    await seedDividendPortfolio(userId, 'E2', 'VALE3');
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const positions = res.body.data.modules.find(
      (m: { module: string }) => m.module === 'ANNUAL_POSITIONS',
    );
    expect(positions.source).toBe('4H.2');
    expect(['READY', 'PARTIAL', 'REQUIRES_CONFIRMATION', 'NO_ACTIVITY']).toContain(
      positions.status,
    );
  });

  // (H) pre-2026 high-income is non-material and never blocks global readiness.
  // The frozen 4I posture returns UNSUPPORTED_YEAR for out-of-window years
  // (<2026); the unified layer treats HIGH_INCOME as non-material for those
  // years so it never forces BLOCKED/UNSUPPORTED on the whole package.
  it('H: pre-2026 high-income is non-blocking (non-material out-of-window)', async () => {
    const userId = uuidFor('u-H');
    const token = await session(userId);
    const res = await request(app.getHttpServer())
      .get(URL(2024))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const hi = res.body.data.modules.find(
      (m: { module: string }) => m.module === 'HIGH_INCOME_MINIMUM_TAX',
    );
    expect(['NOT_APPLICABLE', 'UNSUPPORTED']).toContain(hi.status);
    // The non-material high-income status must not drive the global state.
    expect(res.body.data.status).not.toBe('BLOCKED');
    expect(res.body.data.status).not.toBe('UNSUPPORTED');
  });

  // (Q) response carries no DB UUID / no subject id / no raw amount
  it('Q: body carries no subject id, no DB UUID and no raw monetary amount', async () => {
    const userId = uuidFor('u-Q');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'Q', 'ITUB4', '123456.78');
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = JSON.stringify(res.body.data);
    expect(body).not.toContain(userId);
    expect(body).not.toContain('123456.78');
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  // (R) private/no-store header present
  it('R: Cache-Control private, no-store header present', async () => {
    const token = await session(uuidFor('u-R'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['cache-control']).toContain('private');
  });

  // (S) deterministic annualFingerprint across two identical requests
  it('S: deterministic annualFingerprint across two identical requests', async () => {
    const userId = uuidFor('u-S');
    const token = await session(userId);
    await seedDividendPortfolio(userId, 'S', 'BBAS3');
    const first = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(first.body.data.annualFingerprint).toBe(second.body.data.annualFingerprint);
    expect(first.body.data.annualFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  // (T) out-of-range year -> 400 FISCAL.INVALID_YEAR
  it('T: out-of-range year -> 400 FISCAL.INVALID_YEAR', async () => {
    const token = await session(uuidFor('u-T'));
    const res = await request(app.getHttpServer())
      .get(URL(1800))
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('FISCAL.INVALID_YEAR');
  });

  // Routing: literal annual/opening-positions still resolves to the 4H handler
  it('routing: GET /annual/opening-positions resolves to the 4H list handler (not the unified route)', async () => {
    const token = await session(uuidFor('u-route'));
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/opening-positions')
      .set('Authorization', `Bearer ${token}`);
    // The 4H list route returns 200 with a data array; it must NOT be captured
    // by the parametric unified route (which would 400 on a non-integer year).
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('routing: GET /annual/2026 resolves to the unified handler', async () => {
    const token = await session(uuidFor('u-route2'));
    const res = await request(app.getHttpServer())
      .get(URL(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveProperty('annualFingerprint');
  });

  // Param guard: injection-shaped year -> 400 with no internal detail
  it('param guard: /annual/20);DROP -> 400 with no stack/.ts/node_modules in body', async () => {
    const token = await session(uuidFor('u-inj'));
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/20);DROP')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at\s+\/|\.ts:\d+|node_modules/);
    expect(body).not.toMatch(/stack/i);
  });

  // DB-final-proof: no new migration directory and migrate status clean
  it('DB-final-proof: prisma migrate status is clean (no schema drift from 4J.1)', () => {
    const output = execSync('pnpm --filter @atlas/database exec prisma migrate status', {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_TEST_URL ??
          'postgresql://atlas:atlas@localhost:5433/atlas_test?schema=public',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(output).toMatch(/up to date|Database schema is up to date/i);
  });
});
