import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const ROLLING_SECTIONS = [
  'apps/web/src/components/portfolio/RollingAnalyticsSection.tsx',
  'apps/mobile/src/components/portfolio/MobileRollingAnalyticsSection.tsx',
];

const ROLLING_CHARTS = [
  'apps/web/src/components/portfolio/RollingRiskChart.tsx',
  'apps/mobile/src/components/portfolio/MobileRollingRiskChart.tsx',
];

const ROLLING_ALL_CLIENT = [
  ...ROLLING_SECTIONS,
  ...ROLLING_CHARTS,
  'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  'apps/mobile/app/(app)/portfolio/performance.tsx',
  'packages/ui/src/view-models/portfolio-rolling-analytics.view-model.ts',
];

describe('Architecture: Rolling analytics client boundary (ADR-148)', () => {
  it('client cannot calculate rolling volatility', () => {
    for (const f of ROLLING_ALL_CLIENT) {
      expect(read(f), f).not.toMatch(/calculateRollingVolatility\(/);
    }
  });

  it('client cannot calculate rolling beta', () => {
    for (const f of ROLLING_ALL_CLIENT) {
      expect(read(f), f).not.toMatch(/calculateRollingBeta\(/);
    }
  });

  it('client cannot calculate rolling Sharpe', () => {
    for (const f of ROLLING_ALL_CLIENT) {
      expect(read(f), f).not.toMatch(/calculateRollingSharpe\(/);
    }
  });

  it('client cannot slice returns for financial calculation', () => {
    for (const f of [
      ...ROLLING_SECTIONS,
      'packages/ui/src/view-models/portfolio-rolling-analytics.view-model.ts',
    ]) {
      const c = read(f);
      expect(c, f).not.toMatch(/returns\.slice\(/);
      expect(c, f).not.toMatch(/observations\.slice\(/);
      expect(c, f).not.toMatch(/points\.slice\(/);
    }
  });

  it('client cannot annualize rolling values', () => {
    for (const f of [
      ...ROLLING_SECTIONS,
      'packages/ui/src/view-models/portfolio-rolling-analytics.view-model.ts',
    ]) {
      const c = read(f);
      expect(c, f).not.toMatch(/Math\.sqrt\(/);
      expect(c, f).not.toMatch(/Math\.pow\(/);
      expect(c, f).not.toMatch(/annualizeRolling/);
    }
  });

  it('view-model cannot compute variance/covariance', () => {
    const c = read('packages/ui/src/view-models/portfolio-rolling-analytics.view-model.ts');
    expect(c).not.toMatch(/sampleVariance/);
    expect(c).not.toMatch(/covariance\s*\(/);
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
    expect(c).not.toMatch(/calculateRollingVolatility/);
    expect(c).not.toMatch(/calculateRollingBeta/);
    expect(c).not.toMatch(/calculateRollingSharpe/);
  });

  it('rolling use-case does not leak provider internals', () => {
    const c = read(
      'apps/api/src/application/performance/get-portfolio-rolling-analytics.use-case.ts',
    );
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
    expect(c).not.toMatch(/\^BVSP/);
    expect(c).not.toMatch(/query1\.finance\.yahoo/);
    expect(c).not.toMatch(/bcdata\.sgs/);
  });
});
