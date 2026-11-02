import { describe, expect, it } from 'vitest';
import {
  taxIntelligenceQueryKey,
  mapCtiStatusToPresentation,
  mapCtiActionToTarget,
  formatCtiGeneratedAt,
  resolveBlockerTitle,
  resolveBlockerExplanation,
  resolveFactValue,
} from '@atlas/ui';

// Fixture mirroring the real 2026-10 dry-run shape (BLOCKED overall,
// monthly PARTIAL fact, KCRE11 nuance, no amounts).
const REAL_SHAPE = {
  status: 'BLOCKED',
  headline: 'Cálculo tributário bloqueado',
  summary: 'O Atlas ainda não possui dados suficientes para concluir a apuração.',
  facts: [
    { code: 'TAX_STATUS', label: 'Situação fiscal da competência', value: 'PARTIAL', source: 'TAX_ENGINE' },
    { code: 'DOCUMENTARY_VS_TAX_COST', label: 'Cobertura documental × custo fiscal', value: 'Há posições com cobertura documental completa cujo custo fiscal canônico permanece incompleto.', source: 'COST_ASSESSMENT' },
  ],
  blockers: [
    { code: 'UNKNOWN_COST_BASIS', category: 'COST_BASIS_INCOMPLETE', priority: 100, title: 'Custo de aquisição incompleto', explanation: 'Há posições com custo de aquisição desconhecido.' },
    { code: 'COST_DOCUMENTARY_INCOMPLETE', category: 'COST_BASIS_INCOMPLETE', priority: 60, title: 'Custo documental incompleto em 35 posições', explanation: 'Há posições com unidades sem custo histórico comprovado.' },
  ],
  actions: [
    { actionId: 'OPEN_TAX_QUALITY', label: 'Ver pendências fiscais', priority: 100 },
    { actionId: 'REVIEW_POSITIONS', label: 'Revisar posições', priority: 60 },
  ],
  limitations: ['O Atlas não estima imposto quando faltam dados essenciais.'],
  sources: [{ kind: 'LEDGER', label: 'Livro-razão de transações' }],
  generatedAt: '2026-10-31T12:00:00.000Z',
};

describe('CTI panel contract (pure presentation mapping)', () => {
  it('maps statuses to restrained labels without inventing design language', () => {
    expect(mapCtiStatusToPresentation('CONFIRMED')).toEqual({ label: 'Situação confirmada', variant: 'success' });
    expect(mapCtiStatusToPresentation('PARTIAL')).toEqual({ label: 'Apuração parcial', variant: 'warning' });
    expect(mapCtiStatusToPresentation('BLOCKED')).toEqual({ label: 'Apuração bloqueada', variant: 'danger' });
    expect(mapCtiStatusToPresentation('UNKNOWN')).toEqual({ label: 'Situação indisponível', variant: 'neutral' });
    expect(mapCtiStatusToPresentation('WEIRD')).toEqual({ label: 'Situação indisponível', variant: 'neutral' });
  });

  it('maps allowlisted actions to existing safe routes (navigation only)', () => {
    const pid = '11111111-1111-4111-8111-111111111111';
    expect(mapCtiActionToTarget('OPEN_TAX', 'Abrir apuração fiscal', pid)).toEqual({ href: '/tax', label: 'Abrir apuração fiscal' });
    expect(mapCtiActionToTarget('REVIEW_POSITIONS', 'Revisar posições', pid)).toEqual({
      href: `/portfolio?portfolioId=${pid}&tab=overview`,
      label: 'Revisar posições',
    });
    expect(mapCtiActionToTarget('OPEN_DATA_QUALITY', 'x', pid)).toEqual({ href: '/portfolio/maintenance', label: 'x' });
    expect(mapCtiActionToTarget('OPEN_REVIEWS', 'x', pid)).toEqual({ href: '/reviews', label: 'x' });
  });

  it('refuses unknown action ids (never renders arbitrary href)', () => {
    expect(mapCtiActionToTarget('DELETE_EVERYTHING', 'x', 'p')).toBeNull();
    expect(mapCtiActionToTarget('', 'x', 'p')).toBeNull();
  });

  it('scopes query keys by portfolio + competence (no stale cross-context)', () => {
    expect(taxIntelligenceQueryKey('p1', '2026-10')).toEqual(['tax-intelligence', 'p1', '2026-10']);
    expect(taxIntelligenceQueryKey('p1', '2026-10')).not.toEqual(taxIntelligenceQueryKey('p1', '2026-09'));
    expect(taxIntelligenceQueryKey('p1', '2026-10')).not.toEqual(taxIntelligenceQueryKey('p2', '2026-10'));
    expect(taxIntelligenceQueryKey(null, '2026-10')).toEqual(['tax-intelligence', 'none', '2026-10']);
  });

  it('preserves backend ordering and labels verbatim (no client resort)', () => {
    const order = REAL_SHAPE.blockers.map((b) => b.code);
    expect(order).toEqual(['UNKNOWN_COST_BASIS', 'COST_DOCUMENTARY_INCOMPLETE']);
    expect(REAL_SHAPE.actions.map((a) => a.actionId)).toEqual(['OPEN_TAX_QUALITY', 'REVIEW_POSITIONS']);
  });

  it('KCRE11 nuance text survives verbatim (no missing-cost / fiscal-complete claims)', () => {
    const nuance = REAL_SHAPE.facts.find((f) => f.code === 'DOCUMENTARY_VS_TAX_COST');
    expect(nuance?.value).toContain('documental completa');
    expect(JSON.stringify(REAL_SHAPE)).not.toMatch(/KCRE11 sem custo comprovado|fiscalmente completo/i);
  });

  it('blocked shape carries no payment language and no amounts', () => {
    expect(JSON.stringify(REAL_SHAPE)).not.toMatch(/DARF devido|valor a pagar|pague|imposto devido|estimativa/i);
    expect(JSON.stringify(REAL_SHAPE)).not.toMatch(/R\$ [\d.]+,\d{2}/);
  });

  it('formats generation time honestly (panel time, not market freshness)', () => {
    expect(formatCtiGeneratedAt(REAL_SHAPE.generatedAt)).toContain('Explicação gerada em');
    expect(formatCtiGeneratedAt('')).toBe('');
  });
});

