import { describe, it, expect } from 'vitest';

describe('Mobile Risk-Adjusted Section', () => {
  it('section component exists with Sharpe + Sortino', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobileRiskAdjustedSection.tsx',
    );
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('risk-adjusted-sharpe');
    expect(c).toContain('risk-adjusted-sortino');
    expect(c).toContain('Retorno ajustado ao risco');
  });

  it('has accessibility labels and CDI reference, no qualitative labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(
        process.cwd(),
        'apps/mobile/src/components/portfolio/MobileRiskAdjustedSection.tsx',
      ),
      'utf8',
    );
    expect(c).toContain('accessibilityLabel');
    // Literal label text lives in the shared view-model; the component renders it.
    expect(c).toContain('cur.riskFreeLabel');
    const vm = fs.readFileSync(
      path.join(process.cwd(), 'packages/ui/src/view-models/portfolio-risk-adjusted.view-model.ts'),
      'utf8',
    );
    expect(vm).toContain('Referência usada:');
    expect(c).toContain('Indisponível sem referência compatível.');
    expect(c).not.toMatch(/Excelente|Bom\b|Ruim|Abaixo do ideal/);
    expect(c).not.toMatch(/calculateSharpeRatio/);
    expect(c).not.toMatch(/calculateSortinoRatio/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('mobile screen fetches risk-adjusted and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/performance.tsx'),
      'utf8',
    );
    expect(screen).toContain('/performance/risk-adjusted');
    expect(screen).toContain('MobileRiskAdjustedSection');
    expect(screen).not.toMatch(/calculateSharpeRatio/);
    expect(screen).not.toMatch(/Math\.pow/);
    const section = fs.readFileSync(
      path.join(
        process.cwd(),
        'apps/mobile/src/components/portfolio/MobileRiskAdjustedSection.tsx',
      ),
      'utf8',
    );
    expect(section).toContain('Não foi possível carregar o retorno ajustado ao risco.');
    expect(section).toContain('Histórico insuficiente para calcular Sharpe e Sortino.');
  });
});
