import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import type {
  LocalNotification,
  NewsRefreshSource,
  NotificationHistoryItem,
  NotificationPermissionState,
  NotificationPreferences,
  PortfolioNewsMonitoringDiagnostics,
} from './types';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  clearNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES,
} from './preferences';
import {
  clearPortfolioNewsMonitoringState,
  DEFERRED_HIGH_ALERT_MAX_AGE_HOURS,
  PortfolioNewsMonitoringCoordinator,
} from './news-monitoring';
import { notificationCenter } from './notification-center';
import { getNotificationService, TauriNotificationService } from './service';
import {
  evaluateAndScheduleNotifications,
  type NotificationEvaluationContext,
} from './rule-engine';
import { purgeUserNotifications } from './engine';
import { useAuth } from '../../providers/AuthProvider';
import { useAppLifecycle } from '../../hooks/useAppLifecycle';
import { useTaxComplianceTimeline, useCostEvidence, useMonthlyTaxLiability, useTaxInputReadiness } from '../fiscal/hooks';
import { useIntegrationReviews } from '../imports/hooks';
import type { ComplianceObligationItem } from '../fiscal/types';
import { usePortfolio } from '../../providers/PortfolioProvider';
import { portfolioApi } from '../portfolio/api';
import type { PortfolioNewsInboxResponseDto } from '../portfolio/types';
import {
  DesktopServiceNewsAlertNotifier,
  processPortfolioNewsAlerts,
  type NewsAlertCoordinatorPorts,
} from './news-alerts';
import {
  getClosedAppMonitoringStatus,
  repairClosedAppMonitoringTask,
  syncClosedAppMonitoringPreferences,
  type ClosedAppMonitoringDiagnostics,
} from './background-monitoring';

export interface NotificationContextValue {
  permissionState: NotificationPermissionState;
  requestPermission: () => Promise<NotificationPermissionState>;
  preferences: NotificationPreferences;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  history: NotificationHistoryItem[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearHistory: () => void;
  sendTestNotification: (customBody?: string) => Promise<boolean>;
  evaluateNow: () => Promise<void>;
  newsMonitoring: PortfolioNewsMonitoringDiagnostics;
  closedAppMonitoring: ClosedAppMonitoringDiagnostics | null;
  refreshClosedAppMonitoringStatus: () => Promise<void>;
  repairClosedAppMonitoring: () => Promise<void>;
  refreshPortfolioNewsNow: (portfolioId?: string, source?: NewsRefreshSource) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// In-memory pending deep link queue for unauthenticated launches
let pendingDeepLink: string | null = null;

function RouterNavigatorWrapper({
  onNavigateReady,
}: {
  onNavigateReady: (fn: (path: string) => void) => void;
}) {
  const inRouter = useInRouterContext();
  if (!inRouter) return null;
  return <RouterNavigatorInner onNavigateReady={onNavigateReady} />;
}

function RouterNavigatorInner({
  onNavigateReady,
}: {
  onNavigateReady: (fn: (path: string) => void) => void;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    onNavigateReady((path: string) => navigate(path));
  }, [navigate, onNavigateReady]);
  return null;
}

function buildDefaultMonitoringDiagnostics(
  prefs: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
): PortfolioNewsMonitoringDiagnostics {
  return {
    status: 'PAUSED_NO_PORTFOLIO',
    monitoringEnabled: false,
    intervalMinutes: prefs.newsMonitoringIntervalMinutes ?? DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES,
    portfolioId: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastSuccessfulAutomaticRefreshAt: null,
    lastAutomaticRefreshAttemptAt: null,
    nextScheduledAt: null,
    inFlight: false,
    quietHours: {
      enabled: prefs.quietHoursEnabled,
      active: false,
      start: prefs.quietHoursStart,
      end: prefs.quietHoursEnd,
      policy: 'REFRESH_CONTINUES_ALERTS_SUPPRESSED',
      criticalBypassesQuietHours: false,
      highDeferralWindowHours: DEFERRED_HIGH_ALERT_MAX_AGE_HOURS,
    },
    lastTrigger: null,
    consecutiveFailures: 0,
    backoffUntilAt: null,
    lastCycleDurationMs: null,
    lastError: null,
    overlapSkips: 0,
    automaticCyclesCompleted: 0,
    networkFailures: 0,
  };
}

function createNewsAlertApiPorts(): NewsAlertCoordinatorPorts {
  return {
    claimPendingAlerts: async (
      portfolioId: string,
      items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
    ) => {
      const res = await portfolioApi.claimPortfolioNewsAlerts(portfolioId, items);
      return res.data.claimed;
    },
    confirmAlertsDelivered: async (portfolioId, items, meta) => {
      await portfolioApi.confirmPortfolioNewsAlertsDelivered(portfolioId, {
        items,
        alertAttemptId: meta?.alertAttemptId,
        notificationId: meta?.notificationId,
      });
    },
    releaseAlertsClaim: async (portfolioId, items, meta) => {
      await portfolioApi.releasePortfolioNewsAlertsClaim(portfolioId, {
        items,
        deliveryStatus: meta?.deliveryStatus,
        failureReason: meta?.failureReason,
        attemptedAt: meta?.attemptedAt,
        alertAttemptId: meta?.alertAttemptId,
        recordHistory: meta?.recordHistory ?? true,
      });
    },
    suppressBaseline: async (
      portfolioId: string,
      items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
    ) => {
      await portfolioApi.suppressPortfolioNewsAlertsBaseline(portfolioId, items);
    },
  };
}

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const { selectedPortfolio } = usePortfolio();
  const queryClient = useContext(QueryClientContext);
  const processedInboxObjectsRef = useRef<WeakSet<object>>(new WeakSet());
  const quietSuppressedInboxesRef = useRef<WeakSet<object>>(new WeakSet());
  const [navigateFn, setNavigateFn] = useState<((path: string) => void) | null>(null);