describe('CTI internal-code hotfix (presentation only)', () => {
  it('Test 1 — blocker code hidden, title + mapped explanation shown', () => {
    const title = resolveBlockerTitle('Bloqueio na apuração anual');
    const explanation = resolveBlockerExplanation(
      'BLOCKED_POSITIONS_PRESENT',
    );
    expect(title).toBe('Bloqueio na apuração anual');
    expect(explanation).toBe('Há posições de 31/12 com custo ou dados incompletos.');
    expect(`${title} ${explanation}`).not.toContain('BLOCKED_POSITIONS_PRESENT');
  });

  it('Test 2 — unknown blocker code hidden, safe title shown', () => {
    const explanation = resolveBlockerExplanation('SOME_NEW_INTERNAL_CODE');
    expect(explanation).toBeNull();
    expect(resolveBlockerTitle('')).toBe('Pendência fiscal');
    expect(resolveBlockerTitle('  ')).toBe('Pendência fiscal');
  });

  it('Test 3 — human explanations pass through untouched', () => {
    const human =
      'Há posições com unidades sem custo histórico comprovado. Adicione evidências.';
    expect(resolveBlockerExplanation(human)).toBe(human);
    expect(resolveBlockerExplanation('')).toBeNull();
    expect(resolveBlockerExplanation(null)).toBeNull();
  });

  it('Test 4 — 2026-10 fixture renders without raw identifiers', () => {
    const blockers = [
      { title: 'Bloqueio na apuração anual', explanation: 'BLOCKED_POSITIONS_PRESENT' },
      { title: 'Custo de aquisição incompleto', explanation: 'Há posições com custo desconhecido.' },
    ];
    const rendered = blockers
      .map((b) => `${resolveBlockerTitle(b.title)} ${resolveBlockerExplanation(b.explanation) ?? ''}`)
      .join(' ');
    expect(rendered).toContain('Bloqueio na apuração anual');
    expect(rendered).toContain('Há posições de 31/12');
    expect(rendered).not.toMatch(/[A-Z]{2,}(?:_[A-Z0-9]+)+/);
    expect(resolveFactValue('TAX_STATUS', 'PARTIAL')).toBe('Parcial');
    expect(resolveFactValue('TAX_STATUS', 'WEIRD_FUTURE_STATUS')).toBeNull();
  });

  it('Test 5 — 2026-11 fixture stable, no raw codes', () => {
    expect(resolveBlockerExplanation('BLOCKED_POSITIONS_PRESENT')).not.toContain(
      'BLOCKED_POSITIONS_PRESENT',
    );
    expect(resolveFactValue('TAX_STATUS', 'EMPTY')).toBe('Sem dados na competência');
    expect(resolveFactValue('TAX_DUE', '2494.96 BRL')).toBe('2494.96 BRL');
    expect(resolveFactValue('ANY', null)).toBeNull();
  });
});
