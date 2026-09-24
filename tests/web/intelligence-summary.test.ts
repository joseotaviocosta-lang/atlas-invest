import { describe, it, expect } from 'vitest';

const SECTION = 'apps/web/src/components/portfolio/IntelligenceSummarySection.tsx';
const VM = 'packages/ui/src/view-models/portfolio-intelligence.view-model.ts';
const PAGE = 'apps/web/src/app/(app)/portfolio/performance/page.tsx';

describe('Web Portfolio Intelligence Summary Section', () => {
  it('section exists with grouped blocks and objective highlights', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), SECTION);
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('Resumo da carteira');
    expect(c).toContain('intelligence-summary-section');
    expect(c).toContain('intelligence-overview-');
    expect(c).toContain('intelligence-performance-');
    expect(c).toContain('intelligence-benchmarks-');
    expect(c).toContain('intelligence-risk-');
    expect(c).toContain('intelligence-tail-');
    expect(c).toContain('intelligence-scenario-');
    expect(c).toContain('intelligence-dataquality-');
    expect(c).toContain('Destaques objetivos');
  });

  it('no recommendation, qualitative judgment or score wording', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(c).not.toMatch(/recomend|deveria|considere|riskScore|healthScore|rating|ranking/i);
    expect(vm).not.toMatch(/excelente|ruim|arriscado|saudável|agressivo|conservador/i);
    expect(c).toContain('não previsões');
  });

  it('performs no summary math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    for (const code of [c, vm]) {
      expect(code).not.toMatch(/calculateSharpeRatio|calculateBeta|calculateTWR/);
      expect(code).not.toMatch(/Math\.pow|parseFloat/);
      expect(code).not.toMatch(/riskScore|dataQualityScore/);
    }
  });

  it('performance page renders the intelligence summary section', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('/intelligence/summary');
    expect(page).toContain('intelligenceSummaryQueryKey');
    expect(page).toContain('IntelligenceSummarySection');
  });
});
