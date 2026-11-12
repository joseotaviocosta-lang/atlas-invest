import type { NewsMonitoringIntervalMinutes, NotificationPreferences } from './types';

export const ALLOWED_NEWS_MONITORING_INTERVALS: readonly NewsMonitoringIntervalMinutes[] = [15, 30, 60];
export const DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES: NewsMonitoringIntervalMinutes = 30;

/**
 * Validates monitoring cadence strictly against allowed discrete intervals (15 | 30 | 60 min).
 * Invalid or aggressive sub-15m intervals fall back safely to 30 min.
 */
export function normalizeNewsMonitoringIntervalMinutes(raw: unknown): NewsMonitoringIntervalMinutes {
  const num = typeof raw === 'string' ? Number(raw) : raw;
  if (num === 15 || num === 30 || num === 60) {
    return num;
  }
  return DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES;
}

function normalizePreferences(prefs: NotificationPreferences): NotificationPreferences {
  return {
    ...prefs,
    automaticNewsMonitoring:
      typeof prefs.automaticNewsMonitoring === 'boolean' ? prefs.automaticNewsMonitoring : true,
    closedAppNewsMonitoring:
      typeof prefs.closedAppNewsMonitoring === 'boolean' ? prefs.closedAppNewsMonitoring : false,
    newsMonitoringIntervalMinutes: normalizeNewsMonitoringIntervalMinutes(
      prefs.newsMonitoringIntervalMinutes,
    ),
  };
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  fiscalReminders: true,
  darfReminders: true,
  costEvidenceAlerts: true,
  reconciliationAlerts: true,
  portfolioSummaryAlerts: false, // Conservative: zero marketing spam
  materialNewsAlerts: true, // APP-16N: Default ON for Desktop local owner (CRITICAL + HIGH only)
  materialNewsThreshold: 'HIGH_AND_CRITICAL',
  materialNewsAlertsActivatedAt: null,
  automaticNewsMonitoring: true, // APP-16P: Default ON while Atlas Desktop is open/minimized
  closedAppNewsMonitoring: false, // APP-16Q: Opt-in default OFF for Windows Task Scheduler
  newsMonitoringIntervalMinutes: DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES,
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  maxDailyNotifications: 5,
  cooldownHours: 6,
};

const PREFS_STORAGE_PREFIX = 'atlas.notifications.prefs.';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

// In-memory fallback for test runners and SSR
const memoryPrefsStore = new Map<string, NotificationPreferences>();

export function getNotificationPreferences(userId?: string | null): NotificationPreferences {
  const uid = userId?.trim() || 'default';

  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(`${PREFS_STORAGE_PREFIX}${uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return normalizePreferences({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...parsed,
        });
      }
    } catch {
      // Return defaults on parse error
    }
  }

  const inMem = memoryPrefsStore.get(uid);
  if (inMem) {
    return normalizePreferences({ ...inMem });
  }

  return normalizePreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES });
}

export function saveNotificationPreferences(
  userId: string | null | undefined,
  prefs: Partial<NotificationPreferences>
): NotificationPreferences {
  const uid = userId?.trim() || 'default';
  const current = getNotificationPreferences(uid);
  const updated: NotificationPreferences = normalizePreferences({
    ...current,
    ...prefs,
  });

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(`${PREFS_STORAGE_PREFIX}${uid}`, JSON.stringify(updated));
    } catch {
      // Ignore quota errors
    }
  }

  memoryPrefsStore.set(uid, updated);
  return updated;
}

export function clearNotificationPreferences(userId?: string | null): void {
  const uid = userId?.trim() || 'default';
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(`${PREFS_STORAGE_PREFIX}${uid}`);
    } catch {
      // Ignore
    }
  }
  memoryPrefsStore.delete(uid);
}
