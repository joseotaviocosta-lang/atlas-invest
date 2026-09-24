import { describe, it, expect } from 'vitest';

const SECTION = 'apps/mobile/src/components/portfolio/MobileTailRiskSection.tsx';
const SCREEN = 'apps/mobile/app/(app)/portfolio/performance.tsx';

describe('Mobile Tail Risk Section', () => {
  it('section exists with confidence selector and four metrics', async () => {
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

  it('has accessibility labels, tooltips and no guarantee/forecast/qualitative wording', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('TAIL_RISK_TOOLTIPS');
    expect(c).toContain('Histórico insuficiente para calcular esta métrica.');
    expect(c).not.toMatch(/perda máxima|você não perderá|99% de certeza|garantia/i);
    expect(c).not.toMatch(/seguro|arriscado|alto risco|baixo risco|vai subir|previsão de/i);
    expect(c).not.toMatch(/calculateDownsideDeviation/);
    expect(c).not.toMatch(/calculateHistoricalVar/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('mobile screen fetches tail risk with confidence and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screen).toContain('/performance/tail-risk');
    expect(screen).toContain('tailRiskQueryKey');
    expect(screen).toContain('MobileTailRiskSection');
    expect(screen).not.toMatch(/calculateHistoricalCvar/);
    expect(screen).not.toMatch(/Math\.pow/);
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar o risco de cauda.');
  });
});