  const userId = user?.id || null;
  const activePortfolioId = selectedPortfolio?.id || null;

  const [permissionState, setPermissionState] = useState<NotificationPermissionState>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences>(() =>
    getNotificationPreferences(userId)
  );
  const [newsMonitoring, setNewsMonitoring] = useState<PortfolioNewsMonitoringDiagnostics>(() =>
    buildDefaultMonitoringDiagnostics(getNotificationPreferences(userId))
  );
  const [closedAppMonitoring, setClosedAppMonitoring] =
    useState<ClosedAppMonitoringDiagnostics | null>(null);
  const [history, setHistory] = useState<NotificationHistoryItem[]>(() =>
    notificationCenter.getHistory(userId)
  );

  const latestAuthRef = useRef({ isAuthenticated, userId, activePortfolioId, preferences });
  latestAuthRef.current = { isAuthenticated, userId, activePortfolioId, preferences };
  const monitoringCoordinatorRef = useRef<PortfolioNewsMonitoringCoordinator | null>(null);
  const evaluateCachedInboxRef = useRef<(portfolioId: string) => void>(() => {});

  // Sync preferences and history when active user changes
  useEffect(() => {
    setPreferences(getNotificationPreferences(userId));
    setHistory(notificationCenter.getHistory(userId));
  }, [userId]);

  // Subscribe to Notification Center changes
  useEffect(() => {
    return notificationCenter.subscribe(() => {
      setHistory(notificationCenter.getHistory(userId));
    });
  }, [userId]);

  // Query background models for candidate evaluation
  const { data: rawCompliance } = useTaxComplianceTimeline();
  const complianceTimeline: ComplianceObligationItem[] = useMemo(() => {
    return Array.isArray(rawCompliance) ? (rawCompliance as ComplianceObligationItem[]) : [];
  }, [rawCompliance]);

