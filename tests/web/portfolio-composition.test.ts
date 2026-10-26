import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-C (web) — portfolio composition surface.
 *
 * Canonical dimension breakdowns over one known denominator: tables with
 * category/value/weight/positions, coverage + unclassified handling, top
 * positions with asset navigation, neutral concentration facts. No scores,
 * no judgment, no recommendations.
 */
describe('Phase 5R-C: portfolio composition web surface', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioCompositionSection.tsx'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/page.tsx'),
    'utf8',
  );

  it('fetches the composition endpoint inside the allocation tab', () => {
    expect(section).toContain('/api/v1/portfolios/${portfolioId}/composition');
    expect(section).toContain('queryKey: compositionQueryKey(portfolioId');
    expect(page).toContain(
      '<PortfolioCompositionSection portfolioId={activePortfolio?.id ?? null} />',
    );
    expect(section).toContain('data-testid="portfolio-composition"');
  });

  it('offers a dimension selector limited to available dimensions', () => {
    for (const label of ['Ativos', 'Classe', 'Moeda', 'Bolsa']) {
      expect(section).toContain(label);
    }
    expect(section).toContain('composition-dimension-');
    expect(section).toContain('aria-pressed');
    expect(section).not.toMatch(/Emissor|Setor/);
  });

  it('renders tables with category, value, weight and position counts', () => {
    expect(section).toContain('composition-table-');
    expect(section).toContain('scope="col"');
    expect(section).toContain('Posições');
    expect(section).toContain('formatScenarioMoney');
    expect(section).toContain('formatScenarioBp');
    expect(section).toContain('(sem classificação)');
  });

  it('qualifies partial coverage and lists unvalued positions without dropping them', () => {
    expect(section).toContain('do valor conhecido');
    expect(section).toContain('data-testid="composition-coverage-warning"');
    expect(section).toContain('data-testid="composition-unvalued"');
    expect(section).toContain('Sem cotação');
    expect(section).not.toMatch(/completamente diversificada|totalmente coberta/i);
  });

  it('shows top positions with navigation and neutral concentration facts', () => {
    expect(section).toContain('data-testid="composition-top-positions"');
    expect(section).toContain('Maiores posições');
    expect(section).toContain('/portfolio/assets/${row.assetId}');
    expect(section).toContain('Ver posição');
    expect(section).toContain('data-testid="composition-concentration-facts"');
    expect(section).toContain('Maior posição:');
    expect(section).toContain('Maior classe:');
  });

  it('renders limitations with neutral copy', () => {
    expect(section).toContain('describeCompositionLimitation');
    expect(section).toContain('composition-limitation-');
  });

  it('is accessible with headings, labels and touch targets', () => {
    expect(section).toContain('<h4');
    expect(section).toContain('aria-label=');
    expect(section).toContain('role="group"');
    expect(section).toContain('minHeight: 44');
  });

  it('carries no score, judgment, recommendation or forecast language', () => {
    for (const [name, content] of [
      ['section', section],
      ['page', page],
    ] as const) {
      expect(content, name).not.toMatch(
        /diversificada|concentrad[ao]|arriscad|baixo risco|alto risco|ideal|recomendamos|rebalancear|score|rating|buy now|sell now|forecast|previsão/i,
      );
    }
  });
});
