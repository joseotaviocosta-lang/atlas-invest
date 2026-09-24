import { describe, it, expect } from 'vitest';

const SECTION = 'apps/mobile/src/components/portfolio/MobileActivePerformanceSection.tsx';
const SCREEN = 'apps/mobile/app/(app)/portfolio/performance.tsx';

describe('Mobile Active Performance Section', () => {
  it('section exists with Alpha + Information Ratio + Treynor', async () => {
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

  it('has accessibility labels and IBOV/CDI references, no qualitative labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('viewModel.marketBenchmarkLabel');
    expect(c).toContain('viewModel.riskFreeLabel');
    expect(c).toContain('Indisponível sem referências compatíveis.');
    expect(c).not.toMatch(/Excelente|Bom\b|Ruim|alpha bom|Treynor alto/i);
    expect(c).not.toMatch(/deve subir|deve cair|se o Ibovespa subir/i);
    expect(c).not.toMatch(/calculateJensenAlpha/);
    expect(c).not.toMatch(/calculateInformationRatio/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('mobile screen fetches active performance and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screen).toContain('/performance/active');
    expect(screen).toContain('MobileActivePerformanceSection');
    expect(screen).not.toMatch(/calculateTreynorRatio/);
    expect(screen).not.toMatch(/Math\.pow/);
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar o desempenho ativo.');
    expect(section).toContain('Histórico insuficiente para calcular métricas de desempenho ativo.');
  });
});
