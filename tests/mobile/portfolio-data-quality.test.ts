import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-E (mobile) — portfolio and position data quality stay read-only.
 * Status, counts, issues by position/domain, reconciliation summary and
 * structural notes. Text only, navigation for actions. No scores, no advice.
 */
describe('Phase 5R-E (mobile): data quality read-only', () => {
  const portfolio = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePortfolioDataQualitySection.tsx',
    ),
    'utf8',
  );
  const position = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePositionDataQualitySection.tsx',
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

  it('fetches the lazy quality endpoints and renders on portfolio and asset pages', () => {
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/data-quality');
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/positions/${assetId}/data-quality');
    expect(portfolio).toContain('portfoliosApi.getPortfolioDataQuality(');
    expect(position).toContain('portfoliosApi.getPositionDataQuality(');
    expect(portfolioPage).toContain('MobilePortfolioDataQualitySection');
    expect(assetPage).toContain('MobilePositionDataQualitySection');
    expect(portfolio).toContain('testID="portfolio-data-quality"');
    expect(position).toContain('testID="position-data-quality"');
  });

  it('shows status, counts, issues and reconciliation', () => {
    expect(portfolio).toContain('QUALIDADE DOS DADOS');
    expect(portfolio).toContain('testID="data-quality-status"');
    expect(portfolio).toContain('testID="data-quality-counts"');
    expect(portfolio).toContain('testID="data-quality-by-domain"');
    expect(portfolio).toContain('testID="data-quality-reconciliation"');
    expect(position).toContain('DADOS E PENDÊNCIAS');
    expect(position).toContain('position-data-quality-status');
    expect(position).toContain('position-data-quality-clean');
    expect(position).toContain('describeDataQualityStatus');
  });

  it('navigates to positions and renders structural notes', () => {
    expect(portfolio).toContain('/(app)/portfolio/${row.assetId}?portfolioId=${portfolioId}');
    expect(portfolio).toContain('accessibilityLabel={`Ver posição');
    expect(portfolio).toContain('describeCompositionLimitation');
    expect(portfolio).toContain('data-quality-structural-');
  });

  it('exposes no execution paths and no advice language', () => {
    expect(portfolio).not.toMatch(/Comprar agora|Executar aporte|Corrigir|Aceitar|Reparar/);
    expect(position).not.toMatch(/Comprar agora|Executar aporte|Corrigir|Aceitar|Reparar/);
    for (const [name, content] of [
      ['portfolio', portfolio],
      ['position', position],
    ] as const) {
      expect(content, name).not.toMatch(
        /score|rating|boa carteira|má carteira|arriscada|recomendamos|forecast|previsão|buy now|sell now|saudável/i,
      );
    }
  });
});
