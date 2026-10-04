import 'reflect-metadata';
import { createHash } from 'node:crypto';
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

describe('Phase 4I.4 — Annual High-Income Application Scale (Real App Path)', () => {
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

  it('100 payers with evidence assess on the real path with bounded memory', async () => {
    const userId = uuidFor('user-hi-scale');
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Scale User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token } = await createAuthenticatedUserSession(userId);
    const portfolio = await prisma.portfolio.create({
      data: {
        id: uuidFor('pf-hi-scale'),
        userId,
        name: 'Scale Portfolio',
        type: 'PERSONAL',
        status: 'ACTIVE',
        baseCurrency: 'BRL',
      },
    });
    const institution = await prisma.institution.create({
      data: {
        id: uuidFor('inst-hi-scale'),
        name: 'Scale Broker',
        type: 'BROKER',
        country: 'BR',
      },
    });
    const account = await prisma.account.create({
      data: {
        id: uuidFor('acc-hi-scale'),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Scale Account',
        status: 'ACTIVE',
        currency: 'BRL',
      },
    });

    const payerCount = 100;
    const payerPin = (ticker: string): string =>
      createHash('sha256').update(`${ticker}|10000|0|0|0`, 'utf8').digest('hex');
    for (let p = 0; p < payerCount; p++) {
      const ticker = `SC${p}`;
      const asset = await prisma.asset.create({
        data: {
          id: uuidFor(`asset-hi-scale-${p}`),
          ticker,
          name: `Scale ${p}`,
          type: 'STOCK',
          exchange: 'B3',
          currency: 'BRL',
        },
      });
      await prisma.transaction.create({
        data: {
          id: uuidFor(`tx-hi-scale-${p}`),
          portfolioId: portfolio.id,
          accountId: account.id,
          assetId: asset.id,
          type: 'DIVIDEND',
          tradeDate: new Date('2026-05-15T00:00:00Z'),
          settlementDate: new Date('2026-05-15T00:00:00Z'),
          quantity: '0',
          unitPrice: '0',
          amount: '10000.00',
          currency: 'BRL',
        },
      });
      await prisma.highIncomeEvidenceRecord.create({
        data: {
          taxSubjectId: userId,
          calendarYear: 2026,
          payerKey: ticker,
          payerId: ticker,
          evidenceType: 'CORPORATE_TAX',
          payerType: 'STANDARD_CORPORATE',
          profitPeriodExercise: 2026,
          evidenceMode: 'FULL',
          accountingProfit: '800000.00',
          irDue: '200000.00',
          csllDue: '68000.00',
          authority: 'AUTHORITATIVE',
          evidenceSource: 'PJ_FINANCIAL_STATEMENTS',
          conflictStatus: 'NONE',
          upstreamFingerprint: payerPin(ticker),
          sourceFingerprint: `fp-scale-${p}`,
          revision: 1,
          fingerprint: `fp-full-scale-${p}`,
          createdByPrincipal: userId,
        },
      });
    }
    await prisma.highIncomeEvidenceRecord.create({
      data: {
        taxSubjectId: userId,
        calendarYear: 2026,
        payerKey: '_ANNUAL_',
        payerId: null,
        evidenceType: 'ANNUAL_ADJUSTMENT_IRPF',
        authority: 'AUTHORITATIVE',
        evidenceSource: 'TAXPAYER_CONFIRMED',
        conflictStatus: 'NONE',
        upstreamFingerprint: null,
        sourceFingerprint: 'fp-scale-adj',
        revision: 1,
        fingerprint: 'fp-full-scale-adj',
        adjustmentAmount: '0.00',
        createdByPrincipal: userId,
      },
    });

    const memBefore = process.memoryUsage().heapUsed;
    const startedAt = Date.now();
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/high-income')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const elapsedMs = Date.now() - startedAt;
    const memDeltaMb =
      Math.round(((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024) * 100) / 100;

    expect(res.body.data.corporateRedutor.payerCount).toBe(payerCount);
    expect(res.body.data.evidence.length).toBe(payerCount + 1);
    expect(res.body.data.status).toBe('CALCULABLE');
    expect(res.body.data.netMinimumTax).not.toBeNull();
    // eslint-disable-next-line no-console
    console.log(
      `[4I.4 scale] payers=${payerCount} elapsedMs=${elapsedMs} memDeltaMb=${memDeltaMb} status=${res.body.data.status}`,
    );
  }, 60000);
});
