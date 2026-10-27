import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5S-E-R1 (web) — operational audit trail and change history surface.
 *
 * Verifies that the history page integrates the "Atividade" sub-tab alongside
 * the financial "Operações" ledger history, that PortfolioAuditTimeline consumes
 * the factual read-only endpoint, and that operations center previews activities.
 */
describe('Phase 5S-E-R1: operational audit history web surface', () => {
  const historyPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/history/page.tsx'),
    'utf8',
  );
  const auditTimeline = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioAuditTimeline.tsx'),
    'utf8',
  );
  const operationsSection = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioOperationsSection.tsx'),
    'utf8',
  );

  it('provides sub-tab navigation between financial ledger history and operational activity history', () => {
    expect(historyPage).toContain('role="tablist"');
    expect(historyPage).toContain('aria-label="Tipo de histórico"');
    expect(historyPage).toMatch(/>\s*Operações\s*<\/button>/);
    expect(historyPage).toMatch(/>\s*Atividade\s*<\/button>/);
    expect(historyPage).toContain("activeView === 'activity'");
    expect(historyPage).toContain('<PortfolioAuditTimeline');
    expect(historyPage).toContain('<PortfolioHistoryTimeline');
  });

  it('consumes the portfolio audit history endpoint via React Query', () => {
    expect(auditTimeline).toContain('/api/v1/portfolios/${portfolioId}/audit-history');
    expect(auditTimeline).toContain(
      "queryKey: ['portfolio-audit-history', portfolioId, selectedCategory]",
    );
    expect(auditTimeline).toContain('data-testid="portfolio-audit-timeline"');
    expect(auditTimeline).not.toMatch(/useMutation|POST|PUT|PATCH|DELETE/);
  });

  it('implements category filtering without fake or synthesized states', () => {
    expect(auditTimeline).toContain("label: 'Todos'");
    expect(auditTimeline).toContain("label: 'Importações'");
    expect(auditTimeline).toContain("label: 'Conciliações'");
    expect(auditTimeline).toContain("label: 'Correções'");
    expect(auditTimeline).toContain('aria-label="Filtro de tipos de atividade"');
  });

  it('provides empty state clarifying that financial ledger operations remain in operations tab', () => {
    expect(auditTimeline).toContain('data-testid="audit-empty-state"');
    expect(auditTimeline).toContain('Nenhuma atividade registrada ainda.');
    expect(auditTimeline).toContain(
      'As operações financeiras de compra e venda continuam registradas na aba Operações.',
    );
  });

  it('renders actor safely without raw principal IDs and handles missing actors', () => {
    expect(auditTimeline).toContain("item.actor ? item.actor.label : 'Autor não disponível'");
    expect(auditTimeline).not.toContain('principalId');
    expect(auditTimeline).not.toContain('decidedByPrincipal');
  });

  it('renders reason safely as text note box', () => {
    expect(auditTimeline).toContain('item.reason');
    expect(auditTimeline).toContain('Motivo:');
    expect(auditTimeline).not.toContain('dangerouslySetInnerHTML');
  });

  it('operations center previews bounded recent activities (<= 5) and links to activity tab', () => {
    expect(operationsSection).toContain('data-testid="operations-activity-preview"');
    expect(operationsSection).toContain('Últimas atividades');
    expect(operationsSection).toContain(
      '/portfolio/history?portfolioId=${portfolioId}&view=activity',
    );
    expect(operationsSection).toContain('Ver histórico de alterações →');
  });

  it('renders visually distinct badges for import statuses without false-positive success colors for FAILED', () => {
    expect(auditTimeline).toContain("case 'IMPORT_COMPLETED':");
    expect(auditTimeline).toContain("case 'IMPORT_PARTIAL':");
    expect(auditTimeline).toContain("case 'IMPORT_FAILED':");
    // Ensure IMPORT_FAILED maps to negative, not success
    expect(auditTimeline).toMatch(/case 'IMPORT_FAILED':\s*return 'negative';/);
    expect(auditTimeline).toMatch(/case 'IMPORT_COMPLETED':\s*return 'success';/);
  });
});
