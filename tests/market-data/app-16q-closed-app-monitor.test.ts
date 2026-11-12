import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PortfolioNewsInboxResult } from '@atlas/market-data';
import {
  CLOSED_APP_MONITOR_EXIT_CODES,
  DEFAULT_CLOSED_APP_MONITOR_PREFERENCES,
  isQuietHoursActive,
  runClosedAppNewsMonitorCycle,
  sanitizeMonitorText,
  type ClosedAppMonitorRuntimeDeps,
} from '../../apps/api/src/background-news-monitor';
import { serializeBackgroundMonitorPrefs } from '../../apps/atlas-app/src/features/notifications/background-monitoring';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../apps/atlas-app/src/features/notifications/preferences';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-16q-unit-'));
}

function makeSampleInbox(params: {
  portfolioId: string;
  materiality: 'CRITICAL' | 'HIGH';
  state?: 'NEW' | 'UPDATED';
  publishedAt: string;
  fingerprint?: string;
}): PortfolioNewsInboxResult {
  const fp = params.fingerprint ?? 'fp-v1';
  const state = params.state ?? 'NEW';
  return {
    events: [
      {
        canonicalEventId: 'evt-1',
        ticker: 'PETR4',
        tickers: ['PETR4'],
        headline: 'Fato Relevante PETR4',
        summary: 'Comunicado oficial',
        publishedAt: params.publishedAt,
        source: 'CVM',
        official: true,
        officialSourceLabel: 'CVM',
        url: 'https://www.rad.cvm.gov.br/doc/1',
        category: 'MATERIAL_FACT',
        importance: 5,
        sentiment: 'NEUTRAL',
        recency: 'BREAKING',
        materiality: params.materiality,
        materialityReason: 'Fato relevante oficial',
        state,
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
      criticalCount: params.materiality === 'CRITICAL' ? 1 : 0,
      highCount: params.materiality === 'HIGH' ? 1 : 0,
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
      criticalCount: params.materiality === 'CRITICAL' ? 1 : 0,
      highCount: params.materiality === 'HIGH' ? 1 : 0,
      mediumCount: 0,
      routineCount: 0,
      totalAuditedAssets: 36,
      assetsWithNews: 1,
      assetsWithoutNews: 35,
      officialCoverageCount: 36,
      providerStatus: {
        brapiNewsAvailable: false,
        brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
        officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
        cvmStatus: 'AVAILABLE',
        fnetStatus: 'AVAILABLE',
        fallbackActive: true,
        providersUsed: ['CVM / B3 Regulatório Oficial'],
      },
    },
    asOf: params.publishedAt,
    newsState: {
      portfolioId: params.portfolioId,
      lastRefreshedAt: params.publishedAt,
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
          portfolioId: params.portfolioId,
          canonicalEventId: 'evt-1',
          eventVersionFingerprint: fp,
          alertIdentityKey: `${params.portfolioId}::evt-1::${fp}`,
          state,
          materiality: params.materiality,
          ticker: 'PETR4',
          headline: 'Fato Relevante PETR4',
          materialityReason: 'Fato relevante oficial',
          official: true,
          officialSourceLabel: 'CVM',
          publishedAt: params.publishedAt,
        },
      ],
    },
  };
}

