import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const SERIES_CLIENT_FILES = [
  'apps/web/src/components/portfolio/PerformanceSeriesChart.tsx',
  'apps/mobile/src/components/portfolio/PerformanceSeriesChart.tsx',
  'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  'apps/mobile/app/(app)/portfolio/performance.tsx',
  'packages/ui/src/view-models/portfolio-performance-series.view-model.ts',
];

describe('Architecture: Performance Series client boundary (ADR-126)', () => {
  it('client cannot calculate cumulative performance', () => {
    for (const f of SERIES_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateTWR/);
      expect(c, f).not.toMatch(/calculatePerformanceSeries/);
      expect(c, f).not.toMatch(/calculatePortfolioPerformance/);
    }
  });

  it('client cannot normalize performance series', () => {
    for (const f of SERIES_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/normalize.*series/i);
      expect(c, f).not.toMatch(/firstPoint/);
    }
  });

  it('client cannot calculate benchmark series', () => {
    for (const f of SERIES_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateBenchmarkReturn/);
      expect(c, f).not.toMatch(/calculateRateBenchmarkReturn/);
      expect(c, f).not.toMatch(/calculateExcessReturn/);
    }
  });

  it('client cannot compound CDI series', () => {
    for (const f of SERIES_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/dailyFactor/);
      expect(c, f).not.toMatch(/accumulatedFactor/);
    }
  });

  it('client cannot neutralize cash flows', () => {
    for (const f of SERIES_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/netExternalFlow/);
      expect(c, f).not.toMatch(/neutraliz/i);
    }
  });

  it('portfolio-engine does not import series machinery', () => {
    const c = read('packages/portfolio-engine/src/index.ts');
    expect(c).not.toMatch(/performance-series/);
    expect(c).not.toMatch(/calculatePerformanceSeries/);
    expect(c).not.toMatch(/benchmark-engine/);
  });

  it('performance-engine remains zero I/O', () => {
    const c = read('packages/performance-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/Prisma/);
    expect(c).not.toMatch(/import React/);
  });

  it('benchmark-engine remains zero I/O', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/import React/);
  });

  it('series endpoint does not leak provider internals', () => {
    const c = read(
      'apps/api/src/application/performance/get-portfolio-performance-series.use-case.ts',
    );
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
    expect(c).not.toMatch(/providerSeriesCode/);
  });
});
