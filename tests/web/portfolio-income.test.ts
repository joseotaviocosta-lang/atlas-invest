import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-D (web) — portfolio and position income surfaces.
 *
 * Portfolio: lazy endpoint with period selector, per-type totals,
 * monthly timeline, factual by-position table with navigation and
 * neutral concentration facts. Position: lifecycle totals, timeline,
 * share and recent events. No yield, no forecast, no advice.
 */
describe('Phase 5R-D: income web surfaces', () => {
  const portfolio = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioIncomeSection.tsx'),
    'utf8',
  );
  const position = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PositionIncomeSection.tsx'),
    'utf8',
  );
  const portfolioPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/page.tsx'),
    'utf8',
  );
  const assetPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/assets/[assetId]/page.tsx'),
    'utf8',
  );

  it('fetches the lazy income endpoints with a period selector', () => {
    expect(portfolio).toContain('/api/v1/portfolios/${portfolioId}/income-intelligence');
    expect(portfolio).toContain("queryKey: ['portfolio-income', portfolioId, preset");
    expect(position).toContain('/api/v1/portfolios/${portfolioId}/positions/${assetId}/income');
    expect(position).toContain("queryKey: ['position-income', portfolioId, assetId, preset");
    for (const preset of ['1M', '3M', '6M', 'YTD', '1A', 'Desde o início']) {
      expect(portfolio).toContain(preset);
      expect(position).toContain(preset);
    }
    expect(portfolioPage).toContain('<PortfolioIncomeSection portfolioId={activePortfolio.id} />');
    expect(assetPage).toContain(
      '<PositionIncomeSection portfolioId={activePortfolioId} assetId={assetId} />',
    );
  });

  it('shows totals by type, timeline and by-position tables', () => {
    expect(portfolio).toContain('income-total-${');
    expect(portfolio).toContain('Renda no período');
    expect(portfolio).toContain('describePositionTransactionType');
    expect(portfolio).toContain('data-testid="income-timeline"');
    expect(portfolio).toContain('data-testid="income-by-position"');
    expect(portfolio).toContain('Renda por posição');
    expect(portfolio).toContain('scope="col"');
    expect(position).toContain('position-income-total-${');
    expect(position).toContain('position-income-timeline');
    expect(position).toContain('position-income-recent');
    expect(position).toContain('Eventos recentes');
  });

  it('states portfolio share factually and concentration without judgment', () => {
    expect(position).toContain('position-income-share-${');
    expect(position).toContain('da renda conhecida da');
    expect(portfolio).toContain('income-concentration-${');
    expect(portfolio).toContain('Maior participação:');
    expect(portfolio).toContain('3 maiores posições:');
    expect(portfolio).not.toMatch(/melhor pagadora|pior pagadora|diversifique/i);
  });

  it('navigates only for open positions and renders limitations', () => {
    expect(portfolio).toContain('/portfolio/assets/${row.assetId}');
    expect(portfolio).toContain('hasDetail');
    expect(portfolio).toContain('(encerrada)');
    expect(portfolio).toContain('describeIncomeLimitation');
    expect(position).toContain('describeIncomeLimitation');
  });

  it('is accessible with headings, labels and touch targets', () => {
    for (const [name, content] of [
      ['portfolio', portfolio],
      ['position', position],
    ] as const) {
      expect(content, name).toContain('<h4');
      expect(content, name).toContain('aria-label=');
      expect(content, name).toContain('aria-pressed');
      expect(content, name).toContain('role="group"');
      expect(content, name).toContain('minHeight: 44');
    }
  });

  it('carries no yield, forecast, score or advice language', () => {
    for (const [name, content] of [
      ['portfolio', portfolio],
      ['position', position],
      ['portfolioPage', portfolioPage],
      ['assetPage', assetPage],
    ] as const) {
      expect(content, name).not.toMatch(
        /melhor pagadora|pior pagadora|renda ideal|diversifique|compre|venda|yield|previsão|forecast|annualiz|score|rating|buy now|sell now/i,
      );
    }
  });
});
