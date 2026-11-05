import type { LocalNotification, NotificationHistoryItem } from './types';

const CENTER_STORAGE_PREFIX = 'atlas.notifications.history.';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

// In-memory fallback
const memoryHistoryStore = new Map<string, NotificationHistoryItem[]>();

class NotificationCenter {
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  getHistory(userId?: string | null): NotificationHistoryItem[] {
    const uid = userId?.trim() || 'default';
    const storage = getStorage();
    if (storage) {
      try {
        const raw = storage.getItem(`${CENTER_STORAGE_PREFIX}${uid}`);
        if (raw) return JSON.parse(raw);
      } catch {
        // Fallback
      }
    }
    return memoryHistoryStore.get(uid) || [];
  }

  addNotification(userId: string | null | undefined, notification: LocalNotification): void {
    const uid = userId?.trim() || 'default';
    const history = this.getHistory(uid);

    const newItem: NotificationHistoryItem = {
      id: notification.id,
      notification,
      read: false,
      receivedAt: Date.now(),
    };

    // Prepend and limit to 20 items
    const updated = [newItem, ...history.filter((h) => h.id !== notification.id)].slice(0, 20);

    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(`${CENTER_STORAGE_PREFIX}${uid}`, JSON.stringify(updated));
      } catch {
        // Ignore quota
      }
    }

    memoryHistoryStore.set(uid, updated);
    this.notify();
  }

  markAsRead(userId: string | null | undefined, notificationId: string): void {
    const uid = userId?.trim() || 'default';
    const history = this.getHistory(uid);
    const updated = history.map((item) =>
      item.id === notificationId ? { ...item, read: true } : item
    );

    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(`${CENTER_STORAGE_PREFIX}${uid}`, JSON.stringify(updated));
      } catch {
        // Ignore
      }
    }

    memoryHistoryStore.set(uid, updated);
    this.notify();
  }

  markAllAsRead(userId: string | null | undefined): void {
    const uid = userId?.trim() || 'default';
    const history = this.getHistory(uid);
    const updated = history.map((item) => ({ ...item, read: true }));

    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(`${CENTER_STORAGE_PREFIX}${uid}`, JSON.stringify(updated));
      } catch {
        // Ignore
      }
    }

    memoryHistoryStore.set(uid, updated);
    this.notify();
  }

  clearHistory(userId?: string | null): void {
    const uid = userId?.trim() || 'default';
    const storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(`${CENTER_STORAGE_PREFIX}${uid}`);
      } catch {
        // Ignore
      }
    }
    memoryHistoryStore.delete(uid);
    this.notify();
  }

  getUnreadCount(userId?: string | null): number {
    const history = this.getHistory(userId);
    return history.filter((h) => !h.read).length;
  }
}

export const notificationCenter = new NotificationCenter();
