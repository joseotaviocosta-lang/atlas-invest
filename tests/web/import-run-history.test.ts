import { describe, expect, it } from 'vitest';
import {
  IMPORT_RUN_STATUS_PRESENTATION,
  IMPORT_RUN_STATUSES,
  buildImportRunSummaryLines,
  buildImportRunReconciliationLines,
  describeImportRunSource,
} from '@atlas/ui';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 5P-PRE — run history UX (shared presentation + page surface).
 *
 * The history shows operational facts only: dates, source, status, counts.
 * Fingerprints, external ids, payloads and reconciliation enum internals
 * never render.
 */
describe('Phase 5P-PRE: import run history UX', () => {
  it('maps every run status to human copy with tone', () => {
    expect([...IMPORT_RUN_STATUSES].sort()).toEqual([
      'AWAITING_REVIEW',
      'COMPLETED',
      'CONFIRMING',
      'FAILED',
      'PARTIAL',
      'STARTED',
    ]);
    expect(IMPORT_RUN_STATUS_PRESENTATION.COMPLETED).toMatchObject({
      label: 'Concluída',
      tone: 'success',
    });
    expect(IMPORT_RUN_STATUS_PRESENTATION.PARTIAL.label).toBe('Concluída parcialmente');
    expect(IMPORT_RUN_STATUS_PRESENTATION.FAILED.label).toBe('Falhou');
    expect(IMPORT_RUN_STATUS_PRESENTATION.AWAITING_REVIEW.label).toBe('Aguardando revisão');
    for (const entry of Object.values(IMPORT_RUN_STATUS_PRESENTATION)) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(['neutral', 'info', 'success', 'warning', 'danger']).toContain(entry.tone);
    }
  });

  it('builds honest summary lines that never claim silent success', () => {
    const lines = buildImportRunSummaryLines({
      fetched: 9,
      normalized: 9,
      added: 4,
      exactDuplicates: 5,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
      confirmed: 4,
      ignored: 5,
      divergent: 1,
    });
    const text = lines.map((line) => line.text).join(' | ');
    expect(text).toContain('4 novos registros encontrados');
    expect(text).toContain('5 registros já conhecidos');
    expect(text).toContain('4 registros importados');
    expect(text).toContain('1 diferença encontrada');
    expect(
      buildImportRunSummaryLines({
        fetched: 0,
        normalized: 0,
        added: 0,
        exactDuplicates: 0,
        probableDuplicates: 0,
        conflicts: 0,
        unsupported: 0,
        invalid: 0,
        confirmed: 0,
        ignored: 0,
        divergent: 0,
      }),
    ).toEqual([{ text: 'Nenhum registro novo na fonte.', tone: 'neutral' }]);
  });

  it('describes reconciliation without enum internals', () => {
    const lines = buildImportRunReconciliationLines({
      matched: 3,
      divergent: 1,
      missingLocal: 1,
      missingSource: 0,
      unresolved: 0,
    });
    const text = lines.map((line) => line.text).join(' | ');
    expect(text).toContain('3 posições conferidas');
    expect(text).toContain('1 diferença encontrada');
    expect(text).toContain('1 ativo encontrado só na fonte');
    expect(text).not.toMatch(/MATCHED|DIVERGENT|MISSING_LOCAL/);
  });

  it('labels sources in product language', () => {
    expect(describeImportRunSource('B3', null)).toBe('Sincronização B3');
    expect(describeImportRunSource('CSV', 'ops.csv')).toBe('Arquivo ops.csv');
    expect(describeImportRunSource('CSV', null)).toBe('Arquivo CSV');
    expect(describeImportRunSource('MANUAL', null)).toBe('Lançamento manual');
  });

  it('history surface lists runs and hides technical internals', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/import/page.tsx'),
      'utf8',
    );
    expect(page).toContain('Histórico de importações');
    expect(page).toContain('/imports/runs');
    expect(page).toContain('Nenhuma importação registrada ainda');
    expect(page).toContain('Detalhes');
    // The run history block renders operational facts only; the CSV review
    // table elsewhere legitimately keeps its row identifiers.
    const historyBlock = page.slice(
      page.indexOf('Histórico de importações'),
      page.indexOf('importador-arquivo'),
    );
    expect(historyBlock).not.toMatch(/fingerprint/i);
    expect(historyBlock).not.toMatch(/externalId/);
    expect(historyBlock).not.toMatch(/canonical|reconciliation enum|provider DTO/i);
  });

  it('history covers loading, error with retry, empty, success and detail states', () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/import/page.tsx'),
      'utf8',
    );
    expect(page).toContain('runsQuery.isLoading');
    expect(page).toContain('runsQuery.isError');
    expect(page).toContain('runsQuery.refetch()');
    expect(page).toContain('selectedRun');
    expect(page).toContain('Fechar detalhes');
    expect(page).toContain('aria-expanded');
    expect(page).toContain('aria-label');
  });
});
