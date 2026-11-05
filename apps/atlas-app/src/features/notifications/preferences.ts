import type { NotificationPreferences } from './types';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  fiscalReminders: true,
  darfReminders: true,
  costEvidenceAlerts: true,
  reconciliationAlerts: true,
  portfolioSummaryAlerts: false, // Conservative: zero marketing spam
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
        return {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...parsed,
        };
      }
    } catch {
      // Return defaults on parse error
    }
  }

  const inMem = memoryPrefsStore.get(uid);
  if (inMem) {
    return { ...inMem };
  }

  return { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

export function saveNotificationPreferences(
  userId: string | null | undefined,
  prefs: Partial<NotificationPreferences>
): NotificationPreferences {
  const uid = userId?.trim() || 'default';
  const current = getNotificationPreferences(uid);
  const updated: NotificationPreferences = {
    ...current,
    ...prefs,
  };

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
