import { describe, it, expect } from 'vitest';

describe('Web Performance Page', () => {
  it('route exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('uses performance API, not client math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('/api/v1/portfolios');
    expect(c).toContain('/performance');
    expect(c).not.toMatch(/calculateTWR/);
    expect(c).not.toMatch(/quantity \* price/);
  });

  it('has period selector with presets', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('PERFORMANCE_PERIOD_OPTIONS');
    expect(c).toContain('period');
  });

  it('handles AVAILABLE, PARTIAL, UNAVAILABLE states', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('isPartial');
    expect(c).toContain('isUnavailable');
  });

  it('multi-currency displayed separately', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('currencies');
  });

  it('CDI option exists and IBOV regression', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('CDI');
    expect(c).toContain('IBOV');
    expect(c).toContain('Sem benchmark');
  });

  it('CDI card, p.p., unavailable, partial, tooltips', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('CDI indisponível para este período.');
    expect(c).toContain('p.p. vs. CDI');
    expect(c).toContain('Comparação parcial');
    expect(c).toContain('O CDI é uma referência de taxas de juros');
    expect(c).toContain('A comparação usa o TWR');
    expect(c).not.toMatch(/calculateRateBenchmarkReturn/);
  });

  it('XIRR separate from TWR', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('XIRR');
    expect(c).toContain('TWR');
  });

  it('CDI is selected from URL state (benchmark query param)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain("searchParams.get('benchmark')");
    expect(c).toContain("params.set('benchmark'");
  });

  it('renders positive and negative p.p. distinctly (no client math)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('colors.positive');
    expect(c).toContain('colors.negative');
    expect(c).toContain("diff.startsWith('-')");
    expect(c).not.toMatch(/parseFloat|Number\(/);
  });

  it('benchmark selector is accessible (aria-label + aria-pressed)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(c).toContain('aria-label="Selecionar benchmark CDI"');
    expect(c).toContain('aria-pressed');
  });
});
