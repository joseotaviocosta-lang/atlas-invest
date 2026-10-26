import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-D (mobile) — portfolio and position income stay read-only.
 * Totals by type, monthly timeline, by-position list, share and
 * limitations. Text only, no chart. No yield, forecast or advice.
 */
describe('Phase 5R-D (mobile): income read-only', () => {
  const portfolio = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePortfolioIncomeSection.tsx',
    ),
    'utf8',
  );
  const position = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePositionIncomeSection.tsx',
    ),
    'utf8',
  );
  const portfolioPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/app/(app)/(tabs)/portfolio.tsx'),
    'utf8',
  );
  const assetPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/[assetId].tsx'),
    'utf8',
  );
  const api = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/api/portfolios.ts'),
    'utf8',
  );

  it('fetches the lazy income endpoints and renders on portfolio and asset pages', () => {
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/income-intelligence');
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/positions/${assetId}/income');
    expect(portfolio).toContain('portfoliosApi.getPortfolioIncome(');
    expect(position).toContain('portfoliosApi.getPositionIncome(');
    expect(portfolioPage).toContain('MobilePortfolioIncomeSection');
    expect(assetPage).toContain('MobilePositionIncomeSection');
    expect(portfolio).toContain('testID="portfolio-income"');
    expect(position).toContain('testID="position-income"');
  });

  it('shows totals by type, timeline, by-position and concentration', () => {
    expect(portfolio).toContain('RENDA');
    expect(portfolio).toContain('testID="income-timeline"');
    expect(portfolio).toContain('testID="income-by-position"');
    expect(portfolio).toContain('Renda por posição');
    expect(portfolio).toContain('Concentração da renda');
    expect(portfolio).toContain('Maior participação:');
    expect(position).toContain('RENDA DA POSIÇÃO');
    expect(position).toContain('testID="position-income-timeline"');
    expect(position).toContain('position-income-share-${');
    expect(position).toContain('da renda conhecida da');
  });

  it('offers a period selector without dead controls', () => {
    for (const preset of ['1M', '3M', '6M', 'No ano', '1 ano', 'Desde o início']) {
      expect(portfolio).toContain(preset);
      expect(position).toContain(preset);
    }
    expect(portfolio).toContain('accessibilityState={{ selected: preset === option.value }}');
    expect(portfolio).not.toContain('onPress={() => {}}');
  });

  it('navigates only for open positions and renders limitations', () => {
    expect(portfolio).toContain('hasDetail');
    expect(portfolio).toContain('(encerrada)');
    expect(portfolio).toContain('describeIncomeLimitation');
    expect(position).toContain('describeIncomeLimitation');
  });

  it('exposes no execution paths and no advice language', () => {
    expect(portfolio).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
    expect(position).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
    for (const [name, content] of [
      ['portfolio', portfolio],
      ['position', position],
    ] as const) {
      expect(content, name).not.toMatch(
        /melhor pagadora|pior pagadora|diversifique|yield|previsão|forecast|annualiz|score|rating|buy now|sell now/i,
      );
    }
  });
});
