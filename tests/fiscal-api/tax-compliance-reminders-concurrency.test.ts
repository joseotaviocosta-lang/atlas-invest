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

describe('Phase 4K.3 — Tax Compliance Reminder Concurrency Matrix', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-reminder-concurrency');

  const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
  const obA = uuidFor('rem-conc-ob-a');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    await session(user1);
    await prisma.taxObligationRecord.create({
      data: {
        id: obA,
        taxSubjectId: user1,
        competence: '2026-03',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-conc-a-v1',
        revision: 1,
        principalAmount: '500.00',
        currency: 'BRL',
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Scenario 1 (Concurrency): 10 concurrent identical deliveries yield one canonical event', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-23`;
    const payload = {
      sourceFingerprint: 'fp-conc-a-v1',
      channel: 'IN_APP',
      triggerAt: '2026-04-23',
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/deliveries`)
          .set('Authorization', `Bearer ${token}`)
          .send(payload)
          .expect(201),
      ),
    );
    const ids = new Set(results.map((r) => r.body.data.id as string));
    expect(ids.size).toBe(1);
    const history = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.data.length).toBe(1);
  });

  it('Scenario 2 (Concurrency): two distinct concurrent actions assign monotonic revisions', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-27`;
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'ACKNOWLEDGE',
          obligationKey: keyA,
          reminderKind: 'UPCOMING_DUE',
          triggerAt: '2026-04-27',
          sourceFingerprint: 'fp-conc-a-v1',
        })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'DISMISS',
          obligationKey: keyA,
          reminderKind: 'UPCOMING_DUE',
          triggerAt: '2026-04-27',
          sourceFingerprint: 'fp-conc-a-v1',
        })
        .expect(201),
    ]);
    const revisions = [first.body.data.revision, second.body.data.revision].sort();
    expect(revisions).toEqual([1, 2]);
  });

  it('Scenario 3 (Concurrency): acknowledge races source change — settled state is deterministically STALE-aware', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-29`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'ACKNOWLEDGE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-29',
        sourceFingerprint: 'fp-conc-a-v1',
      })
      .expect(201);
    await prisma.taxObligationRecord.update({
      where: { id: obA },
      data: { liabilityFingerprint: 'fp-conc-a-v2', principalAmount: '600.00' },
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data as Array<{
      reminderKey: string;
      status: string;
      sourceFingerprint: string;
    }>;
    const shells = rows.filter((r) => r.reminderKey === reminderKey && r.status === 'SUPERSEDED');
    expect(shells.length).toBe(1);
    expect(shells[0]!.sourceFingerprint).toBe('fp-conc-a-v1');
    const fresh = rows.filter(
      (r) => r.reminderKey === reminderKey && r.sourceFingerprint === 'fp-conc-a-v2',
    );
    expect(fresh.length).toBe(1);
    expect(['SCHEDULED', 'DELIVERED']).toContain(fresh[0]!.status);
  });

  it('Scenario 4 (Concurrency): snooze races delivery — no double delivery, deterministic final state', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-23`;
    const [snoozeRes, deliveryRes] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'SNOOZE',
          obligationKey: keyA,
          reminderKind: 'UPCOMING_DUE',
          triggerAt: '2026-04-23',
          sourceFingerprint: 'fp-conc-a-v2',
          snoozedUntil: '2026-04-28',
        })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/deliveries`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          sourceFingerprint: 'fp-conc-a-v2',
          channel: 'IN_APP',
          triggerAt: '2026-04-23',
        })
        .expect(201),
    ]);
    expect(snoozeRes.body.data.actionType).toBe('SNOOZE');
    expect(deliveryRes.body.data.deliveryStatus).toBe('DELIVERED');
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data as Array<{ reminderKey: string; status: string }>;
    expect(rows.find((r) => r.reminderKey === reminderKey)?.status).toBe('SNOOZED');
  });

  it('Scenario 5 (Concurrency): preferences update races scheduler projection — no mixed state', async () => {
    const token = await session(user1);
    const [putRes, getRes] = await Promise.all([
      request(app.getHttpServer())
        .put('/api/v1/fiscal/compliance/reminder-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({
          remindersEnabled: true,
          upcomingEnabled: false,
          overdueEnabled: true,
          annualEnabled: true,
          leadTimes: [7, 3, 1],
        })
        .expect(200),
      request(app.getHttpServer())
        .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
        .set('Authorization', `Bearer ${token}`)
        .expect(200),
    ]);
    expect(putRes.body.data.upcomingEnabled).toBe(false);
    expect(Array.isArray(getRes.body.data)).toBe(true);
    for (const row of getRes.body.data as Array<{ status: string }>) {
      expect(typeof row.status).toBe('string');
    }
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [7, 3, 1],
      })
      .expect(200);
  });

  it('Scenario 6 (Concurrency): reminder read during source rebuild yields coherent snapshot', async () => {
    const token = await session(user1);
    const [readRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
        .set('Authorization', `Bearer ${token}`)
        .expect(200),
      prisma.taxObligationRecord.update({
        where: { id: obA },
        data: { liabilityFingerprint: 'fp-conc-a-v3', principalAmount: '650.00' },
      }),
    ]);
    expect(Array.isArray(readRes.body.data)).toBe(true);
    const after = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = after.body.data as Array<{
      obligationKey: string;
      sourceFingerprint: string;
      status: string;
    }>;
    const current = rows.filter((r) => r.obligationKey === keyA && r.status !== 'SUPERSEDED');
    expect(current.every((r) => r.sourceFingerprint === 'fp-conc-a-v3')).toBe(true);
  });
});
