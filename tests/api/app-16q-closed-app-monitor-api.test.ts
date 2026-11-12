import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { INestApplication } from '@nestjs/common';
import {
  deliverMaterialNewsAlerts,
  type NewsAlertCandidate,
  type PortfolioNewsInboxResult,
} from '@atlas/market-data';
import type { IPortfolioNewsStateRepository, IPortfolioRepository } from '@atlas/database';
import {
  DEFAULT_CLOSED_APP_MONITOR_PREFERENCES,
  WindowsBackgroundNewsAlertNotifier,
  runClosedAppNewsMonitorCycle,
} from '../../apps/api/src/background-news-monitor';
import { GetOpportunityRadarUseCase } from '../../apps/api/src/application/portfolios/opportunity-radar';
import {
  PORTFOLIO_NEWS_STATE_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../apps/api/src/database/tokens';
import { LOCAL_OWNER_USER_ID } from '../../apps/api/src/auth/constants/local-owner.constants';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getTestPrismaClient,
} from './setup';

const PORTFOLIO_ID = '16160000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '16160000-0000-4000-8000-000000000005';
const INSTITUTION_ID = '16160000-0000-4000-8000-000000000004';
const ASSET_ID = '16160000-0000-4000-8000-000000000010';
const TX_ID = '16160000-0000-4000-8000-000000000020';

