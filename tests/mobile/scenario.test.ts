import { describe, it, expect } from 'vitest';

const SECTION = 'apps/mobile/src/components/portfolio/MobileScenarioSection.tsx';
const SCREEN = 'apps/mobile/app/(app)/portfolio/performance.tsx';

describe('Mobile Scenario Section', () => {
  it('section exists with preset selector, custom inputs and run button', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), SECTION);
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('Simulação de cenários');
    expect(c).toContain('scenario-section');
    expect(c).toContain('scenario-preset-');
    expect(c).toContain('scenario-input-equity');
    expect(c).toContain('scenario-run');
    expect(c).toContain('scenario-result-');
  });

  it('has accessibility labels, partial/beta/rate messages and no forecast wording', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('Algumas posições não puderam ser avaliadas neste cenário.');
    expect(c).toContain('Estimativa baseada no beta histórico da carteira');
    expect(c).toContain('Este cenário exige dados de sensibilidade de juros');
    expect(c).not.toMatch(/perda esperada|previsão de|vai cair|probabilidade|garantia/i);
    expect(c).not.toMatch(/stressedValue\s*=(?!=)/);
    expect(c).not.toMatch(/modifiedDuration\s*\*/);
    expect(c).not.toMatch(/Math\.sqrt/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('mobile screen renders the scenario section', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screen).toContain('MobileScenarioSection');
    expect(screen).not.toMatch(/applyScenario/);
    expect(screen).not.toMatch(/Math\.pow/);
  });
});
