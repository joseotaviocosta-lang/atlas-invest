import { describe, it, expect } from 'vitest';

const SECTION = 'apps/web/src/components/portfolio/ActivePerformanceSection.tsx';
const VM = 'packages/ui/src/view-models/portfolio-active-performance.view-model.ts';
const PAGE = 'apps/web/src/app/(app)/portfolio/performance/page.tsx';

describe('Web Active Performance Section', () => {
  it('section exists with Alpha + Information Ratio + Treynor cards', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), SECTION);
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('active-performance-alpha');
    expect(c).toContain('active-performance-ir');
    expect(c).toContain('active-performance-treynor');
    expect(c).toContain('Desempenho ativo');
  });

  it('shows IBOV/CDI references and tooltips, no qualitative labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(c).toContain('viewModel.marketBenchmarkLabel');
    expect(c).toContain('viewModel.riskFreeLabel');
    expect(vm).toContain('Benchmark de mercado:');
    expect(vm).toContain('Referência usada:');
    expect(c).toContain('O alpha compara o retorno histórico da carteira');
    expect(c).toContain('O Information Ratio relaciona o retorno ativo histórico');
    expect(c).toContain('O índice de Treynor relaciona o retorno histórico excedente');
    expect(c).not.toMatch(/Excelente|Bom\b|Ruim|alpha bom|alpha ruim|bom IR|Treynor alto/i);
  });

  it('never presents historical metrics as forecasts', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/deve subir|deve cair|se o Ibovespa subir/i);
    expect(c).toContain('não previsões');
  });

  it('performs no active-performance math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/calculateJensenAlpha/);
    expect(c).not.toMatch(/calculateInformationRatio/);
    expect(c).not.toMatch(/calculateTreynorRatio/);
    expect(c).not.toMatch(/expectedReturn\s*=(?!=)/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/Math\.pow/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('performance page fetches active performance and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('/performance/active');
    expect(page).toContain('activePerformanceQueryKey');
    expect(page).toContain('ActivePerformanceSection');
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar o desempenho ativo.');
    expect(section).toContain('Histórico insuficiente para calcular métricas de desempenho ativo.');
    expect(section).toContain('Dados parciais para métricas de desempenho ativo.');
    expect(section).toContain('Indisponível sem referências compatíveis.');
  });

  it('alpha is percentage, IR is a ratio without percent', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(vm).toContain('formatPercentage(c.alpha.periodPercentage');
    expect(vm).toContain('formatRatio(c.informationRatio.daily)');
    expect(vm).toContain('formatPercentage(c.treynor.periodPercentagePerBeta)');
  });
});
