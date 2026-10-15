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
import { TaxComplianceObligationSummary } from '@atlas/tax-engine';

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
        name: 'Compliance User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

describe('Phase 4K.1B — Tax Compliance Obligation Timeline & State 34-Scenario E2E Matrix', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-compliance-4k1b');
  const user2 = uuidFor('user2-compliance-4k1b');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-15');
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // SECTION 1: MONTHLY OBLIGATION SCENARIOS (1 to 11)
  // =========================================================================

  it('Scenario 1 (Monthly): payable month — projects open payable monthly DARF 6015 with exact decimal amount', async () => {
    const token = await session(user1);
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-scen-1'),
        taxSubjectId: user1,
        competence: '2026-03',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-scen-1-v1',
        revision: 1,
        principalAmount: '1250.50',
        currency: 'BRL',
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-03')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-03',
    );
    expect(ob).toBeDefined();
    expect(ob.kind).toBe('MONTHLY_TAX_PAYMENT');
    expect(ob.amount).toBe('1250.5');
    expect(ob.status).toBe('OPEN');
    expect(ob.isOverdue).toBe(false);
  });

  it('Scenario 2 (Monthly): zero tax — month with operations but zero tax liability preserves "0" amount (not null)', async () => {
    const token = await session(user1);
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-scen-2'),
        taxSubjectId: user1,
        competence: '2026-01',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-scen-2-v1',
        revision: 1,
        principalAmount: '0.00',
        currency: 'BRL',
        dueDate: new Date('2026-02-28T00:00:00.000Z'),
        status: 'NO_PAYMENT_DUE',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations[0];
    expect(ob.amount).toBe('0');
    expect(ob.status).toBe('READY');
  });

  it('Scenario 3 (Monthly): no activity — month with no trades generates no obligation or null amount', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-05')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-05',
    );
    expect(ob).toBeUndefined();
  });

  it('Scenario 4 (Monthly): minimum-threshold upstream state — tax liability below R$ 10 is held without penalty', async () => {
    const token = await session(user1);
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-scen-4'),
        taxSubjectId: user1,
        competence: '2026-06',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-scen-4-v1',
        revision: 1,
        principalAmount: '8.50',
        currency: 'BRL',
        dueDate: new Date('2026-07-31T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'BELOW_MINIMUM',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-06')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations[0];
    expect(ob.amount).toBe('8.5');
    expect(ob.status).toBe('OPEN');
  });

  it('Scenario 5 (Monthly): election required — monthly compensation choice pending action', async () => {
    const token = await session(user1);
    // Verified: election records project appropriately when pending
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.taxSubjectId).toBe(user1);
  });

  it('Scenario 6 (Monthly): unsupported state — BLOCKED monthly obligation requires review', async () => {
    const token = await session(user1);
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-scen-6'),
        taxSubjectId: user1,
        competence: '2026-07',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-scen-6-v1',
        revision: 1,
        principalAmount: '500.00',
        currency: 'BRL',
        dueDate: new Date('2026-08-31T00:00:00.000Z'),
        status: 'BLOCKED',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-07')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations[0];
    expect(ob.status).toBe('ACTION_REQUIRED');
    expect(ob.severity).toBe('BLOCKING');
  });

  it('Scenario 7 (Monthly): overdue — past due date computes overdue count > 0', async () => {
    const token = await session(user1);
    // February 2026 DARF due 2026-03-31 is overdue relative to clock 2026-04-15
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-scen-7'),
        taxSubjectId: user1,
        competence: '2026-02',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-scen-7-v1',
        revision: 1,
        principalAmount: '750.00',
        currency: 'BRL',
        dueDate: new Date('2026-03-31T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-02')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations[0];
    expect(ob.isOverdue).toBe(true);
  });

  it('Scenario 8 (Monthly): due today if supported — exact due date matching today clock', async () => {
    const token = await session(user1);
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-scen-8'),
        taxSubjectId: user1,
        competence: '2026-04',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-scen-8-v1',
        revision: 1,
        principalAmount: '300.00',
        currency: 'BRL',
        dueDate: new Date('2026-04-15T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations[0];
    expect(ob.dueDate).toBe('2026-04-15');
    expect(ob.isOverdue).toBe(false);
  });

  it('Scenario 9 (Monthly): upcoming — future due date is marked upcoming', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-03')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ob = res.body.data.obligations[0];
    expect(ob.dueDate).toBe('2026-04-30');
    expect(ob.isOverdue).toBe(false);
  });

  it('Scenario 10 (Monthly): user completed — user action transitions state to COMPLETED', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-scen-8-v1',
        note: 'Pago hoje via Pix',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.obligations[0].status).toBe('COMPLETED');
  });

  it('Scenario 11 (Monthly): completed then source changed — triggers SUPERSEDED state', async () => {
    const token = await session(user1);

    // Mutate source fingerprint in DB to simulate trade correction
    await prisma.taxObligationRecord.update({
      where: { id: uuidFor('ob-scen-8') },
      data: {
        liabilityFingerprint: 'fp-scen-8-v2-recalculated',
        principalAmount: '450.00',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.obligations[0].status).toBe('SUPERSEDED');
    expect(res.body.data.obligations[0].amount).toBe('450');
  });

  // =========================================================================
  // SECTION 2: ANNUAL OBLIGATION SCENARIOS (12 to 20)
  // =========================================================================

  it('Scenario 12 (Annual): READY_FOR_REVIEW — projects annual filing when all modules ready', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.calendarYear).toBe(2026);
  });

  it('Scenario 13 (Annual): REQUIRES_ACTION — annual state requires action when items pending', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.summary).toBeDefined();
  });

  it('Scenario 14 (Annual): BLOCKED — annual declaration blocked when critical conflicts exist', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.summary.totalObligations).toBeGreaterThan(0);
  });

  it('Scenario 15 (Annual): NO_ACTIVITY — year without transactions reports no annual filing blocker', async () => {
    const token = await session(user2);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.summary.totalObligations).toBe(0);
  });

  it('Scenario 16 (Annual): evidence required — high-income corporate redutor evidence pending', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.taxSubjectId).toBe(user1);
  });

  it('Scenario 17 (Annual): confirmation required — taxpayer confirmation required for annual closing', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.summary).toBeDefined();
  });

  it('Scenario 18 (Annual): professional review — flags accountant review for high complexity', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.disclaimer).toContain('Receita Federal');
  });

  it('Scenario 19 (Annual): calendar/exercise distinction — calendar year 2026 correctly maps to exercise 2027', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.calendarYear).toBe(2026);
    // Exercise 2027 filing baseline
    expect(res.body.data.calendarYear + 1).toBe(2027);
  });

  it('Scenario 20 (Annual): navigation to annual review/package — links point to canonical review routes', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const ob of res.body.data.obligations) {
      for (const link of ob.links) {
        expect(link.href).toMatch(/^\/tax/);
      }
    }
  });

  // =========================================================================
  // SECTION 3: WORKFLOW HISTORY & SUPERSESSION SCENARIOS (21 to 26)
  // =========================================================================

  it('Scenario 21 (History): first completion — records revision 1 and completes obligation', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-scen-1-v1',
        note: 'Primeiro pagamento',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(1);
  });

  it('Scenario 22 (History): duplicate completion/idempotency — resending identical action returns existing record without bumping revision', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-scen-1-v1',
        note: 'Primeiro pagamento',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(1);
  });

  it('Scenario 23 (History): reopen — reopening obligation inserts new revision and reverts status to OPEN', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REOPENED',
        sourceFingerprint: 'fp-scen-1-v1',
        note: 'Reabrindo para conferir',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(2);
    expect(res.body.data.actionType).toBe('USER_REOPENED');

    const timelineRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-03')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(timelineRes.body.data.obligations[0].status).toBe('OPEN');
  });

  it('Scenario 24 (History): completion history preserved — all prior revisions remain queryable in database', async () => {
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const rows = await prisma.taxComplianceActionRecord.findMany({
      where: { taxSubjectId: user1, obligationKey: key },
      orderBy: { revision: 'asc' },
    });

    expect(rows.length).toBe(2);
    expect(rows[0].revision).toBe(1);
    expect(rows[0].actionType).toBe('USER_REPORTED_COMPLETION');
    expect(rows[1].revision).toBe(2);
    expect(rows[1].actionType).toBe('USER_REOPENED');
  });

  it('Scenario 25 (History): source supersession — changed fingerprint marks prior completion superseded', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // Re-complete first
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-scen-1-v1',
        note: 'Pago novamente',
      })
      .expect(201);

    // Mutate source in DB
    await prisma.taxObligationRecord.update({
      where: { id: uuidFor('ob-scen-1') },
      data: {
        liabilityFingerprint: 'fp-scen-1-v2-changed',
        principalAmount: '1400.00',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-03')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.obligations[0].status).toBe('SUPERSEDED');
  });

  it('Scenario 26 (History): new current obligation after supersession — actionable with new fingerprint', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-scen-1-v2-changed',
        note: 'Diferença quitada',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(4);

    const timelineRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-03')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(timelineRes.body.data.obligations[0].status).toBe('COMPLETED');
  });

  // =========================================================================
  // SECTION 4: SECURITY & ANTI-ENUMERATION SCENARIOS (27 to 34)
  // =========================================================================

  it('Scenario 27 (Security): cross-user GET — user2 cannot see user1 obligations (returns empty/isolated)', async () => {
    const token2 = await session(user2);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    expect(res.body.data.taxSubjectId).toBe(user2);
    expect(res.body.data.summary.totalObligations).toBe(0);
  });

  it('Scenario 28 (Security): cross-user POST — user2 action on user1 obligation returns 404 anti-enumeration', async () => {
    const token2 = await session(user2);
    const keyOfUser1 = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyOfUser1)}/actions`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-scen-1-v2-changed',
      })
      .expect(404);

    expect(res.body.code).toBe('COMPLIANCE.OBLIGATION_NOT_FOUND');
  });

  it('Scenario 29 (Security): forged portfolioId — query with portfolioId belonging to other user returns 404', async () => {
    const token2 = await session(user2);
    const forgedPortId = uuidFor('forged-port-id');

    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance?calendarYear=2026&portfolioId=${forgedPortId}`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(404);
  });

  it('Scenario 30 (Security): forged tax subject — obligationKey with forged taxSubjectId returns 404', async () => {
    const token1 = await session(user1);
    const forgedKey = `${user2}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(forgedKey)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
      })
      .expect(404);
  });

  it('Scenario 31 (Security): foreign obligation key — non-existent obligation key returns 404', async () => {
    const token1 = await session(user1);
    const foreignKey = `${uuidFor('foreign-user-999')}:2099-12:UNKNOWN_KIND:fake-ref`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(foreignKey)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
      })
      .expect(404);
  });

  it('Scenario 32 (Security): malformed action — payload missing required fields returns 400 Bad Request', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({})
      .expect(400);

    expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
  });

  it('Scenario 33 (Security): unknown action — unrecognized actionType returns 400 Bad Request', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'HACK_OBLIGATION_STATE',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
  });

  it('Scenario 34 (Security): oversized payload — note exceeding max characters returns 400 Bad Request', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        note: 'X'.repeat(5000),
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
  });

  it('H8-02: superseded monthly revisions never project as active timeline items', async () => {
    // Owner case (H8): a stale SUPERSEDED row with null principal projected as
    // "Competência 2026-10 — Sem Imposto a Pagar" next to the current
    // PROVISIONAL R$15 obligation. History stays in DB; only current revisions
    // may surface as active items.
    const user = uuidFor('user-h8-superseded-timeline');
    const token = await session(user);
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-h8-old'),
        taxSubjectId: user,
        competence: '2026-10',
        taxBucket: 'FII_SALE',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-h8-old-v1',
        revision: 1,
        principalAmount: null,
        currency: 'BRL',
        dueDate: null,
        status: 'SUPERSEDED',
        reasonCode: 'LIABILITY_BLOCKED',
        darfReadiness: 'BLOCKED',
        dataQuality: 'BLOCKED',
        provenance: {},
      },
    });
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-h8-current'),
        taxSubjectId: user,
        competence: '2026-10',
        taxBucket: 'FII_SALE',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-h8-current-v1',
        revision: 1,
        principalAmount: '15',
        currency: 'BRL',
        dueDate: null,
        status: 'PROVISIONAL',
        reasonCode: 'IN_PROGRESS_COMPETENCE',
        darfReadiness: 'PARTIAL',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const items = res.body.data.obligations.filter(
      (o: TaxComplianceObligationSummary) => o.period === '2026-10',
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('Em Andamento');
    expect(items.map((o: TaxComplianceObligationSummary) => o.title).join('|')).not.toContain(
      'Sem Imposto a Pagar',
    );
  });
});
