import { Injectable } from '@nestjs/common';
import { OpportunityRadarResult, OPPORTUNITY_MODEL_VERSION } from '@atlas/market-data';

interface CacheEntry {
  result: OpportunityRadarResult;
  cachedAt: number; // ms
  analysisDate: string; // YYYY-MM-DD
}

/**
 * Ephemeral in-memory cache for Opportunity Radar results (APP-16F PARTE X, Y)
 * and previous reference snapshot for APP-16S decision brief comparisons.
 */
@Injectable()
export class OpportunityRadarCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly previousByPortfolio = new Map<string, OpportunityRadarResult>();

  private buildKey(portfolioId: string, analysisDate: string): string {
    return `${portfolioId}:${analysisDate}:${OPPORTUNITY_MODEL_VERSION}`;
  }

  get(portfolioId: string, analysisDate: string = new Date().toISOString().slice(0, 10)): OpportunityRadarResult | null {
    const key = this.buildKey(portfolioId, analysisDate);
    const entry = this.cache.get(key);
    if (!entry) return null;

    return entry.result;
  }

  getPrevious(portfolioId: string): OpportunityRadarResult | null {
    return this.previousByPortfolio.get(portfolioId) ?? null;
  }

  set(
    portfolioId: string,
    result: OpportunityRadarResult,
    analysisDate: string = new Date().toISOString().slice(0, 10),
  ): void {
    const key = this.buildKey(portfolioId, analysisDate);
    const existing = this.cache.get(key);
    if (existing) {
      this.previousByPortfolio.set(portfolioId, existing.result);
    }
    this.cache.set(key, {
      result,
      cachedAt: Date.now(),
      analysisDate,
    });
  }

  invalidate(portfolioId: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${portfolioId}:`)) {
        this.previousByPortfolio.set(portfolioId, entry.result);
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
    this.previousByPortfolio.clear();
  }
}
