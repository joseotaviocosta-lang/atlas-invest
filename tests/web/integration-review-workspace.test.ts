import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5S-B (web) — reconciliation workspace surfaces.
 *
 * Inbox with state/source filters and detail links; lazy detail with
 * run context, source/local panels, reconciliation semantics,
 * differences and navigation-only actions. No mutations, no scores.
 */
describe('Phase 5S-B: reconciliation workspace web surfaces', () => {
  const inbox = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/reviews/page.tsx'),
    'utf8',
  );
  const detail = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/reviews/[runId]/page.tsx'),
    'utf8',
  );

  it('lists reviews with severity, portfolio and source filters', () => {
    expect(inbox).toContain('/api/v1/integration-reviews?${queryParams}');
    expect(inbox).toContain("params.set('source', source)");
    expect(inbox).toContain('Filtrar por origem');
    expect(inbox).toContain('value="B3"');
    expect(inbox).toContain('value="CSV"');
    expect(inbox).toContain('value="MANUAL"');
    expect(inbox).toContain("queryKey: ['integration-reviews', severity, portfolioId, source]");
  });

  it('links each row to the lazy detail view', () => {
    expect(inbox).toContain('/reviews/${item.runId}');
    expect(inbox).toContain('Ver detalhes →');
    expect(detail).toContain('/api/v1/integration-reviews/${runId}');
    expect(detail).toContain("queryKey: ['integration-review', runId]");
    expect(detail).toContain('data-testid="review-run-context"');
  });

  it('shows run context, reasons, source and local panels', () => {
    expect(detail).toContain('data-testid="review-reasons"');
    expect(detail).toContain('describeReviewReason');
    expect(detail).toContain('data-testid="review-source-panel"');
    expect(detail).toContain('data-testid="review-local-panel"');
    expect(detail).toContain('Atlas — operações vinculadas');
    expect(detail).toContain('scope="col"');
    expect(detail).toContain('data-testid="review-reconciliation"');
    expect(detail).toContain('describeReconciliationState');
    expect(detail).toContain('data-testid="review-differences"');
    expect(detail).toContain('describeDifferenceField');
  });

  it('states source limits and offers navigation-only actions', () => {
    expect(detail).toContain('review-limitation-');
    expect(detail).toContain('review-limitation-${');
    expect(detail).toContain('describeWorkspaceLimitation');
    expect(detail).toContain(
      '/portfolio/import?portfolioId=${item.portfolioId}&runId=${item.runId}',
    );
    expect(detail).toContain('Continuar revisão →');
    expect(detail).toContain('← Pendências');
    expect(detail).not.toMatch(/Confirmar correspondência|Marcar como resolvido|Aceitar|Rejeitar/i);
    expect(detail).not.toMatch(/Criar automaticamente|Excluir operação/i);
  });

  it('renders empty, loading and error states accessibly', () => {
    expect(inbox).toContain('Nenhuma pendência no momento');
    expect(detail).toContain('Nenhuma operação vinculada');
    expect(detail).toContain('aria-label=');
    expect(detail).toContain('minHeight: 44');
  });

  it('carries no fuzzy, score, advice or mutation language', () => {
    for (const [name, content] of [
      ['inbox', inbox],
      ['detail', detail],
    ] as const) {
      expect(content, name).not.toMatch(
        /score|confidence|provavelmente|melhor correspondência|recomendamos confirmar|seguro confirmar|forecast|previsão|expected return|sharpe|buy now|sell now/i,
      );
      expect(content, name).not.toMatch(/auto-?accept|auto-?confirm|auto-?fix|auto-?correct/i);
    }
  });
});
