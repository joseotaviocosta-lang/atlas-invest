import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5S-B (mobile) — review list and stacked detail stay read-only.
 * Filters, navigation, source/local panels, reconciliation semantics.
 * Text only; no import actions natively.
 */
describe('Phase 5S-B (mobile): reconciliation workspace read-only', () => {
  const list = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/app/(app)/reviews.tsx'),
    'utf8',
  );
  const detail = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/app/(app)/reviews/[runId].tsx'),
    'utf8',
  );
  const api = fs.readFileSync(path.join(process.cwd(), 'apps/mobile/src/api/reviews.ts'), 'utf8');

  it('lists reviews with severity and source filters plus detail navigation', () => {
    expect(api).toContain("query.set('source', params.source)");
    expect(list).toContain("queryKey: ['integration-reviews', severity, source]");
    expect(list).toContain('testID={`review-filter-${filter.id}`}');
    expect(list).toContain('testID={`review-source-${option}`}');
    expect(list).toContain('/(app)/reviews/${item.runId}');
    expect(list).toContain('testID={`review-detail-${item.runId}`}');
    expect(api).toContain('getReview(runId');
    expect(detail).toContain("queryKey: ['integration-review', runId]");
  });

  it('stacks run context, source, local, reconciliation and differences', () => {
    expect(detail).toContain('testID="review-run-context"');
    expect(detail).toContain('testID="review-reasons"');
    expect(detail).toContain('testID="review-source-panel"');
    expect(detail).toContain('testID="review-local-panel"');
    expect(detail).toContain('testID="review-reconciliation"');
    expect(detail).toContain('testID="review-differences"');
    expect(detail).toContain('describeReconciliationState');
    expect(detail).toContain('describeWorkspaceLimitation');
  });

  it('shows persisted decision state read-only on native detail', () => {
    expect(detail).toContain('testID="review-run-context"');
    expect(detail).toContain('Correspondência confirmada');
    expect(detail).toContain('Não correspondem');
  });

  it('offers no import or decision actions natively', () => {
    expect(detail).not.toContain('Confirmar correspondência</');
    expect(detail).not.toMatch(/apiClient|api\.post|POST.*decisions/);
    expect(list).toContain('acesse a versão web');
  });

  it('exposes no fuzzy, score or advice language', () => {
    for (const [name, content] of [
      ['list', list],
      ['detail', detail],
    ] as const) {
      expect(content, name).not.toMatch(
        /score|confidence|provavelmente|melhor correspondência|recomendamos|forecast|previsão|buy now|sell now/i,
      );
    }
  });
});
