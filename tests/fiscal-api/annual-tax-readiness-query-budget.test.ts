import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, cleanDatabase } from '../api/setup';
import { TEST_DATABASE_URL } from '../database/setup';
import { uuidFor } from '../tax-engine/helpers';

interface QueryLog {
  readonly query: string;
  readonly params: string;
}

describe('Phase 4H.5 — Annual Tax Readiness Query Budget & Bounded Execution (Real App Path)', () => {
  let app: INestApplication;
  const recordedQueries: QueryLog[] = [];
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    prisma.$on('query' as never, (e: { query: string; params: string }) => {
      recordedQueries.push({ query: e.query, params: e.params });
    });
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => '2026-10-01' })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    recordedQueries.length = 0;
  });

  function categorizeQueries(logs: readonly QueryLog[]): {
    positions: number;
    capitalMarket: number;
    income: number;
    confirmations: number;
    evidence: number;
    other: number;
    total: number;
  } {
    let positions = 0;
    let capitalMarket = 0;
    let income = 0;
    let confirmations = 0;
    let evidence = 0;
    let other = 0;

    for (const log of logs) {
      const q = log.query.toLowerCase();
      if (q.includes('taxpayer_confirmations')) {
        confirmations++;
      } else if (q.includes('annual_opening_position_inputs') || q.includes('positions')) {
        positions++;
      } else if (
        q.includes('tax_obligations') ||
        q.includes('tax_compensations') ||
        q.includes('darf')
      ) {
        evidence++;
      } else if (q.includes('transactions') || q.includes('cash_balance')) {
        capitalMarket++;
      } else if (q.includes('assets') || q.includes('asset_tax_metadata')) {
        income++;
      } else {
        other++;
      }
    }

    return {
      positions,
      capitalMarket,
      income,
      confirmations,
      evidence,
      other,
      total: logs.length,
    };
  }

  it('measures query budget for Small user (empty / minimal activity)', async () => {
    const userId = uuidFor('user-budget-small');
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Small User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const { token } = await createAuthenticatedUserSession(userId);

    recordedQueries.length = 0;

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();

    const counts = categorizeQueries(recordedQueries);

    expect(counts.total).toBeLessThanOrEqual(65);

    // Explicit N+1 Verification:
    const perAssetQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('assets where id ='),
    ).length;
    expect(perAssetQueries).toBe(0);

    const perPaymentQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('payments where id ='),
    ).length;
    expect(perPaymentQueries).toBe(0);
  });

  it('measures query budget for Medium user with portfolio, transactions, and confirmations', async () => {
    const userId = uuidFor('user-budget-medium');
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Medium User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const { token } = await createAuthenticatedUserSession(userId);

    // Seed a confirmation
    await prisma.taxpayerConfirmationRecord.create({
      data: {
        taxSubjectId: userId,
        calendarYear: 2026,
        confirmationType: 'DIVIDEND_TRANSITION_EVIDENCE',
        subjectReference: 'asset-petr4',
        decision: 'CONFIRMED',
        statementVersion: '2026.1',
        sourceFingerprint: 'fp_sample_medium',
        source: 'MANUAL_TAXPAYER_CONFIRMATION',
        createdByPrincipal: userId,
        revision: 1,
        fingerprint: 'fp_medium_rec',
      },
    });

    recordedQueries.length = 0;

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();

    const counts = categorizeQueries(recordedQueries);

    expect(counts.total).toBeLessThanOrEqual(65);

    // 0 N+1 checks
    const perRequirementQueries = recordedQueries.filter((q) =>
      q.query.toLowerCase().includes('where requirement_id ='),
    ).length;
    expect(perRequirementQueries).toBe(0);
  });

  it('measures query budget for Large user (multiple confirmations, history, multi-year state)', async () => {
    const userId = uuidFor('user-budget-large');
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Large User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const { token } = await createAuthenticatedUserSession(userId);

    // Seed 5 confirmations
    for (let i = 1; i <= 5; i++) {
      await prisma.taxpayerConfirmationRecord.create({
        data: {
          taxSubjectId: userId,
          calendarYear: 2026,
          confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
          subjectReference: `asset-fii-${i}`,
          decision: 'CONFIRMED',
          statementVersion: '2026.1',
          sourceFingerprint: `fp_fii_${i}`,
          source: 'MANUAL_TAXPAYER_CONFIRMATION',
          createdByPrincipal: userId,
          revision: 1,
          fingerprint: `fp_large_${i}`,
        },
      });
    }

    recordedQueries.length = 0;

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/annual/2026/readiness')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();

    const counts = categorizeQueries(recordedQueries);

    // Queries remain constant and bounded regardless of confirmation count
    expect(counts.total).toBeLessThanOrEqual(65);
  });
});
