import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function read(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), 'utf8');
}

const ACTIVE_CLIENT_FILES = [
  'apps/web/src/components/portfolio/ActivePerformanceSection.tsx',
  'apps/mobile/src/components/portfolio/MobileActivePerformanceSection.tsx',
  'apps/web/src/app/(app)/portfolio/performance/page.tsx',
  'apps/mobile/app/(app)/portfolio/performance.tsx',
  'packages/ui/src/view-models/portfolio-active-performance.view-model.ts',
];

describe('Architecture: Active performance client boundary (ADR-143)', () => {
  it('client cannot calculate alpha', () => {
    for (const f of ACTIVE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateJensenAlpha\(/);
      expect(c, f).not.toMatch(/computeAlpha\(/);
    }
  });

  it('client cannot calculate information ratio', () => {
    for (const f of ACTIVE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateInformationRatio\(/);
      expect(c, f).not.toMatch(/informationRatio\s*=\s*[^=]/);
    }
  });

  it('client cannot calculate treynor', () => {
    for (const f of ACTIVE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/calculateTreynorRatio\(/);
      expect(c, f).not.toMatch(/treynor\s*=\s*[^=]/i);
    }
  });

  it('client cannot calculate expected CAPM return', () => {
    for (const f of ACTIVE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/expectedReturn\s*=(?!=)/);
      expect(c, f).not.toMatch(/calculateExpectedReturn\(/);
      expect(c, f).not.toMatch(/capmReturn\s*=/i);
      expect(c, f).not.toMatch(/riskFree\s*\+\s*.*beta/i);
    }
  });

  it('client cannot divide active return by tracking error', () => {
    for (const f of ACTIVE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/activeReturn\s*\/\s*trackingError/);
      expect(c, f).not.toMatch(/meanActive\s*\//);
    }
  });

  it('client cannot divide excess return by beta', () => {
    for (const f of ACTIVE_CLIENT_FILES) {
      const c = read(f);
      expect(c, f).not.toMatch(/excessReturn\s*\/\s*beta/i);
      expect(c, f).not.toMatch(/excess\s*\/\s*beta/i);
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
    expect(c).not.toMatch(/calculateJensenAlpha/);
    expect(c).not.toMatch(/calculateInformationRatio/);
    expect(c).not.toMatch(/calculateTreynorRatio/);
  });

  it('active-performance use-case does not leak provider internals', () => {
    const c = read(
      'apps/api/src/application/performance/get-portfolio-active-performance.use-case.ts',
    );
    expect(c).not.toMatch(/StooqCsvRow/);
    expect(c).not.toMatch(/YahooFinanceQuote/);
    expect(c).not.toMatch(/\^BVSP/);
    expect(c).not.toMatch(/query1\.finance\.yahoo/);
    expect(c).not.toMatch(/bcdata\.sgs/);
  });
});
