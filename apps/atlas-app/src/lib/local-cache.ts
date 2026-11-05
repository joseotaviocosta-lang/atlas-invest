/**
 * PROJECT ATLAS — APP-12: LOCAL CACHE, OFFLINE READ-ONLY & FAST STARTUP
 *
 * Local read-only cache layer for fast startup, hydration, and offline viewing.
 *
 * INVARIANTE INEGOCIÁVEL (PRINCÍPIO DO PROJETO ATLAS):
 * O cache local é estritamente "LAST KNOWN GOOD READ MODEL", NUNCA fonte da verdade.
 * A única fonte da verdade é o PostgreSQL via Atlas API e Transaction Ledger.
 *
 * REGRAS DE SEGURANÇA:
 * - PROIBIDO armazenar tokens, credenciais, senhas ou segredos (varredura ativa de chaves e conteúdo).
 * - Isolamento estrito por usuário (namespacing: atlas.cache.v1.<userId>.<portfolioId?>.<resource>).
 * - Isolamento estrito por carteira (portfolioId explícito).
 * - Versionamento de schema com descarte imediato em caso de incompatibilidade.
 * - Tratamento defensivo contra corrupção (JSON inválido, schema adulterado).
 */

export const CACHE_SCHEMA_VERSION = 1;
export const CACHE_PREFIX = `atlas.cache.v${CACHE_SCHEMA_VERSION}.`;
export const MAX_CACHE_ENTRIES_PER_USER = 50;

export type CachedResourceType =
  | 'portfolio_summary'
  | 'portfolio_valuation'
  | 'positions'
  | 'allocation'
  | 'market_quotes'
  | 'macro_indicators'
  | 'fiscal_summary';

export const DEFAULT_TTL_MS: Record<CachedResourceType, number> = {
  portfolio_summary: 15 * 60 * 1000,    // 15 minutos
  portfolio_valuation: 15 * 60 * 1000,  // 15 minutos
  positions: 15 * 60 * 1000,            // 15 minutos
  allocation: 15 * 60 * 1000,           // 15 minutos
  market_quotes: 5 * 60 * 1000,         // 5 minutos
  macro_indicators: 24 * 60 * 60 * 1000,// 24 horas
  fiscal_summary: 60 * 60 * 1000,       // 60 minutos
};

/**
 * Versioned envelope wrapping all cached read-models.
 */
export interface CacheEnvelope<T> {
  schemaVersion: number;
  userId: string;
  portfolioId?: string;
  resource: string;
  cachedAt: number;
  ttlMs: number;
  expiresAt: number;
  data: T;
}

export interface CacheReadResult<T> {
  data: T;
  isStale: boolean;
  isExpired: boolean;
  cachedAt: number;
  envelope: CacheEnvelope<T>;
}

export interface SetResourceOptions {
  portfolioId?: string;
  ttlMs?: number;
}

// In-memory fallback for test and non-DOM headless environments
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

/**
 * Scan for prohibited sensitive concepts in key names and payload contents.
 */
function scanForSecrets(key: string, data: unknown): void {
  const lowerKey = key.toLowerCase();
  const FORBIDDEN_KEYWORDS = [
    'token',
    'auth',
    'password',
    'secret',
    'bearer',
    'authorization',
    'apikey',
    'refreshtoken',
    'accesstoken',
    'privatekey',
  ];

  for (const forbidden of FORBIDDEN_KEYWORDS) {
    if (lowerKey.includes(forbidden)) {
      throw new Error(`LocalCache security violation: Attempted to cache sensitive key "${key}"`);
    }
  }

  // Scan serialized content for credential properties or Bearer headers
  if (data && typeof data === 'object') {
    const serialized = JSON.stringify(data);
    const sensitiveFieldRegex = /"(password|refreshToken|accessToken|secret|apiKey|authorization)"\s*:/i;
    const bearerRegex = /bearer\s+[A-Za-z0-9\-._~+/]+=*/i;

    if (sensitiveFieldRegex.test(serialized) || bearerRegex.test(serialized)) {
      throw new Error('LocalCache security violation: Sensitive credential detected inside payload');
    }
  }
}

/**
 * Validate that data is a legitimate non-empty, non-error read model before saving.
 */
function isValidPayload(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Reject explicit API error responses
    if (obj.error && !obj.data) return false;
    // Reject empty objects
    if (Object.keys(obj).length === 0) return false;
  }
  return true;
}

/**
 * Build canonical namespaced cache key.
 */
export function buildCacheKey(userId: string, resource: string, portfolioId?: string): string {
  const cleanUser = userId.trim();
  if (portfolioId) {
    const cleanPortfolio = portfolioId.trim();
    return `${CACHE_PREFIX}${cleanUser}.${cleanPortfolio}.${resource}`;
  }
  return `${CACHE_PREFIX}${cleanUser}.${resource}`;
}

export const LocalCacheKeys = {
  PORTFOLIO_VALUATION: 'atlas.cache.portfolio_valuation',
  PORTFOLIO_SUMMARY: 'atlas.cache.portfolio_summary',
  POSITIONS: 'atlas.cache.positions',
  ALLOCATION: 'atlas.cache.allocation',
  MARKET_QUOTES: 'atlas.cache.market_quotes',
  MACRO_INDICATORS: 'atlas.cache.macro_indicators',
  FISCAL_SUMMARY: 'atlas.cache.fiscal_summary',
  LAST_SYNC_TIMESTAMP: 'atlas.cache.last_sync_timestamp',
} as const;

