import { describe, expect, it } from 'vitest';
import {
  B3_IMPORT_METHOD_CATALOG,
  B3_EXPLANATION_SECTIONS,
  B3_SYNC_STATE_PRESENTATION,
  B3_SYNC_STATES,
  B3_DUPLICATE_PRESENTATION,
  B3_DUPLICATE_KINDS,
  B3_RECONCILIATION_PRESENTATION,
  B3_RECONCILIATION_STATUSES,
  buildB3SyncSummaryLines,
  resolveB3IntegrationAvailability,
} from '@atlas/ui';

/**
 * Phase 5N — B3 connection product flow (web presentation contract).
 *
 * The hub renders the three import methods from B3_IMPORT_METHOD_CATALOG,
 * the explanation dialog from B3_EXPLANATION_SECTIONS, and every technical
 * state through the presentation maps below. These tests pin the honest
 * product vocabulary: B3 is "Em preparação", never a fake live connection.
 */

const FORBIDDEN_COPY = [
  'Conecte agora sua B3',
  'Integração B3 disponível',
  'Sincronização oficial ativa',
  'Carteira 100% automática',
  'Todos os investimentos serão importados',
  'Dados em tempo real',
  'Conectar agora',
  'em parceria com a B3',
  'endossado pela B3',
];

function allProductCopy(): string[] {
  return [
    ...B3_IMPORT_METHOD_CATALOG.flatMap((method) => [
      method.title,
      method.subtitle,
      method.description,
      method.badge ?? '',
      method.ctaLabel,
    ]),
    ...B3_EXPLANATION_SECTIONS.flatMap((section) => [section.title, section.body]),
    ...Object.values(B3_SYNC_STATE_PRESENTATION).flatMap((entry) => [
      entry.label,
      entry.description,
      entry.cta ?? '',
    ]),
    ...Object.values(B3_DUPLICATE_PRESENTATION).flatMap((entry) => [
      entry.label,
      entry.description,
      entry.cta ?? '',
    ]),
    ...Object.values(B3_RECONCILIATION_PRESENTATION).flatMap((entry) => [
      entry.label,
      entry.description,
      entry.cta ?? '',
    ]),
  ];
}

