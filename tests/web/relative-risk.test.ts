import { describe, it, expect } from 'vitest';

const SECTION = 'apps/web/src/components/portfolio/RelativeRiskSection.tsx';
const VM = 'packages/ui/src/view-models/portfolio-benchmark-relative-risk.view-model.ts';
const PAGE = 'apps/web/src/app/(app)/portfolio/performance/page.tsx';

describe('Web Relative Risk Section', () => {
  it('section component exists with Beta + Correlation + Tracking Error cards', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), SECTION);
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('relative-risk-beta');
    expect(c).toContain('relative-risk-correlation');
    expect(c).toContain('relative-risk-tracking-error');
    expect(c).toContain('Relação com o mercado');
  });

  it('shows IBOV reference label and tooltips, no qualitative labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(vm).toContain('Referência:');
    expect(c).toContain('cur.benchmarkLabel');
    expect(c).toContain('O beta mede a sensibilidade histórica dos retornos da carteira');
    expect(c).toContain('A correlação mostra o grau de associação histórica');
    expect(c).toContain('O tracking error mede quanto os retornos históricos');
    expect(c).not.toMatch(/Excelente|Bom\b|Ruim|Abaixo do ideal/);
    expect(c).not.toMatch(
      /Beta alto|Beta baixo|Boa correlação|Correlação ruim|Agressivo|Defensivo/,
    );
  });

  it('never presents historical relationships as forecasts', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/deve subir|deve cair|se o Ibovespa subir/i);
    expect(c).toContain('não previsões');
  });

  it('performs no relative-risk math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/calculateBeta/);
    expect(c).not.toMatch(/calculateCorrelation/);
    expect(c).not.toMatch(/calculateTrackingError/);
    expect(c).not.toMatch(/covariance\s*\(/);
    expect(c).not.toMatch(/activeReturn\s*=(?!=)/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/Math\.pow/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('performance page fetches relative-risk with IBOV and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('/performance/relative-risk');
    expect(page).toContain('benchmark=IBOV');
    expect(page).toContain('relativeRiskQueryKey');
    expect(page).toContain('RelativeRiskSection');
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar a relação com o mercado.');
    expect(section).toContain(
      'Histórico insuficiente para calcular métricas relativas ao Ibovespa.',
    );
    expect(section).toContain('Dados parciais para comparação com o Ibovespa.');
    expect(section).toContain('Indisponível sem benchmark compatível.');
  });

  it('ratios render without percent sign while tracking error uses percent', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(c).toContain('formatRatio(c.beta)');
    expect(c).toContain('formatRatio(c.correlation)');
    expect(c).toContain('formatPercentage(c.trackingError');
  });
});
