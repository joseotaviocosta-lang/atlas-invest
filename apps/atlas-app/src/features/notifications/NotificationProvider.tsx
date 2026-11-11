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
  NotificationHistoryItem,
  NotificationPermissionState,
  NotificationPreferences,
} from './types';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  clearNotificationPreferences,
} from './preferences';
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
} from './news-alerts';

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

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const { selectedPortfolio } = usePortfolio();
  const queryClient = useContext(QueryClientContext);
  const processedInboxObjectsRef = useRef<WeakSet<object>>(new WeakSet());
  const [navigateFn, setNavigateFn] = useState<((path: string) => void) | null>(null);

  const userId = user?.id || null;

  const [permissionState, setPermissionState] = useState<NotificationPermissionState>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences>(() =>
    getNotificationPreferences(userId)
  );
  const [history, setHistory] = useState<NotificationHistoryItem[]>(() =>
    notificationCenter.getHistory(userId)
  );

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

  // App Lifecycle: Re-evaluate when app resumes to foreground
  useAppLifecycle(useCallback(() => {
    evaluateNow();
  }, [evaluateNow]));

  // Auto-evaluation whenever domain models refresh and are ready
  useEffect(() => {
    if (isAuthenticated && userId) {
      evaluateNow();
    }
  }, [isAuthenticated, userId, complianceTimeline, reviewInbox, evaluateNow]);

  // APP-16N: Evaluate material news alerts whenever portfolio-news query resolves or refreshes
  useEffect(() => {
    if (!queryClient || !isAuthenticated || !userId) return;

    const apiPorts = {
      claimPendingAlerts: async (
        portfolioId: string,
        items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
      ) => {
        const res = await portfolioApi.claimPortfolioNewsAlerts(portfolioId, items);
        return res.data.claimed;
      },
      confirmAlertsDelivered: async (
        portfolioId: string,
        items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
      ) => {
        await portfolioApi.confirmPortfolioNewsAlertsDelivered(portfolioId, items);
      },
      releaseAlertsClaim: async (
        portfolioId: string,
        items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
      ) => {
        await portfolioApi.releasePortfolioNewsAlertsClaim(portfolioId, items);
      },
      suppressBaseline: async (
        portfolioId: string,
        items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
      ) => {
        await portfolioApi.suppressPortfolioNewsAlertsBaseline(portfolioId, items);
      },
    };

    const handleInbox = (portfolioId: string, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const inbox = (payload as { data?: PortfolioNewsInboxResponseDto }).data;
      if (!inbox || !inbox.alertsMeta || inbox.alertsMeta.eligibleEvents.length === 0) return;
      if (processedInboxObjectsRef.current.has(inbox)) return;
      processedInboxObjectsRef.current.add(inbox);

      void processPortfolioNewsAlerts({
        portfolioId,
        userId,
        inbox,
        preferences,
        ports: apiPorts,
        notifier: new DesktopServiceNewsAlertNotifier(),
      }).catch(() => {
        // Non-blocking: alert delivery issues must never disrupt news inbox or refresh UX
      });
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
  preferences: {
    enabled: true,
    fiscalReminders: true,
    darfReminders: true,
    costEvidenceAlerts: true,
    reconciliationAlerts: true,
    portfolioSummaryAlerts: false,
    materialNewsAlerts: true,
    materialNewsThreshold: 'HIGH_AND_CRITICAL',
    materialNewsAlertsActivatedAt: null,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    maxDailyNotifications: 5,
    cooldownHours: 6,
  },
  updatePreferences: () => {},
  history: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearHistory: () => {},
  sendTestNotification: async () => false,
  evaluateNow: async () => {},
};

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  return context ?? defaultNotificationContext;
}
