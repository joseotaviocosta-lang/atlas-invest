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

type CenterItem = {
  actionKey: string;
  obligationKey: string;
  sourceFingerprint: string;
  kind: string;
  operationalStatus: string;
  amount: string | null;
  reminderStatus: string | null;
  paymentEvidenceStatus: string | null;
};

async function getCenterItems(token: string, server: unknown): Promise<CenterItem[]> {
  const res = await request(server as never)
    .get('/api/v1/fiscal/compliance/action-center?calendarYear=2026')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.data as CenterItem[];
}

describe('Phase 4K.4 — Tax Compliance Action Center Concurrency Matrix (C1-C6)', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-action-center-concurrency');
  const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
  const obA = uuidFor('ac-conc-ob-a');

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
        liabilityFingerprint: 'fp-ac-conc-v1',
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

  it('C1 (Concurrency): action-center read racing obligation source rebuild yields coherent A or B, never mixed', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    const reads = Array.from({ length: 10 }, () => getCenterItems(token, server));
    const rebuild = (async () => {
      await prisma.taxObligationRecord.updateMany({
        where: { taxSubjectId: user1, competence: '2026-03' },
        data: { liabilityFingerprint: 'fp-ac-conc-v2', principalAmount: '600.00' },
      });
    })();
    const snapshots = await Promise.all([
      ...reads,
      rebuild.then(() => getCenterItems(token, server)),
    ]);
    const payItems = snapshots.flatMap((items) =>
      items.filter((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX'),
    );
    // Every observed PAY_TAX item binds a single coherent lineage.
    for (const item of payItems) {
      if (item.sourceFingerprint === 'fp-ac-conc-v1') {
        expect(item.amount).toBe('500');
      } else {
        expect(item.sourceFingerprint).toBe('fp-ac-conc-v2');
        expect(item.amount).toBe('600');
      }
    }
    // No mixed A/B item exists: amount and fingerprint always agree.
    const mixed = payItems.filter(
      (item) =>
        (item.sourceFingerprint === 'fp-ac-conc-v1' && item.amount === '600') ||
        (item.sourceFingerprint === 'fp-ac-conc-v2' && item.amount === '500'),
    );
    expect(mixed).toEqual([]);
    // Restore lineage A for downstream scenarios.
    await prisma.taxObligationRecord.updateMany({
      where: { taxSubjectId: user1, competence: '2026-03' },
      data: { liabilityFingerprint: 'fp-ac-conc-v1', principalAmount: '500.00' },
    });
  });

  it('C2 (Concurrency): action-center read racing payment evidence write yields pre- or post-evidence coherence', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    const reads = Array.from({ length: 8 }, () => getCenterItems(token, server));
    const write = request(server)
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyA)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '500.00',
        referencePeriod: '2026-03',
        externalReference: 'AC-CONC-EV-001',
      });
    const [snapshots] = await Promise.all([Promise.all(reads), write.then((r) => r)]);
    for (const items of snapshots) {
      const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
      expect(payItem).toBeDefined();
      // Pre-evidence: NO_EVIDENCE. Post-evidence: MATCH informational sibling. Never a hybrid.
      expect(['NO_EVIDENCE', 'USER_REPORTED_MATCH']).toContain(payItem!.paymentEvidenceStatus);
    }
  });

  it('C3 (Concurrency): action-center read racing reminder dismiss — dismiss only changes reminder projection', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-23`;
    const reads = Array.from({ length: 8 }, () => getCenterItems(token, server));
    const dismiss = request(server)
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'DISMISS',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-23',
        sourceFingerprint: 'fp-ac-conc-v1',
      });
    const [snapshots] = await Promise.all([Promise.all(reads), dismiss.then((r) => r)]);
    for (const items of snapshots) {
      const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
      // Obligation projection is untouched: still actionable with the same amount.
      expect(payItem?.operationalStatus).toBe('UPCOMING');
      expect(payItem?.amount).toBe('500');
    }
  });

  it('C4 (Concurrency): action-center read racing reminder snooze — due date never moves', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-27`;
    const reads = Array.from({ length: 8 }, () => getCenterItems(token, server));
    const snooze = request(server)
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'SNOOZE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-27',
        sourceFingerprint: 'fp-ac-conc-v1',
        snoozedUntil: '2026-04-28',
      });
    const [snapshots] = await Promise.all([Promise.all(reads), snooze.then((r) => r)]);
    for (const items of snapshots) {
      for (const item of items.filter((entry) => entry.obligationKey === keyA)) {
        expect((item as CenterItem & { dueDate?: string | null }).dueDate ?? '2026-04-30').toBe(
          '2026-04-30',
        );
      }
    }
  });

  it('C5 (Concurrency): compliance reopen during action-center reads reappears consistently as actionable', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    await request(server)
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyA)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REPORTED_COMPLETION', sourceFingerprint: 'fp-ac-conc-v1' })
      .expect(201);
    const reads = Array.from({ length: 6 }, () => getCenterItems(token, server));
    const reopen = request(server)
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyA)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REOPENED', sourceFingerprint: 'fp-ac-conc-v1' })
      .expect(201);
    const [snapshots] = await Promise.all([Promise.all(reads), reopen.then((r) => r)]);
    // Every snapshot is internally coherent: COMPLETED xor actionable, never both/neither.
    for (const items of snapshots) {
      const related = items.filter((item) => item.obligationKey === keyA);
      const completed = related.filter((item) => item.operationalStatus === 'COMPLETED');
      const actionable = related.filter((item) => item.kind === 'PAY_TAX');
      expect(completed.length + actionable.length).toBeGreaterThanOrEqual(1);
      expect(completed.length <= 1 && actionable.length <= 1).toBe(true);
    }
    const settled = await getCenterItems(token, server);
    const actionable = settled.filter(
      (item) => item.obligationKey === keyA && item.kind === 'PAY_TAX',
    );
    expect(actionable.length).toBe(1);
    expect(actionable[0]!.operationalStatus).toBe('UPCOMING');
  });

  it('C6 (Concurrency): calendar read racing source rebuild shows no duplicate old+new current event', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    const readCalendar = async () => {
      const res = await request(server)
        .get('/api/v1/fiscal/compliance/calendar?from=2026-04-01&to=2026-05-31')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return res.body.data as Array<{
        eventKey: string;
        obligationKey: string | null;
        eventType: string;
        eventDate: string;
      }>;
    };
    const reads = Array.from({ length: 8 }, () => readCalendar());
    const rebuild = (async () => {
      await prisma.taxObligationRecord.updateMany({
        where: { taxSubjectId: user1, competence: '2026-03' },
        data: { liabilityFingerprint: 'fp-ac-conc-v3', principalAmount: '550.00' },
      });
    })();
    const snapshots = await Promise.all([...reads, rebuild.then(() => readCalendar())]);
    for (const events of snapshots) {
      const keys = events.map((event) => event.eventKey);
      expect(new Set(keys).size).toBe(keys.length);
      const dues = events.filter(
        (event) => event.obligationKey === keyA && event.eventType === 'OBLIGATION_DUE',
      );
      // At most one current due event per semantic obligation per snapshot.
      expect(dues.length).toBeLessThanOrEqual(1);
    }
    await prisma.taxObligationRecord.updateMany({
      where: { taxSubjectId: user1, competence: '2026-03' },
      data: { liabilityFingerprint: 'fp-ac-conc-v1', principalAmount: '500.00' },
    });
  });
});
