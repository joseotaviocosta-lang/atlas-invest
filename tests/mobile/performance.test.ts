import { describe, it, expect } from 'vitest';

describe('Mobile Performance', () => {
  it('route exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('uses performance API', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain('/performance');
    expect(c).not.toMatch(/calculateTWR/);
  });

  it('has period selector', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain('PERFORMANCE_PERIOD_OPTIONS');
    expect(c).toContain('period');
  });

  it('accessibility labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('minWidth: 44');
  });

  it('CDI option and IBOV regression', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain('CDI');
    expect(c).toContain('IBOV');
    expect(c).toContain('Sem benchmark');
  });

  it('CDI p.p., unavailable, partial, tooltip', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain('CDI indisponível');
    expect(c).toContain('p.p. vs. CDI');
    expect(c).toContain('Comparação parcial');
    expect(c).toContain('O CDI é uma referência');
  });

  it('benchmark selector accessible and no client rate math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('Selecionar benchmark');
    expect(c).not.toMatch(/parseFloat|Number\(|Math\.pow/);
    expect(c).not.toMatch(/calculateRateBenchmarkReturn|accumulatedFactor|dailyFactor/);
  });

  it('no benchmark regression and XIRR kept separate', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(c).toContain("useState<string>('')");
    expect(c).toContain('XIRR');
    expect(c).toContain('TWR');
  });
});
