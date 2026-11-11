import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  MemoryNotificationService,
  DesktopServiceNewsAlertNotifier,
  processPortfolioNewsAlerts,
  setCustomNotificationService,
  notificationCenter,
  purgeUserNotifications,
  clearNotificationPreferences,
  NotificationSettingsSection,
} from '../../apps/atlas-app/src/features/notifications';
import { DailyNewsDigestSection } from '../../apps/atlas-app/src/features/portfolio/components/DailyNewsDigestSection';
import type { PortfolioNewsInboxResponseDto } from '../../apps/atlas-app/src/features/portfolio/types';

function makeCandidate(overrides: Partial<NonNullable<PortfolioNewsInboxResponseDto['alertsMeta']>['eligibleEvents'][number]> = {}) {
  return {
    portfolioId: '00000000-0000-4000-8000-000000000002',
    canonicalEventId: overrides.canonicalEventId ?? 'evt_1',
    eventVersionFingerprint: overrides.eventVersionFingerprint ?? 'fp_1',
    alertIdentityKey: overrides.alertIdentityKey ?? 'port:evt_1:fp_1',
    state: overrides.state ?? 'NEW',
    materiality: overrides.materiality ?? 'HIGH',
    ticker: overrides.ticker ?? 'PETR4',
    headline: overrides.headline ?? 'Petrobras aprova pagamento de provento relevante',
    materialityReason: overrides.materialityReason ?? 'Provento relevante aprovado',
    official: overrides.official ?? true,
    officialSourceLabel: overrides.officialSourceLabel ?? 'CVM',
    publishedAt: overrides.publishedAt ?? '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

function makeInbox(candidates: ReturnType<typeof makeCandidate>[]): PortfolioNewsInboxResponseDto {
  return {
    events: candidates.map((c) => ({
      id: c.canonicalEventId,
      canonicalEventId: c.canonicalEventId,
      headline: c.headline,
      summary: c.headline,
      publishedAt: c.publishedAt,
      importance: c.materiality === 'CRITICAL' ? 5 : 4,
      sentiment: 'POSITIVE',
      sentimentScore: 0.7,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
      eventType: 'FACT_RELEVANT',
      assets: [c.ticker],
      primaryTickers: [c.ticker],
      secondaryTickers: [],
      sources: [{ name: c.officialSourceLabel || 'InfoMoney', url: 'https://rad.cvm.gov.br/1' }],
      provider: c.official ? 'CVM' : 'GOOGLE_NEWS',
      sourceType: c.official ? 'OFFICIAL_REGULATORY' : 'TRUSTED_FINANCIAL_MEDIA',
      official: c.official,
      freshness: 'BREAKING',
      decayWeight: 1,
      materiality: c.materiality,
      materialityScore: c.materiality === 'CRITICAL' ? 95 : 80,
      materialityReason: c.materialityReason,
      state: c.state,
      isNew: c.state === 'NEW',
      isUpdated: c.state === 'UPDATED',
      isSeen: false,
      firstSeenAt: '2026-11-11T10:05:00.000Z',
      lastObservedAt: '2026-11-11T10:05:00.000Z',
      eventVersionFingerprint: c.eventVersionFingerprint,
    })),
    totalEvents: candidates.length,
    byAssetCount: {},
    metrics: {
      breakingCount: candidates.length,
      recentCount: candidates.length,
      officialCount: candidates.filter((c) => c.official).length,
      highImportanceCount: candidates.length,
      materialCount: candidates.length,
      newEventsCount: candidates.filter((c) => c.state === 'NEW').length,
      newMaterialEventsCount: candidates.length,
      updatedEventsCount: candidates.filter((c) => c.state === 'UPDATED').length,
      seenEventsCount: 0,
      totalAuditedAssets: 36,
      assetsWithNews: 1,
      assetsWithoutNews: 35,
      providerStatus: {
        brapiNewsAvailable: false,
        brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
        officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
        fallbackActive: true,
        providersUsed: ['CVM / B3 Regulatório Oficial'],
      },
    },
    newsState: {
      initialized: true,
      initializedAt: '2026-11-10T00:00:00.000Z',
      lastRefreshedAt: '2026-11-11T10:05:00.000Z',
      alertsInitializedAt: '2026-11-10T00:00:00.000Z',
      newEventsCount: candidates.filter((c) => c.state === 'NEW').length,
      newMaterialEventsCount: candidates.length,
      updatedEventsCount: candidates.filter((c) => c.state === 'UPDATED').length,
      seenEventsCount: 0,
    },
    alertsMeta: {
      baselineInitializedAt: '2026-11-10T00:00:00.000Z',
      pendingEligibleCount: candidates.length,
      eligibleEvents: candidates,
    },
    asOf: '2026-11-11T10:05:00.000Z',
  };
}

describe('PROJECT ATLAS — APP-16N: Desktop Material News Alerts Coordinator & UI', () => {
  let mockService: MemoryNotificationService;
  const portfolioId = '00000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = new MemoryNotificationService();
    mockService.setMockPermission('granted');
    setCustomNotificationService(mockService);
    purgeUserNotifications('local-owner');
    clearNotificationPreferences('local-owner');
    notificationCenter.clearHistory('local-owner');
  });

  afterEach(() => {
    setCustomNotificationService(null);
    vi.restoreAllMocks();
  });

  it('1. Preferences default ON for desktop local owner with HIGH_AND_CRITICAL threshold & toggle renders in Settings', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.materialNewsAlerts).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.materialNewsThreshold).toBe('HIGH_AND_CRITICAL');

    const html = renderToString(
      <MemoryRouter>
        <NotificationSettingsSection />
      </MemoryRouter>,
    );
    expect(html).toContain('Alertas de notícias relevantes');
  });

  it('2. Delivers OS notification cleanly, persists delivered version, and never renders an "ALERTADO" badge in UI', async () => {
    const inbox = makeInbox([makeCandidate()]);
    const confirmed: string[] = [];

    const diag = await processPortfolioNewsAlerts({
      portfolioId,
      userId: 'local-owner',
      inbox,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      ports: {
        claimPendingAlerts: async (_pid, items) => items,
        confirmAlertsDelivered: async (_pid, items) => {
          confirmed.push(...items.map((i) => i.canonicalEventId));
        },
        releaseAlertsClaim: async () => {},
        suppressBaseline: async () => {},
      },
      notifier: new DesktopServiceNewsAlertNotifier(),
    });

    expect(diag.notificationStatus).toBe('DELIVERED');
    expect(diag.deliveredAlerts).toBe(1);
    expect(confirmed).toEqual(['evt_1']);
    expect(mockService.sentNotifications).toHaveLength(1);
    expect(mockService.sentNotifications[0]!.category).toBe('MATERIAL_NEWS');

    // Verify DailyNewsDigestSection renders honest in-app summary without ALERTADO badge
    const qc = new QueryClient();
    qc.setQueryData(['portfolio-news', portfolioId], { data: inbox });
    const uiHtml = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(uiHtml).toContain('1 nova atualização relevante');
    expect(uiHtml).not.toContain('ALERTADO');
  });

  it('3. Permission denied and unsupported platform fail closed, never confirm delivered, and keep in-app count', async () => {
    const inbox = makeInbox([makeCandidate(), makeCandidate({ canonicalEventId: 'evt_2', ticker: 'VALE3' })]);
    const confirmed: string[] = [];
    const released: string[] = [];

    mockService.setMockPermission('denied');
    const deniedDiag = await processPortfolioNewsAlerts({
      portfolioId,
      userId: 'local-owner',
      inbox,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      ports: {
        claimPendingAlerts: async (_pid, items) => items,
        confirmAlertsDelivered: async (_pid, items) => {
          confirmed.push(...items.map((i) => i.canonicalEventId));
        },
        releaseAlertsClaim: async (_pid, items) => {
          released.push(...items.map((i) => i.canonicalEventId));
        },
        suppressBaseline: async () => {},
      },
      notifier: new DesktopServiceNewsAlertNotifier(),
    });

    expect(deniedDiag.notificationStatus).toBe('NOTIFICATIONS_PERMISSION_DENIED');
    expect(deniedDiag.deliveredAlerts).toBe(0);
    expect(confirmed).toHaveLength(0);
    expect(released).toEqual(['evt_1', 'evt_2']);

    // Unsupported environment fallback
    setCustomNotificationService({
      ...mockService,
      isSupported: () => false,
      requestPermission: async () => 'denied',
      getPermissionState: async () => 'default',
      send: async () => false,
      schedule: async () => false,
      cancel: async () => {},
      cancelAll: async () => {},
    });

    const unsupportedDiag = await processPortfolioNewsAlerts({
      portfolioId,
      userId: 'local-owner',
      inbox,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      ports: {
        claimPendingAlerts: async (_pid, items) => items,
        confirmAlertsDelivered: async (_pid, items) => {
          confirmed.push(...items.map((i) => i.canonicalEventId));
        },
        releaseAlertsClaim: async (_pid, items) => {
          released.push(...items.map((i) => i.canonicalEventId));
        },
        suppressBaseline: async () => {},
      },
    });
    expect(unsupportedDiag.notificationStatus).toBe('NOTIFICATIONS_UNAVAILABLE');
    expect(confirmed).toHaveLength(0);

    // Even without OS permission, DailyNewsDigestSection shows in-app relevant update count
    const qc = new QueryClient();
    qc.setQueryData(['portfolio-news', portfolioId], { data: inbox });
    const uiHtml = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(uiHtml).toContain('2 novas atualizações relevantes');
  });

  it('4. Toggle OFF suppresses OS delivery without clearing NEW state and passes baseline suppression', async () => {
    const inbox = makeInbox([makeCandidate({ materiality: 'CRITICAL' })]);
    const suppressed: string[] = [];

    const diag = await processPortfolioNewsAlerts({
      portfolioId,
      userId: 'local-owner',
      inbox,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, materialNewsAlerts: false },
      ports: {
        claimPendingAlerts: async (_pid, items) => items,
        confirmAlertsDelivered: async () => {},
        releaseAlertsClaim: async () => {},
        suppressBaseline: async (_pid, items) => {
          suppressed.push(...items.map((i) => i.canonicalEventId));
        },
      },
    });

    expect(diag.notificationStatus).toBe('DISABLED');
    expect(diag.deliveredAlerts).toBe(0);
    expect(mockService.sentNotifications).toHaveLength(0);
    expect(suppressed).toEqual(['evt_1']);
  });
});
