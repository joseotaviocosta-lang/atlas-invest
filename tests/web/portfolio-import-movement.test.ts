import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  detectClientSourceType,
  groupMovementNotices,
} from '@/lib/import-review';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Web movement source hint (hotfix B1)', () => {
  it('routes movimentacao- filenames to B3_MOVEMENT_XLSX as a hint', () => {
    expect(detectClientSourceType('movimentacao-2026-10-29-11-47-54.xlsx', true)).toEqual({
      sourceType: 'B3_MOVEMENT_XLSX',
      formatName: 'Área do Investidor B3 — Movimentação',
    });
    expect(detectClientSourceType('MOVIMENTAÇÃO-RESUMO.XLSX', true).sourceType).toBe(
      'B3_MOVEMENT_XLSX',
    );
  });

  it('keeps annual/negotiation/csv hints unchanged', () => {
    expect(
      detectClientSourceType('relatorio-consolidado-anual-2024.xlsx', true),
    ).toEqual({
      sourceType: 'B3_ANNUAL_REPORT_XLSX',
      formatName: 'Área do Investidor B3 — Relatório Consolidado Anual (Posição Inicial)',
    });
    expect(detectClientSourceType('negociacao-2026-10-29.xlsx', true).sourceType).toBe(
      'B3_NEGOTIATION_XLSX',
    );
    expect(detectClientSourceType('operacoes.csv', false)).toEqual({
      sourceType: 'GENERIC_CSV',
      formatName: null,
    });
  });
});

describe('Web movement notices section (hotfix B1, M2)', () => {
  const notices = [
    { rowNumber: 7, group: 'CASH_ONLY', movement: 'Rendimento', ticker: 'SNAG11', tradeDate: '2026-10-23', quantity: '1846', reasonCode: 'CASH_ONLY_EVENT', message: 'caixa' },
    { rowNumber: 30, group: 'REVIEW_REQUIRED', movement: 'Direito de Subscrição', ticker: 'SNAG12', tradeDate: '2026-03-05', quantity: '1416', reasonCode: 'SUBSCRIPTION_LIFECYCLE_MANUAL', message: 'sub' },
    { rowNumber: 40, group: 'INFORMATIONAL', movement: 'Empréstimo', ticker: 'HYPE3', tradeDate: '2026-10-28', quantity: '400', reasonCode: 'LOAN_CUSTODY_STATE', message: 'loan' },
    { rowNumber: 50, group: 'INFORMATIONAL', movement: 'Atualização', ticker: 'COGN3', tradeDate: '2026-08-07', quantity: '330', reasonCode: 'INFORMATIONAL_POSITION_MARKER', message: 'marker' },
    { rowNumber: 60, group: 'REVIEW_REQUIRED', movement: 'Fusão Estranha', ticker: 'PETR4', tradeDate: '2026-06-01', quantity: '10', reasonCode: 'UNKNOWN_MOVEMENT_LABEL', message: 'unknown' },
  ];

  it('groups notices into stable pt-BR sections with counts', () => {
    const groups = groupMovementNotices(notices);
    expect(groups.map((g) => g.key)).toEqual(['rights', 'cash', 'loans', 'markers', 'review']);
    expect(groups.map((g) => g.label)).toEqual([
      'Direitos e subscrições',
      'Proventos / caixa',
      'Empréstimos',
      'Atualizações informativas',
      'Revisão necessária',
    ]);
    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(5);
    expect(groups[0]!.items[0]!.ticker).toBe('SNAG12');
  });

  it('never exposes confirm payload fields on notice groups', () => {
    const groups = groupMovementNotices(notices);
    const serialized = JSON.stringify(groups);
    expect(serialized).not.toContain('importable');
    expect(serialized).not.toContain('externalId');
    expect(serialized).not.toContain('transferGroupId');
  });

  it('renders the notices section with per-group counts (page text)', () => {
    const page = readWeb('apps/web/src/app/(app)/portfolio/import/page.tsx');
    expect(page).toContain('Avisos e eventos sem efeito direto');
    expect(page).toContain('groupMovementNotices');
    expect(page).toContain('movement-notices');
    expect(page).toContain('B3_MOVEMENT_XLSX');
    expect(page).toContain('Bonificação');
    expect(page).toContain('detectedName');
  });

  it('renders pending review counters from a single pending derivation (page text)', () => {
    const page = readWeb('apps/web/src/app/(app)/portfolio/import/page.tsx');
    expect(page).toContain('eligibility.pendingCount');
    expect(page).toContain('aguardando revisão');
  });
});
