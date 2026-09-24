import { describe, it, expect } from 'vitest';

const SECTION = 'apps/web/src/components/portfolio/RollingAnalyticsSection.tsx';
const CHART = 'apps/web/src/components/portfolio/RollingRiskChart.tsx';
const VM = 'packages/ui/src/view-models/portfolio-rolling-analytics.view-model.ts';
const PAGE = 'apps/web/src/app/(app)/portfolio/performance/page.tsx';

describe('Web Rolling Analytics Section', () => {
  it('section exists with window selector, metric selector and chart', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), SECTION);
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('Evolução do risco');
    expect(c).toContain('rolling-window-');
    expect(c).toContain('rolling-metric-');
    expect(c).toContain('RollingRiskChart');
    expect(c).toContain('rolling-analytics-section');
  });

  it('shows the three metric tooltips and no qualitative/forecast wording', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vm = fs.readFileSync(path.join(process.cwd(), VM), 'utf8');
    expect(vm).toContain('Mostra como a volatilidade histórica anualizada');
    expect(vm).toContain('Mostra como o beta histórico da carteira');
    expect(vm).toContain('Mostra como o índice de Sharpe histórico');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(c).not.toMatch(/risk increasing|good Sharpe|bad Beta|danger|safe/i);
    expect(c).not.toMatch(/volatility is trending|tendência de alta|vai subir|previsão/i);
    expect(c).toContain('não previsões');
  });

  it('performs no rolling math', async () => {
    const fs = await import('fs');
    const path = await import('path');
    for (const f of [SECTION, CHART]) {
      const c = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      expect(c, f).not.toMatch(/calculateRollingVolatility/);
      expect(c, f).not.toMatch(/calculateRollingBeta/);
      expect(c, f).not.toMatch(/calculateRollingSharpe/);
      expect(c, f).not.toMatch(/sampleVariance/);
      expect(c, f).not.toMatch(/covariance\s*\(/);
      expect(c, f).not.toMatch(/Math\.pow/);
      expect(c, f).not.toMatch(/parseFloat/);
    }
  });

  it('chart breaks the line on null gaps', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), CHART), 'utf8');
    // Null points reset the path accumulator (no line across gaps).
    expect(c).toContain('current = []');
    expect(c).toContain('=== null');
  });

  it('performance page fetches rolling with window and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('/performance/rolling');
    expect(page).toContain('rollingAnalyticsQueryKey');
    expect(page).toContain('window=');
    expect(page).toContain('RollingAnalyticsSection');
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar a evolução do risco.');
    expect(section).toContain('Histórico insuficiente para esta janela.');
    expect(section).toContain('Dados parciais para análise móvel.');
  });
});
