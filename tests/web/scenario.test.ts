import { describe, it, expect } from 'vitest';

const SECTION = 'apps/web/src/components/portfolio/ScenarioSection.tsx';
const VM = 'packages/ui/src/view-models/portfolio-scenario.view-model.ts';
const PAGE = 'apps/web/src/app/(app)/portfolio/performance/page.tsx';

describe('Web Scenario Section', () => {
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
    expect(c).toContain('scenario-input-benchmark');
    expect(c).toContain('scenario-run');
    expect(c).toContain('scenario-result-');
    expect(c).toContain('scenario-base-');
    expect(c).toContain('scenario-stressed-');
    expect(c).toContain('scenario-impact-');
  });

  it('shows partial, beta note and rate-unsupported messages; no forecast/guarantee', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).toContain('Algumas posições não puderam ser avaliadas neste cenário.');
    expect(c).toContain('Estimativa baseada no beta histórico da carteira');
    expect(c).toContain('Este cenário exige dados de sensibilidade de juros');
    expect(c).not.toMatch(/perda esperada|previsão de|vai cair|probabilidade|garantia/i);
    expect(c).toContain('não é previsão');
  });

  it('performs no scenario math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/stressedValue\s*=(?!=)/);
    expect(c).not.toMatch(/modifiedDuration/);
    expect(c).not.toMatch(/applyScenario/);
    expect(c).not.toMatch(/Math\.pow/);
    expect(c).not.toMatch(/parseFloat/);
  });

  it('performance page renders the scenario section', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('ScenarioSection');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).toContain('Impacto estimado no cenário');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(vm).toContain('Hipótese');
  });
});
