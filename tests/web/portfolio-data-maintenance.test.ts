import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5S-D (web) — data maintenance workspace surface.
 *
 * Groups (actionable / navigable / unsupported / structural) with
 * links only to existing flows. No auto-fix, no fix-all, no scores.
 */
describe('Phase 5S-D: maintenance web surface', () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/maintenance/page.tsx'),
    'utf8',
  );
  const operations = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioOperationsSection.tsx'),
    'utf8',
  );

  it('fetches the read-only maintenance endpoint scoped by portfolio', () => {
    expect(page).toContain('/api/v1/portfolios/${portfolioId}/maintenance');
    expect(page).toContain("queryKey: ['portfolio-maintenance', portfolioId]");
    expect(page).toContain('data-testid="portfolio-maintenance"');
    expect(page).not.toMatch(/useMutation|POST|PUT|PATCH|DELETE/);
  });

  it('groups items without fix-all or bulk mutation', () => {
    expect(page).toContain('Pode corrigir no Atlas');
    expect(page).toContain('Requer revisão');
    expect(page).toContain('Sem manutenção disponível');
    expect(page).toContain('Limitações estruturais');
    expect(page).toContain('data-testid="maintenance-summary"');
    expect(page).toContain('data-testid="maintenance-empty"');
    expect(page).not.toMatch(/Corrigir tudo|Fix all|Aplicar todas|auto-fix|AutoFix/i);
  });

  it('links only to existing routes and never a dead CTA', () => {
    // Routes come from the backend policy; the page resolves :portfolioId
    // placeholders and only links UI-navigable routes (never /api/*).
    expect(page).toContain('resolveHref');
    expect(page).toContain("startsWith('/api/')");
    expect(page).toContain('Ver revisões');
    expect(page).toContain('Atualizar dados de mercado');
    expect(page).toContain('Ver operações');
    expect(page).not.toMatch(/Corrigir operação|Editar operação/i);
  });

  it('shows explanations, safety notes and affected capabilities as text', () => {
    expect(page).toContain('item.explanation');
    expect(page).toContain('item.safetyNote');
    expect(page).toContain('Afeta:');
    expect(page).not.toMatch(/score|Score|forecast|previsão|recomendamos/i);
  });

  it('operations center links to maintenance only when work exists', () => {
    expect(operations).toContain('data-testid="operations-maintenance"');
    expect(operations).toContain('Revisar manutenção');
    expect(operations).toContain('/portfolio/maintenance?portfolioId=');
    expect(operations).toContain('data.maintenance.actionable');
  });

  it('position quality shows available actions from the backend policy only', () => {
    const position = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PositionDataQualitySection.tsx'),
      'utf8',
    );
    expect(position).toContain('Ação disponível');
    expect(position).toContain('maintenanceActionLabel');
    expect(position).not.toMatch(/useMutation|Corrigir operação/i);
  });

  it('is accessible with headings, labels and sections', () => {
    expect(page).toContain('<h3');
    expect(page).toContain('aria-label=');
    expect(page).toContain('<section');
  });
});
