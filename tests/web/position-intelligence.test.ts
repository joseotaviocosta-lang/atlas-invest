import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-A (web) — position intelligence detail surface.
 *
 * Facts composed from canonical sources: quantity/costs, valuation,
 * allocation weight, income, realized disposals, recent activity and
 * data-quality limitations. No scores, ratings, recommendations,
 * forecasts or execution language.
 */
describe('Phase 5R-A: position intelligence web surface', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PositionIntelligenceSection.tsx'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/assets/[assetId]/page.tsx'),
    'utf8',
  );

  it('fetches the intelligence endpoint for the open position', () => {
    expect(section).toContain(
      '/api/v1/portfolios/${portfolioId}/positions/${assetId}/intelligence',
    );
    expect(section).toContain("queryKey: ['position-intelligence', portfolioId, assetId]");
    expect(page).toContain('PositionIntelligenceSection');
    expect(page).toContain(
      '<PositionIntelligenceSection portfolioId={activePortfolioId} assetId={assetId} />',
    );
  });

  it('renders valuation, price date and allocation weight with qualifiers', () => {
    expect(section).toContain('data-testid="position-intelligence"');
    expect(section).toContain('data-testid="position-intelligence-valuation"');
    expect(section).toContain('data-testid="position-market-value"');
    expect(section).toContain('Último preço disponível:');
    expect(section).toContain('Preço indisponível para esta posição.');
    expect(section).toContain('do valor conhecido da carteira');
    expect(section).toContain('Participação indisponível sem valor avaliado.');
    expect(section).toContain('Dados de mercado até');
    expect(section).toContain('Ver alocação da carteira');
    expect(section).not.toMatch(/preço atual/i);
  });

  it('shows unrealized results with explicit signs and realized disposals factually', () => {
    expect(section).toContain('data-testid="position-unrealized"');
    expect(section).toContain('Resultado não realizado:');
    expect(section).toContain('Vendas realizadas');
    expect(section).toContain('Nenhuma venda registrada para esta posição.');
  });

  it('shows income totals, recent income and bounded activity', () => {
    expect(section).toContain('data-testid="position-intelligence-income"');
    expect(section).toContain('Renda recebida');
    expect(section).toContain('data-testid="position-intelligence-activity"');
    expect(section).toContain('Atividade recente');
    expect(section).not.toMatch(/rendimento esperado|projeção|yield/i);
  });

  it('states unavailable performance factually and lists data limitations', () => {
    expect(section).toContain('O resultado detalhado por posição ainda não está disponível.');
    expect(section).toContain('data-testid="position-intelligence-limitations"');
    expect(section).toContain('Dados e limitações');
    expect(section).toContain('Indisponível');
  });

  it('navigates back to allocation and keeps history scrollable', () => {
    expect(section).toContain('/portfolio?tab=allocation&portfolioId=${portfolioId}');
    expect(section).toContain('aria-label="Ver alocação da carteira"');
  });

  it('is accessible with headings, labels and touch targets', () => {
    expect(section).toContain('<h4');
    expect(section).toContain('aria-label=');
    expect(section).toContain('aria-live="polite"');
    expect(section).toContain('minHeight: 44');
  });

  it('carries no recommendation, score, rating or forecast language', () => {
    for (const [name, content] of [
      ['section', section],
      ['page', page],
    ] as const) {
      expect(content, name).not.toMatch(
        /você deveria|deve (investir|comprar|vender)|recomendamos|ideal|ótimo|bom investimento|attractive|cheap|expensive|score|rating|buy now|sell now|hold\b|targetPrice|fair value|previsão|forecast|projeção/i,
      );
    }
  });
});
