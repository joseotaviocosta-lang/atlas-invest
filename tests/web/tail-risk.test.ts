import { describe, it, expect } from 'vitest';

const SECTION = 'apps/web/src/components/portfolio/TailRiskSection.tsx';
const VM = 'packages/ui/src/view-models/portfolio-tail-risk.view-model.ts';
const PAGE = 'apps/web/src/app/(app)/portfolio/performance/page.tsx';

describe('Web Tail Risk Section', () => {
  it('section exists with confidence selector and four cards', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), SECTION);
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('Risco de cauda');
    expect(c).toContain('tail-confidence-');
    expect(c).toContain('tail-downside-');
    expect(c).toContain('tail-semideviation-');
    expect(c).toContain('tail-var-');
    expect(c).toContain('tail-cvar-');
    expect(c).toContain('tail-risk-section');
  });

  it('shows the four tooltips and no guarantee/forecast/qualitative wording', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(vm).toContain('Mostra a dispersão histórica dos retornos abaixo de zero.');
    expect(vm).toContain('abaixo da média da própria série');
    expect(vm).toContain('limiar de perda diária');
    expect(vm).toContain('perda média histórica observada');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/perda máxima|você não perderá|99% de certeza|garantia/i);
    expect(c).not.toMatch(/seguro|arriscado|alto risco|baixo risco|previsão de|vai subir/i);
    // Historical language lives in the shared view-model.
    expect(vm).toContain('não previsões');
  });

  it('performs no tail-risk math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/calculateDownsideDeviation/);
    expect(c).not.toMatch(/calculateSemideviation/);
    expect(c).not.toMatch(/calculateHistoricalVar/);
    expect(c).not.toMatch(/calculateHistoricalCvar/);
    expect(c).not.toMatch(/\.sort\(/);
    expect(c).not.toMatch(/quantile\s*\(/i);
    expect(c).not.toMatch(/Math\.pow/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('performance page fetches tail risk with confidence and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('/performance/tail-risk');
    expect(page).toContain('tailRiskQueryKey');
    expect(page).toContain('confidenceLevel=');
    expect(page).toContain('TailRiskSection');
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar o risco de cauda.');
    expect(section).toContain('Histórico insuficiente para calcular esta métrica.');
    expect(section).toContain('Dados parciais para métricas de risco de cauda.');
  });

  it('renders VaR/CVaR losses as magnitudes (non-negative) via formatPercentage', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(vm).toContain('formatPercentage(c.historicalVar.lossPercentage)');
    expect(vm).toContain('formatPercentage(c.historicalCvar.lossPercentage)');
    // No showSign on loss magnitudes.
    expect(vm).not.toContain('lossPercentage, { showSign: true }');
  });
});
