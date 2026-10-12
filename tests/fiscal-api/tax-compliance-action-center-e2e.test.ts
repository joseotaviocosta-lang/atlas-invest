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
        name: 'Action Center User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

type ActionItem = {
  actionKey: string;
  obligationKey: string;
  sourceFingerprint: string;
  kind: string;
  period: string;
  calendarYear: number;
  exercise: number | null;
  dueDate: string | null;
  priority: string;
  operationalStatus: string;
  title: string;
  summary: string;
  nextAction: string;
  actionTarget: string;
  amount: string | null;
  currency: string | null;
  revenueCode: string | null;
  paymentSupportStatus: string | null;
  paymentEvidenceStatus: string | null;
  reminderStatus: string | null;
  annualReviewStatus: string | null;
  isStale: boolean;
  isSuperseded: boolean;
  blockingReasons: string[];
  sourceVersion: string;
};

type CalendarEvent = {
  eventKey: string;
  obligationKey: string | null;
  actionKey: string | null;
  sourceFingerprint: string;
  eventType: string;
  eventDate: string;
  title: string;
  status: string;
  severity: string;
  actionTarget: string;
};

describe('Phase 4K.4 — Tax Compliance Action Center & Calendar 60-Scenario E2E Matrix', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-action-center');
  const user2 = uuidFor('user2-action-center');

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

  async function getCenter(
    token: string,
    qs = 'calendarYear=2026',
  ): Promise<{
    items: ActionItem[];
    meta: {
      summary: Record<string, number>;
      centerFingerprint: string;
      totalCount: number;
      limit: number;
      offset: number;
    };
  }> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/action-center?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { items: res.body.data as ActionItem[], meta: res.body.meta };
  }

  async function getCalendar(token: string, qs: string): Promise<CalendarEvent[]> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/calendar?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data as CalendarEvent[];
  }

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    await session(user1);
    await session(user2);

    await seedObligation({
      id: uuidFor('ac-ob-a'),
      userId: user1,
      competence: '2026-03',
      amount: '500.00',
      dueDate: '2026-04-30',
      fingerprint: 'fp-ac-a-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-b'),
      userId: user1,
      competence: '2026-02',
      amount: '450.00',
      dueDate: '2026-03-31',
      fingerprint: 'fp-ac-b-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-c'),
      userId: user1,
      competence: '2026-01',
      amount: null,
      dueDate: '2026-02-28',
      fingerprint: 'fp-ac-c-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-d'),
      userId: user1,
      competence: '2026-04',
      amount: null,
      dueDate: '2026-05-31',
      status: 'BLOCKED',
      fingerprint: 'fp-ac-d-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-f'),
      userId: user1,
      competence: '2026-05',
      amount: '300.00',
      dueDate: '2026-04-20',
      fingerprint: 'fp-ac-f-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-g'),
      userId: user1,
      competence: '2026-06',
      amount: '700.00',
      dueDate: '2026-05-31',
      fingerprint: 'fp-ac-g-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-h'),
      userId: user1,
      competence: '2026-07',
      amount: '800.00',
      dueDate: '2026-06-30',
      fingerprint: 'fp-ac-h-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-i'),
      userId: user1,
      competence: '2026-08',
      amount: '900.00',
      dueDate: '2026-07-31',
      fingerprint: 'fp-ac-i-v1',
    });
    await seedObligation({
      id: uuidFor('ac-ob-k'),
      userId: user1,
      competence: '2026-09',
      amount: '100.00',
      dueDate: '2026-04-30',
      fingerprint: 'fp-ac-k-v1',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // BASIC ACTION CENTER (1-10)
  // =========================================================================

  it('Scenario 1 (Basic): subject without fiscal activity yields empty center with zeroed counters', async () => {
    const token = await session(user2);
    const { items, meta } = await getCenter(token, 'calendarYear=2026');
    expect(items).toEqual([]);
    expect(meta.totalCount).toBe(0);
    expect(meta.summary).toMatchObject({
      needsAttention: 0,
      overdue: 0,
      dueToday: 0,
      upcoming: 0,
      requiresReview: 0,
      completed: 0,
      total: 0,
    });
    expect(typeof meta.centerFingerprint).toBe('string');
  });

  it('Scenario 2 (Basic): one upcoming obligation projects PAY_TAX/UPCOMING/MEDIUM', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const upcoming = items.filter(
      (item) =>
        item.obligationKey === `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015` &&
        item.kind === 'PAY_TAX',
    );
    expect(upcoming.length).toBe(1);
    expect(upcoming[0]!.operationalStatus).toBe('UPCOMING');
    expect(upcoming[0]!.priority).toBe('MEDIUM');
    expect(upcoming[0]!.nextAction).toBe('REVIEW_OBLIGATION');
    expect(upcoming[0]!.dueDate).toBe('2026-04-30');
    expect(upcoming[0]!.amount).toBe('500');
    expect(upcoming[0]!.sourceVersion).toBe('4K.4');
  });

  it('Scenario 3 (Basic): due-today obligation projects DUE_TODAY/HIGH', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const dueToday = items.filter(
      (item) =>
        item.obligationKey === `${user1}:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015` &&
        item.kind === 'PAY_TAX',
    );
    expect(dueToday.length).toBe(1);
    expect(dueToday[0]!.operationalStatus).toBe('DUE_TODAY');
    expect(dueToday[0]!.priority).toBe('HIGH');
    expect(dueToday[0]!.nextAction).toBe('PREPARE_PAYMENT');
  });

  it('Scenario 4 (Basic): overdue obligation projects OVERDUE/CRITICAL first', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const overdue = items.filter(
      (item) =>
        item.obligationKey === `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015` &&
        item.kind === 'PAY_TAX',
    );
    expect(overdue.length).toBe(1);
    expect(overdue[0]!.operationalStatus).toBe('OVERDUE');
    expect(overdue[0]!.priority).toBe('CRITICAL');
    expect(items[0]!.priority).toBe('CRITICAL');
  });

  it('Scenario 5 (Basic): completed workflow projects COMPLETED, reopen restores actionability', async () => {
    const token = await session(user1);
    const keyB = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyB)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REPORTED_COMPLETION', sourceFingerprint: 'fp-ac-b-v1' })
      .expect(201);
    const completed = await getCenter(token);
    const doneItem = completed.items.filter((item) => item.obligationKey === keyB);
    expect(doneItem.length).toBe(1);
    expect(doneItem[0]!.operationalStatus).toBe('COMPLETED');
    expect(doneItem[0]!.kind).toBe('COMPLETE_COMPLIANCE_ACTION');
    expect(doneItem[0]!.nextAction).toBe('VIEW_DETAILS');
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyB)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REOPENED', sourceFingerprint: 'fp-ac-b-v1' })
      .expect(201);
    const reopened = await getCenter(token);
    const actionable = reopened.items.filter(
      (item) => item.obligationKey === keyB && item.kind === 'PAY_TAX',
    );
    expect(actionable.length).toBe(1);
    expect(actionable[0]!.operationalStatus).toBe('OVERDUE');
  });

  it('Scenario 6 (Basic): action-required obligation projects RESOLVE_BLOCKER/CRITICAL', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const blocker = items.filter(
      (item) =>
        item.obligationKey === `${user1}:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015` &&
        item.kind === 'RESOLVE_BLOCKER',
    );
    expect(blocker.length).toBe(1);
    expect(blocker[0]!.operationalStatus).toBe('ACTION_REQUIRED');
    expect(blocker[0]!.priority).toBe('CRITICAL');
    expect(blocker[0]!.blockingReasons.length).toBeGreaterThan(0);
  });

  it('Scenario 7 (Basic): zero-amount obligation projects INFORMATIONAL, never payable', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const info = items.filter(
      (item) => item.obligationKey === `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`,
    );
    expect(info.length).toBe(1);
    expect(info[0]!.kind).toBe('INFORMATIONAL');
    expect(info[0]!.operationalStatus).toBe('INFORMATIONAL');
    expect(info[0]!.priority).toBe('LOW');
  });

  it('Scenario 8 (Basic): multiple priorities sort CRITICAL first', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const weights: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    for (let i = 1; i < items.length; i++) {
      expect(weights[items[i]!.priority]!).toBeLessThanOrEqual(weights[items[i - 1]!.priority]!);
    }
  });

  it('Scenario 9 (Basic): deterministic sorting across repeated reads', async () => {
    const token = await session(user1);
    const first = await getCenter(token);
    const second = await getCenter(token);
    expect(JSON.stringify(second.items)).toBe(JSON.stringify(first.items));
    expect(second.meta.centerFingerprint).toBe(first.meta.centerFingerprint);
    const keys = first.items.map((item) => item.actionKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Scenario 10 (Basic): summary counters reconcile to classification', async () => {
    const token = await session(user1);
    const { items, meta } = await getCenter(token);
    const current = items.filter((item) => item.operationalStatus !== 'SUPERSEDED');
    expect(meta.summary.total).toBe(current.length);
    expect(meta.summary.overdue).toBe(
      current.filter((item) => item.operationalStatus === 'OVERDUE').length,
    );
    expect(meta.summary.dueToday).toBe(
      current.filter((item) => item.operationalStatus === 'DUE_TODAY').length,
    );
    expect(meta.summary.upcoming).toBe(
      current.filter((item) => item.operationalStatus === 'UPCOMING').length,
    );
    expect(meta.summary.completed).toBe(
      current.filter((item) => item.operationalStatus === 'COMPLETED').length,
    );
    expect(meta.summary.needsAttention).toBeGreaterThan(0);
  });

  it('Scenario pagination: limit/offset bound the page without changing totals', async () => {
    const token = await session(user1);
    const full = await getCenter(token);
    const page = await getCenter(token, 'calendarYear=2026&limit=2&offset=1');
    expect(page.items.length).toBe(2);
    expect(page.meta.totalCount).toBe(full.meta.totalCount);
    expect(page.meta.limit).toBe(2);
    expect(page.meta.offset).toBe(1);
    expect(page.items[0]!.actionKey).toBe(full.items[1]!.actionKey);
  });

  // =========================================================================
  // PAYMENT EVIDENCE (11-20)
  // =========================================================================

  it('Scenario 11 (Evidence): payment support READY integrates with the center', async () => {
    const token = await session(user1);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const support = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(keyA)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(support.body.data.supportStatus).toBe('READY');
    expect(support.body.data.reconciliationStatus).toBe('NO_EVIDENCE');
    const { items } = await getCenter(token);
    const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
    expect(payItem?.paymentSupportStatus).toBe('READY');
    expect(payItem?.paymentEvidenceStatus).toBe('NO_EVIDENCE');
  });

  it('Scenario 12 (Evidence): exact evidence match projects MATCH informational item', async () => {
    const token = await session(user1);
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyG)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '700.00',
        referencePeriod: '2026-06',
        externalReference: 'AC-MATCH-001',
      })
      .expect(201);
    const { items } = await getCenter(token);
    const match = items.filter(
      (item) => item.obligationKey === keyG && item.kind === 'INFORMATIONAL',
    );
    expect(match.length).toBe(1);
    expect(match[0]!.paymentEvidenceStatus).toBe('USER_REPORTED_MATCH');
    expect(
      items.some((item) => item.obligationKey === keyG && item.kind === 'REVIEW_PAYMENT_EVIDENCE'),
    ).toBe(false);
  });

  it('Scenario 18 (Evidence): USER_REPORTED wording on matched evidence', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const match = items.find(
      (item) => item.obligationKey === keyG && item.kind === 'INFORMATIONAL',
    );
    expect(match).toBeDefined();
    expect(match!.summary).toContain('sem verificação governamental');
  });

  it('Scenario 19 (Evidence): matched evidence is never government verified', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    for (const item of items) {
      expect(item.summary).not.toMatch(/RECEITA.*confir|governo.*verific|quitado oficialmente/i);
      expect(item.nextAction).not.toBe('CONFIRM_INFORMATION' as string);
    }
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const match = items.find(
      (item) => item.obligationKey === keyG && item.kind === 'INFORMATIONAL',
    );
    expect(match!.paymentEvidenceStatus).toBe('USER_REPORTED_MATCH');
  });

  it('Scenario 13 (Evidence): amount mismatch projects REVIEW_PAYMENT_EVIDENCE', async () => {
    const token = await session(user1);
    const keyH = `${user1}:2026-07:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyH)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '750.00',
        referencePeriod: '2026-07',
        externalReference: 'AC-MISMATCH-001',
      })
      .expect(201);
    const { items } = await getCenter(token);
    const review = items.filter(
      (item) => item.obligationKey === keyH && item.kind === 'REVIEW_PAYMENT_EVIDENCE',
    );
    expect(review.length).toBe(1);
    expect(review[0]!.operationalStatus).toBe('REQUIRES_REVIEW');
    expect(review[0]!.priority).toBe('HIGH');
    expect(review[0]!.nextAction).toBe('ADD_PAYMENT_EVIDENCE');
    expect(review[0]!.paymentEvidenceStatus).toBe('USER_REPORTED_MISMATCH');
  });

  it('Scenario 14 (Evidence): revenue-code mismatch projects review', async () => {
    const token = await session(user1);
    const keyI = `${user1}:2026-08:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyI)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '900.00',
        revenueCodeReported: '0600',
        referencePeriod: '2026-08',
        externalReference: 'AC-CODE-001',
      })
      .expect(201);
    const { items } = await getCenter(token);
    const review = items.filter(
      (item) => item.obligationKey === keyI && item.kind === 'REVIEW_PAYMENT_EVIDENCE',
    );
    expect(review.length).toBe(1);
    expect(review[0]!.paymentEvidenceStatus).toBe('USER_REPORTED_MISMATCH');
  });

  it('Scenario 15 (Evidence): period mismatch on latest revision still projects review', async () => {
    const token = await session(user1);
    const keyH = `${user1}:2026-07:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyH)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '800.00',
        referencePeriod: '2026-06',
        externalReference: 'AC-PERIOD-001',
      })
      .expect(201);
    const { items } = await getCenter(token);
    const review = items.filter(
      (item) => item.obligationKey === keyH && item.kind === 'REVIEW_PAYMENT_EVIDENCE',
    );
    expect(review.length).toBe(1);
  });

  it('Scenario 17 (Evidence): obligation without evidence reports NO_EVIDENCE', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
    expect(payItem?.paymentEvidenceStatus).toBe('NO_EVIDENCE');
  });

  it('Scenario 16 (Evidence): source change after evidence projects stale actionable item', async () => {
    const token = await session(user1);
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await prisma.taxObligationRecord.updateMany({
      where: { taxSubjectId: user1, competence: '2026-06' },
      data: { liabilityFingerprint: 'fp-ac-g-v2', principalAmount: '750.00' },
    });
    const { items } = await getCenter(token);
    const stale = items.filter(
      (item) => item.obligationKey === keyG && item.kind === 'REVIEW_CHANGED_OBLIGATION',
    );
    expect(stale.length).toBe(1);
    expect(stale[0]!.operationalStatus).toBe('REQUIRES_REVIEW');
    expect(stale[0]!.isStale).toBe(true);
    expect(stale[0]!.nextAction).toBe('REVIEW_STALE_EVIDENCE');
    expect(items.some((item) => item.obligationKey === keyG && item.kind === 'INFORMATIONAL')).toBe(
      false,
    );
  });

  it('Scenario 20 (Evidence): stale evidence item is actionable, not informational', async () => {
    const token = await session(user1);
    const { items, meta } = await getCenter(token);
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const stale = items.filter(
      (item) => item.obligationKey === keyG && item.kind === 'REVIEW_CHANGED_OBLIGATION',
    );
    expect(stale.length).toBe(1);
    expect(meta.summary.requiresReview).toBeGreaterThanOrEqual(1);
    expect(meta.summary.needsAttention).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // REMINDERS (21-30)
  // =========================================================================

  it('Scenario 21 (Reminders): scheduled reminder attaches without resolving', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const keyK = `${user1}:2026-09:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const payItem = items.find((item) => item.obligationKey === keyK && item.kind === 'PAY_TAX');
    expect(payItem?.reminderStatus).toBe('SCHEDULED');
    expect(payItem?.operationalStatus).toBe('UPCOMING');
  });

  it('Scenario 22 (Reminders): acknowledged reminder keeps obligation actionable', async () => {
    const token = await session(user1);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(`${keyA}:UPCOMING_DUE:2026-04-23`)}/actions`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'ACKNOWLEDGE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-23',
        sourceFingerprint: 'fp-ac-a-v1',
      })
      .expect(201);
    const { items } = await getCenter(token);
    const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
    expect(payItem?.operationalStatus).toBe('UPCOMING');
    expect(payItem?.reminderStatus).toBe('ACKNOWLEDGED');
  });

  it('Scenario 23 (Reminders): snoozed reminder preserves due date', async () => {
    const token = await session(user1);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(`${keyA}:UPCOMING_DUE:2026-04-27`)}/actions`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'SNOOZE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-27',
        sourceFingerprint: 'fp-ac-a-v1',
        snoozedUntil: '2026-04-28',
      })
      .expect(201);
    // The snoozed instance itself is SNOOZED (verified via reminders API)…
    const remRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = remRes.body.data as Array<{
      obligationKey: string;
      kind: string;
      triggerAt: string;
      status: string;
    }>;
    const snoozed = rows.find(
      (row) => row.obligationKey === keyA && row.triggerAt === '2026-04-27',
    );
    expect(snoozed?.status).toBe('SNOOZED');
    // …while the payable item keeps the authoritative due date and stays actionable.
    const { items } = await getCenter(token);
    const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
    expect(payItem?.dueDate).toBe('2026-04-30');
    expect(payItem?.operationalStatus).toBe('UPCOMING');
  });

  it('Scenario 24 (Reminders): dismissed reminder keeps obligation actionable', async () => {
    const token = await session(user1);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(`${keyA}:UPCOMING_DUE:2026-04-29`)}/actions`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'DISMISS',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-29',
        sourceFingerprint: 'fp-ac-a-v1',
      })
      .expect(201);
    // The dismissed instance itself is DISMISSED (verified via reminders API)…
    const remRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = remRes.body.data as Array<{
      obligationKey: string;
      kind: string;
      triggerAt: string;
      status: string;
    }>;
    const dismissed = rows.find(
      (row) => row.obligationKey === keyA && row.triggerAt === '2026-04-29',
    );
    expect(dismissed?.status).toBe('DISMISSED');
    // …while the payable item stays actionable (reminder state never resolves).
    const { items } = await getCenter(token);
    const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
    expect(payItem?.operationalStatus).toBe('UPCOMING');
  });

  it('Scenario 25 (Reminders): overdue reminder surfaces as delivered', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data as Array<{
      obligationKey: string;
      kind: string;
      status: string;
    }>;
    const overdue = rows.filter(
      (row) =>
        row.obligationKey === `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015` &&
        row.kind === 'OVERDUE',
    );
    expect(overdue.length).toBe(1);
    expect(overdue[0]!.status).toBe('DELIVERED');
  });

  it('Scenario 26 (Reminders): source change mints fresh reminder lineage', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data as Array<{
      obligationKey: string;
      kind: string;
      sourceFingerprint: string;
      status: string;
    }>;
    const keyG = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const fresh = rows.filter(
      (row) =>
        row.obligationKey === keyG &&
        row.kind === 'UPCOMING_DUE' &&
        row.sourceFingerprint === 'fp-ac-g-v2',
    );
    expect(fresh.length).toBe(3);
    expect(fresh.every((row) => row.status === 'SCHEDULED')).toBe(true);
  });

  it('Scenario 27 (Reminders): dismissal does not resolve the obligation', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
    // Payable item stays actionable no matter which reminder instance was dismissed.
    expect(payItem?.operationalStatus).toBe('UPCOMING');
    expect(payItem?.kind).toBe('PAY_TAX');
  });

  it('Scenario 28 (Reminders): acknowledgement does not resolve the obligation', async () => {
    const token = await session(user1);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    // Acknowledge another instance; the payable item must stay actionable.
    await request(app.getHttpServer())
      .post(
        `/api/v1/fiscal/compliance/reminders/${encodeURIComponent(`${keyA}:UPCOMING_DUE:2026-04-23`)}/actions`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'ACKNOWLEDGE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-23',
        sourceFingerprint: 'fp-ac-a-v1',
      })
      .expect(201);
    const after = await getCenter(token);
    const payItem = after.items.find(
      (item) => item.obligationKey === keyA && item.kind === 'PAY_TAX',
    );
    expect(payItem?.operationalStatus).toBe('UPCOMING');
  });

  it('Scenario 29 (Reminders): snooze does not alter the legal due date', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    for (const item of items.filter((item) => item.obligationKey === keyA)) {
      expect(item.dueDate).toBe('2026-04-30');
    }
  });

  it('Scenario 30 (Reminders): reminder state reflected exactly once per item', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    for (const item of items) {
      expect(item.reminderStatus === null || typeof item.reminderStatus === 'string').toBe(true);
    }
    const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const payItem = items.find((item) => item.obligationKey === keyA && item.kind === 'PAY_TAX');
    // Latest action on the 04-23 instance was ACKNOWLEDGE (Scenario 28).
    expect(payItem?.reminderStatus).toBe('ACKNOWLEDGED');
  });

  // =========================================================================
  // ANNUAL (31-40)
  // =========================================================================

  it('Scenario 31 (Annual): annual review item is present with HIGH priority', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const annual = items.filter((item) => item.exercise !== null);
    expect(annual.length).toBeGreaterThan(0);
    const review = annual.filter((item) => item.kind === 'REVIEW_ANNUAL_FILING');
    expect(review.length).toBe(1);
    expect(review[0]!.priority).toBe('HIGH');
    expect(review[0]!.nextAction).toBe('OPEN_ANNUAL_REVIEW');
  });

  it('Scenario 32 (Annual): completing annual review distinguishes annual completion', async () => {
    const token = await session(user1);
    const before = await getCenter(token);
    const review = before.items.find((item) => item.kind === 'REVIEW_ANNUAL_FILING');
    expect(review).toBeDefined();
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(review!.obligationKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: review!.sourceFingerprint,
      })
      .expect(201);
    const after = await getCenter(token);
    const done = after.items.filter(
      (item) =>
        item.obligationKey === review!.obligationKey && item.operationalStatus === 'COMPLETED',
    );
    expect(done.length).toBe(1);
    expect(done[0]!.kind).toBe('COMPLETE_COMPLIANCE_ACTION');
    expect(done[0]!.exercise).toBe(2027);
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(review!.obligationKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REOPENED',
        sourceFingerprint: review!.sourceFingerprint,
      })
      .expect(201);
  });

  it('Scenario 33 (Annual): upstream blocker stays visible alongside annual review', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const blocker = items.filter((item) => item.kind === 'RESOLVE_BLOCKER');
    expect(blocker.length).toBe(1);
    expect(blocker[0]!.priority).toBe('CRITICAL');
    expect(items.some((item) => item.kind === 'REVIEW_ANNUAL_FILING')).toBe(true);
  });

  it('Scenario 34 (Annual): calendar year preserved on annual items', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const annual = items.filter((item) => item.exercise !== null);
    expect(annual.length).toBeGreaterThan(0);
    for (const item of annual) {
      expect(item.calendarYear).toBe(2026);
      expect(item.period).toBe('2026');
    }
  });

  it('Scenario 35 (Annual): exercise preserved distinctly from calendar year', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const annual = items.filter((item) => item.exercise !== null);
    for (const item of annual) {
      expect(item.exercise).toBe(2027);
      expect(item.exercise).not.toBe(item.calendarYear);
    }
  });

  it('Scenario 36 (Annual): annual action target navigates to the annual workspace', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    const review = items.find((item) => item.kind === 'REVIEW_ANNUAL_FILING');
    expect(review?.actionTarget).toBe('/tax');
  });

  it('Scenario 37 (Annual): subject without annual activity has no annual items', async () => {
    const token = await session(user2);
    const { items } = await getCenter(token, 'calendarYear=2026');
    expect(items.filter((item) => item.exercise !== null)).toEqual([]);
  });

  it('Scenario 38 (Annual): high-income absence creates no false action', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    for (const item of items) {
      const refs = (item as unknown as { sourceReferences: Array<{ label: string; ref: string }> })
        .sourceReferences;
      expect(refs[1]!.ref).not.toBe('4I');
    }
  });

  it('Scenario 39 (Annual): high-income review semantics stay engine-side', async () => {
    const token = await session(user1);
    const { items } = await getCenter(token);
    // No fabricated high-income action exists; review requirements surface only
    // through authoritative annual obligations.
    const fabricated = items.filter(
      (item) => item.summary.includes('alta renda') && item.exercise === null,
    );
    expect(fabricated).toEqual([]);
  });

  it('Scenario 40 (Annual): partial upstream data stays surfaced', async () => {
    const token = await session(user1);
    const { items, meta } = await getCenter(token);
    expect(items.some((item) => item.kind === 'RESOLVE_BLOCKER')).toBe(true);
    expect(items.some((item) => item.kind === 'REVIEW_ANNUAL_FILING')).toBe(true);
    expect(meta.summary.needsAttention).toBeGreaterThan(0);
  });

  // =========================================================================
  // CALENDAR (41-50)
  // =========================================================================

  it('Scenario 41 (Calendar): month projection covers dues and reminders', async () => {
    const token = await session(user1);
    const events = await getCalendar(token, 'from=2026-04-01&to=2026-04-30');
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((event) => event.eventType === 'OBLIGATION_DUE')).toBe(true);
    expect(events.some((event) => event.eventType === 'REMINDER')).toBe(true);
    for (const event of events) {
      expect(event.eventDate >= '2026-04-01' && event.eventDate <= '2026-04-30').toBe(true);
    }
  });

  it('Scenario 42 (Calendar): agenda projection for a single day', async () => {
    const token = await session(user1);
    const events = await getCalendar(token, 'from=2026-04-30&to=2026-04-30');
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.eventDate === '2026-04-30')).toBe(true);
  });

  it('Scenario 43 (Calendar): same-date multiple items share the date cell', async () => {
    const token = await session(user1);
    const events = await getCalendar(token, 'from=2026-04-30&to=2026-04-30');
    const dueEvents = events.filter((event) => event.eventType === 'OBLIGATION_DUE');
    expect(dueEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('Scenario 44 (Calendar): event-type filters narrow server-side', async () => {
    const token = await session(user1);
    const dueOnly = await getCalendar(
      token,
      'from=2026-04-01&to=2026-04-30&eventType=OBLIGATION_DUE',
    );
    expect(dueOnly.length).toBeGreaterThan(0);
    expect(dueOnly.every((event) => event.eventType === 'OBLIGATION_DUE')).toBe(true);
    const remindersOnly = await getCalendar(
      token,
      'from=2026-04-01&to=2026-04-30&eventType=REMINDER',
    );
    expect(remindersOnly.every((event) => event.eventType === 'REMINDER')).toBe(true);
    const attention = await getCalendar(token, 'from=2026-04-01&to=2026-04-30&status=ATTENTION');
    expect(attention.length).toBeGreaterThan(0);
    expect(
      attention.every((event) =>
        ['OVERDUE', 'DUE_TODAY', 'ACTION_REQUIRED', 'REQUIRES_REVIEW', 'WAITING_USER'].includes(
          event.status,
        ),
      ),
    ).toBe(true);
  });

  it('Scenario 45 (Calendar): oversized ranges and inverted ranges fail closed', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/calendar?from=2020-01-01&to=2030-12-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/calendar?from=2026-05-01&to=2026-04-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/calendar?from=2026-13-01&to=2026-04-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 46 (Calendar): no duplicate semantic events', async () => {
    const token = await session(user1);
    const events = await getCalendar(token, 'from=2026-04-01&to=2026-06-30');
    const keys = events.map((event) => event.eventKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Scenario 47 (Calendar): deterministic order across reads', async () => {
    const token = await session(user1);
    const first = await getCalendar(token, 'from=2026-04-01&to=2026-06-30');
    const second = await getCalendar(token, 'from=2026-04-01&to=2026-06-30');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    for (let i = 1; i < first.length; i++) {
      expect(first[i]!.eventDate >= first[i - 1]!.eventDate).toBe(true);
    }
  });

  it('Scenario 48 (Calendar): stale evidence review appears on the current date', async () => {
    const token = await session(user1);
    const events = await getCalendar(token, 'from=2026-04-20&to=2026-04-20');
    const reviews = events.filter((event) => event.eventType === 'PAYMENT_EVIDENCE_REVIEW');
    expect(reviews.length).toBeGreaterThanOrEqual(1);
    expect(reviews.every((event) => event.eventDate === '2026-04-20')).toBe(true);
  });

  it('Scenario 49 (Calendar): annual review item appears in the exercise window', async () => {
    const token = await session(user1);
    const events = await getCalendar(token, 'from=2027-04-01&to=2027-04-30');
    const annual = events.filter((event) => event.eventType === 'ANNUAL_REVIEW');
    expect(annual.length).toBe(1);
    expect(annual[0]!.eventDate).toBe('2027-04-30');
  });

  it('Scenario 50 (Calendar): completed items remain visible as history', async () => {
    const token = await session(user1);
    const keyB = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyB)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REPORTED_COMPLETION', sourceFingerprint: 'fp-ac-b-v1' })
      .expect(201);
    const events = await getCalendar(token, 'from=2026-03-01&to=2026-03-31');
    const doneDue = events.filter(
      (event) => event.obligationKey === keyB && event.eventType === 'OBLIGATION_DUE',
    );
    expect(doneDue.length).toBe(1);
    expect(doneDue[0]!.status).toBe('COMPLETED');
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyB)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'USER_REOPENED', sourceFingerprint: 'fp-ac-b-v1' })
      .expect(201);
  });

  // =========================================================================
  // SECURITY (51-61)
  // =========================================================================

  it('Scenario 51 (Security): cross-user action center is isolated', async () => {
    const token2 = await session(user2);
    const { items, meta } = await getCenter(token2, 'calendarYear=2026');
    expect(items).toEqual([]);
    expect(meta.totalCount).toBe(0);
  });

  it('Scenario 52 (Security): cross-user calendar is isolated', async () => {
    const token2 = await session(user2);
    const events = await getCalendar(token2, 'from=2026-04-01&to=2026-04-30');
    expect(events).toEqual([]);
  });

  it('Scenario 53 (Security): forged subject data never leaks across users', async () => {
    const token2 = await session(user2);
    const { items } = await getCenter(token2, 'calendarYear=2026');
    expect(items.every((item) => !item.obligationKey.startsWith(`${user1}:`))).toBe(true);
  });

  it('Scenario 54 (Security): oversized calendar range is rejected', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/calendar?from=2024-01-01&to=2027-12-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 55 (Security): invalid year is rejected', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/action-center?calendarYear=1800')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 56 (Security): invalid status is rejected', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/action-center?calendarYear=2026&status=PAID')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 57 (Security): unknown priority is rejected', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/action-center?calendarYear=2026&priority=URGENT')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 58 (Security): malformed calendar date is rejected without stack traces', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/calendar?from=not-a-date&to=2026-04-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.stack).toBeUndefined();
    expect(res.body.trace).toBeUndefined();
  });

  it('Scenario 59 (Security): action-center and calendar responses are private/no-store', async () => {
    const token = await session(user1);
    const center = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/action-center?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(center.headers['cache-control']).toContain('no-store');
    const calendar = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/calendar?from=2026-04-01&to=2026-04-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(calendar.headers['cache-control']).toContain('no-store');
  });

  it('Scenario 60 (Security): unauthenticated access returns 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/action-center?calendarYear=2026')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/calendar?from=2026-04-01&to=2026-04-30')
      .expect(401);
  });

  it('Scenario 61 (Security): unknown action kind filter is rejected', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/action-center?calendarYear=2026&kind=PAY_TAXES')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
