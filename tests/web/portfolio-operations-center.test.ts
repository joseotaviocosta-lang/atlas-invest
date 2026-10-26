import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5S-A (web) — portfolio operations center surface.
 *
 * One operational view: status, attention items, integrations, runs,
 * reconciliation and data-quality summaries with navigation actions.
 * Derived facts only — no repairs, syncs, scores or advice.
 */
describe('Phase 5S-A: operations center web surface', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioOperationsSection.tsx'),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/page.tsx'),
    'utf8',
  );

  it('fetches the lazy operations endpoint and renders on the portfolio page', () => {
    expect(section).toContain('/api/v1/portfolios/${portfolioId}/operations-center');
    expect(section).toContain("queryKey: ['portfolio-operations', portfolioId]");
    expect(page).toContain('<PortfolioOperationsSection portfolioId={activePortfolio.id} />');
    expect(section).toContain('data-testid="portfolio-operations"');
  });

  it('shows status, clear and attention states with counts', () => {
    expect(section).toContain('data-testid="operations-status"');
    expect(section).toContain('Situação:');
    expect(section).toContain('data-testid="operations-clear"');
    expect(section).toContain('Nenhuma pendência operacional identificada.');
    expect(section).toContain('data-testid="operations-attention-count"');
    expect(section).toContain('da sua atenção');
    expect(section).toContain('data-testid="operations-attention"');
    expect(section).toContain('describeOperationsStatus');
  });

  it('shows attention items with impact and navigation only', () => {
    expect(section).toContain('describeOperationsAttention');
    expect(section).toContain('describeOperationsAttentionDetail');
    expect(section).toContain('describeOperationsDomain');
    expect(section).toContain('/reviews?portfolioId=${portfolioId}');
    expect(section).toContain('/portfolio?tab=overview');
    expect(section).toContain('/portfolio/import?portfolioId=${portfolioId}');
    expect(section).toContain('Ver revisões');
    expect(section).not.toMatch(/Sincronizar agora|Tentar novamente|Corrigir|Aceitar|Reparar/i);
  });

  it('shows integrations, reconciliation, data quality, runs and review preview', () => {
    expect(section).toContain('data-testid="operations-integrations"');
    expect(section).toContain('Integrações');
    expect(section).toContain('sem agendamento');
    expect(section).toContain('em preparação');
    expect(section).toContain('data-testid="operations-reconciliation"');
    expect(section).toContain('Conferidos:');
    expect(section).toContain('data-testid="operations-data-quality"');
    expect(section).toContain('Qualidade dos dados');
    expect(section).toContain('data-testid="operations-recent-runs"');
    expect(section).toContain('Execuções recentes');
    expect(section).toContain('Ver histórico de execuções');
    expect(section).toContain('data-testid="operations-review-preview"');
    expect(section).toContain('Ver todas as revisões');
  });

  it('is accessible with headings, labels and list semantics', () => {
    expect(section).toContain('<h4');
    expect(section).toContain('aria-label=');
    expect(section).toContain('<ul');
    expect(section).toContain('<li');
  });

  it('carries no score, investment, recommendation or forecast language', () => {
    for (const [name, content] of [
      ['section', section],
      ['page', page],
    ] as const) {
      expect(content, name).not.toMatch(
        /score|rating|boa carteira|má carteira|arriscada|recomendamos|deveria investir|venda|compre|forecast|previsão|expected return|sharpe|buy now|sell now|saudável|investimento ruim|risco alto|rebalancear/i,
      );
    }
  });
});
