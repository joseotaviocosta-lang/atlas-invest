import { describe, expect, it } from 'vitest';
import {
  mapToDarfHandoffViewModel,
  type RawDarfGenerationRecord,
  type RawDarfReadiness,
} from '@atlas/ui';

function readiness(over: Partial<RawDarfReadiness> = {}): RawDarfReadiness {
  return {
    obligationId: 'o1',
    competence: '2026-09',
    status: 'USER_ACTION_REQUIRED',
    reasonCode: null,
    generationMode: 'OFFICIAL_INTERACTIVE_HANDOFF',
    eligible: true,
    overdue: false,
    revenueCode: '6015',
    dueDate: '2026-10-30',
    preparedValues: {
      revenueCode: '6015',
      competence: '2026-09',
      dueDate: '2026-10-30',
      principalAmount: { amount: '199.9', currency: 'BRL' },
      carryForwardAmount: null,
      lateFeeAmount: null,
      interestAmount: null,
      totalAmount: { amount: '199.9', currency: 'BRL' },
    },
    destination: {
      sourceSystem: 'RFB_SICALC',
      url: 'https://sicalc.receita.fazenda.gov.br/sicalc/principal',
      prefillSupported: false,
    },
    requiresTaxpayerIdentity: true,
    requiresUserAction: true,
    instructions: ['Acesse o Sicalc oficial da Receita Federal'],
    identity: { identityAvailable: false, identityType: null, maskedIdentifier: null },
    adjustment: null,
    sourceSystem: 'RFB_SICALC',
    officialGenerationSupported: false,
    disclaimer: 'x',
    ...over,
  };
}

describe('UI: official DARF handoff view-model (Phase 4F)', () => {
  it('returns null for null input', () => {
    expect(mapToDarfHandoffViewModel(null)).toBeNull();
  });

  it('labels the handoff as an official-service action, never local generation', () => {
    const vm = mapToDarfHandoffViewModel(readiness())!;
    expect(vm.statusLabel).toBe('Dados preparados — ação necessária');
    expect(vm.actionLabel).toBe('Abrir Sicalc');
    expect(vm.actionLabel).not.toMatch(/Gerar DARF/i);
    expect(vm.officialSourceLabel).toBe('Receita Federal — Sicalc');
    expect(vm.destinationUrl).toContain('sicalc.receita.fazenda.gov.br');
    expect(vm.principalFormatted).toContain('199,90');
    expect(vm.totalFormatted).toContain('199,90');
    expect(vm.dueDateFormatted).toBe('30/10/2026');
    expect(vm.requiresTaxpayerIdentity).toBe(true);
  });

  it('renders the overdue prepared amounts and the record status separately from payment', () => {
    const record: RawDarfGenerationRecord = {
      id: 'd1',
      generationMode: 'OFFICIAL_INTERACTIVE_HANDOFF',
      revenueCode: '6015',
      competence: '2026-08',
      dueDate: '2026-09-30',
      principalAmount: { amount: '199.9', currency: 'BRL' },
      carryForwardAmount: null,
      lateFeeAmount: { amount: '0.66', currency: 'BRL' },
      interestAmount: { amount: '2.00', currency: 'BRL' },
      totalAmount: { amount: '202.56', currency: 'BRL' },
      sourceSystem: 'RFB_SICALC',
      status: 'USER_ACTION_REQUIRED',
      version: 1,
      generatedByAtlas: false,
      disclaimer: 'x',
    };
    const vm = mapToDarfHandoffViewModel(
      readiness({
        competence: '2026-08',
        overdue: true,
        preparedValues: {
          revenueCode: '6015',
          competence: '2026-08',
          dueDate: '2026-09-30',
          principalAmount: { amount: '199.9', currency: 'BRL' },
          carryForwardAmount: null,
          lateFeeAmount: { amount: '0.66', currency: 'BRL' },
          interestAmount: { amount: '2.00', currency: 'BRL' },
          totalAmount: { amount: '202.56', currency: 'BRL' },
        },
      }),
      record,
    )!;
    expect(vm.lateFeeFormatted).toContain('0,66');
    expect(vm.interestFormatted).toContain('2,00');
    expect(vm.totalFormatted).toContain('202,56');
    expect(vm.recordStatusLabel).toBe('Aguardando emissão no Sicalc');
  });

  it('fails closed below the minimum with a clear reason and no local action', () => {
    const vm = mapToDarfHandoffViewModel(
      readiness({
        status: 'BLOCKED',
        eligible: false,
        reasonCode: 'BELOW_MINIMUM',
        preparedValues: null,
        destination: null,
      }),
    )!;
    expect(vm.statusLabel).toBe('Indisponível');
    expect(vm.actionLabel).toBe('Indisponível');
    expect(vm.reasonLabel).toContain('abaixo do mínimo');
    expect(vm.totalFormatted).toBe('—');
  });

  it('renders the carry-forward breakdown for an aggregated handoff', () => {
    const vm = mapToDarfHandoffViewModel(
      readiness({
        preparedValues: {
          revenueCode: '6015',
          competence: '2026-09',
          dueDate: '2026-10-30',
          principalAmount: { amount: '10', currency: 'BRL' },
          carryForwardAmount: { amount: '4.9', currency: 'BRL' },
          lateFeeAmount: null,
          interestAmount: null,
          totalAmount: { amount: '10', currency: 'BRL' },
        },
      }),
    )!;
    expect(vm.carryForwardFormatted).toContain('4,90');
    expect(vm.totalFormatted).toContain('10,00');
  });
});
