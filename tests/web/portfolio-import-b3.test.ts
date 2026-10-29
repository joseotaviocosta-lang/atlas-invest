import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function page(): string {
  return readFileSync(
    resolve(__dirname, '../../apps/web/src/app/(app)/portfolio/import/page.tsx'),
    'utf-8',
  );
}

describe('Web Import Hub: Native B3 XLSX Integration', () => {
  it('accepts both CSV and XLSX files in file input', () => {
    const src = page();
    expect(src).toContain('accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"');
    expect(src).toContain('Arquivo da corretora ou B3 (CSV ou XLSX)');
  });

  it('supports B3_NEGOTIATION_XLSX sourceType with detected format display', () => {
    const src = page();
    expect(src).toContain("setSourceType('B3_NEGOTIATION_XLSX')");
    expect(src).toContain('Área do Investidor B3 — Negociação');
    expect(src).toContain('Formato detectado:');
  });

  it('renders Instituição column in preview table', () => {
    const src = page();
    expect(src).toContain("'Instituição'");
    expect(src).toContain('candidate.brokerLabel');
  });

  it('provides a Cancel button to clear preview without persistence', () => {
    const src = page();
    expect(src).toContain('Cancelar');
    expect(src).toContain('previewMutation.reset()');
  });

  it('renders unique assets summary and batch asset mapping', () => {
    const src = page();
    expect(src).toContain('Ativos únicos encontrados');
    expect(src).toContain('handleBatchAssetMap');
    expect(src).toContain('Aplicar a todas as ocorrências de');
  });

  it('renders institutions summary with batch account mapping and quick creation', () => {
    const src = page();
    expect(src).toContain('Instituições e contas de custódia');
    expect(src).toContain('handleBatchAccountMap');
    expect(src).toContain('handleCreateAccountForInstitution');
    expect(src).toContain('Usar esta conta para todas as operações desta instituição');
  });

  it('derives single source of truth summary ensuring found equation holds', () => {
    const src = page();
    expect(src).toContain('const derivedSummary = useMemo');
    expect(src).toContain('(derivedSummary ?? preview.summary).ready');
    expect(src).toContain('(derivedSummary ?? preview.summary).needsReview');
  });

  it('handles batch account resolution idempotency and re-triggers preview mutation', () => {
    const src = page();
    expect(src).toContain('// 1. Idempotency / Duplicate Guard: reuse account if already exists');
    expect(src).toContain('await previewMutation.mutateAsync()');
  });

  it('checks full institution resolution to prevent misleading success badges', () => {
    const src = page();
    expect(src).toContain('const isFullyResolved =');
    expect(src).toContain('isFullyResolved && resolvedAccount ?');
    expect(src).toContain('operações com conta');
  });

  it('displays resolved account in row table and hides redundant dropdown', () => {
    const src = page();
    expect(src).toContain('Conta:');
    expect(src).toContain('resolvedAccountObj.name');
    expect(src).toContain('alterar');
  });
});
