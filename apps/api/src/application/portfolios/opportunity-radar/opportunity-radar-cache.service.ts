import { Injectable } from '@nestjs/common';
import { OpportunityRadarResult, OPPORTUNITY_MODEL_VERSION } from '@atlas/market-data';

interface CacheEntry {
  result: OpportunityRadarResult;
  cachedAt: number; // ms
  analysisDate: string; // YYYY-MM-DD
}

/**
 * Ephemeral in-memory cache for Opportunity Radar results (APP-16F PARTE X, Y).
 *
 * Cache key: `${portfolioId}:${analysisDate}:${OPPORTUNITY_MODEL_VERSION}`.
 * Provides instant startup response (< 5ms) without re-fetching external providers on every render.
 */
@Injectable()
export class OpportunityRadarCacheService {
  private readonly cache = new Map<string, CacheEntry>();

  private buildKey(portfolioId: string, analysisDate: string): string {
    return `${portfolioId}:${analysisDate}:${OPPORTUNITY_MODEL_VERSION}`;
  }

  get(portfolioId: string, analysisDate: string = new Date().toISOString().slice(0, 10)): OpportunityRadarResult | null {
    const key = this.buildKey(portfolioId, analysisDate);
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Cache is valid for the current analysis date (up to 24h)
    return entry.result;
  }

  set(
    portfolioId: string,
    result: OpportunityRadarResult,
    analysisDate: string = new Date().toISOString().slice(0, 10),
  ): void {
    const key = this.buildKey(portfolioId, analysisDate);
    this.cache.set(key, {
      result,
      cachedAt: Date.now(),
      analysisDate,
    });
  }

  invalidate(portfolioId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${portfolioId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
