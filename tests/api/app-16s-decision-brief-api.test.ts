import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PortfolioNewsPipelineService } from '../../apps/api/src/application/portfolios/opportunity-radar/portfolio-news-pipeline.service';
import type { PortfolioNewsInboxResult, PortfolioNewsInboxMetrics } from '@atlas/market-data';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  createAuthenticatedUserSession,
  getTestPrismaClient,
} from './setup';

describe('API Integration: APP-16S Daily Portfolio Decision Brief', () => {
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

  it('returns 200 with PortfolioDailyDecisionBrief envelope and supports optional contributionAmount simulation', async () => {
    const res1 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res1.body.data).toBeDefined();
    expect(res1.body.data.portfolioId).toBe(portfolioId);
    expect(res1.body.data.modelVersion).toBe('opportunity-v2.3.1');
    expect(Array.isArray(res1.body.data.topPriorities)).toBe(true);
    expect(res1.body.data.dataQuality).toBeDefined();
    expect(res1.body.data.contributionContext.source).toBe('NONE');

    const res2 = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=1250.50`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res2.body.data.contributionContext.source).toBe('USER_SIMULATION');
    expect(res2.body.data.contributionContext.plannedAmount).toBe('1250.50');
  });

  it('rejects invalid contributionAmount with 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=-50`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=0`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief?contributionAmount=abc`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(400);
  });

  it('enforces 404 anti-enumeration for portfolios owned by another user', async () => {
    const prisma = getTestPrismaClient();
    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'other-decision-brief@example.com',
        passwordHash: 'test-hash',
        name: 'Other User',
      },
    });
    const otherAuth = await createAuthenticatedUserSession(otherUser.id);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/decision-brief`)
      .set('Authorization', `Bearer ${otherAuth.token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${randomUUID()}/decision-brief`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(404);
  });

  it('propagates real news provider quality (AVAILABLE, NO_OFFICIAL_EVENTS, PARTIAL, STALE_CACHE, UNAVAILABLE) through controller -> use case -> builder without altering score', async () => {
    const prisma = getTestPrismaClient();
    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'BBAS3',
        name: 'Banco do Brasil ON',
        type: 'STOCK',
        exchange: 'B3',
        currency: 'BRL',
      },
    });

    await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId: '44444444-4444-4444-8444-444444444444',
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-10-01T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '27.50',
        amount: '2750.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    const now = new Date();
    await prisma.marketQuoteRecord.create({
      data: {
        id: randomUUID(),
        assetId: asset.id,
        tradingDate: now,
        currency: 'BRL',
        close: '28.50',
        provider: 'BRAPI',
        providerSymbol: 'BBAS3',
        firstFetchedAt: now,
        lastFetchedAt: now,
      },
    });

    const newsPipeline = app.get(PortfolioNewsPipelineService);
    const makeInbox = (
      providerStatus: PortfolioNewsInboxMetrics['providerStatus'],
    ): PortfolioNewsInboxResult => ({
      events: [],
      totalEvents: 0,
      byAssetCount: { BBAS3: 0 },
      metrics: {
        breakingCount: 0,
        recentCount: 0,
        officialCount: 0,
        highImportanceCount: 0,
        totalAuditedAssets: 1,
        assetsWithNews: 0,
        assetsWithoutNews: 1,
        officialCoverageCount: 1,
        providerStatus,
      },
      asOf: new Date().toISOString(),
    });

    const spy = vi.spyOn(newsPipeline, 'getPortfolioNews');

    try {
      // 1. OFFICIAL_PROVIDER_AVAILABLE -> no partial caution
      spy.mockResolvedValueOnce(
        makeInbox({
          brapiNewsAvailable: true,
          brapiNewsStatus: 'BRAPI_NEWS_PRO_AVAILABLE',
          officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
          cvmStatus: 'AVAILABLE',
          fnetStatus: 'AVAILABLE',
          fallbackActive: false,
          providersUsed: ['CVM', 'B3_FNET'],
        }),
      );
      const resAvailable = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/decision-brief?refresh=true`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resAvailable.body.data.dataQuality.officialProviderStatus).toBe(
        'OFFICIAL_PROVIDER_AVAILABLE',
      );
      const baselineScore = resAvailable.body.data.topPriorities[0].opportunityScore;
      expect(resAvailable.body.data.topPriorities[0].cautions).not.toContain(
        'Cobertura de notícias parcial nesta execução.',
      );

      // 2. NO_OFFICIAL_EVENTS -> no partial caution
      spy.mockResolvedValueOnce(
        makeInbox({
          brapiNewsAvailable: false,
          brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
          officialStatus: 'NO_OFFICIAL_EVENTS',
          cvmStatus: 'NO_EVENTS',
          fnetStatus: 'NO_EVENTS',
          fallbackActive: true,
          providersUsed: ['GOOGLE_NEWS_RSS'],
        }),
      );
      const resNoEvents = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/decision-brief?refresh=true`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resNoEvents.body.data.dataQuality.officialProviderStatus).toBe('NO_OFFICIAL_EVENTS');
      expect(resNoEvents.body.data.topPriorities[0].cautions).not.toContain(
        'Cobertura de notícias parcial nesta execução.',
      );

      // 3. OFFICIAL_PROVIDER_PARTIAL -> caution present, score unchanged
      spy.mockResolvedValueOnce(
        makeInbox({
          brapiNewsAvailable: false,
          brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
          officialStatus: 'OFFICIAL_PROVIDER_PARTIAL',
          cvmStatus: 'AVAILABLE',
          fnetStatus: 'UNAVAILABLE',
          fallbackActive: true,
          providersUsed: ['CVM', 'GOOGLE_NEWS_RSS'],
        }),
      );
      const resPartial = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/decision-brief?refresh=true`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resPartial.body.data.dataQuality.officialProviderStatus).toBe(
        'OFFICIAL_PROVIDER_PARTIAL',
      );
      expect(resPartial.body.data.topPriorities[0].cautions).toContain(
        'Cobertura de notícias parcial nesta execução.',
      );
      expect(resPartial.body.data.topPriorities[0].opportunityScore).toBe(baselineScore);

      // 4. STALE_CACHE -> caution present
      spy.mockResolvedValueOnce(
        makeInbox({
          brapiNewsAvailable: true,
          brapiNewsStatus: 'BRAPI_NEWS_PRO_AVAILABLE',
          officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
          cvmStatus: 'STALE_CACHE',
          fnetStatus: 'AVAILABLE',
          fallbackActive: false,
          providersUsed: ['CVM'],
        }),
      );
      const resStale = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/decision-brief?refresh=true`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resStale.body.data.topPriorities[0].cautions).toContain(
        'Cobertura de notícias parcial nesta execução.',
      );

      // 5. OFFICIAL_PROVIDER_UNAVAILABLE -> 200 OK with caution, score unchanged
      spy.mockResolvedValueOnce(
        makeInbox({
          brapiNewsAvailable: false,
          brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
          officialStatus: 'OFFICIAL_PROVIDER_UNAVAILABLE',
          cvmStatus: 'UNAVAILABLE',
          fnetStatus: 'UNAVAILABLE',
          fallbackActive: false,
          providersUsed: [],
        }),
      );
      const resUnavailable = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/decision-brief?refresh=true`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(resUnavailable.body.data.dataQuality.officialProviderStatus).toBe(
        'OFFICIAL_PROVIDER_UNAVAILABLE',
      );
      expect(resUnavailable.body.data.topPriorities[0].cautions).toContain(
        'Cobertura de notícias parcial nesta execução.',
      );
      expect(resUnavailable.body.data.topPriorities[0].opportunityScore).toBe(baselineScore);
    } finally {
      spy.mockRestore();
    }
  });
});
