import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-B (web) — position performance section.
 *
 * Lazy TWR with period presets, P&L components, economic total, monthly
 * contribution table and honest limitations. No scores, rankings,
 * recommendations or forecasts; gains carry explicit signs.
 */
describe('Phase 5R-B: position performance web surface', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PositionPerformanceSection.tsx'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/assets/[assetId]/page.tsx'),
    'utf8',
  );

  it('fetches the lazy performance endpoint with a period selector', () => {
    expect(section).toContain('/api/v1/portfolios/${portfolioId}/positions/${assetId}/performance');
    expect(section).toContain("queryKey: ['position-performance', portfolioId, assetId, preset");
    for (const preset of ['1M', '3M', '6M', 'YTD', '1A', 'Desde o início']) {
      expect(section).toContain(preset);
    }
    expect(page).toContain(
      '<PositionPerformanceSection portfolioId={activePortfolioId} assetId={assetId} />',
    );
  });

  it('shows return, P&L components and economic total with explicit signs', () => {
    expect(section).toContain('data-testid="performance-return"');
    expect(section).toContain('Retorno no período:');
    expect(section).toContain('data-testid="performance-pnl"');
    expect(section).toContain('Componentes do resultado');
    expect(section).toContain('data-testid="performance-unavailable"');
    expect(section).toContain(
      'O resultado detalhado por posição ainda não está disponível para este período.',
    );
  });

  it('shows the monthly contribution table with weights, never current-weight math', () => {
    expect(section).toContain('data-testid="performance-contribution"');
    expect(section).toContain('Contribuição para a carteira');
    expect(section).toContain(
      'Quanto esta posição contribuiu para a variação da carteira no período.',
    );
    expect(section).toContain('portfolioReturnOnGrid');
    expect(section).not.toMatch(/currentWeight/);
  });

  it('states market data date and limitations factually', () => {
    expect(section).toContain('Dados de mercado até');
    expect(section).toContain('describePositionLimitation');
    expect(section).toContain('data-testid="position-performance"');
  });

  it('is accessible with headings, labels and touch targets', () => {
    expect(section).toContain('<h4');
    expect(section).toContain('aria-label=');
    expect(section).toContain('aria-pressed');
    expect(section).toContain('role="group"');
    expect(section).toContain('minHeight: 44');
  });

  it('carries no ranking, recommendation, score or forecast language', () => {
    for (const [name, content] of [
      ['section', section],
      ['page', page],
    ] as const) {
      expect(content, name).not.toMatch(
        /melhor ativo|pior ativo|top performer|recomendamos|ideal|ótimo|score|rating|buy now|sell now|forecast|previsão|expected return|sharpe/i,
      );
    }
  });
});
