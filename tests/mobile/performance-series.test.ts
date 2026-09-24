import { describe, it, expect } from 'vitest';

describe('Mobile Performance Series Chart', () => {
  it('chart component exists with portfolio + benchmark lines', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/PerformanceSeriesChart.tsx',
    );
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('portfolio-line');
    expect(c).toContain('benchmark-line');
  });

  it('chart has accessibility label and no financial math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/src/components/portfolio/PerformanceSeriesChart.tsx'),
      'utf8',
    );
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('Evolução da performance da carteira');
    expect(c).not.toMatch(/calculateTWR/);
    expect(c).not.toMatch(/calculateBenchmarkReturn/);
    expect(c).not.toMatch(/dailyFactor/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('mobile screen fetches series and degrades gracefully', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain('/performance/series');
    expect(c).toContain('MobilePerformanceSeriesChart');
    expect(c).toContain('Não foi possível carregar o histórico de performance.');
    expect(c).toContain('Série parcial');
    expect(c).toContain('Histórico insuficiente para montar o gráfico.');
    expect(c).not.toMatch(/calculateTWR/);
    expect(c).not.toMatch(/Math\.pow/);
  });
});