describe('Phase 5N: Importar / Conectar hub', () => {
  it('1: exposes exactly the three import methods', () => {
    expect(B3_IMPORT_METHOD_CATALOG.map((method) => method.id)).toEqual(['b3', 'csv', 'manual']);
    for (const method of B3_IMPORT_METHOD_CATALOG) {
      expect(method.title.trim()).not.toBe('');
      expect(method.subtitle.trim()).not.toBe('');
      expect(method.description.trim()).not.toBe('');
      expect(method.ctaLabel.trim()).not.toBe('');
    }
  });

  it('2: B3 appears honestly as preparing, never as available', () => {
    const b3 = B3_IMPORT_METHOD_CATALOG.find((method) => method.id === 'b3')!;
    expect(b3.badge).toBe('Em preparação');
    expect(b3.ctaLabel).toBe('Saiba como funcionará');
  });

  it('3: production shows no active connect control', () => {
    expect(resolveB3IntegrationAvailability()).toBe('PREPARING');
    expect(resolveB3IntegrationAvailability({})).toBe('PREPARING');
    const b3 = B3_IMPORT_METHOD_CATALOG.find((method) => method.id === 'b3')!;
    expect(b3.ctaLabel).not.toMatch(/conectar agora/i);
  });

  it('4-5: CSV and manual entries keep functional targets', () => {
    const csv = B3_IMPORT_METHOD_CATALOG.find((method) => method.id === 'csv')!;
    const manual = B3_IMPORT_METHOD_CATALOG.find((method) => method.id === 'manual')!;
    expect(csv.action).toBe('csv-anchor');
    expect(csv.ctaLabel).toBe('Importar arquivo');
    expect(manual.action).toBe('manual-operations');
    expect(manual.ctaLabel).toBe('Adicionar operação');
    expect(new Set(B3_IMPORT_METHOD_CATALOG.map((method) => method.action)).size).toBe(3);
  });

  it('6: explanation flow covers what syncs, staleness, user control and security', () => {
    expect(B3_EXPLANATION_SECTIONS.map((section) => section.title)).toEqual([
      'O que será sincronizado',
      'Atualização dos dados',
      'Você no controle',
      'Segurança',
    ]);
    const bodies = B3_EXPLANATION_SECTIONS.map((section) => section.body).join('\n');
    expect(bodies).toMatch(/defasagem/);
    expect(bodies).toMatch(/autorização/);
    expect(bodies).toMatch(/revogar/);
    expect(bodies).toMatch(/revisão/);
    expect(bodies).toMatch(/senha da sua corretora/);
  });

  it('7: sync state mapping covers all nine engine states with copy and CTA', () => {
    expect([...B3_SYNC_STATES].sort()).toEqual([
      'AUTHORIZED',
      'AWAITING_AUTHORIZATION',
      'ERROR',
      'NOT_CONNECTED',
      'PARTIAL',
      'REQUIRES_REAUTHORIZATION',
      'REVOKED',
      'SYNCED',
      'SYNCING',
    ]);
    expect(Object.keys(B3_SYNC_STATE_PRESENTATION).sort()).toEqual([...B3_SYNC_STATES].sort());
    for (const entry of Object.values(B3_SYNC_STATE_PRESENTATION)) {
      expect(entry.label.trim()).not.toBe('');
      expect(entry.description.trim()).not.toBe('');
    }
  });

  it('8-10: duplicate vocabulary never auto-merges', () => {
    expect([...B3_DUPLICATE_KINDS].sort()).toEqual([
      'CONFLICT',
      'EXACT_DUPLICATE',
      'NEW',
      'PROBABLE_DUPLICATE',
    ]);
    expect(B3_DUPLICATE_PRESENTATION.EXACT_DUPLICATE.label).toBe('Já importado');
    expect(B3_DUPLICATE_PRESENTATION.PROBABLE_DUPLICATE.label).toBe('Possível duplicidade');
    expect(B3_DUPLICATE_PRESENTATION.CONFLICT.label).toBe('Conflito de dados');
    expect(B3_DUPLICATE_PRESENTATION.EXACT_DUPLICATE.description).toMatch(/ignorado/);
    expect(B3_DUPLICATE_PRESENTATION.PROBABLE_DUPLICATE.description).toMatch(/revisão/);
    expect(B3_DUPLICATE_PRESENTATION.CONFLICT.description).toMatch(/decisão explícita/);
  });

  it('11: reconciliation mapping covers all five verdicts without auto-correction', () => {
    expect(Object.keys(B3_RECONCILIATION_PRESENTATION).sort()).toEqual(
      [...B3_RECONCILIATION_STATUSES].sort(),
    );
    expect(B3_RECONCILIATION_PRESENTATION.MATCHED.label).toBe('Posição conferida');
    expect(B3_RECONCILIATION_PRESENTATION.DIVERGENT.label).toBe('Diferença encontrada');
    expect(B3_RECONCILIATION_PRESENTATION.MISSING_LOCAL.description).toMatch(/fonte/);
    expect(B3_RECONCILIATION_PRESENTATION.MISSING_SOURCE.description).toMatch(/carteira/);
    expect(B3_RECONCILIATION_PRESENTATION.DIVERGENT.description).toMatch(
      /Nada foi corrigido automaticamente/,
    );
  });

  it('12: unsupported counts stay visible and partial is never framed as success', () => {
    const lines = buildB3SyncSummaryLines({
      newCount: 3,
      knownCount: 5,
      reviewCount: 1,
      unsupportedCount: 2,
      partial: true,
    });
    expect(lines.some((line) => line.text.includes('Sincronização parcial'))).toBe(true);
    expect(lines.some((line) => line.text.includes('3 novas operações encontradas'))).toBe(true);
    expect(lines.some((line) => line.text.includes('5 registros já conhecidos'))).toBe(true);
    expect(lines.some((line) => line.text.includes('precisa de revisão'))).toBe(true);
    expect(lines.some((line) => line.text.includes('2 eventos ainda não suportados'))).toBe(true);
    expect(lines.every((line) => line.tone !== 'success')).toBe(true);
    expect(
      buildB3SyncSummaryLines({
        newCount: 0,
        knownCount: 0,
        reviewCount: 0,
        unsupportedCount: 0,
        partial: false,
      }),
    ).toEqual([{ text: 'Nenhum registro novo na fonte.', tone: 'neutral' }]);
  });

  it('13-14: revoked and reauthorization states carry honest recovery copy', () => {
    expect(B3_SYNC_STATE_PRESENTATION.REVOKED.label).toBe('Acesso revogado');
    expect(B3_SYNC_STATE_PRESENTATION.REVOKED.description).toMatch(/permanecem na carteira/);
    expect(B3_SYNC_STATE_PRESENTATION.REQUIRES_REAUTHORIZATION.label).toBe(
      'Nova autorização necessária',
    );
    expect(B3_SYNC_STATE_PRESENTATION.REQUIRES_REAUTHORIZATION.cta).toBe('Autorizar novamente');
  });

  it('15: simulation stays out of the production/default surface', () => {
    expect(resolveB3IntegrationAvailability({ realConnectionEnabled: false })).toBe('PREPARING');
    expect(resolveB3IntegrationAvailability({ realConnectionEnabled: 'false' })).toBe('PREPARING');
    const b3 = B3_IMPORT_METHOD_CATALOG.find((method) => method.id === 'b3')!;
    expect(b3.action).toBe('b3-explain');
  });

  it('16: feature flag is default-safe and explicit-only', () => {
    expect(resolveB3IntegrationAvailability()).toBe('PREPARING');
    expect(resolveB3IntegrationAvailability({ realConnectionEnabled: true })).toBe('AVAILABLE');
    expect(resolveB3IntegrationAvailability({ realConnectionEnabled: 'true' })).toBe('AVAILABLE');
    expect(resolveB3IntegrationAvailability({ realConnectionEnabled: '1' })).toBe('PREPARING');
  });

  it('17: status never depends on color alone — every entry has text and tone', () => {
    for (const entry of [
      ...Object.values(B3_SYNC_STATE_PRESENTATION),
      ...Object.values(B3_DUPLICATE_PRESENTATION),
      ...Object.values(B3_RECONCILIATION_PRESENTATION),
    ]) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(['neutral', 'info', 'success', 'warning', 'danger']).toContain(entry.tone);
    }
  });

  it('18: a single action catalog drives every viewport (no desktop-only actions)', () => {
    expect(B3_IMPORT_METHOD_CATALOG).toHaveLength(3);
    for (const method of B3_IMPORT_METHOD_CATALOG) {
      expect(['b3-explain', 'csv-anchor', 'manual-operations']).toContain(method.action);
      expect(method.ctaLabel.length).toBeLessThanOrEqual(30);
    }
  });

  it('19-20: no real B3 access, no credentials in the product surface', async () => {
    const fs = await import('fs');
    const files = [
      'packages/ui/src/view-models/b3-connection.view-model.ts',
      'apps/web/src/app/(app)/portfolio/import/page.tsx',
    ];
    for (const file of files) {
      const content: string = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/b3\.com\.br|api\.b3|b3api/i);
      expect(content).not.toMatch(/oauth|client_secret|access_token|refresh_token/i);
      expect(content).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
      expect(content).not.toMatch(/mTLS|cert\.pem|\.p12/);
    }
    const page: string = fs.readFileSync(
      'apps/web/src/app/(app)/portfolio/import/page.tsx',
      'utf8',
    );
    expect(page).not.toMatch(/from '@atlas\/import-engine'|from "..\/.*import-engine/);
  });

  it('copy guardrails: no forbidden promise appears anywhere in the product copy', () => {
    for (const text of allProductCopy()) {
      for (const forbidden of FORBIDDEN_COPY) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});
