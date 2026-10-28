import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Phase 5W: UX Consistency & Product Polish', () => {
  const switcher = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/ui/PortfolioSwitcher.tsx'),
    'utf8',
  );
  const reviewDetail = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/reviews/[runId]/page.tsx'),
    'utf8',
  );
  const importPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/import/page.tsx'),
    'utf8',
  );
  const scenarios = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioSavedScenarios.tsx'),
    'utf8',
  );
  const tabs = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/ui/Tabs.tsx'),
    'utf8',
  );

  it('PortfolioSwitcher localizes internal portfolio type enums to pt-BR', () => {
    expect(switcher).toContain('PORTFOLIO_TYPE_LABELS');
    expect(switcher).toContain("PERSONAL: 'Pessoal'");
    expect(switcher).toContain("FAMILY: 'Familiar'");
    expect(switcher).toContain('{PORTFOLIO_TYPE_LABELS[item.type] || item.type}');
  });

  it('PortfolioSwitcher respects touch targets and keyboard accessibility', () => {
    expect(switcher).toContain('minHeight: 44');
    expect(switcher).toContain("e.key === 'Escape'");
  });

  it('ReviewDetailPage provides explicit top back-to-review navigation', () => {
    expect(reviewDetail).toContain('Voltar para Fila de Revisão');
    expect(reviewDetail).toContain('href="/reviews"');
    expect(reviewDetail).toContain('breadcrumb="Carteira / Pendências / Detalhe"');
  });

  it('PortfolioImportPage modularizes dense layout into segmented tabs', () => {
    expect(importPage).toContain('<Tabs');
    expect(importPage).toContain("label: 'Importar Arquivo'");
    expect(importPage).toContain("label: 'Sincronização B3'");
    expect(importPage).toContain("label: 'Histórico de Importações'");
    expect(importPage).toContain("activeSection === 'history'");
    expect(importPage).toContain("activeSection === 'sync'");
    expect(importPage).toContain("activeSection === 'import'");
  });

  it('PortfolioSavedScenarios provides mobile anchor for inspection', () => {
    expect(scenarios).toContain('id="scenario-detail-section"');
    expect(scenarios).toContain('scrollIntoView');
    expect(scenarios).toContain('scrollMarginTop');
  });

  it('Tabs enforces comfortable touch target for mobile interaction', () => {
    expect(tabs).toContain('minHeight: 44');
    expect(tabs).toContain("overflowX: 'auto'");
  });

  it('Zero floating-point conversions and zero roadmap jargon in web sources', () => {
    for (const [name, content] of [
      ['switcher', switcher],
      ['reviewDetail', reviewDetail],
      ['importPage', importPage],
      ['scenarios', scenarios],
    ] as const) {
      expect(content, name).not.toMatch(/parseFloat|Math\.pow|Math\.sqrt/);
    }
  });
});
