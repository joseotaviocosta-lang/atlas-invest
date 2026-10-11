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

  it('Scenario 2 (Concurrency): two distinct evidence submissions concurrently assign monotonic revisions and preserve distinct payload history', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-concurrent-distinct');
    await seedObligation({ id: obId, userId: user1, competence: '2026-02', amount: '500.00' });
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          paymentDate: '2026-04-20',
          amountReported: '500.00',
          referencePeriod: '2026-02',
          externalReference: 'PAY-A',
          note: 'Submission Alpha',
        }),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          paymentDate: '2026-04-21',
          amountReported: '500.00',
          referencePeriod: '2026-02',
          externalReference: 'PAY-B',
          note: 'Submission Beta',
        }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    const revisions = [res1.body.data.revision, res2.body.data.revision].sort((a, b) => a - b);
    expect(revisions).toEqual([1, 2]);

    const historyRes = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const notes = historyRes.body.data.map((h: TaxPaymentEvidenceRecord) => h.note).sort();
    expect(notes).toEqual(['Submission Alpha', 'Submission Beta']);
  });

  it('Scenario 3 (Concurrency): evidence + source change — concurrent evidence submission + source obligation recalculation resolves deterministically', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-concurrent-3');
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-03',
      amount: '400.00',
      fingerprint: 'fp-conc-initial-v1',
    });
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const writeEvidence = request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-05-20',
        amountReported: '400.00',
        referencePeriod: '2026-03',
      });

    const updateSource = prisma.taxObligationRecord.update({
      where: { id: obId },
      data: { liabilityFingerprint: 'fp-conc-updated-v2' },
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

  it('Scenario 4 (Concurrency): evidence + compliance reopen — concurrent evidence submission and user reopen action resolve deterministically', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-concurrent-4');
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-04',
      amount: '350.00',
      fingerprint: 'fp-reopen-test-v1',
    });
    const key = `${user1}:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const postEvidence = request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-05-25',
        amountReported: '350.00',
        referencePeriod: '2026-04',
      });

    const postReopen = request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REOPENED',
        sourceFingerprint: 'fp-reopen-test-v1',
        note: 'Concurrent reopen action',
      });

    const [evRes, actionRes] = await Promise.all([postEvidence, postReopen]);
    expect(evRes.status).toBe(201);
    expect(actionRes.status).toBe(201);
    expect(evRes.body.data.revision).toBe(1);
    expect(actionRes.body.data.revision).toBe(1);
    expect(actionRes.body.data.actionType).toBe('USER_REOPENED');
  });

  it('Scenario 5 (Concurrency): support read + source rebuild — concurrent support read during source obligation update/rebuild yields coherent snapshot', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-concurrent-5');
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-05',
      amount: '600.00',
      fingerprint: 'fp-rebuild-init',
    });
    const key = `${user1}:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // Concurrently read support while updating source obligation principalAmount and fingerprint
    const readPromises = Array.from({ length: 5 }, () =>
      request(app.getHttpServer())
        .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
        .set('Authorization', `Bearer ${token}`),
    );

    const updatePromise = prisma.taxObligationRecord.update({
      where: { id: obId },
      data: {
        principalAmount: '650.00',
        liabilityFingerprint: 'fp-rebuild-updated',
      },
    });

    const [reads, update] = await Promise.all([Promise.all(readPromises), updatePromise]);
    expect(update.principalAmount.toString()).toBe('650');

    // All reads must succeed with 200 and return coherent amount (either 600 or 650)
    for (const r of reads) {
      expect(r.status).toBe(200);
      expect(['600', '650', '600.00', '650.00']).toContain(r.body.data.amount);
      expect(['fp-rebuild-init', 'fp-rebuild-updated']).toContain(r.body.data.sourceFingerprint);
    }
  });
});