  const { data: costEvidences } = useCostEvidence(selectedPortfolio?.id);
  const currentCompetence = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);
  const { data: taxLiability } = useMonthlyTaxLiability(currentCompetence);
  const { data: taxInputReadiness } = useTaxInputReadiness(currentCompetence);
  const { data: reviewInbox } = useIntegrationReviews(
    selectedPortfolio?.id ? { portfolioId: selectedPortfolio.id } : undefined
  );

  // Check initial OS permission
  useEffect(() => {
    const service = getNotificationService();
    service.getPermissionState().then((state) => {
      setPermissionState(state);
    });
  }, []);

  // Handle deep link navigation
  const handleDeepLink = useCallback(
    (deepLink?: string) => {
      if (!deepLink) return;
      // Sanitize route
      const target = deepLink.startsWith('/') ? deepLink : `/${deepLink}`;

      if (isAuthenticated) {
        if (navigateFn) {
          navigateFn(target);
        }
      } else {
        // Queue until authentication restore completes
        pendingDeepLink = target;
      }
    },
    [isAuthenticated, navigateFn]
  );

  // Bind deep link action listener
  useEffect(() => {
    const service = getNotificationService();
    if (service instanceof TauriNotificationService) {
      service.onNotificationAction(handleDeepLink);
    }
  }, [handleDeepLink]);

  // If a pending deep link was queued while logging in / restoring, flush it
  useEffect(() => {
    if (isAuthenticated && pendingDeepLink && navigateFn) {
      const target = pendingDeepLink;
      pendingDeepLink = null;
      navigateFn(target);
    }
  }, [isAuthenticated, navigateFn]);

  // Request OS Notification Permission
  const requestPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    const service = getNotificationService();
    const result = await service.requestPermission();
    setPermissionState(result);
    return result;
  }, []);

  // Update and persist user preferences (record activation timestamp on OFF -> ON transition)
  const updatePreferences = useCallback(
    (newPrefs: Partial<NotificationPreferences>) => {
      setPreferences((prev) => {
        const nextMerged: Partial<NotificationPreferences> = { ...newPrefs };
        if (newPrefs.materialNewsAlerts === true && !prev.materialNewsAlerts) {
          nextMerged.materialNewsAlertsActivatedAt = new Date().toISOString();
        }
        return saveNotificationPreferences(userId, nextMerged);
      });
    },
    [userId]
  );

  // Evaluate notification rules over authoritative domain data
  const evaluateNow = useCallback(async () => {
    if (!userId || !isAuthenticated) return;

    const context: NotificationEvaluationContext = {
      userId,
      portfolioId: selectedPortfolio?.id,
      complianceTimeline: complianceTimeline ?? [],
      costEvidences: costEvidences ?? [],
      taxLiability: taxLiability ?? null,
      taxInputReadiness: taxInputReadiness ?? null,
      reviewItems: reviewInbox?.data ?? [],
      preferences,
    };

    await evaluateAndScheduleNotifications(context);
  }, [
    userId,
    isAuthenticated,
    selectedPortfolio?.id,
    complianceTimeline,
    costEvidences,
    taxLiability,
    taxInputReadiness,
    reviewInbox,
    preferences,
  ]);

  // App Lifecycle: Re-evaluate notifications and check stale news monitoring on foreground resume
  const handleForegroundLifecycle = useCallback(() => {
    void evaluateNow();
    monitoringCoordinatorRef.current?.handleForegroundResume();
  }, [evaluateNow]);

  const { isOnline } = useAppLifecycle(handleForegroundLifecycle);

  // Auto-evaluation whenever domain models refresh and are ready
  useEffect(() => {
    if (isAuthenticated && userId) {
      evaluateNow();
    }
  }, [isAuthenticated, userId, complianceTimeline, reviewInbox, evaluateNow]);

  // APP-16P: Single timer owner for in-app automatic portfolio news monitoring (open or minimized)
  useEffect(() => {
    const coordinator = new PortfolioNewsMonitoringCoordinator({
      onRefreshPortfolioNews: async (targetPortfolioId: string) => {
        const res = await portfolioApi.refreshPortfolioNews(targetPortfolioId);
        if (queryClient) {
          queryClient.setQueryData(['portfolio-news', targetPortfolioId], res);
        }
      },
      onQuietHoursEnded: (targetPortfolioId: string) => {
        evaluateCachedInboxRef.current(targetPortfolioId);
      },
      onDiagnosticsChange: (diag) => {
        setNewsMonitoring(diag);
      },
    });
    monitoringCoordinatorRef.current = coordinator;

    const handleBeforeUnload = () => {
      coordinator.dispose();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      coordinator.dispose();
      if (monitoringCoordinatorRef.current === coordinator) {
        monitoringCoordinatorRef.current = null;
      }
    };
  }, [queryClient]);

  const refreshClosedAppMonitoringStatus = useCallback(async () => {
    try {
      const diag = await getClosedAppMonitoringStatus(
        preferences.closedAppNewsMonitoring,
        preferences.newsMonitoringIntervalMinutes,
      );
      if (diag) {
        setClosedAppMonitoring(diag);
      }
    } catch {
      // Non-fatal in non-Tauri environments
    }
  }, [preferences.closedAppNewsMonitoring, preferences.newsMonitoringIntervalMinutes]);

  const repairClosedAppMonitoring = useCallback(async () => {
    try {
      await repairClosedAppMonitoringTask(preferences.newsMonitoringIntervalMinutes);
      await refreshClosedAppMonitoringStatus();
    } catch {
      // Non-fatal
    }
  }, [preferences.newsMonitoringIntervalMinutes, refreshClosedAppMonitoringStatus]);

  // Sync monitoring scheduler when auth, portfolio, preferences, or online status changes
  useEffect(() => {
    const coordinator = monitoringCoordinatorRef.current;
    if (!coordinator) return;
    coordinator.updateContext({
      isAuthenticated,
      userId,
      portfolioId: activePortfolioId,
      preferences,
      isOnline,
    });
  }, [isAuthenticated, userId, activePortfolioId, preferences, isOnline]);

  // APP-16Q: Sync closed-app Windows Task Scheduler opt-in and non-secret prefs
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void syncClosedAppMonitoringPreferences(preferences)
      .then(() => {
        if (!cancelled) {
          return refreshClosedAppMonitoringStatus();
        }
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, preferences, refreshClosedAppMonitoringStatus]);

  // Single refresh path shared by manual refresh button, automatic timer, resume, and recovery
  const refreshPortfolioNewsNow = useCallback(
    async (portfolioIdArg?: string, source: NewsRefreshSource = 'MANUAL') => {
      const targetId = portfolioIdArg || activePortfolioId;
      if (!targetId) return;

      const coordinator = monitoringCoordinatorRef.current;
      if (coordinator && coordinator.getDiagnostics().portfolioId === targetId) {
        await coordinator.refreshNow(source);
        return;
      }

      const res = await portfolioApi.refreshPortfolioNews(targetId);
      if (queryClient) {
        queryClient.setQueryData(['portfolio-news', targetId], res);
      }
    },
    [activePortfolioId, queryClient],
  );

  // APP-16N / APP-16O / APP-16P: Evaluate material news alerts with Quiet Hours awareness
  useEffect(() => {
    if (!queryClient || !isAuthenticated || !userId) return;

    const apiPorts = createNewsAlertApiPorts();

    const handleInbox = (portfolioId: string, payload: unknown, forceReevaluateQuiet = false) => {
      if (!payload || typeof payload !== 'object') return;
      const inbox = (payload as { data?: PortfolioNewsInboxResponseDto }).data;
      if (!inbox || !inbox.alertsMeta || inbox.alertsMeta.eligibleEvents.length === 0) return;
      if (processedInboxObjectsRef.current.has(inbox)) return;
      if (!forceReevaluateQuiet && quietSuppressedInboxesRef.current.has(inbox)) return;

      void processPortfolioNewsAlerts({
        portfolioId,
        userId,
        inbox,
        preferences,
        ports: apiPorts,
        notifier: new DesktopServiceNewsAlertNotifier(),
        enforceQuietHours: true,
        deferHighMaxAgeHours: DEFERRED_HIGH_ALERT_MAX_AGE_HOURS,
        now: Date.now(),
      })
        .then((diag) => {
          if (diag.notificationStatus === 'SUPPRESSED_QUIET_HOURS') {
            quietSuppressedInboxesRef.current.add(inbox);
          } else {
            processedInboxObjectsRef.current.add(inbox);
          }
          if (diag.eligibleAlerts > 0 && diag.notificationStatus !== 'SUPPRESSED_QUIET_HOURS') {
            void queryClient.invalidateQueries({
              queryKey: ['portfolio-news-alert-history', portfolioId],
            });
          }
        })
        .catch(() => {
          // Non-blocking: alert delivery issues must never disrupt news inbox or refresh UX
        });
    };

    evaluateCachedInboxRef.current = (targetPortfolioId: string) => {
      const cached = queryClient.getQueryData(['portfolio-news', targetPortfolioId]);
      if (cached) {
        handleInbox(targetPortfolioId, cached, true);
      }
    };

    // Process any already-cached portfolio-news query once on mount
    for (const q of queryClient.getQueryCache().findAll({ queryKey: ['portfolio-news'] })) {
      const qKey = q.queryKey;
      if (Array.isArray(qKey) && typeof qKey[1] === 'string' && q.state.status === 'success') {
        handleInbox(qKey[1], q.state.data);
      }
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const qKey = event.query.queryKey;
      if (!Array.isArray(qKey) || qKey[0] !== 'portfolio-news' || typeof qKey[1] !== 'string') {
        return;
      }
      handleInbox(qKey[1], event.action.data);
    });

    return () => {
      evaluateCachedInboxRef.current = () => {};
      unsubscribe();
    };
  }, [queryClient, isAuthenticated, userId, preferences]);

  // Logout clean-up (Session Isolation)
  useEffect(() => {
    if (!isAuthenticated && userId) {
      const service = getNotificationService();
      service.cancelAll();
      purgeUserNotifications(userId);
      clearNotificationPreferences(userId);
      clearPortfolioNewsMonitoringState(userId);
      notificationCenter.clearHistory(userId);
    }
  }, [isAuthenticated, userId]);

  // Test notification helper (DEV / Test harness only)
  const sendTestNotification = useCallback(
    async (customBody?: string): Promise<boolean> => {
      const service = getNotificationService();
      const testNotification: LocalNotification = {
        id: `test_${Date.now()}`,
        title: 'Notificação de Teste Atlas',
        body: customBody || 'Notificações locais estão configuradas e ativas no dispositivo.',
        category: 'SYSTEM_TEST',
        severity: 'LOW',
        deepLink: '/today',
        createdAt: Date.now(),
      };

      const success = await service.send(testNotification);
      if (success && userId) {
        notificationCenter.addNotification(userId, testNotification);
      }
      return success;
    },
    [userId]
  );

  const unreadCount = useMemo(() => {
    return history.filter((h) => !h.read).length;
  }, [history]);

  const markAsRead = useCallback(
    (id: string) => {
      notificationCenter.markAsRead(userId, id);
    },
    [userId]
  );

  const markAllAsRead = useCallback(() => {
    notificationCenter.markAllAsRead(userId);
  }, [userId]);

  const clearHistory = useCallback(() => {
    notificationCenter.clearHistory(userId);
  }, [userId]);

  const value: NotificationContextValue = {
    permissionState,
    requestPermission,
    preferences,
    updatePreferences,
    history,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearHistory,
    sendTestNotification,
    evaluateNow,
    newsMonitoring,
    closedAppMonitoring,
    refreshClosedAppMonitoringStatus,
    repairClosedAppMonitoring,
    refreshPortfolioNewsNow,
  };

  return (
    <NotificationContext.Provider value={value}>
      <RouterNavigatorWrapper onNavigateReady={setNavigateFn} />
      {children}
    </NotificationContext.Provider>
  );
};

const defaultNotificationContext: NotificationContextValue = {
  permissionState: 'default',
  requestPermission: async () => 'default',
  preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
  updatePreferences: () => {},
  history: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearHistory: () => {},
  sendTestNotification: async () => false,
  evaluateNow: async () => {},
  newsMonitoring: buildDefaultMonitoringDiagnostics(DEFAULT_NOTIFICATION_PREFERENCES),
  closedAppMonitoring: null,
  refreshClosedAppMonitoringStatus: async () => {},
  repairClosedAppMonitoring: async () => {},
  refreshPortfolioNewsNow: async (portfolioIdArg?: string) => {
    if (!portfolioIdArg) return;
    await portfolioApi.refreshPortfolioNews(portfolioIdArg);
  },
};

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  return context ?? defaultNotificationContext;
}

export function usePortfolioNewsMonitoring() {
  const { newsMonitoring, refreshPortfolioNewsNow, preferences, updatePreferences } = useNotifications();
  return {
    monitoring: newsMonitoring,
    refreshNow: refreshPortfolioNewsNow,
    automaticNewsMonitoring: preferences.automaticNewsMonitoring,
    intervalMinutes: preferences.newsMonitoringIntervalMinutes,
    updatePreferences,
  };
}
