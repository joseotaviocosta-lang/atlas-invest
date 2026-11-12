import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OPPORTUNITY_MODEL_VERSION } from '../../packages/market-data/src/opportunity-radar/types';
import {
  ALLOWED_NEWS_MONITORING_INTERVALS,
  clearNotificationPreferences,
  clearPortfolioNewsMonitoringState,
  computeOfflineBackoffMs,
  DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  derivePortfolioNewsMonitoringStatus,
  DesktopServiceNewsAlertNotifier,
  getNotificationPreferences,
  isInQuietHours,
  MemoryNotificationService,
  NotificationSettingsSection,
  normalizeNewsMonitoringIntervalMinutes,
  PortfolioNewsMonitoringCoordinator,
  processPortfolioNewsAlerts,
  saveNotificationPreferences,
  setCustomNotificationService,
  type NewsAlertCoordinatorPorts,
  type NewsRefreshSource,
} from '../../apps/atlas-app/src/features/notifications';
import { DailyNewsDigestSection } from '../../apps/atlas-app/src/features/portfolio/components/DailyNewsDigestSection';
import { generateSanitizedDiagnostics } from '../../apps/atlas-app/src/lib/diagnostics';
import type { PortfolioNewsInboxResponseDto } from '../../apps/atlas-app/src/features/portfolio/types';

interface ScheduledTimer {
  id: number;
  runAtMs: number;
  fn: () => void;
  cleared: boolean;
}

class VirtualClockHarness {
  public nowMs: number;
  private nextId = 1;
  private timers: ScheduledTimer[] = [];

  constructor(initialDate: Date = new Date(2026, 10, 11, 14, 0, 0, 0)) {
    this.nowMs = initialDate.getTime();
  }

  public readonly adapter = {
    now: () => this.nowMs,
    setTimeout: (fn: () => void, delayMs: number): number => {
      const id = this.nextId++;
      this.timers.push({
        id,
        runAtMs: this.nowMs + Math.max(0, delayMs),
        fn,
        cleared: false,
      });
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      const target = this.timers.find((t) => t.id === handle);
      if (target) {
        target.cleared = true;
      }
    },
  };

  public activeTimers(): ScheduledTimer[] {
    return this.timers.filter((t) => !t.cleared);
  }

  public async advanceByMinutes(minutes: number): Promise<void> {
    await this.advanceTo(this.nowMs + minutes * 60 * 1000);
  }

  public async advanceTo(targetMs: number): Promise<void> {
    while (true) {
      const due = this.timers
        .filter((t) => !t.cleared && t.runAtMs <= targetMs)
        .sort((a, b) => a.runAtMs - b.runAtMs || a.id - b.id);
      if (due.length === 0) break;
      const next = due[0]!;
      next.cleared = true;
      this.nowMs = next.runAtMs;
      next.fn();
      await flushMicrotasks();
    }
    this.nowMs = targetMs;
    await flushMicrotasks();
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

function makeCandidate(
  overrides: Partial<NonNullable<PortfolioNewsInboxResponseDto['alertsMeta']>['eligibleEvents'][number]> = {},
) {
  return {
    portfolioId: '00000000-0000-4000-8000-000000000002',
    canonicalEventId: overrides.canonicalEventId ?? 'evt_16p_1',
    eventVersionFingerprint: overrides.eventVersionFingerprint ?? 'fp_16p_1',
    alertIdentityKey: 'port:evt_16p_1:fp_16p_1',
    state: overrides.state ?? 'NEW',
    materiality: overrides.materiality ?? 'HIGH',
    ticker: overrides.ticker ?? 'PETR4',
    headline: overrides.headline ?? 'Petrobras divulga fato relevante relevante',
    materialityReason: overrides.materialityReason ?? 'Fato relevante divulgado na CVM',
    official: overrides.official ?? true,
    officialSourceLabel: overrides.officialSourceLabel ?? 'CVM',
    publishedAt: overrides.publishedAt ?? '2026-11-11T16:30:00.000Z',
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
      sources: [{ name: c.officialSourceLabel || 'CVM', url: 'https://rad.cvm.gov.br/1' }],
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
      firstSeenAt: c.publishedAt,
      lastObservedAt: c.publishedAt,
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
        fallbackActive: false,
        providersUsed: ['CVM / B3 Regulatório Oficial'],
      },
    },
    newsState: {
      initialized: true,
      lastRefreshedAt: '2026-11-11T17:00:00.000Z',
      lastSeenAt: null,
      alertsInitializedAt: '2026-11-11T10:00:00.000Z',
      newEventsCount: candidates.filter((c) => c.state === 'NEW').length,
      newMaterialEventsCount: candidates.length,
      updatedEventsCount: candidates.filter((c) => c.state === 'UPDATED').length,
      seenEventsCount: 0,
      unchangedEventsCount: 0,
      totalTrackedEvents: candidates.length,
    },
    alertsMeta: {
      baselineInitializedAt: '2026-11-11T10:00:00.000Z',
      pendingEligibleCount: candidates.length,
      eligibleEvents: candidates,
    },
    asOf: '2026-11-11T17:00:00.000Z',
  };
}

