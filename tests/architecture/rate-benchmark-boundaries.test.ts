import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

describe('Architecture: Rate Benchmark 3G', () => {
  it('client cannot calculateRateBenchmarkReturn', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
      'packages/ui/src/view-models/portfolio-performance.view-model.ts',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/calculateRateBenchmarkReturn/);
    }
  });

  it('client cannot compound CDI (dailyFactor/accumulatedFactor)', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
      'packages/ui/src/view-models/portfolio-performance.view-model.ts',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/accumulatedFactor/);
      expect(c).not.toMatch(/dailyFactor/);
      expect(c).not.toMatch(/1 \+.*rate/);
    }
  });

  it('client cannot annualize CDI', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
      'packages/ui/src/view-models/portfolio-performance.view-model.ts',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/annualize/i);
      expect(c).not.toMatch(/\(1 \+.*\)\s*\*\*\s*/);
    }
  });

  it('client cannot combine CDI with USD', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
    ];
    for (const f of files) {
      const c = read(f);
      // Ensure no FX conversion attempt
      expect(c).not.toMatch(/USD.*CDI|CDI.*USD/);
    }
  });

  it('rate provider DTOs do not leak to UI', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/BcbRateBenchmarkDataProvider/);
      expect(c).not.toMatch(/RateBenchmarkObservation/);
      expect(c).not.toMatch(/valor.*BCB/);
    }
  });

  it('benchmark-engine remains zero I/O (no fetch in engine core)', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    // Engine pure: calculate* functions must not contain fetch
    const calculateSection = c.split('class InMemoryBenchmarkDataProvider')[0] ?? c;
    expect(calculateSection).not.toMatch(/fetch\(/);
    // Providers are adapters with fetch, but engine math is pure
    expect(c).toMatch(/calculateRateBenchmarkReturn/);
  });

  it('portfolio-engine does not import benchmark-engine', () => {
    const dir = path.join(process.cwd(), 'packages/portfolio-engine/src');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.ts')) {
        const c = fs.readFileSync(path.join(dir, file), 'utf8');
        expect(c).not.toMatch(/@atlas\/benchmark-engine/);
        expect(c).not.toMatch(/benchmark/);
      }
    }
  });

  it('no Math.pow in CDI client path', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
      'packages/ui/src/view-models/portfolio-performance.view-model.ts',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/Math\.pow/);
    }
  });

  it('no parseFloat/Number for rate benchmark in client', () => {
    const files = [
      'apps/web/src/app/(app)/portfolio/performance/page.tsx',
      'apps/mobile/app/(app)/portfolio/performance.tsx',
    ];
    for (const f of files) {
      const c = read(f);
      expect(c).not.toMatch(/parseFloat.*rate/i);
      expect(c).not.toMatch(/Number\(.*rate/i);
    }
  });

  it('benchmark data provider for IBOV still exists and uses PRICE_INDEX', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    expect(c).toMatch(/type: 'PRICE_INDEX'/);
    expect(c).toMatch(/IBOV/);
    expect(c).toMatch(/YahooBenchmarkDataProvider/);
  });

  it('CDI definition uses RATE_SERIES', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    expect(c).toMatch(/CDI/);
    expect(c).toMatch(/RATE_SERIES/);
    expect(c).toMatch(/BcbRateBenchmarkDataProvider/);
  });

  it('benchmark-engine has no Math.pow (no floating exponent in rate compounding)', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    expect(c).not.toMatch(/Math\.pow/);
  });

  it('rate units are explicit and exclude silent annual conversion', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    expect(c).toMatch(/RATE_UNITS = \['DAILY_PERCENT', 'DAILY_FACTOR'\]/);
    expect(c).not.toMatch(/ANNUAL_PERCENT/);
  });

  it('provider series code never becomes canonical benchmark identity', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    // canonical identity is the BenchmarkId union
    expect(c).toMatch(/BENCHMARK_IDS = \['IBOV', 'CDI'\]/);
    expect(c).toMatch(/BENCHMARK_DEFINITIONS/);
  });

  it('application routes benchmarks by type, not by hardcoded ids', () => {
    const c = read('apps/api/src/application/performance/get-portfolio-performance.use-case.ts');
    expect(c).toMatch(/def\.type === 'PRICE_INDEX'/);
    expect(c).toMatch(/calculateRateBenchmarkReturn/);
    expect(c).toMatch(/BENCHMARK_DEFINITIONS/);
  });

  it('API does not leak BCB provider internals', () => {
    const c = read('apps/api/src/application/performance/get-portfolio-performance.use-case.ts');
    expect(c).not.toMatch(/bcdata\.sgs/);
    expect(c).not.toMatch(/providerSeriesCode/);
  });
});
