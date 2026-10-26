import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5S-A (mobile) — operations center stays compact and read-only.
 * Status, attention count, integration/reconciliation/data-quality
 * summaries and recent runs. Text only, navigation where routes exist.
 */
describe('Phase 5S-A (mobile): operations center read-only', () => {
  const section = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePortfolioOperationsSection.tsx',
    ),
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

  it('fetches the lazy operations endpoint and renders on the portfolio tab', () => {
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/operations-center');
    expect(section).toContain('portfoliosApi.getPortfolioOperations(');
    expect(page).toContain('MobilePortfolioOperationsSection');
    expect(section).toContain('testID="portfolio-operations"');
  });

  it('shows status, counts, summaries and recent runs', () => {
    expect(section).toContain('CENTRAL DE OPERAÇÕES');
    expect(section).toContain('testID="operations-status"');
    expect(section).toContain('testID="operations-attention-count"');
    expect(section).toContain('testID="operations-attention"');
    expect(section).toContain('testID="operations-integrations"');
    expect(section).toContain('testID="operations-reconciliation"');
    expect(section).toContain('testID="operations-data-quality"');
    expect(section).toContain('testID="operations-recent-runs"');
    expect(section).toContain('Nenhuma pendência operacional identificada.');
  });

  it('navigates only where native routes exist', () => {
    expect(section).toContain('/(app)/reviews');
    expect(section).toContain('/(app)/(tabs)/portfolio');
    expect(section).toContain('testID={`operations-action-${action.type}`}');
    expect(section).not.toContain('/portfolio/import');
  });

  it('exposes no execution paths and no advice language', () => {
    expect(section).not.toMatch(/Sincronizar|Corrigir|Aceitar|Reparar|Importar agora/);
    expect(section).not.toMatch(
      /score|rating|boa carteira|má carteira|arriscada|recomendamos|forecast|previsão|buy now|sell now|saudável/i,
    );
  });
});
