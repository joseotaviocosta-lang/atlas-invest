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
        name: 'Concurrency User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

interface Fixture {
  portfolioId: string;
  accountId: string;
  assetId: string;
}

async function seedDividend(userId: string, tag: string): Promise<Fixture> {
  const portfolio = await prisma.portfolio.create({
    data: {
      id: uuidFor(`pf-cc-${tag}`),
      userId,
      name: `CC ${tag}`,
      type: 'PERSONAL',
      status: 'ACTIVE',
      baseCurrency: 'BRL',
    },
  });
  const institution = await prisma.institution.create({
    data: { id: uuidFor(`inst-cc-${tag}`), name: `Broker ${tag}`, type: 'BROKER', country: 'BR' },
  });
  const account = await prisma.account.create({
    data: {
      id: uuidFor(`acc-cc-${tag}`),
      portfolioId: portfolio.id,
      institutionId: institution.id,
      name: `Acc ${tag}`,
      status: 'ACTIVE',
      currency: 'BRL',
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: uuidFor(`asset-cc-${tag}`),
      ticker: 'PETR4',
      name: 'Petrobras PN',
      type: 'STOCK',
      exchange: 'B3',
      currency: 'BRL',
    },
  });
  await prisma.transaction.create({
    data: {
      id: uuidFor(`tx-cc-${tag}`),
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
  return { portfolioId: portfolio.id, accountId: account.id, assetId: asset.id };
}

function corporateBody(payerId: string, overrides: Record<string, unknown> = {}) {
  return {
    evidenceType: 'CORPORATE_TAX',
    payerId,
    payerType: 'STANDARD_CORPORATE',
    profitPeriodExercise: 2026,
    evidenceMode: 'FULL',
    accountingProfit: '800000.00',
    irDue: '200000.00',
    csllDue: '68000.00',
    evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
    ...overrides,
  };
}

const REVIEW = (year: number) => `/api/v1/fiscal/annual/${year}/high-income/review`;
const PACKAGE_STATUSES = new Set([
  'READY_FOR_REVIEW',
  'INCOMPLETE',
  'BLOCKED',
  'NOT_APPLICABLE',
  'UNSUPPORTED',
]);

describe('API Concurrency: High-Income Review/Support Package (Phase 4I.6)', () => {
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

  it('10 concurrent requests over the same source state yield an identical packageFingerprint', async () => {
    const userId = uuidFor('user-cc-identical');
    const token = await session(userId);
    await seedDividend(userId, 'identical');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/high-income/evidence')
      .set('Authorization', `Bearer ${token}`)
      .send(corporateBody('PETR4'))
      .expect(201);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .get(REVIEW(2026))
          .set('Authorization', `Bearer ${token}`)
          .expect(200),
      ),
    );
    const fingerprints = new Set(results.map((r) => r.body.data.packageFingerprint));
    expect(fingerprints.size).toBe(1);
  });

  it('a source/evidence race yields a single consistent package or SNAPSHOT_INCONSISTENT — never mixed-state', async () => {
    const userId = uuidFor('user-cc-race');
    const token = await session(userId);
    await seedDividend(userId, 'race');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/high-income/evidence')
      .set('Authorization', `Bearer ${token}`)
      .send(corporateBody('PETR4'))
      .expect(201);

    const baseline = await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const fp0 = baseline.body.data.packageFingerprint as string;

    const racingReads = Array.from({ length: 10 }, () =>
      request(app.getHttpServer()).get(REVIEW(2026)).set('Authorization', `Bearer ${token}`),
    );
    const racingWrite = request(app.getHttpServer())
      .post('/api/v1/fiscal/annual/2026/high-income/evidence')
      .set('Authorization', `Bearer ${token}`)
      .send(corporateBody('PETR4', { irDue: '210000.00' }));

    const [reads] = await Promise.all([Promise.all(racingReads), racingWrite]);

    const seenFingerprints = new Set<string>();
    for (const res of reads) {
      // Either a clean 200 package, or a fail-closed 400 SNAPSHOT_INCONSISTENT.
      if (res.status === 200) {
        expect(PACKAGE_STATUSES.has(res.body.data.status)).toBe(true);
        // Each package internally echoes a single fingerprint (no mixed state).
        expect(res.body.data.section8Provenance.packageFingerprint).toBe(
          res.body.data.packageFingerprint,
        );
        seenFingerprints.add(res.body.data.packageFingerprint);
      } else {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('FISCAL.SNAPSHOT_INCONSISTENT');
      }
    }

    const converged = await request(app.getHttpServer())
      .get(REVIEW(2026))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const fp1 = converged.body.data.packageFingerprint as string;

    // No racy read may have produced a third, mixed fingerprint.
    for (const fp of seenFingerprints) {
      expect([fp0, fp1]).toContain(fp);
    }
  });
});
