import { describe, it, expect } from 'vitest';

describe('Web Risk-Adjusted Section', () => {
  it('section component exists with Sharpe + Sortino cards', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskAdjustedSection.tsx');
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('risk-adjusted-sharpe');
    expect(c).toContain('risk-adjusted-sortino');
    expect(c).toContain('Retorno ajustado ao risco');
  });

  it('shows CDI reference label and tooltips, no qualitative labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskAdjustedSection.tsx'),
      'utf8',
    );
    // Literal label text lives in the shared view-model; the component renders it.
    expect(c).toContain('cur.riskFreeLabel');
    const vm = fs.readFileSync(
      path.join(process.cwd(), 'packages/ui/src/view-models/portfolio-risk-adjusted.view-model.ts'),
      'utf8',
    );
    expect(vm).toContain('Referência usada:');
    expect(c).toContain('O índice de Sharpe relaciona o retorno excedente histórico');
    expect(c).toContain('O índice de Sortino relaciona o retorno excedente histórico');
    expect(c).not.toMatch(/Excelente|Bom\b|Ruim|Abaixo do ideal/);
  });

  it('performs no risk-adjusted math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskAdjustedSection.tsx'),
      'utf8',
    );
    expect(c).not.toMatch(/calculateSharpeRatio/);
    expect(c).not.toMatch(/calculateSortinoRatio/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/Math\.pow/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('performance page fetches risk-adjusted with period and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(page).toContain('/performance/risk-adjusted');
    expect(page).toContain('riskAdjustedQueryKey');
    expect(page).toContain('RiskAdjustedSection');
    const section = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskAdjustedSection.tsx'),
      'utf8',
    );
    expect(section).toContain('Não foi possível carregar o retorno ajustado ao risco.');
    expect(section).toContain('Histórico insuficiente para calcular Sharpe e Sortino.');
    expect(section).toContain('Dados parciais para retorno ajustado ao risco.');
    expect(section).toContain('Indisponível sem referência compatível.');
  });

  it('ratios render without percent sign', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'packages/ui/src/view-models/portfolio-risk-adjusted.view-model.ts'),
      'utf8',
    );
    expect(c).toContain('formatRatio');
    expect(c).not.toMatch(/formatPercentage\(c\.sharpe/);
  });
});
