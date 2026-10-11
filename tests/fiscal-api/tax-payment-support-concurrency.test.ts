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
import { TaxPaymentEvidenceRecord } from '@atlas/tax-engine';

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

describe('Phase 4K.2 — Tax Payment Support & Settlement Concurrency Matrix', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-concurrency-4k2');
  const user2 = uuidFor('user2-concurrency-4k2');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-15');
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedObligation(params: {
    id: string;
    userId: string;
    competence: string;
    amount: string;
    dueDate?: string;
    fingerprint?: string;
  }) {
    await prisma.taxObligationRecord.create({
      data: {
        id: params.id,
        taxSubjectId: params.userId,
        competence: params.competence,
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: params.fingerprint ?? `fp-${params.id}-v1`,
        revision: 1,
        principalAmount: params.amount,
        currency: 'BRL',
        dueDate: new Date(`${params.dueDate ?? '2026-04-30'}T00:00:00.000Z`),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  }

  it('Scenario 1 (Concurrency): 10 concurrent duplicate evidence submissions on the same obligation assign monotonic revisions 1..10 with zero failures', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-concurrent-1');
    await seedObligation({ id: obId, userId: user1, competence: '2026-01', amount: '1000.00' });
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // Fire 10 concurrent requests simultaneously
    const requests = Array.from({ length: 10 }, (_, i) =>
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          paymentDate: '2026-04-20',
          amountReported: '1000.00',
          referencePeriod: '2026-01',
          externalReference: `CONC-REQ-${i}`,
          note: `Concurrent submission ${i}`,
        }),
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);
    expect(statuses.every((s) => s === 201)).toBe(true);

    const revisions = responses
      .map((r) => (r.body.data as TaxPaymentEvidenceRecord).revision)
      .sort((a, b) => a - b);
    expect(revisions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Verify DB history
    const historyRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const history: TaxPaymentEvidenceRecord[] = historyRes.body.data;
    expect(history.length).toBe(10);
  });

  it('Scenario 2 (Concurrency): concurrent submissions across two different obligations (user1 and user2) are completely isolated', async () => {
    const token1 = await session(user1);
    const token2 = await session(user2);

    const obId1 = uuidFor('ob-concurrent-user1');
    const obId2 = uuidFor('ob-concurrent-user2');
    await seedObligation({ id: obId1, userId: user1, competence: '2026-02', amount: '500.00' });
    await seedObligation({ id: obId2, userId: user2, competence: '2026-02', amount: '750.00' });

    const key1 = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const key2 = `${user2}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key1)}/payment-evidence`)
        .set('Authorization', `Bearer ${token1}`)
        .send({
          paymentDate: '2026-04-20',
          amountReported: '500.00',
          referencePeriod: '2026-02',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key2)}/payment-evidence`)
        .set('Authorization', `Bearer ${token2}`)
        .send({
          paymentDate: '2026-04-20',
          amountReported: '750.00',
          referencePeriod: '2026-02',
        }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.revision).toBe(1);
    expect(res2.body.data.revision).toBe(1);
    expect(res1.body.data.taxSubjectId).toBe(user1);
    expect(res2.body.data.taxSubjectId).toBe(user2);
  });

  it('Scenario 3 (Concurrency): concurrent read during write never returns corrupt or partial state', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-concurrent-3');
    await seedObligation({ id: obId, userId: user1, competence: '2026-03', amount: '300.00' });
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // 5 concurrent writes and 5 concurrent reads
    const operations = Array.from({ length: 10 }, (_, i) => {
      if (i % 2 === 0) {
        return request(app.getHttpServer())
          .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            paymentDate: '2026-04-20',
            amountReported: '300.00',
            referencePeriod: '2026-03',
          });
      } else {
        return request(app.getHttpServer())
          .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
          .set('Authorization', `Bearer ${token}`);
      }
    });

    const results = await Promise.all(operations);
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);

    // Final support read must reflect valid match
    const finalRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(finalRes.body.data.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(finalRes.body.data.latestEvidence.revision).toBe(5);
  });

  it('Scenario 4 (Concurrency): concurrent evidence submission + source obligation recalculation resolves deterministically', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-concurrent-4');
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-04',
      amount: '400.00',
      fingerprint: 'fp-conc-initial',
    });
    const key = `${user1}:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const writeEvidence = request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-05-20',
        amountReported: '400.00',
        referencePeriod: '2026-04',
      });

    const updateSource = prisma.taxObligationRecord.update({
      where: { id: obId },
      data: { liabilityFingerprint: 'fp-conc-updated' },
    });

    const [evRes] = await Promise.all([writeEvidence, updateSource]);
    expect(evRes.status).toBe(201);

    const supportRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // After source fingerprint update, support is either MATCH (if evidence was recorded after update) or STALE_SOURCE (if recorded before)
    expect(['USER_REPORTED_MATCH', 'STALE_SOURCE']).toContain(
      supportRes.body.data.reconciliationStatus,
    );
  });
});
