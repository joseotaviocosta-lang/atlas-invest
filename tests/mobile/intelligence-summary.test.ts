import { describe, it, expect } from 'vitest';

const SECTION = 'apps/mobile/src/components/portfolio/MobileIntelligenceSummarySection.tsx';
const SCREEN = 'apps/mobile/app/(app)/portfolio/performance.tsx';

describe('Mobile Portfolio Intelligence Summary Section', () => {
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

  it('has accessibility labels and no recommendation/score wording', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).toContain('accessibilityLabel');
    expect(c).not.toMatch(/recomend|deveria|riskScore|healthScore|rating|ranking/i);
    expect(c).not.toMatch(/calculateSharpeRatio|calculateBeta|Math\.pow|parseFloat/);
  });

  it('mobile screen renders the intelligence summary section', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screen).toContain('MobileIntelligenceSummarySection');
    expect(screen).toContain('/intelligence/summary');
  });
});
