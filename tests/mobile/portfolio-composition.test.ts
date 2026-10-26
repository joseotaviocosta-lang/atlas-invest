import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-C (mobile) — portfolio composition read-only.
 * Summary, dimension selector, per-bucket rows, coverage, unclassified
 * handling, top positions with asset navigation, neutral facts.
 * No charts, no scores, no advice. ASSET rows navigate to 5R-A detail.
 */
describe('Phase 5R-C (mobile): portfolio composition read-only', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileCompositionSection.tsx'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/app/(app)/(tabs)/portfolio.tsx'),
    'utf8',
  );
  const api = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/api/portfolios.ts'),
    'utf8',
  );

  it('fetches the composition endpoint and renders on the portfolio screen', () => {
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/composition');
    expect(section).toContain('portfoliosApi.getPortfolioComposition(portfolioId)');
    expect(section).toContain("queryKey: ['portfolio-composition', portfolioId]");
    expect(page).toContain('MobileCompositionSection');
    expect(section).toContain('testID="portfolio-composition"');
  });

  it('offers a dimension selector limited to available dimensions', () => {
    for (const label of ['Ativos', 'Classe', 'Moeda', 'Bolsa']) {
      expect(section).toContain(label);
    }
    expect(section).toContain('composition-dimension-');
    expect(section).toContain('accessibilityState={{ selected: dimension === code }}');
    expect(section).not.toMatch(/Emissor|Setor/);
  });

  it('shows buckets with value, weight and position counts', () => {
    expect(section).toContain('composition-table-');
    expect(section).toContain('(sem classificação)');
    expect(section).toContain('posição');
    expect(section).toContain('formatScenarioBp');
    expect(section).toContain('formatScenarioMoney');
  });

  it('qualifies partial coverage and keeps unvalued positions visible', () => {
    expect(section).toContain('do valor conhecido da');
    expect(section).toContain('testID="composition-coverage-warning"');
    expect(section).toContain('testID="composition-unvalued"');
    expect(section).toContain('SEM COTAÇÃO');
  });

  it('shows top positions and neutral concentration facts with asset navigation', () => {
    expect(section).toContain('testID="composition-top-positions"');
    expect(section).toContain('MAIORES POSIÇÕES');
    expect(section).toContain('/(app)/portfolio/');
    expect(section).toContain('testID="composition-concentration-facts"');
    expect(section).toContain('Maior posição:');
    expect(section).toContain('Maior classe:');
  });

  it('renders limitations with neutral copy', () => {
    expect(section).toContain('describeCompositionLimitation');
    expect(section).toContain('composition-limitation-');
  });

  it('offers no dead actions and no execution language', () => {
    expect(section).not.toContain('onPress={() => {}}');
    expect(section).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
    expect(section).not.toMatch(
      /diversificada|concentrad[ao]|arriscad|baixo risco|alto risco|ideal|recomendamos|rebalancear|score|rating|buy now|sell now/i,
    );
  });

  it('is accessible with labels and selection state', () => {
    expect(section).toContain('accessibilityRole="button"');
    expect(section).toContain('accessibilityLabel=');
  });
});
