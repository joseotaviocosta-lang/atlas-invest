/**
 * Safe local read-only cache for offline and instant startup presentation.
 * STRICT SECURITY INVARIANT: NEVER stores tokens, credentials, passwords, or secrets.
 * Only caches non-sensitive aggregated read models (portfolio valuation, macro indicators).
 */

const CACHE_PREFIX = 'atlas.cache.';

export const LocalCacheKeys = {
  PORTFOLIO_VALUATION: `${CACHE_PREFIX}portfolio_valuation`,
  MACRO_INDICATORS: `${CACHE_PREFIX}macro_indicators`,
  LAST_SYNC_TIMESTAMP: `${CACHE_PREFIX}last_sync_timestamp`,
} as const;

// In-memory fallback for headless/SSR test environments
const fallbackStore = new Map<string, string>();

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (k: string) => fallbackStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      fallbackStore.set(k, v);
    },
    removeItem: (k: string) => {
      fallbackStore.delete(k);
    },
    key: (i: number) => Array.from(fallbackStore.keys())[i] ?? null,
    get length() {
      return fallbackStore.size;
    },
  };
}

export class LocalCache {
  /**
   * Save a non-sensitive data snapshot to local storage.
   */
  static set<T>(key: string, data: T): void {
    // Invariant check: strictly forbid any keys related to auth or secrets
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret')
    ) {
      throw new Error(`LocalCache security violation: Attempted to cache sensitive key "${key}"`);
    }

    try {
      const storage = getStorage();
      const payload = JSON.stringify({
        data,
        cachedAt: Date.now(),
      });
      storage.setItem(key, payload);
    } catch {
      // Ignore quota or serialization errors
    }
  }

  /**
   * Retrieve a cached snapshot. Returns null if missing or invalid.
   */
  static get<T>(key: string): { data: T; cachedAt: number } | null {
    try {
      const storage = getStorage();
      const raw = storage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Clear all cached read-models (e.g. on user logout).
   */
  static clear(): void {
    try {
      const storage = getStorage();
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore errors
    }
  }
}
