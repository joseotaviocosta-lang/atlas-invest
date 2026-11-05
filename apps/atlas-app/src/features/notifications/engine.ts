import type { LocalNotification, NotificationPreferences } from './types';

/**
 * Checks whether the specified time falls inside configured Quiet Hours.
 * Supports overnight ranges (e.g. 22:00 -> 08:00) as well as intraday ranges.
 */
export function isInQuietHours(prefs: NotificationPreferences, date: Date = new Date()): boolean {
  if (!prefs.quietHoursEnabled) {
    return false;
  }

  const startParts = (prefs.quietHoursStart || '22:00').split(':');
  const endParts = (prefs.quietHoursEnd || '08:00').split(':');

  const startHour = Number(startParts[0] ?? 22);
  const startMin = Number(startParts[1] ?? 0);
  const endHour = Number(endParts[0] ?? 8);
  const endMin = Number(endParts[1] ?? 0);

  if (
    Number.isNaN(startHour) ||
    Number.isNaN(startMin) ||
    Number.isNaN(endHour) ||
    Number.isNaN(endMin)
  ) {
    return false;
  }

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes <= endMinutes) {
    // Intraday range (e.g. 13:00 to 15:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g. 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Computes a deterministic identity key for deduplication.
 */
export function buildNotificationKey(params: {
  type: string;
  userId: string;
  portfolioId?: string | null;
  entityId: string;
  version?: string | number;
}): string {
  const pId = params.portfolioId || 'all';
  const ver = params.version ?? '1';
  return `${params.type}:${params.userId}:${pId}:${params.entityId}:${ver}`;
}

/**
 * Deterministically maps a string key to a 32-bit positive integer for OS APIs.
 */
export function stringToNumericId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * PRIVACY SAFEGUARD:
 * Validates that notification text does not leak sensitive asset quantities,
 * portfolio net worth, or exact account balances to lock screens.
 */
const SENSITIVE_CURRENCY_REGEX = /R\$\s*[\d.]+(,\d{2})?/gi;
const SENSITIVE_PATRIMONIO_REGEX = /(patrimônio|saldo|total\s+de)\s*:?\s*R?\$?\s*[\d.]+/gi;

export function sanitizeNotificationText(
  title: string,
  body: string
): { title: string; body: string; hadSensitiveContent: boolean } {
  let sanitizedBody = body;
  let hadSensitiveContent = false;

  if (SENSITIVE_CURRENCY_REGEX.test(body) || SENSITIVE_PATRIMONIO_REGEX.test(body)) {
    hadSensitiveContent = true;
    sanitizedBody = body
      .replace(SENSITIVE_CURRENCY_REGEX, '[valor omitido]')
      .replace(SENSITIVE_PATRIMONIO_REGEX, 'Há atualizações patrimoniais no Atlas.');
  }

  return {
    title: title.trim(),
    body: sanitizedBody.trim(),
    hadSensitiveContent,
  };
}

// In-memory audit log for deduplication and rate limiting
interface SentRecord {
  key: string;
  category: string;
  timestamp: number;
}

const auditLogStore = new Map<string, SentRecord[]>();

const LOG_STORAGE_PREFIX = 'atlas.notifications.log.';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function loadAuditRecords(userId: string): SentRecord[] {
  const uid = userId.trim() || 'default';
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(`${LOG_STORAGE_PREFIX}${uid}`);
      if (raw) return JSON.parse(raw);
    } catch {
      // Fallback
    }
  }
  return auditLogStore.get(uid) || [];
}

function persistAuditRecords(userId: string, records: SentRecord[]): void {
  const uid = userId.trim() || 'default';
  // Keep only last 100 records
  const trimmed = records.slice(-100);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(`${LOG_STORAGE_PREFIX}${uid}`, JSON.stringify(trimmed));
    } catch {
      // Ignore quota
    }
  }
  auditLogStore.set(uid, trimmed);
}

/**
 * Checks whether a notification with this key was already sent within the cooldown period.
 */
export function isDeduplicated(
  userId: string,
  key: string,
  cooldownHours: number,
  now: number = Date.now()
): boolean {
  const records = loadAuditRecords(userId);
  const cooldownMs = cooldownHours * 60 * 60 * 1000;

  const found = records.find((r) => r.key === key);
  if (!found) {
    return false;
  }

  return now - found.timestamp < cooldownMs;
}

/**
 * Checks whether the user has received fewer notifications today than the daily budget.
 */
export function isWithinDailyBudget(
  userId: string,
  maxDaily: number,
  now: number = Date.now()
): boolean {
  const records = loadAuditRecords(userId);
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const recentCount = records.filter((r) => r.timestamp >= oneDayAgo).length;

  return recentCount < maxDaily;
}

/**
 * Records a dispatched notification in the audit log.
 */
export function recordNotificationSent(
  userId: string,
  notification: LocalNotification,
  now: number = Date.now()
): void {
  const records = loadAuditRecords(userId);
  records.push({
    key: notification.id,
    category: notification.category,
    timestamp: now,
  });
  persistAuditRecords(userId, records);
}

/**
 * Session isolation: Purges all notification logs for a user upon logout.
 */
export function purgeUserNotifications(userId: string): void {
  const uid = userId.trim() || 'default';
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(`${LOG_STORAGE_PREFIX}${uid}`);
    } catch {
      // Ignore
    }
  }
  auditLogStore.delete(uid);
}
