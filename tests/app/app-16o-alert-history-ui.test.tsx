import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  MemoryNotificationService,
  DesktopServiceNewsAlertNotifier,
  processPortfolioNewsAlerts,
  setCustomNotificationService,
} from '../../apps/atlas-app/src/features/notifications';
import { DailyNewsDigestSection } from '../../apps/atlas-app/src/features/portfolio/components/DailyNewsDigestSection';
import { AlertHistoryModal } from '../../apps/atlas-app/src/features/portfolio/components/AlertHistoryModal';
import type {
  PortfolioNewsAlertAuditItemDto,
  PortfolioNewsAlertHistoryResponseDto,
  PortfolioNewsInboxResponseDto,
} from '../../apps/atlas-app/src/features/portfolio/types';

const portfolioId = '00000000-0000-4000-8000-000000000002';

function makeCandidate(
  overrides: Partial<NonNullable<PortfolioNewsInboxResponseDto['alertsMeta']>['eligibleEvents'][number]> = {},
) {
  return {
    portfolioId,
    canonicalEventId: overrides.canonicalEventId ?? 'evt_ui_1',
    eventVersionFingerprint: overrides.eventVersionFingerprint ?? 'fp_ui_1',
    alertIdentityKey: 'port:evt_ui_1:fp_ui_1',
    state: overrides.state ?? 'NEW',
    materiality: overrides.materiality ?? 'HIGH',
    ticker: overrides.ticker ?? 'PETR4',
    headline: overrides.headline ?? 'Petrobras aprova pagamento extraordinário',
    materialityReason: overrides.materialityReason ?? 'Dividendo relevante aprovado',
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
      importance: 5,
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
      eventType: 'FACT_RELEVANT',
      assets: [c.ticker],
      primaryTickers: [c.ticker],
      secondaryTickers: [],
      sources: [{ name: c.officialSourceLabel || 'CVM', url: 'https://rad.cvm.gov.br/1' }],
      provider: c.officialSourceLabel || 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      official: c.official,
      freshness: 'BREAKING',
      decayWeight: 1,
      materiality: c.materiality,
      materialityReason: c.materialityReason,
      state: c.state,
      firstSeenAt: '2026-11-11T10:05:00.000Z',
      lastObservedAt: '2026-11-11T10:05:00.000Z',
      lastSeenByUserAt: null,
      eventVersionFingerprint: c.eventVersionFingerprint,
    })),
    totalEvents: candidates.length,
    byAssetCount: { PETR4: candidates.length },
    metrics: {
      breakingCount: candidates.length,
      recentCount: candidates.length,
      officialCount: candidates.length,
      highImportanceCount: candidates.length,
      totalAuditedAssets: 36,
      assetsWithNews: 1,
      assetsWithoutNews: 35,
      officialCoverageCount: 36,
      providerStatus: {
        brapiNewsAvailable: false,
        brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
        officialStatus: 'OFFICIAL_OK',
        fallbackActive: true,
        providersUsed: ['CVM', 'B3_FNET'],
      },
    },
    newsState: {
      initialized: true,
      initializedAt: '2026-11-10T00:00:00.000Z',
      lastRefreshedAt: '2026-11-11T10:05:00.000Z',
      alertsInitializedAt: '2026-11-11T09:00:00.000Z',
      newEventsCount: candidates.length,
      newMaterialEventsCount: candidates.length,
      updatedEventsCount: 0,
      seenEventsCount: 0,
    },
    alertsMeta: {
      baselineInitializedAt: '2026-11-11T09:00:00.000Z',
      pendingEligibleCount: candidates.length,
      eligibleEvents: candidates,
    },
    asOf: '2026-11-11T10:05:00.000Z',
  };
}

