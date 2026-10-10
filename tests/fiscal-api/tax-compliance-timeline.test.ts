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

describe('Phase 4K.1 — Tax Compliance Obligation Timeline & State Integration E2E', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-compliance-4k1');
  const user2 = uuidFor('user2-compliance-4k1');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-15');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Rejects unauthenticated GET /api/v1/fiscal/compliance with 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/fiscal/compliance').expect(401);

    expect(res.body.code).toBe('AUTH.UNAUTHORIZED');
  });

  it('2. Returns empty timeline with summary counters = 0 for user without activity', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.data.taxSubjectId).toBe(user1);
    expect(res.body.data.calendarYear).toBe(2026);
    expect(res.body.data.summary.totalObligations).toBe(0);
    expect(res.body.data.summary.actionRequiredCount).toBe(0);
    expect(res.body.data.summary.overdueCount).toBe(0);
    expect(res.body.data.summary.upcomingCount).toBe(0);
    expect(res.body.data.summary.completedCount).toBe(0);
    expect(res.body.data.obligations).toEqual([]);
    expect(res.body.data.disclaimer).toContain('O Atlas fornece controle operacional');
  });

  it('3. Projects monthly DARF obligation when persisted in database', async () => {
    const token = await session(user1);

    // Create a persisted monthly tax obligation in database
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-darf-2026-03'),
        taxSubjectId: user1,
        competence: '2026-03',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'lp-darf-2026-03-v1',
        revision: 1,
        principalAmount: '1500.75',
        currency: 'BRL',
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const darfOb = res.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-03',
    );
    expect(darfOb).toBeDefined();
    expect(darfOb.obligationKey).toBe(`${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`);
    expect(darfOb.kind).toBe('MONTHLY_TAX_PAYMENT');
    expect(darfOb.amount).toBe('1500.75');
    expect(darfOb.currency).toBe('BRL');
    expect(darfOb.dueDate).toBe('2026-04-30');
    expect(darfOb.status).toBe('OPEN');
    expect(darfOb.isOverdue).toBe(false);
  });

  it('4. Correctly computes overdue status when today civil date is past due date', async () => {
    const token = await session(user1);

    // Create a February DARF with due date 2026-03-31 (today is 2026-04-15)
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor('ob-darf-2026-02'),
        taxSubjectId: user1,
        competence: '2026-02',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'lp-darf-2026-02-v1',
        revision: 1,
        principalAmount: '800.00',
        currency: 'BRL',
        dueDate: new Date('2026-03-31T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.summary.overdueCount).toBe(1);

    const febOb = res.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-02',
    );
    expect(febOb).toBeDefined();
    expect(febOb.isOverdue).toBe(true);
    expect(febOb.status).toBe('OPEN');
  });

  it('5. Rejects unauthenticated POST /api/v1/fiscal/compliance/:key/actions with 401', async () => {
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
      })
      .expect(401);
  });

  it('6. Rejects action on obligation belonging to another user with 404 (anti-enumeration)', async () => {
    const token2 = await session(user2);
    // user2 attempts to mark an obligation of user1
    const keyOfUser1 = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyOfUser1)}/actions`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'lp-darf-2026-02-v1',
      })
      .expect(404);

    expect(res.body.code).toBe('COMPLIANCE.OBLIGATION_NOT_FOUND');
  });

  it('7. Rejects invalid actionType with 400 Bad Request', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'INVALID_TYPE_FOO',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
  });

  it('8. Records USER_REPORTED_COMPLETION with matching sourceFingerprint and transitions obligation to COMPLETED', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const actionRes = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'lp-darf-2026-02-v1',
        note: 'Pago no aplicativo Itaú',
      })
      .expect(201);

    expect(actionRes.body.data.actionType).toBe('USER_REPORTED_COMPLETION');
    expect(actionRes.body.data.revision).toBe(1);
    expect(actionRes.body.data.note).toBe('Pago no aplicativo Itaú');

    // Query timeline and verify obligation is now COMPLETED and overdue count dropped
    const timelineRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(timelineRes.body.data.summary.overdueCount).toBe(0);
    expect(timelineRes.body.data.summary.completedCount).toBe(1);

    const febOb = timelineRes.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-02',
    );
    expect(febOb.status).toBe('COMPLETED');
    expect(febOb.isOverdue).toBe(false);
    expect(febOb.userAction.actionType).toBe('USER_REPORTED_COMPLETION');
    expect(febOb.userAction.note).toBe('Pago no aplicativo Itaú');
  });

  it('9. Idempotent action: sending identical action returns existing record without bumping revision', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'lp-darf-2026-02-v1',
        note: 'Pago no aplicativo Itaú',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(1);
  });

  it('10. Bumps revision when user provides updated note or new action', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'lp-darf-2026-02-v1',
        note: 'Pago no aplicativo Itaú (comprovante salvo)',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(2);
    expect(res.body.data.note).toBe('Pago no aplicativo Itaú (comprovante salvo)');
  });

  it('11. Detects staleness and transitions obligation to SUPERSEDED when underlying source fingerprint changes', async () => {
    const token1 = await session(user1);

    // Simulate upstream recalculation by updating the obligation record's fingerprint in DB
    await prisma.taxObligationRecord.update({
      where: { id: uuidFor('ob-darf-2026-02') },
      data: {
        liabilityFingerprint: 'lp-darf-2026-02-v2-recomputed',
        principalAmount: '950.00',
      },
    });

    const timelineRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(timelineRes.body.data.summary.supersededCount).toBe(1);
    expect(timelineRes.body.data.summary.completedCount).toBe(0);

    const febOb = timelineRes.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-02',
    );
    expect(febOb.status).toBe('SUPERSEDED');
    expect(febOb.amount).toBe('950');
  });

  it('12. User re-confirms superseded obligation with new sourceFingerprint and it transitions back to COMPLETED', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'lp-darf-2026-02-v2-recomputed',
        note: 'Diferença de R$ 150 paga',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(3);

    const timelineRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(timelineRes.body.data.summary.supersededCount).toBe(0);
    expect(timelineRes.body.data.summary.completedCount).toBe(1);

    const febOb = timelineRes.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-02',
    );
    expect(febOb.status).toBe('COMPLETED');
  });

  it('13. Supports USER_DISMISSED action', async () => {
    const token1 = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        actionType: 'USER_DISMISSED',
        sourceFingerprint: 'lp-darf-2026-03-v1',
        note: 'Não aplicável para este perfil',
      })
      .expect(201);

    const timelineRes = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    const marOb = timelineRes.body.data.obligations.find(
      (o: TaxComplianceObligationSummary) => o.period === '2026-03',
    );
    expect(marOb.status).toBe('DISMISSED');
  });

  it('14. Supports query filtering by status', async () => {
    const token1 = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&status=COMPLETED')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(
      res.body.data.obligations.every(
        (o: TaxComplianceObligationSummary) => o.status === 'COMPLETED',
      ),
    ).toBe(true);
    expect(res.body.data.obligations.length).toBe(1);
  });

  it('15. Supports query filtering by kind', async () => {
    const token1 = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&kind=MONTHLY_TAX_PAYMENT')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(
      res.body.data.obligations.every(
        (o: TaxComplianceObligationSummary) => o.kind === 'MONTHLY_TAX_PAYMENT',
      ),
    ).toBe(true);
  });

  it('16. Supports query filtering by period', async () => {
    const token1 = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026&period=2026-02')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(res.body.data.obligations.length).toBe(1);
    expect(res.body.data.obligations[0].period).toBe('2026-02');
  });

  it('17. Preserves strict decimal string format and null distinction (never "0.00" for null)', async () => {
    const token1 = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    for (const ob of res.body.data.obligations) {
      if (ob.amount !== null) {
        expect(typeof ob.amount).toBe('string');
        expect(/^\d+(\.\d{1,2})?$/.test(ob.amount)).toBe(true);
      }
    }
  });

  it('18. Timeline response includes mandatory legal non-affiliation disclaimer', async () => {
    const token1 = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);

    expect(res.body.data.disclaimer).toContain('Receita Federal do Brasil');
    expect(res.body.data.disclaimer).toContain('controle estritamente interno');
  });

  it('19. Ensures tenant isolation: user2 sees 0 obligations and 0 actions from user1', async () => {
    const token2 = await session(user2);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    expect(res.body.data.taxSubjectId).toBe(user2);
    expect(res.body.data.summary.totalObligations).toBe(0);
    expect(res.body.data.obligations).toEqual([]);
  });

  it('20. User2 cannot query or manipulate user1 compliance actions', async () => {
    const token2 = await session(user2);
    const foreignKey = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(foreignKey)}/actions`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        actionType: 'USER_DISMISSED',
      })
      .expect(404);
  });
});
