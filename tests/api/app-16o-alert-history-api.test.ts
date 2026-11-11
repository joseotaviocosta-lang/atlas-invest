import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

describe('API Integration: APP-16O Material News Alert History & Ownership Isolation', () => {
  let app: INestApplication;
  let userToken: string;
  let portfolioId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    const auth = await createAuthenticatedUserSession(fixtures.userId);
    userToken = auth.token;
  });

  it('persists confirm delivery & failed attempt release via HTTP and enforces pagination, filters, civil date validation, and 404 anti-enumeration', async () => {
    const prisma = getTestPrismaClient();

    // Seed two tracked news state rows in DB
    const fp1 = 'fp_http_petr4_v1';
    const fp2 = 'fp_http_vale3_v1';
    await prisma.portfolioNewsSyncState.create({
      data: {
        portfolioId,
        newsStateInitializedAt: new Date('2026-11-10T10:00:00.000Z'),
        lastRefreshedAt: new Date('2026-11-11T10:00:00.000Z'),
      },
    });
    await prisma.portfolioNewsEventStateRecord.createMany({
      data: [
        {
          id: randomUUID(),
          portfolioId,
          canonicalEventId: 'evt_http_petr4',
          firstSeenAt: new Date('2026-11-11T10:00:00.000Z'),
          lastObservedAt: new Date('2026-11-11T10:00:00.000Z'),
          firstFingerprint: fp1,
          latestFingerprint: fp1,
          state: 'NEW',
          latestUpdateReasons: [],
          snapshotMeta: { official: true, materiality: 'HIGH', tickers: ['PETR4'] },
        },
        {
          id: randomUUID(),
          portfolioId,
          canonicalEventId: 'evt_http_vale3',
          firstSeenAt: new Date('2026-11-11T10:00:00.000Z'),
          lastObservedAt: new Date('2026-11-11T10:00:00.000Z'),
          firstFingerprint: fp2,
          latestFingerprint: fp2,
          state: 'UPDATED',
          latestUpdateReasons: ['TEXT_UPDATED'],
          snapshotMeta: { official: true, materiality: 'CRITICAL', tickers: ['VALE3'] },
        },
      ],
    });

    // Claim -> fail release (recorded in history) -> retry confirm
    const claimRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/claim`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        items: [
          { canonicalEventId: 'evt_http_petr4', eventVersionFingerprint: fp1 },
          { canonicalEventId: 'evt_http_vale3', eventVersionFingerprint: fp2 },
        ],
      });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.claimed).toHaveLength(2);

    const releaseRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/release`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        deliveryStatus: 'DELIVERY_FAILED',
        failureReason: 'Transient toast timeout',
        attemptedAt: '2026-11-11T10:01:00.000Z',
        recordHistory: true,
        items: [
          {
            canonicalEventId: 'evt_http_vale3',
            eventVersionFingerprint: fp2,
            ticker: 'VALE3',
            eventState: 'UPDATED',
            materiality: 'CRITICAL',
            alertType: 'CRITICAL_UPDATE',
            headlineSnapshot: 'Vale retificação crítica',
            sourceLabelSnapshot: 'CVM',
          },
        ],
      });
    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.data.historyInsertedCount).toBe(1);

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/confirm`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        notificationId: 'notif_http_1',
        items: [
          {
            canonicalEventId: 'evt_http_petr4',
            eventVersionFingerprint: fp1,
            ticker: 'PETR4',
            eventState: 'NEW',
            materiality: 'HIGH',
            alertType: 'MATERIAL_NEW',
            headlineSnapshot: 'Petrobras dividendo aprovado',
            sourceLabelSnapshot: 'CVM',
            attemptedAt: '2026-11-11T10:02:00.000Z',
            deliveredAt: '2026-11-11T10:02:00.000Z',
          },
          {
            canonicalEventId: 'evt_http_vale3',
            eventVersionFingerprint: fp2,
            ticker: 'VALE3',
            eventState: 'UPDATED',
            materiality: 'CRITICAL',
            alertType: 'CRITICAL_UPDATE',
            headlineSnapshot: 'Vale retificação crítica',
            sourceLabelSnapshot: 'CVM',
            attemptedAt: '2026-11-11T10:03:00.000Z',
            deliveredAt: '2026-11-11T10:03:00.000Z',
          },
        ],
      });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.confirmedCount).toBe(2);
    expect(confirmRes.body.data.historyInsertedCount).toBe(2);

    // GET history ordered newest first with cursor pagination (limit=2 -> page1=2 items, page2=1 item)
    const page1 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/history?limit=2`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.hasMore).toBe(true);
    expect(page1.body.data.metrics.totalCount).toBe(3);
    expect(page1.body.data.metrics.deliveredCount).toBe(2);
    expect(page1.body.data.metrics.failedCount).toBe(1);

    const page2 = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/history?limit=2&cursor=${encodeURIComponent(page1.body.data.nextCursor)}`,
      )
      .set('Authorization', `Bearer ${userToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data.items).toHaveLength(1);
    expect(page2.body.data.hasMore).toBe(false);
    expect(page2.body.data.items[0].deliveryStatus).toBe('DELIVERY_FAILED');

    // Filter by ticker & status
    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/history?ticker=VALE3&status=DELIVERY_FAILED`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items).toHaveLength(1);

    // Invalid civil calendar date -> 400
    const badDate = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/history?from=2026-02-30`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(badDate.status).toBe(400);

    // Another user accessing this portfolio -> 404 anti-enumeration
    const otherUserId = randomUUID();
    await prisma.user.create({
      data: {
        id: otherUserId,
        email: 'other-user-16o@atlas.dev',
        name: 'Other User',
        passwordHash: 'hash_not_used',
      },
    });
    const otherSession = await createAuthenticatedUserSession(otherUserId);
    const crossTenant = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/opportunity-radar/news/alerts/history`)
      .set('Authorization', `Bearer ${otherSession.token}`);
    expect(crossTenant.status).toBe(404);
  });
});
