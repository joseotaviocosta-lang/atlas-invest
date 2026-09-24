import { describe, it, expect } from 'vitest';

const SECTION = 'apps/mobile/src/components/portfolio/MobileRollingAnalyticsSection.tsx';
const CHART = 'apps/mobile/src/components/portfolio/MobileRollingRiskChart.tsx';
const SCREEN = 'apps/mobile/app/(app)/portfolio/performance.tsx';

describe('Mobile Rolling Analytics Section', () => {
  it('section exists with window selector, metric selector and chart', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), SECTION);
    expect(fs.existsSync(p)).toBe(true);
    const c = fs.readFileSync(p, 'utf8');
    expect(c).toContain('Evolução do risco');
    expect(c).toContain('rolling-window-');
    expect(c).toContain('rolling-metric-');
    expect(c).toContain('MobileRollingRiskChart');
    expect(c).toContain('rolling-analytics-section');
  });

  it('has accessibility labels, gaps handling and no qualitative/forecast wording', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const c = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    const chart = fs.readFileSync(path.join(process.cwd(), CHART), 'utf8');
    expect(c).toContain('accessibilityLabel');
    expect(c).toContain('Histórico insuficiente para esta janela.');
    expect(c).not.toMatch(/risk increasing|good Sharpe|bad Beta|danger|safe/i);
    expect(c).not.toMatch(/vai subir|previsão|tendência de alta/i);
    expect(chart).toContain('=== null');
    expect(chart).not.toMatch(/calculateRollingVolatility/);
    expect(chart).not.toMatch(/variance/i);
  });

  it('mobile screen fetches rolling with window and isolates failures', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const screen = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screen).toContain('/performance/rolling');
    expect(screen).toContain('rollingAnalyticsQueryKey');
    expect(screen).toContain('MobileRollingAnalyticsSection');
    expect(screen).not.toMatch(/calculateRollingSharpe/);
    expect(screen).not.toMatch(/Math\.pow/);
    const section = fs.readFileSync(path.join(process.cwd(), SECTION), 'utf8');
    expect(section).toContain('Não foi possível carregar a evolução do risco.');
  });
});