describe('PROJECT ATLAS — APP-16P: In-App Automatic News Monitoring & Quiet Hours', () => {
  const userId = 'user-16p';
  const portfolioA = '00000000-0000-4000-8000-000000000002';
  const portfolioB = '00000000-0000-4000-8000-000000000009';
  let memoryService: MemoryNotificationService;

  beforeEach(() => {
    memoryService = new MemoryNotificationService();
    memoryService.setMockPermission('granted');
    setCustomNotificationService(memoryService);
    clearNotificationPreferences(userId);
    clearPortfolioNewsMonitoringState(userId);
  });

  it('BS & AU & PARTES C/D/E: keeps opportunity-v2.3.1, defaults ON/30min, and rejects aggressive sub-15m intervals', () => {
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');
    expect(DEFAULT_NOTIFICATION_PREFERENCES.automaticNewsMonitoring).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.newsMonitoringIntervalMinutes).toBe(30);
    expect(DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES).toBe(30);
    expect(ALLOWED_NEWS_MONITORING_INTERVALS).toEqual([15, 30, 60]);

    expect(normalizeNewsMonitoringIntervalMinutes(15)).toBe(15);
    expect(normalizeNewsMonitoringIntervalMinutes(30)).toBe(30);
    expect(normalizeNewsMonitoringIntervalMinutes(60)).toBe(60);
    expect(normalizeNewsMonitoringIntervalMinutes(1)).toBe(30);
    expect(normalizeNewsMonitoringIntervalMinutes(5)).toBe(30);
    expect(normalizeNewsMonitoringIntervalMinutes(0)).toBe(30);
    expect(normalizeNewsMonitoringIntervalMinutes(-10)).toBe(30);
    expect(normalizeNewsMonitoringIntervalMinutes(45)).toBe(30);
    expect(normalizeNewsMonitoringIntervalMinutes('invalid')).toBe(30);

    const saved = saveNotificationPreferences(userId, {
      newsMonitoringIntervalMinutes: 1 as unknown as 30,
    });
    expect(saved.newsMonitoringIntervalMinutes).toBe(30);
    expect(getNotificationPreferences(userId).newsMonitoringIntervalMinutes).toBe(30);
  });

  it('AY & AZ: with 30 min interval, runs 0 refreshes at 29 min and 1 refresh at 30 min', async () => {
    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 14, 0, 0));
    const triggers: Array<{ portfolioId: string; source: NewsRefreshSource; atMs: number }> = [];

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: false,
      onRefreshPortfolioNews: async (pId, source) => {
        triggers.push({ portfolioId: pId, source, atMs: clock.nowMs });
      },
    });

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      isOnline: true,
    });

    await clock.advanceByMinutes(29);
    expect(triggers).toHaveLength(0);

    await clock.advanceByMinutes(1);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.source).toBe('AUTOMATIC_INTERVAL');
    expect(coordinator.getDiagnostics().lastSuccessfulAutomaticRefreshAt).not.toBeNull();
    expect(coordinator.getDiagnostics().automaticCyclesCompleted).toBe(1);

    coordinator.dispose();
  });

  it('BA: manual refresh at 20 min resets next automatic cycle to 20 + 30 = 50 min', async () => {
    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 14, 0, 0));
    const triggers: NewsRefreshSource[] = [];

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: false,
      onRefreshPortfolioNews: async (_pId, source) => {
        triggers.push(source);
      },
    });

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      isOnline: true,
    });

    await clock.advanceByMinutes(20);
    expect(triggers).toEqual([]);

    await coordinator.refreshNow('MANUAL');
    expect(triggers).toEqual(['MANUAL']);

    // At 30 min (original deadline), 0 new automatic cycle should run
    await clock.advanceByMinutes(10);
    expect(triggers).toEqual(['MANUAL']);

    // At 49 min total, still 0 automatic refresh
    await clock.advanceByMinutes(19);
    expect(triggers).toEqual(['MANUAL']);

    // At 50 min total (20 + 30), 1st automatic cycle runs
    await clock.advanceByMinutes(1);
    expect(triggers).toEqual(['MANUAL', 'AUTOMATIC_INTERVAL']);

    coordinator.dispose();
  });

  it('BB & AP: prevents overlapping refreshes when in-flight request exceeds interval/timer tick', async () => {
    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 14, 0, 0));
    let callCount = 0;
    let releasePending!: () => void;

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: false,
      onRefreshPortfolioNews: async () => {
        callCount += 1;
        await new Promise<void>((resolve) => {
          releasePending = resolve;
        });
      },
    });

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      isOnline: true,
    });

    // Advance 30 min so automatic refresh begins and stays in-flight
    await clock.advanceByMinutes(30);
    expect(callCount).toBe(1);
    expect(coordinator.getDiagnostics().inFlight).toBe(true);

    // Advance 2 min while still in-flight & fire manual + resume + automatic attempts -> all skip/coalesce
    await clock.advanceByMinutes(2);
    const autoSkipped = await coordinator.refreshNow('AUTOMATIC_INTERVAL');
    expect(autoSkipped).toBe(false);
    expect(coordinator.handleForegroundResume()).toBe(false);
    expect(callCount).toBe(1);
    expect(coordinator.getDiagnostics().overlapSkips).toBeGreaterThanOrEqual(2);

    releasePending();
    await flushMicrotasks();
    expect(coordinator.getDiagnostics().inFlight).toBe(false);
    expect(callCount).toBe(1);

    coordinator.dispose();
  });

  it('BC: when automaticNewsMonitoring is OFF, 0 automatic refreshes execute while manual refresh stays functional', async () => {
    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 14, 0, 0));
    const triggers: NewsRefreshSource[] = [];

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: false,
      onRefreshPortfolioNews: async (_pId, source) => {
        triggers.push(source);
      },
    });

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, automaticNewsMonitoring: false },
      isOnline: true,
    });

    expect(coordinator.getDiagnostics().status).toBe('DISABLED');
    expect(coordinator.getActiveTimerCount()).toBe(0);

    await clock.advanceByMinutes(180);
    expect(triggers).toEqual([]);

    await coordinator.refreshNow('MANUAL');
    expect(triggers).toEqual(['MANUAL']);

    coordinator.dispose();
  });

  it('BD & BE & BO: isolates portfolio switches, cancels timer on logout/dispose, and keeps strictly 1 timer across 20 rerenders', async () => {
    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 14, 0, 0));
    const refreshedPortfolios: string[] = [];

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: true,
      onRefreshPortfolioNews: async (pId) => {
        refreshedPortfolios.push(pId);
      },
    });

    // Simulate 20 repeated React renders / updateContext calls on portfolio A
    for (let i = 0; i < 20; i++) {
      coordinator.updateContext({
        isAuthenticated: true,
        userId,
        portfolioId: portfolioA,
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
        isOnline: true,
      });
    }
    expect(coordinator.getActiveTimerCount()).toBe(1);
    expect(clock.activeTimers()).toHaveLength(1);

    // Trigger cycle on portfolio A
    await clock.advanceByMinutes(30);
    expect(refreshedPortfolios).toEqual([portfolioA]);
    const portALastSuccess = coordinator.getDiagnostics().lastSuccessAt;
    expect(portALastSuccess).not.toBeNull();

    // Switch to portfolio B: must cancel A timer and start fresh isolated state for B
    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioB,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      isOnline: true,
    });
    expect(coordinator.getActiveTimerCount()).toBe(1);
    expect(clock.activeTimers()).toHaveLength(1);
    expect(coordinator.getDiagnostics().portfolioId).toBe(portfolioB);
    expect(coordinator.getDiagnostics().lastSuccessAt).toBeNull();

    await clock.advanceByMinutes(30);
    expect(refreshedPortfolios).toEqual([portfolioA, portfolioB]);

    // Logout: cancels timer completely and stops all automatic activity
    coordinator.updateContext({
      isAuthenticated: false,
      userId: null,
      portfolioId: null,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      isOnline: true,
    });
    expect(coordinator.getActiveTimerCount()).toBe(0);
    expect(clock.activeTimers()).toHaveLength(0);
    expect(coordinator.getDiagnostics().status).toBe('PAUSED_NO_PORTFOLIO');

    await clock.advanceByMinutes(120);
    expect(refreshedPortfolios).toEqual([portfolioA, portfolioB]);

    // Dispose / close window
    coordinator.dispose();
    expect(await coordinator.refreshNow('MANUAL')).toBe(false);
  });

  it('AX & BG & BF & BH & BI & BJ: enforces cross-midnight quiet hours (22:00-08:00), continues refresh, suppresses CRITICAL+HIGH during quiet hours, and avoids flood at 08:00', async () => {
    const qPrefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    };

    // AX & BG checks across midnight boundary
    expect(isInQuietHours(qPrefs, new Date(2026, 10, 11, 23, 30, 0))).toBe(true);
    expect(isInQuietHours(qPrefs, new Date(2026, 10, 12, 2, 0, 0))).toBe(true);
    expect(isInQuietHours(qPrefs, new Date(2026, 10, 12, 7, 59, 0))).toBe(true);
    expect(isInQuietHours(qPrefs, new Date(2026, 10, 12, 8, 0, 0))).toBe(false);

    // Status during 23:00 is PAUSED_QUIET_HOURS while monitoring refresh keeps running
    const nightStatus = derivePortfolioNewsMonitoringStatus({
      isAuthenticated: true,
      portfolioId: portfolioA,
      preferences: qPrefs,
      isOnline: true,
      nowMs: new Date(2026, 10, 11, 23, 0, 0).getTime(),
    });
    expect(nightStatus).toBe('PAUSED_QUIET_HOURS');

    const claimedKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> = [];
    const confirmedKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> = [];
    const suppressedKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> = [];

    const mockPorts: NewsAlertCoordinatorPorts = {
      claimPendingAlerts: async (_p, items) => {
        claimedKeys.push(...items);
        return items;
      },
      confirmAlertsDelivered: async (_p, items) => {
        confirmedKeys.push(
          ...items.map((i) => ({
            canonicalEventId: i.canonicalEventId,
            eventVersionFingerprint: i.eventVersionFingerprint,
          })),
        );
      },
      releaseAlertsClaim: async () => {},
      suppressBaseline: async (_p, items) => {
        suppressedKeys.push(...items);
      },
    };

    // BF & BH & BI: At 23:00, both CRITICAL and HIGH are suppressed during quiet hours (zero bypass, zero claim, zero fake history)
    const nightAt23 = new Date(2026, 10, 11, 23, 0, 0);
    const critCandidate = makeCandidate({
      canonicalEventId: 'evt_crit_overnight',
      eventVersionFingerprint: 'fp_crit_1',
      materiality: 'CRITICAL',
      ticker: 'VALE3',
      headline: 'VALE3 suspende operações após decisão judicial',
      publishedAt: new Date(2026, 10, 11, 22, 50, 0).toISOString(),
    });
    const staleHighCandidate = makeCandidate({
      canonicalEventId: 'evt_high_old',
      eventVersionFingerprint: 'fp_high_old',
      materiality: 'HIGH',
      ticker: 'ITUB4',
      headline: 'ITUB4 anuncia emissão antiga de debêntures',
      publishedAt: new Date(2026, 10, 11, 22, 30, 0).toISOString(), // 9h31m old by 08:01
    });

    const quietDiag = await processPortfolioNewsAlerts({
      portfolioId: portfolioA,
      userId,
      inbox: makeInbox([critCandidate, staleHighCandidate]),
      preferences: qPrefs,
      ports: mockPorts,
      notifier: new DesktopServiceNewsAlertNotifier(),
      now: nightAt23,
      enforceQuietHours: true,
    });
    expect(quietDiag.notificationStatus).toBe('SUPPRESSED_QUIET_HOURS');
    expect(quietDiag.deliveredAlerts).toBe(0);
    expect(memoryService.sentNotifications).toHaveLength(0);
    expect(claimedKeys).toHaveLength(0);

    // BJ: After Quiet Hours end at 08:01 next day:
    // - CRITICAL from 22:50 (9h+ old) retains eligibility -> alerted cleanly!
    // - Old HIGH from 22:30 (>6h old) is baseline-suppressed (NO delayed spam!)
    // - 4 recent HIGHs from 05:00-07:30 (<=6h old) batch into ONE summary alert (no flood!)
    const morning0801 = new Date(2026, 10, 12, 8, 1, 0);
    const recentHighs = ['PETR4', 'BBDC4', 'WEGE3', 'MXRF11'].map((ticker, idx) =>
      makeCandidate({
        canonicalEventId: `evt_recent_${idx}`,
        eventVersionFingerprint: `fp_recent_${idx}`,
        materiality: 'HIGH',
        ticker,
        headline: `${ticker} fato relevante recente da madrugada`,
        publishedAt: new Date(2026, 10, 12, 6, idx * 15, 0).toISOString(),
      }),
    );

    const morningDiag = await processPortfolioNewsAlerts({
      portfolioId: portfolioA,
      userId,
      inbox: makeInbox([critCandidate, staleHighCandidate, ...recentHighs]),
      preferences: qPrefs,
      ports: mockPorts,
      notifier: new DesktopServiceNewsAlertNotifier(),
      now: morning0801,
      enforceQuietHours: true,
      deferHighMaxAgeHours: 6,
    });

    expect(morningDiag.notificationStatus).toBe('DELIVERED');
    // Stale HIGH suppressed quietly into baseline
    expect(suppressedKeys.map((k) => k.canonicalEventId)).toEqual(['evt_high_old']);
    // Strictly 2 OS notifications total: 1 individual CRITICAL + 1 BATCH summary for the 4 recent HIGHs (no flood!)
    expect(memoryService.sentNotifications).toHaveLength(2);
    expect(confirmedKeys.map((k) => k.canonicalEventId)).toEqual([
      'evt_crit_overnight',
      'evt_recent_0',
      'evt_recent_1',
      'evt_recent_2',
      'evt_recent_3',
    ]);
  });

  it('BK & BL: offline/provider failure applies 30->60->120 min backoff without crashing, and network recovery executes strictly 1 refresh', async () => {
    expect(computeOfflineBackoffMs(1)).toBe(30 * 60 * 1000);
    expect(computeOfflineBackoffMs(2)).toBe(60 * 60 * 1000);
    expect(computeOfflineBackoffMs(3)).toBe(120 * 60 * 1000);
    expect(computeOfflineBackoffMs(8)).toBe(120 * 60 * 1000);

    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 14, 0, 0));
    let failNext = true;
    const attempts: NewsRefreshSource[] = [];

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: false,
      onRefreshPortfolioNews: async (_pId, source) => {
        attempts.push(source);
        if (failNext) {
          throw new Error('Network unavailable Bearer secret_abc_123');
        }
      },
    });

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, newsMonitoringIntervalMinutes: 15 },
      isOnline: true,
    });

    // Cycle 1 at +15m fails -> failure #1 schedules backoff +30m, sanitizing error
    await clock.advanceByMinutes(15);
    expect(attempts).toEqual(['AUTOMATIC_INTERVAL']);
    let diag = coordinator.getDiagnostics();
    expect(diag.status).toBe('PAUSED_OFFLINE');
    expect(diag.consecutiveFailures).toBe(1);
    expect(diag.networkFailures).toBe(1);
    expect(diag.lastError).not.toContain('secret_abc_123');

    // At +29m after failure (15 + 29 = 44m), backoff 30m has NOT fired yet
    await clock.advanceByMinutes(29);
    expect(attempts).toHaveLength(1);

    // At +30m after failure, failure #2 schedules backoff +60m
    await clock.advanceByMinutes(1);
    expect(attempts).toHaveLength(2);
    expect(coordinator.getDiagnostics().consecutiveFailures).toBe(2);

    // Go offline then recover back online -> triggers strictly 1 RECOVERY refresh!
    failNext = false;
    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, newsMonitoringIntervalMinutes: 15 },
      isOnline: false,
    });
    expect(coordinator.getDiagnostics().status).toBe('PAUSED_OFFLINE');
    expect(coordinator.getActiveTimerCount()).toBe(0);

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, newsMonitoringIntervalMinutes: 15 },
      isOnline: true,
    });
    await flushMicrotasks();

    expect(attempts).toEqual(['AUTOMATIC_INTERVAL', 'AUTOMATIC_INTERVAL', 'RECOVERY']);
    diag = coordinator.getDiagnostics();
    expect(diag.status).toBe('ENABLED');
    expect(diag.consecutiveFailures).toBe(0);
    expect(diag.backoffUntilAt).toBeNull();

    coordinator.dispose();
  });

  it('BM & BN: continues periodic cycle while minimized and executes immediate FOREGROUND_RESUME when stale (> interval)', async () => {
    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 14, 0, 0));
    const triggers: NewsRefreshSource[] = [];

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: false,
      onRefreshPortfolioNews: async (_pId, source) => {
        triggers.push(source);
      },
    });

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, quietHoursEnabled: false, newsMonitoringIntervalMinutes: 30 },
      isOnline: true,
    });

    // BM: While window is minimized (isForeground=false in UI lifecycle), coordinator timer keeps active
    await clock.advanceByMinutes(30);
    expect(triggers).toEqual(['AUTOMATIC_INTERVAL']);

    // Returning to foreground at +10m (< 30m) must NOT fire extra refresh
    clock.nowMs += 10 * 60 * 1000;
    expect(coordinator.handleForegroundResume()).toBe(false);
    expect(triggers).toEqual(['AUTOMATIC_INTERVAL']);

    // Simulate system sleep / stale gap of +35m beyond lastSuccessAt without timer having fired yet -> foreground resume refreshes immediately
    clock.nowMs += 35 * 60 * 1000;
    expect(coordinator.handleForegroundResume()).toBe(true);
    await flushMicrotasks();
    expect(triggers).toEqual(['AUTOMATIC_INTERVAL', 'FOREGROUND_RESUME']);

    coordinator.dispose();
  });

  it('BP & BQ & BR & AA/AB/AC/CO/CN: integrates automatic cycle with APP-16N/16O dedupe, UI copy, and sanitized diagnostics', async () => {
    const clock = new VirtualClockHarness(new Date(2026, 10, 11, 16, 40, 0));
    const deliveredSet = new Set<string>();
    const historyLog: Array<{ canonicalEventId: string; fp: string; attemptId?: string }> = [];

    const ports: NewsAlertCoordinatorPorts = {
      claimPendingAlerts: async (_p, items) =>
        items.filter((i) => !deliveredSet.has(`${i.canonicalEventId}::${i.eventVersionFingerprint}`)),
      confirmAlertsDelivered: async (_p, items, meta) => {
        for (const i of items) {
          deliveredSet.add(`${i.canonicalEventId}::${i.eventVersionFingerprint}`);
          historyLog.push({
            canonicalEventId: i.canonicalEventId,
            fp: i.eventVersionFingerprint,
            attemptId: meta?.alertAttemptId,
          });
        }
      },
      releaseAlertsClaim: async () => {},
      suppressBaseline: async () => {},
    };

    const inboxV1 = makeInbox([
      makeCandidate({
        canonicalEventId: 'evt_auto_1',
        eventVersionFingerprint: 'fp_auto_v1',
        ticker: 'PETR4',
        materiality: 'HIGH',
        publishedAt: new Date(clock.nowMs - 10 * 60 * 1000).toISOString(),
      }),
    ]);

    const coordinator = new PortfolioNewsMonitoringCoordinator({
      timer: clock.adapter,
      persistState: false,
      onRefreshPortfolioNews: async (pId) => {
        await processPortfolioNewsAlerts({
          portfolioId: pId,
          userId,
          inbox: inboxV1,
          preferences: DEFAULT_NOTIFICATION_PREFERENCES,
          ports,
          notifier: new DesktopServiceNewsAlertNotifier(),
          now: clock.nowMs,
          enforceQuietHours: true,
        });
      },
    });

    coordinator.updateContext({
      isAuthenticated: true,
      userId,
      portfolioId: portfolioA,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, quietHoursEnabled: false },
      isOnline: true,
    });

    // Cycle 1: delivers alert & writes history APP-16O
    await clock.advanceByMinutes(30);
    expect(memoryService.sentNotifications).toHaveLength(1);
    expect(historyLog).toHaveLength(1);

    // Cycle 2: same eventVersionFingerprint -> 0 duplicate alerts & 0 extra history
    await clock.advanceByMinutes(30);
    expect(memoryService.sentNotifications).toHaveLength(1);
    expect(historyLog).toHaveLength(1);

    // CN: Verify sanitized diagnostics payload
    const sanitizedPkg = generateSanitizedDiagnostics({
      isAuthenticated: true,
      hasActivePortfolio: true,
      newsMonitoring: coordinator.getDiagnostics(),
    });
    expect(sanitizedPkg.newsMonitoring?.monitoringEnabled).toBe(true);
    expect(sanitizedPkg.newsMonitoring?.intervalMinutes).toBe(30);
    expect(sanitizedPkg.newsMonitoring?.lastTrigger).toBe('AUTOMATIC_INTERVAL');
    expect(sanitizedPkg.newsMonitoring?.lastAttemptAt).not.toBeNull();
    expect(sanitizedPkg.newsMonitoring?.lastSuccessAt).not.toBeNull();
    expect(sanitizedPkg.newsMonitoring?.nextScheduledAt).not.toBeNull();

    // AA, AB, CO: Verify NotificationSettingsSection renders monitoring controls & exact non-24h copy
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const settingsHtml = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <NotificationSettingsSection />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(settingsHtml).toContain('Monitoramento automático de notícias');
    expect(settingsHtml).toContain('Frequência');
    expect(settingsHtml).toContain('15 min');
    expect(settingsHtml).toContain('30 min');
    expect(settingsHtml).toContain('60 min');
    expect(settingsHtml).toContain(
      'O Atlas monitora automaticamente enquanto o aplicativo está aberto ou minimizado.',
    );
    expect(settingsHtml).toContain(
      'Durante o horário silencioso, o Atlas continua monitorando, mas não exibe alertas sonoros do sistema.',
    );
    expect(settingsHtml).not.toContain('24h por dia');

    // AC: Verify DailyNewsDigestSection renders discreet status pill
    qc.setQueryData(['portfolio-news', portfolioA], { data: inboxV1 });
    const digestHtml = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DailyNewsDigestSection portfolioId={portfolioA} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(digestHtml).toContain('Monitoramento automático ativo • a cada 30 min');

    coordinator.dispose();
  });
});
