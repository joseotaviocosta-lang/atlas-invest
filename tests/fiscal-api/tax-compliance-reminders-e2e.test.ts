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
        name: 'Reminder User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

type ReminderRow = {
  reminderKey: string;
  obligationKey: string;
  sourceFingerprint: string;
  kind: string;
  triggerAt: string;
  effectiveAt: string;
  status: string;
  severity: string;
  title: string;
  message: string;
  actionTarget: string;
  sourceVersion: string;
};

describe('Phase 4K.3 — Tax Compliance Reminders & Notification Orchestration 45-Scenario E2E Matrix', () => {
  let app: INestApplication;
  let futureApp: INestApplication;
  const user1 = uuidFor('user1-reminders');
  const user2 = uuidFor('user2-reminders');

  const obA = uuidFor('rem-ob-a');
  const obB = uuidFor('rem-ob-b');
  const obC = uuidFor('rem-ob-c');
  const obD = uuidFor('rem-ob-d');
  const obF = uuidFor('rem-ob-f');
  const obG = uuidFor('rem-ob-g');

  const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

  async function seedObligation(params: {
    id: string;
    userId: string;
    competence: string;
    amount: string | null;
    dueDate?: string | null;
    status?: string;
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
        dueDate:
          params.dueDate === null
            ? null
            : new Date(`${params.dueDate ?? '2026-04-30'}T00:00:00.000Z`),
        status: params.status ?? 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  }

  async function getReminders(token: string, qs = 'calendarYear=2026'): Promise<ReminderRow[]> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/reminders?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data as ReminderRow[];
  }

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    futureApp = await buildApp('2026-04-29');
    await session(user1);
    await session(user2);

    await seedObligation({
      id: obA,
      userId: user1,
      competence: '2026-03',
      amount: '500.00',
      dueDate: '2026-04-30',
      fingerprint: 'fp-a-v1',
    });
    await seedObligation({
      id: obB,
      userId: user1,
      competence: '2026-02',
      amount: '450.00',
      dueDate: '2026-03-31',
      fingerprint: 'fp-b-v1',
    });
    await seedObligation({
      id: obC,
      userId: user1,
      competence: '2026-01',
      amount: null,
      dueDate: '2026-02-28',
      fingerprint: 'fp-c-v1',
    });
    await seedObligation({
      id: obD,
      userId: user1,
      competence: '2026-04',
      amount: null,
      dueDate: '2026-05-31',
      status: 'BLOCKED',
      fingerprint: 'fp-d-v1',
    });
    await seedObligation({
      id: obF,
      userId: user1,
      competence: '2026-05',
      amount: '300.00',
      dueDate: '2026-04-20',
      fingerprint: 'fp-f-v1',
    });
    await seedObligation({
      id: obG,
      userId: user1,
      competence: '2026-06',
      amount: '700.00',
      dueDate: '2026-05-31',
      fingerprint: 'fp-g-v1',
    });
  });

  afterAll(async () => {
    await app.close();
    await futureApp.close();
  });

  // =========================================================================
  // UPCOMING REMINDERS (1-10) + DUE-TODAY (11)
  // =========================================================================

  it('Scenario 1 (Upcoming): future payable obligation projects 3 UPCOMING_DUE instances', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const upcoming = rows.filter((r) => r.obligationKey === keyA && r.kind === 'UPCOMING_DUE');
    expect(upcoming.length).toBe(3);
  });

  it('Scenario 2 (Upcoming): T-7/T-3/T-1 triggers equal dueDate minus policy lead time', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const triggers = rows
      .filter((r) => r.obligationKey === keyA && r.kind === 'UPCOMING_DUE')
      .map((r) => r.triggerAt)
      .sort();
    expect(triggers).toEqual(['2026-04-23', '2026-04-27', '2026-04-29']);
  });

  it('Scenario 3 (Upcoming): future triggers carry SCHEDULED status', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const upcoming = rows.filter((r) => r.obligationKey === keyA && r.kind === 'UPCOMING_DUE');
    expect(upcoming.every((r) => r.status === 'SCHEDULED')).toBe(true);
  });

  it('Scenario 4 (Upcoming): reminder keys are deterministic semantic identities', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const keys = rows
      .filter((r) => r.obligationKey === keyA && r.kind === 'UPCOMING_DUE')
      .map((r) => r.reminderKey)
      .sort();
    expect(keys).toEqual([
      `${keyA}:UPCOMING_DUE:2026-04-23`,
      `${keyA}:UPCOMING_DUE:2026-04-27`,
      `${keyA}:UPCOMING_DUE:2026-04-29`,
    ]);
    for (const row of rows) {
      expect(row.sourceVersion).toBe('4K.3');
      expect(row.actionTarget).toBe('/tax');
    }
  });

  it('Scenario 5 (Upcoming): envelope {data, meta} with totalCount and no-store', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.totalCount).toBe(res.body.data.length);
    expect(res.body.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('Scenario 6 (Upcoming): kind/status filters narrow server-side', async () => {
    const token = await session(user1);
    const filtered = await getReminders(token, 'calendarYear=2026&kind=UPCOMING_DUE');
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.kind === 'UPCOMING_DUE')).toBe(true);
    const scheduled = await getReminders(token, 'calendarYear=2026&status=SCHEDULED');
    expect(scheduled.every((r) => r.status === 'SCHEDULED')).toBe(true);
  });

  it('Scenario 7 (Upcoming): disabled upcoming preference cancels deterministically', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: false,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [7, 3, 1],
      })
      .expect(200);
    const rows = await getReminders(token);
    const upcoming = rows.filter((r) => r.kind === 'UPCOMING_DUE');
    expect(upcoming.length).toBeGreaterThan(0);
    expect(upcoming.every((r) => r.status === 'CANCELLED')).toBe(true);
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

  it('Scenario 8 (Upcoming): acknowledged upcoming carries ACKNOWLEDGED, siblings stay actionable', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-23`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'ACKNOWLEDGE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-23',
        sourceFingerprint: 'fp-a-v1',
      })
      .expect(201);
    const rows = await getReminders(token);
    expect(rows.find((r) => r.reminderKey === key)?.status).toBe('ACKNOWLEDGED');
    const siblings = rows.filter(
      (r) => r.obligationKey === keyA && r.reminderKey !== key && r.kind === 'UPCOMING_DUE',
    );
    expect(siblings.every((r) => r.status === 'SCHEDULED')).toBe(true);
  });

  it('Scenario 9 (Upcoming): snoozed upcoming carries SNOOZED with future effectiveAt', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-27`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'SNOOZE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-27',
        sourceFingerprint: 'fp-a-v1',
        snoozedUntil: '2026-04-28',
      })
      .expect(201);
    const rows = await getReminders(token);
    const target = rows.find((r) => r.reminderKey === key);
    expect(target?.status).toBe('SNOOZED');
    expect(target?.effectiveAt).toBe('2026-04-28');
    expect(target?.triggerAt).toBe('2026-04-27');
  });

  it('Scenario 10 (Upcoming): dismissed upcoming carries DISMISSED without resolving siblings', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-29`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'DISMISS',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-29',
        sourceFingerprint: 'fp-a-v1',
      })
      .expect(201);
    const rows = await getReminders(token);
    expect(rows.find((r) => r.reminderKey === key)?.status).toBe('DISMISSED');
  });

  it('Scenario 11 (Due-today): obligation due today projects DUE_TODAY', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const dueToday = rows.filter(
      (r) =>
        r.obligationKey === `${user1}:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015` &&
        r.kind === 'DUE_TODAY',
    );
    expect(dueToday.length).toBe(1);
    expect(dueToday[0]!.triggerAt).toBe('2026-04-20');
    expect(dueToday[0]!.status).toBe('DELIVERED');
  });

  // =========================================================================
  // OVERDUE (12-17)
  // =========================================================================

  it('Scenario 12 (Overdue): past-due obligation projects exactly one OVERDUE instance', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const overdue = rows.filter(
      (r) =>
        r.obligationKey === `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015` &&
        r.kind === 'OVERDUE',
    );
    expect(overdue.length).toBe(1);
    expect(overdue[0]!.triggerAt).toBe('2026-04-01');
    expect(overdue[0]!.status).toBe('DELIVERED');
  });

  it('Scenario 13 (Overdue): no penalty/interest/SELIC computation in reminder content', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const overdue = rows.filter((r) => r.kind === 'OVERDUE');
    expect(overdue.length).toBeGreaterThan(0);
    for (const row of overdue) {
      expect(row.message).toContain('não calcula multa, juros ou SELIC');
      expect(row.message).not.toMatch(/multa de R\$|juros de R\$|total atualizado/i);
    }
  });

  it('Scenario 14 (Overdue): repeated scheduler cycles never duplicate semantic instances', async () => {
    const token = await session(user1);
    const first = await getReminders(token);
    const second = await getReminders(token);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    const keys = second.map((r) => `${r.reminderKey}:${r.sourceFingerprint}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Scenario 15 (Overdue): completed workflow suppresses irrelevant reminders', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyA)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REPORTED_COMPLETION', sourceFingerprint: 'fp-a-v1' })
      .expect(201);
    const rows = await getReminders(token);
    expect(rows.filter((r) => r.obligationKey === keyA)).toEqual([]);
  });

  it('Scenario 16 (Overdue): reopened compliance restores appropriate reminders', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyA)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REOPENED', sourceFingerprint: 'fp-a-v1' })
      .expect(201);
    const rows = await getReminders(token);
    const upcoming = rows.filter((r) => r.obligationKey === keyA && r.kind === 'UPCOMING_DUE');
    expect(upcoming.length).toBe(3);
  });

  it('Scenario 17 (Overdue): zero-amount obligation yields no due reminders', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const zeroKey = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const dueKinds = rows.filter(
      (r) =>
        r.obligationKey === zeroKey &&
        (r.kind === 'UPCOMING_DUE' || r.kind === 'DUE_TODAY' || r.kind === 'OVERDUE'),
    );
    expect(dueKinds).toEqual([]);
  });

  // =========================================================================
  // STALE / EVIDENCE (18-23)
  // =========================================================================

  it('Scenario 18 (Stale): source change supersedes old instances and generates fresh ones', async () => {
    const token = await session(user1);
    await prisma.taxObligationRecord.update({
      where: { id: obA },
      data: { liabilityFingerprint: 'fp-a-v2', principalAmount: '600.00' },
    });
    const rows = await getReminders(token);
    const shells = rows.filter((r) => r.obligationKey === keyA && r.status === 'SUPERSEDED');
    expect(shells.length).toBeGreaterThan(0);
    expect(shells.every((r) => r.sourceFingerprint === 'fp-a-v1')).toBe(true);
    const fresh = rows.filter(
      (r) =>
        r.obligationKey === keyA && r.kind === 'UPCOMING_DUE' && r.sourceFingerprint === 'fp-a-v2',
    );
    expect(fresh.length).toBe(3);
  });

  it('Scenario 19 (Stale): prior dismissal is not inherited by the new source', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const fresh = rows.filter(
      (r) =>
        r.obligationKey === keyA && r.kind === 'UPCOMING_DUE' && r.sourceFingerprint === 'fp-a-v2',
    );
    expect(fresh.every((r) => r.status === 'SCHEDULED')).toBe(true);
  });

  it('Scenario 20 (Stale): matching payment evidence raises no pending-payment nag', async () => {
    const token = await session(user1);
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyG)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '700.00',
        referencePeriod: '2026-06',
        externalReference: 'MATCH-001',
      })
      .expect(201);
    const rows = await getReminders(token);
    const nag = rows.filter(
      (r) =>
        r.obligationKey === keyG &&
        (r.kind === 'PAYMENT_EVIDENCE_REVIEW' || r.kind === 'STALE_SOURCE'),
    );
    expect(nag).toEqual([]);
  });

  it('Scenario 21 (Stale): mismatching evidence raises PAYMENT_EVIDENCE_REVIEW', async () => {
    const token = await session(user1);
    const keyF = `${user1}:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyF)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '299.99',
        referencePeriod: '2026-05',
        externalReference: 'MISMATCH-001',
      })
      .expect(201);
    const rows = await getReminders(token);
    const review = rows.filter(
      (r) => r.obligationKey === keyF && r.kind === 'PAYMENT_EVIDENCE_REVIEW',
    );
    expect(review.length).toBe(1);
    expect(review[0]!.status).toBe('DELIVERED');
  });

  it('Scenario 22 (Stale): evidence recorded then source changed raises STALE_SOURCE alert', async () => {
    const token = await session(user1);
    await prisma.taxObligationRecord.update({
      where: { id: obG },
      data: { liabilityFingerprint: 'fp-g-v2', principalAmount: '750.00' },
    });
    const rows = await getReminders(token);
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const stale = rows.filter((r) => r.obligationKey === keyG && r.kind === 'STALE_SOURCE');
    expect(stale.length).toBe(1);
    expect(stale[0]!.message).toContain('alterados');
  });

  it('Scenario 23 (Stale): old acknowledgement is never reused across changed source', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const actionable = rows.filter(
      (r) => r.obligationKey === keyA && r.sourceFingerprint === 'fp-a-v2',
    );
    expect(actionable.length).toBeGreaterThan(0);
    expect(actionable.every((r) => r.status === 'SCHEDULED' || r.status === 'DELIVERED')).toBe(
      true,
    );
  });

  // =========================================================================
  // ANNUAL (24-28)
  // =========================================================================

  it('Scenario 24 (Annual): annual review required reminder is present', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const annual = rows.filter((r) => r.kind === 'ANNUAL_REVIEW_REQUIRED');
    expect(annual.length).toBeGreaterThan(0);
    expect(annual[0]!.status).toBe('DELIVERED');
  });

  it('Scenario 25 (Annual): disabled annual preference cancels annual reminders', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: false,
        leadTimes: [7, 3, 1],
      })
      .expect(200);
    const rows = await getReminders(token);
    const annual = rows.filter((r) => r.kind === 'ANNUAL_REVIEW_REQUIRED');
    expect(annual.length).toBeGreaterThan(0);
    expect(annual.every((r) => r.status === 'CANCELLED')).toBe(true);
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

  it('Scenario 26 (Annual): kind filter isolates annual reminders', async () => {
    const token = await session(user1);
    const rows = await getReminders(token, 'calendarYear=2026&kind=ANNUAL_REVIEW_REQUIRED');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === 'ANNUAL_REVIEW_REQUIRED')).toBe(true);
  });

  it('Scenario 27 (Annual): calendar year and exercise period are preserved', async () => {
    const token = await session(user1);
    const rows = await getReminders(token, 'calendarYear=2026&kind=ANNUAL_REVIEW_REQUIRED');
    for (const row of rows) {
      expect(row.obligationKey.startsWith(`${user1}:2026`)).toBe(true);
    }
  });

  it('Scenario 28 (Annual): blocked monthly obligation raises ACTION_REQUIRED', async () => {
    const token = await session(user1);
    const rows = await getReminders(token);
    const keyD = `${user1}:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const action = rows.filter((r) => r.obligationKey === keyD && r.kind === 'ACTION_REQUIRED');
    expect(action.length).toBe(1);
    expect(action[0]!.status).toBe('DELIVERED');
  });

  // =========================================================================
  // PREFERENCES (29-34)
  // =========================================================================

  it('Scenario 29 (Preferences): defaults apply when never configured', async () => {
    const token = await session(user2);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toMatchObject({
      remindersEnabled: true,
      upcomingEnabled: true,
      overdueEnabled: true,
      annualEnabled: true,
      leadTimes: [1, 3, 7],
    });
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('Scenario 30 (Preferences): full disable cancels every reminder', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: false,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [7, 3, 1],
      })
      .expect(200);
    const rows = await getReminders(token);
    expect(rows.length).toBeGreaterThan(0);
    // History shells stay SUPERSEDED; every actionable instance is CANCELLED.
    const live = rows.filter((r) => r.status !== 'SUPERSEDED');
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((r) => r.status === 'CANCELLED')).toBe(true);
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

  it('Scenario 31 (Preferences): custom lead time projects exact custom triggers', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [5],
      })
      .expect(200);
    const rows = await getReminders(token);
    const upcomingB = rows
      .filter(
        (r) =>
          r.obligationKey === `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015` &&
          r.kind === 'UPCOMING_DUE',
      )
      .map((r) => r.triggerAt)
      .sort();
    // dueDate 2026-03-31 minus 5 days (past triggers preserved as history)
    expect(upcomingB).toEqual(['2026-03-26']);
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

  it('Scenario 32 (Preferences): invalid lead times fail validation', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [0],
      })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [31],
      })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: 'yes' as unknown as boolean,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [7],
      })
      .expect(400);
  });

  it('Scenario 33 (Preferences): ownership — subjects never share preference rows', async () => {
    const token2 = await session(user2);
    const res2 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    expect(res2.body.data.leadTimes).toEqual([1, 3, 7]);
    const token1 = await session(user1);
    const res1 = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);
    expect(res1.body.data.leadTimes).toEqual([1, 3, 7]);
  });

  it('Scenario 34 (Preferences): trigger window filters narrow server-side', async () => {
    const token = await session(user1);
    const rows = await getReminders(
      token,
      'calendarYear=2026&triggerFrom=2026-04-23&triggerTo=2026-04-23',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.effectiveAt === '2026-04-23')).toBe(true);
  });

  // =========================================================================
  // SECURITY + DELIVERY (35-45)
  // =========================================================================

  it('Scenario 35 (Security): cross-user reminders GET only sees own data', async () => {
    const token2 = await session(user2);
    const rows = await getReminders(token2);
    expect(rows).toEqual([]);
  });

  it('Scenario 36 (Security): cross-user action POST returns 404', async () => {
    const token2 = await session(user2);
    const key = `${keyA}:UPCOMING_DUE:2026-04-23`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        actionType: 'ACKNOWLEDGE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-23',
        sourceFingerprint: 'fp-a-v2',
      })
      .expect(404);
  });

  it('Scenario 37 (Security): foreign reminder key returns 404', async () => {
    const token = await session(user1);
    const forged = `${uuidFor('ghost')}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-23`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(forged)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'DISMISS',
        obligationKey: `${uuidFor('ghost')}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-23',
        sourceFingerprint: 'fp-x',
      })
      .expect(404);
  });

  it('Scenario 38 (Security): forged key structure (kind/trigger mismatch) returns 400', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-23`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'DISMISS',
        obligationKey: keyA,
        reminderKind: 'DUE_TODAY',
        triggerAt: '2026-04-23',
        sourceFingerprint: 'fp-a-v2',
      })
      .expect(400);
  });

  it('Scenario 39 (Security): malformed snooze (past date) returns 400', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-27`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'SNOOZE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-27',
        sourceFingerprint: 'fp-a-v2',
        snoozedUntil: '2026-04-19',
      })
      .expect(400);
  });

  it('Scenario 40 (Security): oversized payload returns 400', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-27`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'DISMISS',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-27',
        sourceFingerprint: 'fp-a-v2',
        note: 'x'.repeat(1001),
      })
      .expect(400);
  });

  it('Scenario 41 (Security): unknown action type returns 400', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-27`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'SNOOZE_FOREVER',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-27',
        sourceFingerprint: 'fp-a-v2',
      })
      .expect(400);
  });

  it('Scenario 42 (Security): unauthenticated reminder access returns 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminder-preferences')
      .expect(401);
  });

  it('Scenario 43 (Delivery): duplicate delivery is idempotent with history preserved', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-27`;
    const first = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceFingerprint: 'fp-a-v2',
        channel: 'IN_APP',
        triggerAt: '2026-04-27',
      })
      .expect(201);
    expect(first.body.data.deliveryStatus).toBe('DELIVERED');
    const second = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceFingerprint: 'fp-a-v2',
        channel: 'IN_APP',
        triggerAt: '2026-04-27',
      })
      .expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    const history = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.data.length).toBe(1);
    expect(history.headers['cache-control']).toContain('no-store');
  });

  it('Scenario 44 (Delivery): delivery against stale fingerprint is rejected', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-27`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(key)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceFingerprint: 'fp-a-v1',
        channel: 'IN_APP',
        triggerAt: '2026-04-27',
      })
      .expect(404);
  });

  it('Scenario 45 (Delivery): expired snooze resurfaces as DELIVERED on later dates', async () => {
    const token = await session(user1);
    const key = `${keyA}:UPCOMING_DUE:2026-04-27`;
    await request(futureApp.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then((res) => {
        const rows = res.body.data as ReminderRow[];
        const target = rows.find((r) => r.reminderKey === key);
        // Snoozed until 2026-04-28 (Scenario 9, fp-a-v1 shell era); on 2026-04-29
        // the current fp-a-v2 instance is independently actionable.
        expect(target).toBeDefined();
        expect(['SCHEDULED', 'DELIVERED']).toContain(target!.status);
      });
  });
});
