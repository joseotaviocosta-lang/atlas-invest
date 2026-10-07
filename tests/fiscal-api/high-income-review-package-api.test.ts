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
        name: 'Review Package User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

/**
 * Seeds an APPLICABLE equity-gain scenario (R$700k capital gain, no dividend
 * withholding) and records a zero annual-adjustment attestation so the engine
 * can emit an authoritative net — mirrors the frozen 4I.4 "Scenario B" that
 * yields CALCULABLE/net, which the package maps to READY_FOR_REVIEW.
 */
async function seedReadyForReview(
  server: unknown,
  token: string,
  userId: string,
  tag: string,
): Promise<void> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-rp-${tag}`),
      userId,
      name: `RP ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-rp-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-rp-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-rp-${tag}`),
      ticker: 'PETR4',
      name: 'Petrobras PN',
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-rp-buy-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: new Date('2026-01-10T00:00:00Z'),
      settlementDate: new Date('2026-01-12T00:00:00Z'),
      quantity: '100000',
      unitPrice: '10.00',
      amount: '1000000.00',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-rp-sell-${tag}`),
      portfolioId: portfolio.id,
      accountId: account.id,
      assetId: asset.id,
      type: 'SELL',
      tradeDate: new Date('2026-06-15T00:00:00Z'),
      settlementDate: new Date('2026-06-17T00:00:00Z'),
      quantity: '100000',
      unitPrice: '17.00',
      amount: '1700000.00',
      currency: 'BRL',
    },
  });
  await request(server as never)
    .post(`/api/v1/fiscal/annual/2026/high-income/evidence`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      evidenceType: 'ANNUAL_ADJUSTMENT_IRPF',
      adjustmentAmount: '0.00',
      evidenceSource: 'TAXPAYER_CONFIRMED',
    })
    .expect(201);
}

const REVIEW = (year: number) => `/api/v1/fiscal/annual/${year}/high-income/review`;
const EXPORT = (year: number) => `/api/v1/fiscal/annual/${year}/high-income/export`;

describe('API Integration: High-Income Review/Support Package (Phase 4I.6)', () => {
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

  it('rejects unauthenticated review + export with 401', async () => {
    await request(app.getHttpServer()).get(REVIEW(2026)).expect(401);
    await request(app.getHttpServer()).get(EXPORT(2026)).expect(401);
  });

  it('GET /review returns 200 with a well-formed package envelope', async () => {
    const userId = uuidFor('user-rp-review');
    const token = await session(userId);
    await seedReadyForReview(app.getHttpServer(), token, userId, 'review');

    const res = await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pkg = res.body.data;
    expect(pkg.packageVersion).toBe('high-income-annual-review-package-v1');
    expect(pkg.section1Identity.calendarYear).toBe(2026);
    expect(pkg.section1Identity.declarationExercise).toBe(2027);
    expect(pkg.packageFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(pkg.disclaimer).toContain('DOCUMENTO DE APOIO');
    expect(pkg.status).toBe('READY_FOR_REVIEW');
    expect(pkg.section2Applicability.thresholdMetric).toBe('TOTAL_ANNUAL_INCOME');
    expect(pkg.section4Calculation.netMinimumTax).not.toBeNull();
  });

  it('GET /export?format=csv returns CSV with safe filename and no-store cache', async () => {
    const userId = uuidFor('user-rp-csv');
    const token = await session(userId);
    await seedReadyForReview(app.getHttpServer(), token, userId, 'csv');

    const res = await request(app.getHttpServer())
      .get(`${EXPORT(2026)}?format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="atlas-alta-renda-2026-relatorio-apoio.csv"',
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.text).toContain('DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL');
    // semicolon-delimited + CRLF
    expect(res.text).toContain('\r\n');
  });

  it('GET /export defaults to csv when format is omitted', async () => {
    const userId = uuidFor('user-rp-default');
    const token = await session(userId);
    await seedReadyForReview(app.getHttpServer(), token, userId, 'default');

    const res = await request(app.getHttpServer())
      .get(EXPORT(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(
      'atlas-alta-renda-2026-relatorio-apoio.csv',
    );
  });

  it('GET /export?format=json returns JSON attachment, no-store, and matches /review fingerprint', async () => {
    const userId = uuidFor('user-rp-json');
    const token = await session(userId);
    await seedReadyForReview(app.getHttpServer(), token, userId, 'json');

    const review = await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`${EXPORT(2026)}?format=json`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain(
      'atlas-alta-renda-2026-relatorio-apoio.json',
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    const exported = JSON.parse(res.text);
    // Export rebuilds the CURRENT package: fingerprint matches /review.
    expect(exported.packageFingerprint).toBe(review.body.data.packageFingerprint);
  });

  it('unsupported year (2028) -> 200 UNSUPPORTED with null figures (no API-layer window)', async () => {
    const userId = uuidFor('user-rp-2028');
    const token = await session(userId);

    const res = await request(app.getHttpServer())
      .get(REVIEW(2028))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('UNSUPPORTED');
    expect(res.body.data.section4Calculation.netMinimumTax).toBeNull();
    expect(res.body.data.section4Calculation.grossMinimumTax).toBeNull();

    const exp = await request(app.getHttpServer())
      .get(`${EXPORT(2028)}?format=json`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(JSON.parse(exp.text).status).toBe('UNSUPPORTED');
  });

  it('pre-2026 unsupported year (2025) -> 200 UNSUPPORTED', async () => {
    const userId = uuidFor('user-rp-2025');
    const token = await session(userId);
    const res = await request(app.getHttpServer())
      .get(REVIEW(2025))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('UNSUPPORTED');
  });

  it('invalid calendar year -> 400 FISCAL.INVALID_YEAR', async () => {
    const token = await session(uuidFor('user-rp-year'));
    await request(app.getHttpServer())
      .get(REVIEW(1800))
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('FISCAL.INVALID_YEAR'));
  });

  it('invalid export format -> 400', async () => {
    const token = await session(uuidFor('user-rp-format'));
    await request(app.getHttpServer())
      .get(`${EXPORT(2026)}?format=pdf`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('empty subject still yields a safe NOT_APPLICABLE package (no fabricated figures)', async () => {
    const userId = uuidFor('user-rp-empty');
    const token = await session(userId);
    const res = await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('NOT_APPLICABLE');
    expect(res.body.data.section4Calculation.netMinimumTax).toBeNull();
  });
});
