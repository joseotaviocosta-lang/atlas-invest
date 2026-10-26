import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-E (web) — portfolio and position data quality surfaces.
 *
 * Status, counts, issues by position/domain, reconciliation summary and
 * structural notes with safe navigation. No scores, no repairs, no advice.
 */
describe('Phase 5R-E: data quality web surfaces', () => {
  const portfolio = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioDataQualitySection.tsx'),
    'utf8',
  );
  const position = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PositionDataQualitySection.tsx'),
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

  it('fetches the lazy quality endpoints and renders on portfolio and asset pages', () => {
    expect(portfolio).toContain('/api/v1/portfolios/${portfolioId}/data-quality');
    expect(position).toContain(
      '/api/v1/portfolios/${portfolioId}/positions/${assetId}/data-quality',
    );
    expect(portfolioPage).toContain(
      '<PortfolioDataQualitySection portfolioId={activePortfolio.id} />',
    );
    expect(assetPage).toContain(
      '<PositionDataQualitySection portfolioId={activePortfolioId} assetId={assetId} />',
    );
    expect(portfolio).toContain('data-testid="portfolio-data-quality"');
    expect(position).toContain('data-testid="position-data-quality"');
  });

  it('shows status, counts, positions and domain grouping', () => {
    expect(portfolio).toContain('data-testid="data-quality-status"');
    expect(portfolio).toContain('Situação:');
    expect(portfolio).toContain('data-testid="data-quality-counts"');
    expect(portfolio).toContain('posições');
    expect(portfolio).toContain('data-testid="data-quality-by-domain"');
    expect(portfolio).toContain('data-quality-position-${');
    expect(portfolio).toContain('describeDataQualityStatus');
    expect(portfolio).toContain('describeDataQualityDomain');
    expect(position).toContain('position-data-quality-status');
    expect(position).toContain('position-data-quality-clean');
  });

  it('shows issues with impact and safe navigation only', () => {
    expect(portfolio).toContain('describeDataQualityIssue');
    expect(portfolio).toContain('describeDataQualityIssueDetail');
    expect(portfolio).toContain('describeAffectedCapability');
    expect(portfolio).toContain('Afeta:');
    expect(portfolio).toContain('/portfolio/assets/${row.assetId}');
    expect(portfolio).toContain('Ver revisões');
    expect(portfolio).toContain('/reviews?portfolioId=${portfolioId}');
    expect(portfolio).not.toMatch(/Corrigir|Aceitar|Reparar|auto/i);
  });

  it('shows reconciliation aggregates and structural limitations once', () => {
    expect(portfolio).toContain('data-testid="data-quality-reconciliation"');
    expect(portfolio).toContain('Reconciliação');
    expect(portfolio).toContain('Conferidos:');
    expect(portfolio).toContain('data-quality-structural-');
    expect(portfolio).toContain('describeCompositionLimitation');
  });

  it('carries no score, risk, recommendation or forecast language', () => {
    for (const [name, content] of [
      ['portfolio', portfolio],
      ['position', position],
      ['portfolioPage', portfolioPage],
      ['assetPage', assetPage],
    ] as const) {
      expect(content, name).not.toMatch(
        /score|rating|boa carteira|má carteira|arriscada|recomendamos|deveria investir|venda|compre|forecast|previsão|expected return|sharpe|buy now|sell now|saudável/i,
      );
    }
  });
});
