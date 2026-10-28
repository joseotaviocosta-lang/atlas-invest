import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

describe('API Integration: Investor Notification Center Feed (Phase 5V)', () => {
  let app: INestApplication;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let portfolioAId: string;
  let portfolioBId: string;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await cleanDatabase();

    // User A from seedBaseFixtures
    const fixtures = await seedBaseFixtures();
    userAId = fixtures.userId;
    portfolioAId = fixtures.portfolioId;
    const sessionA = await createAuthenticatedUserSession(userAId);
    userAToken = sessionA.token;

    // User B with their own portfolio
    userBId = randomUUID();
    await prisma.user.create({
      data: {
        id: userBId,
        email: 'userb_notif@test.com',
        name: 'User B Notifications',
        passwordHash: 'dummyhash12345',
      },
    });
    portfolioBId = randomUUID();
    await prisma.portfolio.create({
      data: {
        id: portfolioBId,
        userId: userBId,
        name: 'Portfolio B',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    const sessionB = await createAuthenticatedUserSession(userBId);
    userBToken = sessionB.token;
  });

  describe('GET /api/v1/notifications', () => {
    it('returns empty feed with zero counts when no actionable events exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({
        totalCount: 0,
        actionRequiredCount: 0,
        urgentCount: 0,
        categories: [],
      });
      expect(typeof res.body.meta.generatedAt).toBe('string');
    });

    it('aggregates fiscal obligations and compliance blocks', async () => {
      // 1. Pending DARF due in 10 days
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);

      await prisma.taxObligationRecord.create({
        data: {
          id: randomUUID(),
          taxSubjectId: userAId,
          competence: '2026-09',
          revenueCode: '8523',
          liabilityFingerprint: 'fp-darf-1',
          revision: 1,
          principalAmount: '240.50',
          dueDate,
          status: 'PENDING',
          darfReadiness: 'READY',
          dataQuality: 'CLEAN',
          provenance: {},
        },
      });

      // 2. Blocked compliance period
      await prisma.taxCompliancePeriodCloseRecord.create({
        data: {
          id: randomUUID(),
          taxSubjectId: userAId,
          scope: 'MONTHLY',
          period: '2026-08',
          calendarYear: 2026,
          recordStatus: 'ACTIVE',
          statusAtClose: 'BLOCKED',
          sourceFingerprint: 'fp-src-1',
          binderFingerprint: 'fp-bin-1',
          reason: 'Divergência detectada no fechamento',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.totalCount).toBe(2);
      expect(res.body.meta.categories).toContain('FISCAL');

      const darfNotif = res.body.data.find((n: { id: string }) => n.id.startsWith('fiscal:obl:'));
      expect(darfNotif).toBeDefined();
      expect(darfNotif.category).toBe('FISCAL');
      expect(darfNotif.sourceContext.origin).toBe('Tax Engine');
      expect(darfNotif.sourceContext.entityType).toBe('TAX_OBLIGATION');
      expect(darfNotif.actionHref).toBe('/tax');

      const blockNotif = res.body.data.find((n: { id: string }) => n.id.startsWith('fiscal:blocked:'));
      expect(blockNotif).toBeDefined();
      expect(blockNotif.priority).toBe('URGENT');
      expect(blockNotif.title).toContain('2026-08');
    });

    it('aggregates pending reviews and failed integration runs', async () => {
      // 1. Run awaiting review
      await prisma.integrationRun.create({
        data: {
          id: randomUUID(),
          portfolioId: portfolioAId,
          source: 'B3',
          status: 'AWAITING_REVIEW',
          recordsFetched: 15,
          recordsNormalized: 15,
          newCandidates: 3,
        },
      });

      // 2. Run failed
      await prisma.integrationRun.create({
        data: {
          id: randomUUID(),
          portfolioId: portfolioAId,
          source: 'B3',
          status: 'FAILED',
          errorMessage: 'Conexão interrompida pelo provedor',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.categories).toContain('REVIEW');
      expect(res.body.meta.categories).toContain('IMPORT');

      const reviewNotif = res.body.data.find((n: { category: string }) => n.category === 'REVIEW');
      expect(reviewNotif).toBeDefined();
      expect(reviewNotif.priority).toBe('ACTION_REQUIRED');
      expect(reviewNotif.actionHref).toMatch(/\/reviews\/.+/);

      const importNotif = res.body.data.find((n: { category: string }) => n.category === 'IMPORT');
      expect(importNotif).toBeDefined();
      expect(importNotif.priority).toBe('IMPORTANT');
      expect(importNotif.actionHref).toBe('/portfolio/import');
    });

    it('aggregates active operational alerts with correct routing', async () => {
      await prisma.operationalAlertEventRecord.create({
        data: {
          id: randomUUID(),
          dedupeKey: 'alert-portfolio-drift',
          alertType: 'PORTFOLIO_DRIFT',
          severity: 'ERROR',
          source: 'PORTFOLIO_ENGINE',
          status: 'ACTIVE',
          reasonCode: 'NEGATIVE_POSITION',
          firstDetectedAt: new Date(),
          lastDetectedAt: new Date(),
          metadata: { portfolioId: portfolioAId },
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      const alertNotif = res.body.data.find((n: { category: string }) => n.category === 'RECOVERY');
      expect(alertNotif).toBeDefined();
      expect(alertNotif.priority).toBe('URGENT');
      expect(alertNotif.actionHref).toBe('/portfolio/maintenance');
    });

    it('filters by category and priority', async () => {
      // Seed both a review run and a failed run
      await prisma.integrationRun.create({
        data: {
          id: randomUUID(),
          portfolioId: portfolioAId,
          source: 'B3',
          status: 'AWAITING_REVIEW',
        },
      });
      await prisma.integrationRun.create({
        data: {
          id: randomUUID(),
          portfolioId: portfolioAId,
          source: 'B3',
          status: 'FAILED',
        },
      });

      // Filter by category=REVIEW
      const reviewRes = await request(app.getHttpServer())
        .get('/api/v1/notifications?category=REVIEW')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.length).toBe(1);
      expect(reviewRes.body.data[0].category).toBe('REVIEW');

      // Filter by priority=IMPORTANT
      const priorityRes = await request(app.getHttpServer())
        .get('/api/v1/notifications?priority=IMPORTANT')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(priorityRes.status).toBe(200);
      expect(priorityRes.body.data.length).toBe(1);
      expect(priorityRes.body.data[0].priority).toBe('IMPORTANT');
    });

    it('enforces multi-tenant isolation: User A cannot see User B events', async () => {
      // Seed an awaiting review run in User B's portfolio
      await prisma.integrationRun.create({
        data: {
          id: randomUUID(),
          portfolioId: portfolioBId,
          source: 'B3',
          status: 'AWAITING_REVIEW',
        },
      });

      // User A requests their notifications -> should NOT see User B's review
      const resA = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data).toEqual([]);

      // User B requests their notifications -> should see the review
      const resB = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.length).toBe(1);
      expect(resB.body.data[0].portfolioId).toBe(portfolioBId);
    });

    it('enforces anti-enumeration: querying a foreign portfolioId returns 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/notifications?portfolioId=${portfolioBId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PERSISTENCE.ENTITY_NOT_FOUND');
    });
  });
});
