import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const RELATIVE_RISK_CLIENT_FILES = [
  'apps/web/src/components/portfolio/RelativeRiskSection.tsx',
  'apps/mobile/src/components/portfolio/MobileRelativeRiskSection.tsx',
  'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  'apps/mobile/app/(app)/portfolio/performance.tsx',
  'packages/ui/src/view-models/portfolio-benchmark-relative-risk.view-model.ts',
];

describe('Architecture: Benchmark-relative client boundary (ADR-138)', () => {
  it('client cannot calculate beta', () => {
    for (const f of RELATIVE_RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateBeta\(/);
      expect(c, f).not.toMatch(/computeBeta\(/);
    }
  });

  it('client cannot calculate correlation', () => {
    for (const f of RELATIVE_RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateCorrelation\(/);
      expect(c, f).not.toMatch(/pearson/i);
    }
  });

  it('client cannot calculate covariance', () => {
    for (const f of RELATIVE_RISK_CLIENT_FILES) {
      const c = read(f);
      // Match code, not documentation prose ("no covariance, variance, ...").
      expect(c, f).not.toMatch(/covariance\s*\(/);
      expect(c, f).not.toMatch(/sampleCovariance/);
    }
  });

  it('client cannot calculate tracking error', () => {
    for (const f of RELATIVE_RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateTrackingError\(/);
      expect(c, f).not.toMatch(/trackingError\s*=(?!=)/);
    }
  });

  it('client cannot calculate active returns', () => {
    for (const f of RELATIVE_RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/activeReturn\s*=(?!=)/);
      expect(c, f).not.toMatch(/portfolioReturn\s*-\s*benchmarkReturn/);
    }
  });

  it('client cannot align relative-risk intervals', () => {
    for (const f of RELATIVE_RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/alignBenchmarkRelativeReturns\(/);
      expect(c, f).not.toMatch(/buildPortfolioIntervals\(/);
      expect(c, f).not.toMatch(/buildBenchmarkIntervals\(/);
    }
  });

  it('client cannot annualize tracking error', () => {
    for (const f of RELATIVE_RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/Math\.sqrt\(/);
      expect(c, f).not.toMatch(/Math\.pow\(/);
      expect(c, f).not.toMatch(/annualizeTrackingError/);
    }
  });

  it('risk-engine remains zero I/O', () => {
    const c = read('packages/risk-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/from '@atlas\/benchmark-engine'/);
    expect(c).not.toMatch(/from '@atlas\/performance-engine'/);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/import React/);
    expect(c).not.toMatch(/@nestjs\//);
    expect(c).not.toMatch(/Math\.sqrt\(/);
    expect(c).not.toMatch(/Math\.pow\(/);
    expect(c).not.toMatch(/parseFloat\(/);
  });

  it('portfolio-engine does not import risk-engine', () => {
    const c = read('packages/portfolio-engine/src/index.ts');
    expect(c).not.toMatch(/risk-engine/);
    expect(c).not.toMatch(/calculateBeta/);
    expect(c).not.toMatch(/calculateCorrelation/);
    expect(c).not.toMatch(/calculateTrackingError/);
  });

  it('relative-risk use-case does not leak benchmark provider internals', () => {
    const c = read(
      'apps/api/src/application/performance/get-portfolio-benchmark-relative-risk.use-case.ts',
    );
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
    expect(c).not.toMatch(/\^BVSP/);
    expect(c).not.toMatch(/query1\.finance\.yahoo/);
    expect(c).not.toMatch(/stooq\.com/);
  });

  it('Yahoo benchmark adapter keeps ^BVSP as adapter metadata only', () => {
    const c = read('packages/benchmark-engine/src/index.ts');
    expect(c).toMatch(/\^BVSP/);
    // The provider symbol never becomes a canonical benchmark identity.
    expect(c).toContain("BENCHMARK_IDS = ['IBOV', 'CDI']");
  });
});
