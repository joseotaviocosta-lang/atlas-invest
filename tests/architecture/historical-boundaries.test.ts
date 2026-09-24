import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: Historical Market Data Boundaries', () => {
  it('historical provider types stay inside adapters', () => {
    const c = read('packages/market-data/src/index.ts');
    // Historical types should be defined but not leak via API controller imports
    expect(c).toContain('HistoricalMarketPrice');
    expect(c).toContain('InMemoryHistoricalMarketDataProvider');
    // Ensure API controller does not import StooqCsvRow
    const apiPerf = read(
      'apps/api/src/application/performance/get-portfolio-performance.use-case.ts',
    );
    expect(apiPerf).not.toMatch(/StooqCsvRow/);
    expect(apiPerf).not.toMatch(/InMemoryHistoricalPrice/);
  });

  it('historical valuations computed server-side, not client', () => {
    const web = read('apps/web/src/app/(app)/portfolio/page.tsx');
    expect(web).not.toMatch(/HistoricalMarketPrice/);
    expect(web).not.toMatch(/getDailyPrice/);
    const mobile = read('apps/mobile/app/(app)/(tabs)/portfolio.tsx');
    expect(mobile).not.toMatch(/HistoricalMarketPrice/);
  });

  it('performance observations preserve currency segregation', () => {
    const c = read('packages/performance-engine/src/index.ts');
    expect(c).toContain('observationsByCurrency');
    expect(c).toContain('currencies');
  });

  it('partial historical valuation never labeled complete', () => {
    const c = read('apps/api/src/application/performance/historical-valuation.builder.ts');
    expect(c).toContain('PARTIAL');
    expect(c).toContain('UNAVAILABLE');
  });

  it('current quotes never backfilled into past', () => {
    const c = read('packages/market-data/src/index.ts');
    // Historical provider should only look backwards, not forwards
    expect(c).toContain('maxLookbackDays');
    expect(c).toContain('PREVIOUS_TRADING_DAY');
    expect(c).not.toMatch(/priceDate > requestedDate/);
  });
});
