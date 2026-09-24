import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const RISK_ADJUSTED_CLIENT_FILES = [
  'apps/web/src/components/portfolio/RiskAdjustedSection.tsx',
  'apps/mobile/src/components/portfolio/MobileRiskAdjustedSection.tsx',
  'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  'apps/mobile/app/(app)/portfolio/performance.tsx',
  'packages/ui/src/view-models/portfolio-risk-adjusted.view-model.ts',
];

describe('Architecture: Risk-adjusted client boundary (ADR-133)', () => {
  it('client cannot calculate Sharpe', () => {
    for (const f of RISK_ADJUSTED_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateSharpeRatio\(/);
      expect(c, f).not.toMatch(/computeSharpe\(/);
    }
  });

  it('client cannot calculate Sortino', () => {
    for (const f of RISK_ADJUSTED_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateSortinoRatio\(/);
      expect(c, f).not.toMatch(/computeSortino\(/);
    }
  });

  it('client cannot calculate downside deviation', () => {
    for (const f of RISK_ADJUSTED_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateDownsideDeviation\(/);
      expect(c, f).not.toMatch(/downsideVariance/);
    }
  });

  it('client cannot subtract CDI from returns', () => {
    for (const f of RISK_ADJUSTED_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/portfolioReturn\s*-\s*riskFree/);
      expect(c, f).not.toMatch(/calculateExcessReturn\(/);
      expect(c, f).not.toMatch(/meanExcess\s*=/);
    }
  });

  it('client cannot annualize ratios', () => {
    for (const f of RISK_ADJUSTED_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/Math\.sqrt\(/);
      expect(c, f).not.toMatch(/Math\.pow\(/);
      expect(c, f).not.toMatch(/annualizeSharpe|annualizeSortino/);
    }
  });

  it('risk-engine remains zero I/O (no Sharpe-time imports)', () => {
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
    expect(c).not.toMatch(/calculateSharpeRatio/);
    expect(c).not.toMatch(/calculateSortinoRatio/);
  });

  it('risk-adjusted use-case does not leak provider internals', () => {
    const c = read(
      'apps/api/src/application/performance/get-portfolio-risk-adjusted-metrics.use-case.ts',
    );
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
    expect(c).not.toMatch(/providerSeriesCode/);
    expect(c).not.toMatch(/bcdata\.sgs/);
  });
});