export class LocalCache {
  /**
   * Primary typed API: Save a namespaced read model for a user and portfolio.
   */
  static setResource<T>(
    userId: string,
    resource: CachedResourceType | string,
    data: T,
    options?: SetResourceOptions
  ): void {
    if (!userId || !userId.trim()) {
      return;
    }

    const key = buildCacheKey(userId, resource, options?.portfolioId);
    scanForSecrets(key, data);

    if (!isValidPayload(data)) {
      return; // Never overwrite with invalid / error / empty data
    }

    const ttl =
      options?.ttlMs ??
      DEFAULT_TTL_MS[resource as CachedResourceType] ??
      15 * 60 * 1000;

    const now = Date.now();
    const envelope: CacheEnvelope<T> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      userId,
      portfolioId: options?.portfolioId,
      resource,
      cachedAt: now,
      ttlMs: ttl,
      expiresAt: now + ttl,
      data,
    };

    try {
      const storage = getStorage();
      this.enforceQuota(storage, userId);
      storage.setItem(key, JSON.stringify(envelope));
    } catch {
      // Storage quota or serialization fail-safe
    }
  }

  /**
   * Primary typed API: Retrieve a namespaced read model for a user and portfolio.
   * Returns null if missing, corrupted, or schema mismatch.
   */
  static getResource<T>(
    userId: string,
    resource: CachedResourceType | string,
    portfolioId?: string
  ): CacheReadResult<T> | null {
    if (!userId || !userId.trim()) {
      return null;
    }

    const key = buildCacheKey(userId, resource, portfolioId);
    return this.get<T>(key, userId);
  }

  /**
   * Universal get: reads and validates cache envelope.
   * Handles corruption, version mismatch, and TTL evaluation.
   */
  static get<T>(key: string, expectedUserId?: string): CacheReadResult<T> | null {
    try {
      const storage = getStorage();
      const raw = storage.getItem(key);
      if (!raw) return null;

      let envelope: CacheEnvelope<T>;
      try {
        envelope = JSON.parse(raw);
      } catch {
        // Corrupted JSON syntax: safely discard corrupted entry
        storage.removeItem(key);
        return null;
      }

      // Defense: Validate envelope structure
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        typeof envelope.schemaVersion !== 'number' ||
        typeof envelope.cachedAt !== 'number'
      ) {
        storage.removeItem(key);
        return null;
      }

      // Schema version mismatch: discard incompatible schema
      if (envelope.schemaVersion !== CACHE_SCHEMA_VERSION) {
        storage.removeItem(key);
        return null;
      }

      // User isolation check: discard if not belonging to expected user
      if (expectedUserId && envelope.userId && envelope.userId !== expectedUserId) {
        return null;
      }

      // Check corrupted timestamps (future date > 24h)
      const now = Date.now();
      if (envelope.cachedAt > now + 24 * 60 * 60 * 1000) {
        storage.removeItem(key);
        return null;
      }

      const isExpired = envelope.expiresAt ? now > envelope.expiresAt : false;
      const isStale = envelope.ttlMs ? now - envelope.cachedAt > envelope.ttlMs : false;

      return {
        data: envelope.data,
        isStale,
        isExpired,
        cachedAt: envelope.cachedAt,
        envelope,
      };
    } catch {
      return null;
    }
  }

  /**
   * Backward-compatible set: allows saving with generic key string.
   */
  static set<T>(key: string, data: T, options?: { userId?: string; ttlMs?: number }): void {
    scanForSecrets(key, data);

    if (!isValidPayload(data)) {
      return;
    }

    const userId = options?.userId ?? 'shared';
    const ttl = options?.ttlMs ?? 15 * 60 * 1000;
    const now = Date.now();

    const envelope: CacheEnvelope<T> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      userId,
      resource: key,
      cachedAt: now,
      ttlMs: ttl,
      expiresAt: now + ttl,
      data,
    };

    try {
      const storage = getStorage();
      storage.setItem(key, JSON.stringify(envelope));
    } catch {
      // Storage quota or serialization fail-safe
    }
  }

  /**
   * Purge all cache entries for a specific user (e.g. upon logout).
   */
  static purgeUser(userId: string): void {
    if (!userId || !userId.trim()) return;
    try {
      const storage = getStorage();
      const userPrefix = `${CACHE_PREFIX}${userId.trim()}.`;
      const keysToRemove: string[] = [];

      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(userPrefix)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore errors
    }
  }

  /**
   * Purge all cache entries in the application.
   */
  static clear(): void {
    try {
      fallbackStore.clear();
      const storage = getStorage();
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && (k.startsWith('atlas.cache.') || k.startsWith('atlas.'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore errors
    }
  }

  /**
   * Storage quota enforcement: keeps user entries within bounds.
   */
  private static enforceQuota(storage: ReturnType<typeof getStorage>, userId: string): void {
    try {
      const userPrefix = `${CACHE_PREFIX}${userId}.`;
      const userEntries: Array<{ key: string; cachedAt: number }> = [];

      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(userPrefix)) {
          const raw = storage.getItem(k);
          if (raw) {
            try {
              const env = JSON.parse(raw);
              userEntries.push({ key: k, cachedAt: env.cachedAt || 0 });
            } catch {
              userEntries.push({ key: k, cachedAt: 0 });
            }
          }
        }
      }

      if (userEntries.length >= MAX_CACHE_ENTRIES_PER_USER) {
        // Sort oldest first and remove excess
        userEntries.sort((a, b) => a.cachedAt - b.cachedAt);
        const toRemove = userEntries.slice(0, userEntries.length - MAX_CACHE_ENTRIES_PER_USER + 5);
        toRemove.forEach((e) => storage.removeItem(e.key));
      }
    } catch {
      // Ignore errors
    }
  }
}
