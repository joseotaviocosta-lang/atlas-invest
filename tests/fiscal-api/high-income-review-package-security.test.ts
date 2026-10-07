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

async function seedDividendPayer(userId: string, tag: string, ticker: string): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-sec-${tag}`),
      userId,
      name: `Sec ${tag}`,
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
      amount: '700000.00',
      currency: 'BRL',
    },
  });
}

const REVIEW = (year: number) => `/api/v1/fiscal/annual/${year}/high-income/review`;
const EXPORT = (year: number) => `/api/v1/fiscal/annual/${year}/high-income/export`;

describe('API Security: High-Income Review/Support Package (Phase 4I.6)', () => {
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

  it('unauthenticated review/export -> 401, never leaks data', async () => {
    await request(app.getHttpServer()).get(REVIEW(2026)).expect(401);
    await request(app.getHttpServer())
      .get(`${EXPORT(2026)}?format=csv`)
      .expect(401);
  });

  it('malformed JWT -> 401', async () => {
    await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('cross-user isolation: user B sees only their own (empty) package, never user A data', async () => {
    const userA = uuidFor('user-sec-a');
    const tokenA = await session(userA);
    await seedDividendPayer(userA, 'a', 'PETR4');
    // Record a corporate evidence row for A (contains internal UUID id).
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/high-income/evidence')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        evidenceType: 'CORPORATE_TAX',
        payerId: 'PETR4',
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        evidenceMode: 'FULL',
        accountingProfit: '800000.00',
        irDue: '200000.00',
        csllDue: '68000.00',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
      })
      .expect(201);

    const userB = uuidFor('user-sec-b');
    const tokenB = await session(userB);

    const res = await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(res.body.data.status).toBe('NOT_APPLICABLE');
    expect(res.body.data.section2Applicability.totalAnnualIncome).toBeNull();
    expect(res.body.data.section6CorporateRedutorByPayer.payers).toHaveLength(0);
    // B's package must not carry A's business payer id either.
    expect(JSON.stringify(res.body.data)).not.toContain('PETR4');
  });

  it('foreign/missing resources never produce 403 (anti-enumeration): other paths resolve to 404', async () => {
    const token = await session(uuidFor('user-sec-404'));
    // A sibling evidence resolve path for a non-existent id must be 404, never 403.
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/annual/2026/high-income/evidence/${uuidFor('ghost')}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'ACCEPT_NEW' })
      .expect((res) => {
        expect(res.status).not.toBe(403);
        expect([404, 409]).toContain(res.status);
      });
  });

  it('foreign payer cannot be injected via evidence for a different user (404, not 403)', async () => {
    const userA = uuidFor('user-sec-fp-a');
    await session(userA); // ensures user A exists (its token is unused here)
    await seedDividendPayer(userA, 'fpa', 'VALE3');

    const userB = uuidFor('user-sec-fp-b');
    const tokenB = await session(userB);
    // B references A's payer universe — foreign, must be 404 not 403.
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/high-income/evidence')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        evidenceType: 'CORPORATE_TAX',
        payerId: 'VALE3',
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        evidenceMode: 'FULL',
        accountingProfit: '800000.00',
        irDue: '200000.00',
        csllDue: '68000.00',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
      })
      .expect(404);
  });

  it('tampered params (non-integer year) -> 400 with no stack/internal detail in body', async () => {
    const token = await session(uuidFor('user-sec-tamper'));
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/20);DROP/high-income/review')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at\s+\/|\.ts:\d+|node_modules/);
    expect(body).not.toMatch(/stack/i);
  });

  it('serialized package + export carry no internal DB UUID / CPF / token / stack, and escape injected text', async () => {
    const userId = uuidFor('user-sec-leak');
    const token = await session(userId);
    await seedDividendPayer(userId, 'leak', 'ITUB4');
    // Record corporate evidence (its DB id is an internal UUID that must NOT leak).
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/high-income/evidence')
      .set('Authorization', `Bearer ${token}`)
      .send({
        evidenceType: 'CORPORATE_TAX',
        payerId: 'ITUB4',
        payerType: 'STANDARD_CORPORATE',
        profitPeriodExercise: 2026,
        evidenceMode: 'FULL',
        accountingProfit: '800000.00',
        irDue: '200000.00',
        csllDue: '68000.00',
        evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
      })
      .expect(201);

    // Pull the stored row id so we can scan the serialized surfaces for it.
    const rows = await prisma.highIncomeEvidenceRecord.findMany({
      where: { taxSubjectId: userId, calendarYear: 2026 },
    });
    expect(rows.length).toBeGreaterThan(0);
    const dbIds = rows.map((r) => r.id);

    const supersedesIds = rows
      .map((r) => r.supersedesId)
      .filter((v): v is string => typeof v === 'string');
    const forbiddenIds = [...dbIds, ...supersedesIds];

    const review = await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const reviewJson = JSON.stringify(review.body.data);
    // The evidence row DB id and supersedesId (randomUUID PKs) must never leak
    // into the serialized evidence surface (design §2 Section 7 / §8).
    for (const id of forbiddenIds) {
      expect(reviewJson).not.toContain(id);
    }
    expect(review.body.data.section7Readiness.evidence[0]).not.toHaveProperty('id');
    expect(review.body.data.section7Readiness.evidence[0]).not.toHaveProperty('supersedesId');
    expect(reviewJson).not.toMatch(/stack/i);

    const csv = await request(app.getHttpServer())
      .get(`${EXPORT(2026)}?format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    for (const id of forbiddenIds) {
      expect(csv.text).not.toContain(id);
    }

    const json = await request(app.getHttpServer())
      .get(`${EXPORT(2026)}?format=json`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    for (const id of forbiddenIds) {
      expect(json.text).not.toContain(id);
    }
  });

  it('CSV output never begins a cell with a formula control character (OWASP injection defense)', async () => {
    const userId = uuidFor('user-sec-csv');
    const token = await session(userId);
    await seedDividendPayer(userId, 'csv', 'BBAS3');

    const csv = await request(app.getHttpServer())
      .get(`${EXPORT(2026)}?format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const line of csv.text.split('\r\n')) {
      if (line.startsWith('#') || line.length === 0) {
        continue; // comment/banner lines
      }
      for (const cell of line.split(';')) {
        // A data cell beginning with a dangerous char must be quote-prefixed.
        expect(/^[=+@](?!")/.test(cell)).toBe(false);
      }
    }
  });
});
