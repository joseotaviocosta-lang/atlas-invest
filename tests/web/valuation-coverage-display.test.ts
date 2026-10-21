import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { formatPercentage } from '@atlas/ui';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Valuation coverage display precision (Phase 5K-HV-R2)', () => {
  it('formats the exact owner-reported repeating decimal as human-readable pt-BR', () => {
    expect(formatPercentage('66.66666666666666666666666666666667')).toBe('66,67%');
  });

  it('covers display edge cases without NaN/undefined/Infinity leaks', () => {
    expect(formatPercentage('0')).toBe('0,00%');
    expect(formatPercentage('33.33333333333333333333333333333333')).toBe('33,33%');
    expect(formatPercentage('100')).toBe('100,00%');
    expect(formatPercentage('50.0')).toBe('50,00%');
    expect(formatPercentage(null)).toBe('—');
    expect(formatPercentage(undefined)).toBe('—');
    expect(formatPercentage('')).toBe('—');

    for (const out of [
      formatPercentage('66.66666666666666666666666666666667'),
      formatPercentage('0'),
      formatPercentage('100'),
      formatPercentage(null),
    ]) {
      expect(out).not.toContain('NaN');
      expect(out).not.toContain('undefined');
      expect(out).not.toContain('Infinity');
    }
  });

  it('routes valuation coverage through the canonical formatter, never raw interpolation', () => {
    const valuation = readWeb('apps/web/src/components/portfolio/PortfolioValuation.tsx');
    expect(valuation).toContain('formatPercentage(valuation.summary.valuationCoveragePercent)');
    expect(valuation).not.toMatch(/valuationCoveragePercent\}%/);

    const allocation = readWeb('apps/web/src/components/portfolio/PortfolioAllocationSection.tsx');
    expect(allocation).toContain('formatPercentage(allocation.valuationCoveragePercent)');
    expect(allocation).not.toMatch(/valuationCoveragePercent\}%/);

    const market = readWeb('apps/web/src/app/(app)/market/page.tsx');
    expect(market).toContain('formatPercentage(summary.valuationCoveragePercent)');
    expect(market).not.toMatch(/valuationCoveragePercent\}%/);
  });

  it('routes benchmark returns through the canonical formatter', () => {
    const performance = readWeb('apps/web/src/app/(app)/portfolio/performance/page.tsx');
    expect(performance).toContain('formatPercentage(bench.return)');
    expect(performance).not.toMatch(/\$\{bench\.return\}%/);
  });

  it('preserves the partial-valuation disclosure copy', () => {
    const valuation = readWeb('apps/web/src/components/portfolio/PortfolioValuation.tsx');
    expect(valuation).toContain(
      'Parte da carteira ainda não possui cotação disponível. Os totais de mercado',
    );
  });
});
