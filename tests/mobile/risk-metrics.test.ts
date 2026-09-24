import { describe, it, expect } from 'vitest';

describe('Mobile Risk Metrics Section', () => {
  it('risk section component exists with volatility + drawdown', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobileRiskSection.tsx',
    );
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('risk-volatility');
    expect(c).toContain('risk-max-drawdown');
    expect(c).toContain('risk-current-drawdown');
  });

  it('has accessibility labels and historical language', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileRiskSection.tsx'),
      'utf8',
    );
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('Risco histórico');
    expect(c).not.toMatch(/baixo risco|alto risco|risco futuro/i);
    expect(c).not.toMatch(/calculateRealizedVolatility/);
    expect(c).not.toMatch(/calculateDrawdown/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('mobile screen fetches risk and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(screen).toContain('/performance/risk');
    expect(screen).toContain('MobileRiskSection');
    expect(screen).not.toMatch(/calculateRealizedVolatility/);
    expect(screen).not.toMatch(/Math\.pow/);
    // Failure/empty UX copy lives in the section component (failure isolation).
    const section = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileRiskSection.tsx'),
      'utf8',
    );
    expect(section).toContain('Não foi possível carregar as métricas de risco.');
    expect(section).toContain('Histórico insuficiente para calcular métricas de risco.');
  });
});
