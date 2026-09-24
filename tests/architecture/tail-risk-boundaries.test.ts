import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const TAIL_CLIENT_FILES = [
  'apps/web/src/components/portfolio/TailRiskSection.tsx',
  'apps/mobile/src/components/portfolio/MobileTailRiskSection.tsx',
  'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  'apps/mobile/app/(app)/portfolio/performance.tsx',
  'packages/ui/src/view-models/portfolio-tail-risk.view-model.ts',
];

describe('Architecture: Tail risk client boundary (ADR-153)', () => {
  it('client cannot calculate downside deviation', () => {
    for (const f of TAIL_CLIENT_FILES) {
      expect(read(f), f).not.toMatch(/calculateDownsideDeviation\(/);
    }
  });

  it('client cannot calculate semideviation', () => {
    for (const f of TAIL_CLIENT_FILES) {
      expect(read(f), f).not.toMatch(/calculateSemideviation\(/);
    }
  });

  it('client cannot sort returns for VaR', () => {
    for (const f of TAIL_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/returns\.sort\(/);
      expect(c, f).not.toMatch(/\.sort\(/);
    }
  });

  it('client cannot calculate quantiles', () => {
    for (const f of TAIL_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateHistoricalVar\(/);
      expect(c, f).not.toMatch(/quantile\s*\(/i);
      expect(c, f).not.toMatch(/empiricalTailRank/);
      expect(c, f).not.toMatch(/nearestRank/);
    }
  });

  it('client cannot calculate CVaR tail mean', () => {
    for (const f of TAIL_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateHistoricalCvar\(/);
      expect(c, f).not.toMatch(/meanTail\s*=(?!=)/);
    }
  });

  it('client cannot convert quantile to loss', () => {
    for (const f of TAIL_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/lossPercentage\s*=(?!=)/);
      expect(c, f).not.toMatch(/Math\.abs\(/);
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
    expect(c).not.toMatch(/calculateDownsideDeviation/);
    expect(c).not.toMatch(/calculateHistoricalVar/);
    expect(c).not.toMatch(/calculateHistoricalCvar/);
  });

  it('tail-risk use-case does not leak provider internals', () => {
    const c = read(
      'apps/api/src/application/performance/get-portfolio-tail-risk-metrics.use-case.ts',
    );
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
    expect(c).not.toMatch(/\^BVSP/);
    expect(c).not.toMatch(/bcdata\.sgs/);
  });
});
