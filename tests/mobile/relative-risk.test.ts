import { describe, it, expect } from 'vitest';

const SECTION = 'apps/mobile/src/components/portfolio/MobileRelativeRiskSection.tsx';
const SCREEN = 'apps/mobile/app/(app)/portfolio/performance.tsx';

describe('Mobile Relative Risk Section', () => {
  it('section component exists with Beta + Correlation + Tracking Error', async () => {
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

  it('has accessibility labels and IBOV reference, no qualitative labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('cur.benchmarkLabel');
    expect(c).toContain('Indisponível sem benchmark compatível.');
    expect(c).not.toMatch(/Excelente|Bom\b|Ruim|Abaixo do ideal/);
    expect(c).not.toMatch(/Beta alto|Beta baixo|Agressivo|Defensivo/);
    expect(c).not.toMatch(/deve subir|deve cair|se o Ibovespa subir/i);
    expect(c).not.toMatch(/calculateBeta/);
    expect(c).not.toMatch(/calculateCorrelation/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('mobile screen fetches relative-risk with IBOV and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screen).toContain('/performance/relative-risk');
    expect(screen).toContain('benchmark=IBOV');
    expect(screen).toContain('MobileRelativeRiskSection');
    expect(screen).not.toMatch(/calculateBeta/);
    expect(screen).not.toMatch(/Math\.pow/);
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar a relação com o mercado.');
    expect(section).toContain(
      'Histórico insuficiente para calcular métricas relativas ao Ibovespa.',
    );
  });
});
