import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const RISK_CLIENT_FILES = [
  'apps/web/src/components/portfolio/RiskMetricsSection.tsx',
  'apps/mobile/src/components/portfolio/MobileRiskSection.tsx',
  'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  'apps/mobile/app/(app)/portfolio/performance.tsx',
  'packages/ui/src/view-models/portfolio-risk.view-model.ts',
];

describe('Architecture: Risk client boundary (ADR-127)', () => {
  it('client cannot calculate volatility', () => {
    for (const f of RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateRealizedVolatility/);
      expect(c, f).not.toMatch(/calculateRiskMetrics/);
      expect(c, f).not.toMatch(/standardDeviation/);
    }
  });

  it('client cannot annualize volatility', () => {
    for (const f of RISK_CLIENT_FILES) {
      const c = read(f);
      // Field names (annualizedPercentage/annualizedFormatted) are allowed;
      // computing annualization is not.
      expect(c, f).not.toMatch(/computeAnnualized|calculateAnnualized/);
      expect(c, f).not.toMatch(/Math\.sqrt/);
      expect(c, f).not.toMatch(/sqrt\(252\)/);
      expect(c, f).not.toMatch(/annualizationFactor\s*=\s*['"]252['"]/);
    }
  });

  it('client cannot calculate variance', () => {
    for (const f of RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateVariance/);
      expect(c, f).not.toMatch(/sampleVariance/);
      // mean-as-identifier guard: allow formatting helpers, forbid risk mean calc
      expect(c, f).not.toMatch(/meanReturn/);
    }
  });

  it('client cannot calculate drawdown', () => {
    for (const f of RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateDrawdown/);
      expect(c, f).not.toMatch(/maxDrawdown/);
    }
  });

  it('client cannot detect drawdown peaks', () => {
    for (const f of RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/runningPeak/);
      expect(c, f).not.toMatch(/peakValue/);
      expect(c, f).not.toMatch(/detectPeak/);
    }
  });

  it('client cannot detect recovery', () => {
    for (const f of RISK_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/detectRecovery/);
      expect(c, f).not.toMatch(/recoveryWealth/);
    }
  });

  it('risk-engine is zero I/O and framework-free', () => {
    const c = read('packages/risk-engine/src/index.ts');
    expect(c).not.toMatch(/from '@atlas\/market-data'/);
    expect(c).not.toMatch(/from '@atlas\/database'/);
    expect(c).not.toMatch(/from '@atlas\/portfolio-engine'/);
    expect(c).not.toMatch(/from '@atlas\/performance-engine'/);
    expect(c).not.toMatch(/fetch\(/);
    expect(c).not.toMatch(/PrismaClient/);
    expect(c).not.toMatch(/@prisma\//);
    expect(c).not.toMatch(/import React/);
    expect(c).not.toMatch(/@nestjs\//);
    // Call-expression guards (prose may name the ban; code must not call it).
    // Number( verified separately: the single match is the prose ban itself.
    expect(c).not.toMatch(/Math\.sqrt\(/);
    expect(c).not.toMatch(/Math\.pow\(/);
    expect(c).not.toMatch(/parseFloat\(/);
  });

  it('risk-engine encapsulates decimals (no DecimalValue leak)', () => {
    const c = read('packages/risk-engine/src/index.ts');
    // Prose may name the rule; code must never import or re-export it.
    expect(c).not.toMatch(/import.*DecimalValue/);
    expect(c).not.toMatch(/export.*DecimalValue/);
    expect(c).not.toMatch(/from 'decimal/);
    expect(c).not.toMatch(/require\(['"]decimal/);
  });

  it('portfolio-engine does not import risk-engine', () => {
    const c = read('packages/portfolio-engine/src/index.ts');
    expect(c).not.toMatch(/risk-engine/);
    expect(c).not.toMatch(/calculateRealizedVolatility/);
    expect(c).not.toMatch(/calculateDrawdown/);
  });

  it('risk use-case does not leak provider internals', () => {
    const c = read('apps/api/src/application/performance/get-portfolio-risk-metrics.use-case.ts');
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
    expect(c).not.toMatch(/providerSeriesCode/);
  });
});
