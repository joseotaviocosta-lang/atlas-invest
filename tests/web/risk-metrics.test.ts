import { describe, it, expect } from 'vitest';

describe('Web Risk Metrics Section', () => {
  it('risk section component exists with volatility + drawdown cards', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskMetricsSection.tsx');
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('risk-volatility');
    expect(c).toContain('risk-max-drawdown');
    expect(c).toContain('risk-current-drawdown');
  });

  it('uses historical language with tooltips, zero line not required', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskMetricsSection.tsx'),
      'utf8',
    );
    expect(c).toContain('Risco histórico');
    expect(c).toContain('Volatilidade mede quanto os retornos históricos oscilaram');
    expect(c).toContain('Máxima queda mostra a maior perda percentual');
    expect(c).not.toMatch(/baixo risco|alto risco|risco futuro/i);
  });

  it('performs no risk math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskMetricsSection.tsx'),
      'utf8',
    );
    expect(c).not.toMatch(/calculateRealizedVolatility/);
    expect(c).not.toMatch(/calculateDrawdown/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/Math\.pow/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('performance page fetches risk with period and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/performance/page.tsx'),
      'utf8',
    );
    expect(page).toContain('/performance/risk');
    expect(page).toContain('riskQueryKey');
    expect(page).toContain('PortfolioRiskSection');
    // Failure/empty UX copy lives in the section component (failure isolation).
    const section = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskMetricsSection.tsx'),
      'utf8',
    );
    expect(section).toContain('Não foi possível carregar as métricas de risco.');
    expect(section).toContain('Histórico insuficiente para calcular métricas de risco.');
    expect(section).toContain('Dados parciais para métricas de risco.');
  });

  it('open drawdown and recovery states covered', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/RiskMetricsSection.tsx'),
      'utf8',
    );
    expect(c).toContain('Não recuperado no período');
    expect(c).toContain('Recuperação:');
    expect(c).toContain('Pico:');
    expect(c).toContain('Fundo:');
  });
});
