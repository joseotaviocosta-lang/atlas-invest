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
});