describe('APP-16Q: Closed-app DB + Real Windows Notification + GUI/Task Race', () => {
  let app: INestApplication;
  let radarUseCase: GetOpportunityRadarUseCase;
  let newsStateRepo: IPortfolioNewsStateRepository;
  let portfolioRepo: IPortfolioRepository;

  beforeAll(async () => {
    app = await createTestApp();
    radarUseCase = app.get(GetOpportunityRadarUseCase);
    newsStateRepo = app.get<IPortfolioNewsStateRepository>(PORTFOLIO_NEWS_STATE_REPOSITORY);
    portfolioRepo = app.get<IPortfolioRepository>(PORTFOLIO_REPOSITORY);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const prisma = getTestPrismaClient();

    await prisma.user.create({
      data: {
        id: LOCAL_OWNER_USER_ID,
        email: 'owner-16q@atlas.local',
        passwordHash: 'not-used',
        name: 'Owner 16Q',
      },
    });

    await prisma.institution.create({
      data: {
        id: INSTITUTION_ID,
        name: 'B3 Test 16Q',
        type: 'BROKER',
        country: 'BR',
      },
    });

    await prisma.asset.create({
      data: {
        id: ASSET_ID,
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    await prisma.portfolio.create({
      data: {
        id: PORTFOLIO_ID,
        userId: LOCAL_OWNER_USER_ID,
        name: 'Carteira 16Q',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });

    await prisma.account.create({
      data: {
        id: ACCOUNT_ID,
        portfolioId: PORTFOLIO_ID,
        institutionId: INSTITUTION_ID,
        name: 'Conta Corretora 16Q',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    await prisma.transaction.create({
      data: {
        id: TX_ID,
        portfolioId: PORTFOLIO_ID,
        accountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        type: 'BUY',
        quantity: '100',
        unitPrice: '35.00',
        amount: '3500.00',
        currency: 'BRL',
        tradeDate: new Date('2026-01-15T00:00:00.000Z'),
        settlementDate: new Date('2026-01-17T00:00:00.000Z'),
        provider: 'MANUAL',
        externalId: '16q-buy-petr4',
      },
    });
  });

  it('discovers owner portfolio, delivers 1 real Windows Toast, persists DELIVERED history, prevents duplicates and GUI/Task races', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-16q-api-'));
    const now = new Date(2026, 10, 12, 11, 0, 0);
    const eventPublishedAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const makeInbox = (fp: string): PortfolioNewsInboxResult => ({
      events: [
        {
          canonicalEventId: 'evt-16q-real-toast',
          ticker: 'PETR4',
          tickers: ['PETR4'],
          headline: 'PETR4 anuncia fato relevante de produção',
          summary: 'Comunicado oficial CVM',
          publishedAt: eventPublishedAt,
          source: 'CVM',
          official: true,
          officialSourceLabel: 'CVM',
          url: 'https://www.rad.cvm.gov.br/16q',
          category: 'MATERIAL_FACT',
          importance: 5,
          sentiment: 'POSITIVE',
          recency: 'BREAKING',
          materiality: 'HIGH',
          materialityReason: 'Fato relevante oficial',
          state: 'NEW',
          eventVersionFingerprint: fp,
          updateReasons: [],
        } as unknown as PortfolioNewsInboxResult['events'][number],
      ],
      totalEvents: 1,
      byAssetCount: { PETR4: 1 },
      digest: {
        date: '2026-11-12',
        totalEvents: 1,
        materialEventsCount: 1,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 0,
        routineCount: 0,
        affectedAssetsCount: 1,
        affectedAssets: ['PETR4'],
        items: [],
      },
      assetDailyStatus: {},
      metrics: {
        breakingCount: 1,
        recentCount: 1,
        officialCount: 1,
        highImportanceCount: 1,
        materialCount: 1,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 0,
        routineCount: 0,
        totalAuditedAssets: 1,
        assetsWithNews: 1,
        assetsWithoutNews: 0,
        officialCoverageCount: 1,
        providerStatus: {
          brapiNewsAvailable: false,
          brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
          officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
          cvmStatus: 'AVAILABLE',
          fnetStatus: 'AVAILABLE',
          fallbackActive: false,
          providersUsed: ['CVM / B3 Regulatório Oficial'],
        },
      },
      asOf: now.toISOString(),
      newsState: {
        portfolioId: PORTFOLIO_ID,
        lastRefreshedAt: now.toISOString(),
        newEventsCount: 1,
        newMaterialEventsCount: 1,
        updatedEventsCount: 0,
        seenEventsCount: 0,
        alertsInitializedAt: '2026-11-01T00:00:00.000Z',
      },
      alertsMeta: {
        baselineInitializedAt: '2026-11-01T00:00:00.000Z',
        pendingEligibleCount: 1,
        eligibleEvents: [
          {
            portfolioId: PORTFOLIO_ID,
            canonicalEventId: 'evt-16q-real-toast',
            eventVersionFingerprint: fp,
            alertIdentityKey: `${PORTFOLIO_ID}::evt-16q-real-toast::${fp}`,
            state: 'NEW',
            materiality: 'HIGH',
            ticker: 'PETR4',
            headline: 'PETR4 anuncia fato relevante de produção',
            materialityReason: 'Fato relevante oficial',
            official: true,
            officialSourceLabel: 'CVM',
            publishedAt: eventPublishedAt,
          },
        ],
      },
    });

    await newsStateRepo.persistSnapshot({
      portfolioId: PORTFOLIO_ID,
      syncState: {
        portfolioId: PORTFOLIO_ID,
        lastRefreshedAt: now.toISOString(),
        lastSuccessfulRefreshAt: now.toISOString(),
        baselineInitializedAt: '2026-11-01T00:00:00.000Z',
        alertsInitializedAt: '2026-11-01T00:00:00.000Z',
      },
      items: [
        {
          portfolioId: PORTFOLIO_ID,
          canonicalEventId: 'evt-16q-real-toast',
          firstSeenAt: now.toISOString(),
          lastObservedAt: now.toISOString(),
          lastSeenByUserAt: null,
          firstFingerprint: 'fp-16q-v1',
          latestFingerprint: 'fp-16q-v1',
          state: 'NEW',
          latestUpdateReasons: [],
          eventPublishedAt,
          meta: { ticker: 'PETR4', materiality: 'HIGH' },
        },
      ],
    });

    const realWindowsNotifier = new WindowsBackgroundNewsAlertNotifier('br.com.atlasinvest.app');

    // 1. Real portfolio discovery + real Windows Toast notification + real DB DELIVERED history
    const firstRun = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async (userId) => {
        const list = await portfolioRepo.findByUserId(userId);
        return list.map((p) => ({ id: String(p.id) }));
      },
      getPortfolioNews: async () => makeInbox('fp-16q-v1'),
      claimPendingNewsAlerts: (p) => radarUseCase.claimPendingNewsAlerts(p),
      confirmNewsAlertsDelivered: (p) => radarUseCase.confirmNewsAlertsDelivered(p),
      releaseNewsAlertsClaim: (p) => radarUseCase.releaseNewsAlertsClaim(p),
      notifier: realWindowsNotifier,
      prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: true },
      dataDir: tempDir,
      now,
    });

    expect(firstRun.exitCode).toBe(0);
    expect(firstRun.deliveredAlertsCount).toBe(1);

    const historyAfterFirst = await radarUseCase.getPortfolioNewsAlertHistory({
      portfolioId: PORTFOLIO_ID,
      userId: LOCAL_OWNER_USER_ID,
    });
    expect(historyAfterFirst.items.length).toBe(1);
    expect(historyAfterFirst.items[0]?.deliveryStatus).toBe('DELIVERED');

    // 2. Duplicate run on same fingerprint -> 0 duplicate notification
    const duplicateRun = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async () => [{ id: PORTFOLIO_ID }],
      getPortfolioNews: async () => makeInbox('fp-16q-v1'),
      claimPendingNewsAlerts: (p) => radarUseCase.claimPendingNewsAlerts(p),
      confirmNewsAlertsDelivered: (p) => radarUseCase.confirmNewsAlertsDelivered(p),
      releaseNewsAlertsClaim: (p) => radarUseCase.releaseNewsAlertsClaim(p),
      notifier: realWindowsNotifier,
      prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: true },
      dataDir: tempDir,
      now,
    });
    expect(duplicateRun.deliveredAlertsCount).toBe(0);

    // 3. GUI + Task concurrent race on new fingerprint fp-16q-v2 -> strictly 1 delivery
    await newsStateRepo.persistSnapshot({
      portfolioId: PORTFOLIO_ID,
      syncState: {
        portfolioId: PORTFOLIO_ID,
        lastRefreshedAt: now.toISOString(),
        lastSuccessfulRefreshAt: now.toISOString(),
        baselineInitializedAt: '2026-11-01T00:00:00.000Z',
        alertsInitializedAt: '2026-11-01T00:00:00.000Z',
      },
      items: [
        {
          portfolioId: PORTFOLIO_ID,
          canonicalEventId: 'evt-16q-real-toast',
          firstSeenAt: now.toISOString(),
          lastObservedAt: now.toISOString(),
          lastSeenByUserAt: null,
          firstFingerprint: 'fp-16q-v1',
          latestFingerprint: 'fp-16q-v2',
          state: 'UPDATED',
          latestUpdateReasons: ['MATERIAL_FACT'],
          eventPublishedAt,
          meta: { ticker: 'PETR4', materiality: 'HIGH' },
        },
      ],
    });

    const raceCandidate: NewsAlertCandidate = {
      portfolioId: PORTFOLIO_ID,
      canonicalEventId: 'evt-16q-real-toast',
      eventVersionFingerprint: 'fp-16q-v2',
      alertIdentityKey: `${PORTFOLIO_ID}::evt-16q-real-toast::fp-16q-v2`,
      state: 'UPDATED',
      materiality: 'HIGH',
      ticker: 'PETR4',
      headline: 'PETR4 anuncia fato relevante atualizado',
      materialityReason: 'Fato relevante oficial',
      official: true,
      officialSourceLabel: 'CVM',
      publishedAt: eventPublishedAt,
      event: makeInbox('fp-16q-v2').events[0]!,
    };

    const [taskRace, guiRace] = await Promise.all([
      runClosedAppNewsMonitorCycle({
        listOwnerPortfolios: async () => [{ id: PORTFOLIO_ID }],
        getPortfolioNews: async () => makeInbox('fp-16q-v2'),
        claimPendingNewsAlerts: (p) => radarUseCase.claimPendingNewsAlerts(p),
        confirmNewsAlertsDelivered: (p) => radarUseCase.confirmNewsAlertsDelivered(p),
        releaseNewsAlertsClaim: (p) => radarUseCase.releaseNewsAlertsClaim(p),
        notifier: realWindowsNotifier,
        prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: true },
        dataDir: tempDir,
        now,
      }),
      deliverMaterialNewsAlerts({
        portfolioId: PORTFOLIO_ID,
        candidates: [raceCandidate],
        notifier: realWindowsNotifier,
        ports: {
          claimPendingAlerts: async ({ portfolioId, candidates }) =>
            (await radarUseCase.claimPendingNewsAlerts({ portfolioId, userId: LOCAL_OWNER_USER_ID, items: candidates, now })).claimed,
          confirmAlertsDelivered: async ({ portfolioId, delivered }) => {
            await radarUseCase.confirmNewsAlertsDelivered({
              portfolioId,
              userId: LOCAL_OWNER_USER_ID,
              items: delivered,
              alertAttemptId: delivered[0]?.alertAttemptId,
              notificationId: delivered[0]?.notificationId ?? null,
              now,
            });
          },
          releaseAlertsClaim: async ({ portfolioId, items }) => {
            await radarUseCase.releaseNewsAlertsClaim({
              portfolioId,
              userId: LOCAL_OWNER_USER_ID,
              items,
              recordHistory: true,
            });
          },
        },
      }),
    ]);

    expect(taskRace.deliveredAlertsCount + guiRace.deliveredCount).toBe(1);
    const historyAfterRace = await radarUseCase.getPortfolioNewsAlertHistory({
      portfolioId: PORTFOLIO_ID,
      userId: LOCAL_OWNER_USER_ID,
    });
    expect(historyAfterRace.items.length).toBe(2);
  }, 30000);
});
