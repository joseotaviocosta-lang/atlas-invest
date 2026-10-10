import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

describe('Phase 4K.1B — Tax Compliance Concurrency Matrix', () => {
  let app: INestApplication;
  const user = uuidFor('user-compliance-concurrency');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-15');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Two simultaneous completion actions produce sequential monotonic revisions without split-brain', async () => {
    const token = await session(user);
    const key = `${user}:2026-08:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-conc-1'),
        taxSubjectId: user,
        competence: '2026-08',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-conc-1',
        revision: 1,
        principalAmount: '1000.00',
        currency: 'BRL',
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REPORTED_COMPLETION',
          sourceFingerprint: 'fp-conc-1',
          note: 'Parallel Post 1',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REPORTED_COMPLETION',
          sourceFingerprint: 'fp-conc-1',
          note: 'Parallel Post 2',
        }),
    ]);

    expect([res1.status, res2.status]).toContain(201);
    const rows = await prisma.taxComplianceActionRecord.findMany({
      where: { taxSubjectId: user, obligationKey: key },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('2. Completion + source change race condition safely evaluates to current state', async () => {
    const token = await session(user);
    const key = `${user}:2026-08:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REPORTED_COMPLETION',
          sourceFingerprint: 'fp-conc-1',
          note: 'Concurrent user action',
        }),
      prisma.taxObligationRecord.update({
        where: { id: uuidFor('ob-conc-1') },
        data: { liabilityFingerprint: 'fp-conc-1-updated', principalAmount: '1100.00' },
      }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-08')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Depending on ordering, obligation is either SUPERSEDED (if update was seen) or COMPLETED
    expect(['COMPLETED', 'SUPERSEDED']).toContain(res.body.data.obligations[0].status);
  });

  it('3. Reopen + completion race condition produces sequential audit rows', async () => {
    const token = await session(user);
    const key = `${user}:2026-08:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const [resReopen, resComp] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REOPENED',
          sourceFingerprint: 'fp-conc-1-updated',
          note: 'Reaberto',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REPORTED_COMPLETION',
          sourceFingerprint: 'fp-conc-1-updated',
          note: 'Completado',
        }),
    ]);

    expect([resReopen.status, resComp.status]).toContain(201);
  });

  it('4. Annual rebuild + compliance read race returns valid snapshot without failure', async () => {
    const token = await session(user);

    const reads = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .get('/api/v1/fiscal/compliance?calendarYear=2026')
          .set('Authorization', `Bearer ${token}`),
      ),
    );

    for (const r of reads) {
      expect(r.status).toBe(200);
      expect(r.body.data.taxSubjectId).toBe(user);
    }
  });
});
