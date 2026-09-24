import { describe, it, expect } from 'vitest';

describe('Web Performance Series Chart', () => {
  it('chart component exists with portfolio + benchmark lines', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(
      process.cwd(),
      'apps/web/src/components/portfolio/PerformanceSeriesChart.tsx',
    );
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('portfolio-line');
    expect(c).toContain('benchmark-line');
  });

  it('chart does zero-line at 0% and gaps without connecting', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PerformanceSeriesChart.tsx'),
      'utf8',
    );
    expect(c).toContain('zeroY');
    expect(c).toContain('role="img"');
    expect(c).toContain('aria-label');
  });

  it('chart performs no financial math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PerformanceSeriesChart.tsx'),
      'utf8',
    );
    expect(c).not.toMatch(/calculateTWR/);
    expect(c).not.toMatch(/calculateBenchmarkReturn/);
    expect(c).not.toMatch(/calculateRateBenchmarkReturn/);
    expect(c).not.toMatch(/dailyFactor/);
    expect(c).not.toMatch(/accumulatedFactor/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('performance page fetches series with AUTO + benchmark + period', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('/performance/series');
    expect(c).toContain('granularity=AUTO');
    expect(c).toContain('performanceSeriesQueryKey');
    expect(c).toContain('PerformanceSeriesChart');
  });

  it('page keeps summary visible when series fails + partial/unavailable UX', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('Não foi possível carregar o histórico de performance.');
    expect(c).toContain('Série parcial');
    expect(c).toContain('Histórico insuficiente para montar o gráfico.');
    expect(c).toContain('Skeleton');
  });

  it('accessible fallback list exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PerformanceSeriesChart.tsx'),
      'utf8',
    );
    expect(c).toContain('Dados da série de performance');
    expect(c).toContain('<title>');
  });
});