describe('PROJECT ATLAS — APP-16O: Alert History UI & Client Coordinator Audit Payload', () => {
  let mockService: MemoryNotificationService;

  beforeEach(() => {
    mockService = new MemoryNotificationService();
    mockService.setMockPermission('granted');
    setCustomNotificationService(mockService);
  });

  it('1. Client coordinator attaches full sanitized audit snapshots on confirm and failure release', async () => {
    const confirmedPayloads: PortfolioNewsAlertAuditItemDto[] = [];
    const releasedPayloads: PortfolioNewsAlertAuditItemDto[] = [];

    const inbox = makeInbox([makeCandidate()]);

    const okDiag = await processPortfolioNewsAlerts({
      portfolioId,
      userId: 'local-owner',
      inbox,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      ports: {
        claimPendingAlerts: async (_pid, items) => items,
        confirmAlertsDelivered: async (_pid, items) => {
          confirmedPayloads.push(...items);
        },
        releaseAlertsClaim: async () => {},
        suppressBaseline: async () => {},
      },
      notifier: new DesktopServiceNewsAlertNotifier(),
    });

    expect(okDiag.notificationStatus).toBe('DELIVERED');
    expect(confirmedPayloads).toHaveLength(1);
    expect(confirmedPayloads[0]!.ticker).toBe('PETR4');
    expect(confirmedPayloads[0]!.deliveryStatus).toBe('DELIVERED');
    expect(confirmedPayloads[0]!.sourceLabelSnapshot).toBe('CVM');
    expect(confirmedPayloads[0]!.alertAttemptId).toBeDefined();

    mockService.setMockPermission('denied');
    const denyDiag = await processPortfolioNewsAlerts({
      portfolioId,
      userId: 'local-owner',
      inbox,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      ports: {
        claimPendingAlerts: async (_pid, items) => items,
        confirmAlertsDelivered: async () => {},
        releaseAlertsClaim: async (_pid, items) => {
          releasedPayloads.push(...items);
        },
        suppressBaseline: async () => {},
      },
      notifier: new DesktopServiceNewsAlertNotifier(),
    });

    expect(denyDiag.notificationStatus).toBe('NOTIFICATIONS_PERMISSION_DENIED');
    expect(releasedPayloads).toHaveLength(1);
    expect(releasedPayloads[0]!.deliveryStatus).toBe('PERMISSION_DENIED');
    expect(releasedPayloads[0]!.failureReason).toBeDefined();
  });

  it('2. BM: AlertHistoryModal renders DELIVERED, FAILED, UPDATED ("Atualização"), CRITICAL, HIGH, official source, batch link, and NO "Reenviar" button', () => {
    const qc = new QueryClient();
    const inbox = makeInbox([makeCandidate()]);
    qc.setQueryData(['portfolio-news', portfolioId], { data: inbox });

    const historyData: PortfolioNewsAlertHistoryResponseDto = {
      historyAvailableSince: '2026-11-11T15:00:00.000Z',
      hasMore: false,
      nextCursor: null,
      metrics: {
        totalCount: 3,
        deliveredCount: 2,
        failedCount: 1,
        criticalCount: 1,
        highCount: 2,
      },
      items: [
        {
          id: 'h1',
          alertAttemptId: 'a1',
          ticker: 'PETR4',
          canonicalEventId: 'evt_petr4',
          eventVersionFingerprint: 'fp_1',
          eventState: 'NEW',
          materiality: 'HIGH',
          alertType: 'MATERIAL_NEW',
          deliveryStatus: 'DELIVERED',
          headline: 'Petrobras anuncia pagamento de dividendo extraordinário',
          materialityReason: 'Provento relevante confirmado',
          sourceLabel: 'CVM',
          notificationId: 'notif_1',
          batchEventCount: 1,
          batchTickers: ['PETR4'],
          claimedAt: '2026-11-11T15:30:00.000Z',
          attemptedAt: '2026-11-11T15:32:00.000Z',
          deliveredAt: '2026-11-11T15:32:00.000Z',
          failureReason: null,
        },
        {
          id: 'h2',
          alertAttemptId: 'a2',
          ticker: 'VALE3',
          canonicalEventId: 'evt_vale3',
          eventVersionFingerprint: 'fp_2',
          eventState: 'UPDATED',
          materiality: 'CRITICAL',
          alertType: 'CRITICAL_UPDATE',
          deliveryStatus: 'DELIVERY_FAILED',
          headline: 'Vale publica retificação crítica de operação',
          materialityReason: 'Impacto operacional crítico',
          sourceLabel: 'B3 / FNET',
          notificationId: null,
          batchEventCount: 5,
          batchTickers: ['VALE3', 'PETR4', 'ITUB4', 'BBAS3', 'WEGE3'],
          claimedAt: '2026-11-11T15:20:00.000Z',
          attemptedAt: '2026-11-11T15:21:00.000Z',
          deliveredAt: null,
          failureReason: 'COM notification timeout',
        },
      ],
    };

    qc.setQueryData(
      [
        'portfolio-news-alert-history',
        portfolioId,
        20,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      { data: historyData },
    );

    const digestHtml = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(digestHtml).toContain('Histórico de alertas');

    const modalHtml = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AlertHistoryModal portfolioId={portfolioId} isOpen={true} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(modalHtml).toContain('Histórico de alertas');
    expect(modalHtml).toContain('Histórico disponível a partir de');
    expect(modalHtml).toContain('PETR4');
    expect(modalHtml).toContain('Nova notícia de alta relevância');
    expect(modalHtml).toContain('DELIVERED');
    expect(modalHtml).toContain('Fonte: CVM');
    expect(modalHtml).toContain('VALE3');
    expect(modalHtml).toContain('Atualização crítica');
    expect(modalHtml).toContain('CRITICAL');
    expect(modalHtml).toContain('HIGH');
    expect(modalHtml).toContain('Falha ao entregar');
    expect(modalHtml).toContain('COM notification timeout');
    expect(modalHtml).toContain('Vínculo em lote (5 eventos)');
    expect(modalHtml).not.toContain('Reenviar');
  });
});