describe('APP-16Q: Closed-app local news monitor orchestration', () => {
  it('defaults closedAppNewsMonitoring to false and skips execution with exit 10', async () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.closedAppNewsMonitoring).toBe(false);
    expect(DEFAULT_CLOSED_APP_MONITOR_PREFERENCES.closedAppNewsMonitoring).toBe(false);

    const listOwnerPortfolios = vi.fn();
    const res = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios,
      getPortfolioNews: vi.fn(),
      claimPendingNewsAlerts: vi.fn(),
      confirmNewsAlertsDelivered: vi.fn(),
      releaseNewsAlertsClaim: vi.fn(),
      notifier: { notifyMaterialNews: vi.fn() },
      prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: false },
      dataDir: makeTempDir(),
    });

    expect(res.exitCode).toBe(CLOSED_APP_MONITOR_EXIT_CODES.SKIPPED);
    expect(listOwnerPortfolios).not.toHaveBeenCalled();
  });

  it('returns exit 20 on offline/all-providers-unavailable without generating false alerts', async () => {
    const notifyMaterialNews = vi.fn();
    const res = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async () => [{ id: 'p-1' }],
      getPortfolioNews: async () => ({
        events: [],
        totalEvents: 0,
        byAssetCount: {},
        digest: {
          date: '2026-11-12',
          totalEvents: 0,
          materialEventsCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          routineCount: 0,
          affectedAssetsCount: 0,
          affectedAssets: [],
          items: [],
        },
        assetDailyStatus: {},
        metrics: {
          breakingCount: 0,
          recentCount: 0,
          officialCount: 0,
          highImportanceCount: 0,
          materialCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          routineCount: 0,
          totalAuditedAssets: 36,
          assetsWithNews: 0,
          assetsWithoutNews: 36,
          officialCoverageCount: 0,
          providerStatus: {
            brapiNewsAvailable: false,
            brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
            officialStatus: 'OFFICIAL_PROVIDER_UNAVAILABLE',
            cvmStatus: 'UNAVAILABLE',
            fnetStatus: 'UNAVAILABLE',
            fallbackActive: false,
            providersUsed: [],
          },
        },
        asOf: '2026-11-12T12:00:00.000Z',
      }),
      claimPendingNewsAlerts: vi.fn(),
      confirmNewsAlertsDelivered: vi.fn(),
      releaseNewsAlertsClaim: vi.fn(),
      notifier: { notifyMaterialNews },
      prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: true },
      dataDir: makeTempDir(),
    });

    expect(res.exitCode).toBe(CLOSED_APP_MONITOR_EXIT_CODES.OFFLINE_OR_PROVIDER_UNAVAILABLE);
    expect(res.deliveredAlertsCount).toBe(0);
    expect(notifyMaterialNews).not.toHaveBeenCalled();
  });

  it('refreshes news during quiet hours (23:00) but suppresses CRITICAL and HIGH notifications', async () => {
    const quietNow = new Date(2026, 10, 12, 23, 0, 0);
    const getPortfolioNews = vi.fn().mockResolvedValue(
      makeSampleInbox({
        portfolioId: 'p-1',
        materiality: 'CRITICAL',
        publishedAt: quietNow.toISOString(),
      }),
    );
    const notifyMaterialNews = vi.fn();

    expect(
      isQuietHoursActive(
        { quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '08:00' },
        quietNow,
      ),
    ).toBe(true);

    const res = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async () => [{ id: 'p-1' }],
      getPortfolioNews,
      claimPendingNewsAlerts: vi.fn(),
      confirmNewsAlertsDelivered: vi.fn(),
      releaseNewsAlertsClaim: vi.fn(),
      notifier: { notifyMaterialNews },
      prefs: {
        ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES,
        closedAppNewsMonitoring: true,
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      },
      dataDir: makeTempDir(),
      now: quietNow,
    });

    expect(res.exitCode).toBe(CLOSED_APP_MONITOR_EXIT_CODES.SUCCESS);
    expect(getPortfolioNews).toHaveBeenCalledTimes(1);
    expect(res.suppressedQuietHoursCount).toBe(1);
    expect(res.deliveredAlertsCount).toBe(0);
    expect(notifyMaterialNews).not.toHaveBeenCalled();
  });

  it('enforces post-quiet 6h window for HIGH while preserving CRITICAL eligibility', async () => {
    const morningNow = new Date(2026, 10, 12, 9, 0, 0);
    const eightHoursAgo = new Date(morningNow.getTime() - 8 * 60 * 60 * 1000).toISOString();

    const notifyHigh = vi.fn();
    const resHighOld = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async () => [{ id: 'p-1' }],
      getPortfolioNews: async () =>
        makeSampleInbox({ portfolioId: 'p-1', materiality: 'HIGH', publishedAt: eightHoursAgo }),
      claimPendingNewsAlerts: vi.fn(),
      confirmNewsAlertsDelivered: vi.fn(),
      releaseNewsAlertsClaim: vi.fn(),
      notifier: { notifyMaterialNews: notifyHigh },
      prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: true },
      dataDir: makeTempDir(),
      now: morningNow,
    });
    expect(resHighOld.deliveredAlertsCount).toBe(0);
    expect(notifyHigh).not.toHaveBeenCalled();

    const notifyCrit = vi.fn().mockResolvedValue({ status: 'DELIVERED', notificationId: 'n-crit' });
    const confirmCrit = vi.fn().mockResolvedValue({});
    const resCritOld = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async () => [{ id: 'p-1' }],
      getPortfolioNews: async () =>
        makeSampleInbox({ portfolioId: 'p-1', materiality: 'CRITICAL', publishedAt: eightHoursAgo }),
      claimPendingNewsAlerts: async ({ items }) => ({ claimed: items }),
      confirmNewsAlertsDelivered: confirmCrit,
      releaseNewsAlertsClaim: vi.fn(),
      notifier: { notifyMaterialNews: notifyCrit },
      prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: true },
      dataDir: makeTempDir(),
      now: morningNow,
    });
    expect(resCritOld.deliveredAlertsCount).toBe(1);
    expect(notifyCrit).toHaveBeenCalledTimes(1);
    expect(confirmCrit).toHaveBeenCalledTimes(1);
  });

  it('releases claim on notifier failure and redacts secrets in logs/prefs', async () => {
    const morningNow = new Date(2026, 10, 12, 10, 0, 0);
    const releaseNewsAlertsClaim = vi.fn().mockResolvedValue({});
    const confirmNewsAlertsDelivered = vi.fn();
    const dataDir = makeTempDir();

    const deps: ClosedAppMonitorRuntimeDeps = {
      listOwnerPortfolios: async () => [{ id: 'p-1' }],
      getPortfolioNews: async () =>
        makeSampleInbox({
          portfolioId: 'p-1',
          materiality: 'HIGH',
          publishedAt: morningNow.toISOString(),
        }),
      claimPendingNewsAlerts: async ({ items }) => ({ claimed: items }),
      confirmNewsAlertsDelivered,
      releaseNewsAlertsClaim,
      notifier: {
        notifyMaterialNews: async () => ({
          status: 'DELIVERY_FAILED',
          reason: 'Toast service unavailable',
        }),
      },
      prefs: { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES, closedAppNewsMonitoring: true },
      dataDir,
      now: morningNow,
    };

    const res = await runClosedAppNewsMonitorCycle(deps);
    expect(res.deliveredAlertsCount).toBe(0);
    expect(confirmNewsAlertsDelivered).not.toHaveBeenCalled();
    expect(releaseNewsAlertsClaim).toHaveBeenCalledTimes(1);

    const sanitized = sanitizeMonitorText(
      'DATABASE_URL=postgresql://atlas:secret123@127.0.0.1:5434/atlas_local Bearer mytoken123 BRAPI_API_KEY=abc',
    );
    expect(sanitized).not.toContain('secret123');
    expect(sanitized).not.toContain('mytoken123');
    expect(sanitized).not.toContain('abc');

    const serializedPrefs = serializeBackgroundMonitorPrefs(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(serializedPrefs).toContain('"closedAppNewsMonitoring":false');
    expect(serializedPrefs).not.toContain('BRAPI');
  });
});
