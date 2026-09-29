import { describe, expect, it } from 'vitest';
import {
  mapToTaxObligationViewModel,
  taxObligationBucketLabel,
  type RawTaxObligation,
} from '@atlas/ui';

const SAMPLE: RawTaxObligation = {
  id: 'o1',
  competence: '2026-08',
  taxBucket: 'FII_SALE',
  revenueCode: '6015',
  status: 'OPEN',
  baseStatus: 'OPEN',
  reasonCode: null,
  principalAmount: { amount: '199.9', currency: 'BRL' },
  currency: 'BRL',
  dueDate: '2026-09-30',
  darfReadiness: 'READY',
  darfReadinessReason: null,
  dataQuality: 'COMPLETE',
  liabilityFingerprint: 'x'.repeat(64),
  revision: 1,
  deadline: {
    entryId: 'e1',
    dueDate: '2026-09-30',
    version: 1,
    sourceAuthority: 'RFB',
    sourceDocument: 'ADE CORAT nº 63/2026',
    sourceReference: 'https://www.gov.br/receitafederal',
    sourcePublishedAt: '2026-08-27',
    verifiedAt: '2026-09-28',
  },
  darfPreparation: {
    revenueCode: '6015',
    competence: '2026-08',
    taxBucket: 'FII_SALE',
    principalAmount: { amount: '199.9', currency: 'BRL' },
    dueDate: '2026-09-30',
    sourceProvenance: {
      entryId: 'e1',
      dueDate: '2026-09-30',
      version: 1,
      sourceAuthority: 'RFB',
      sourceDocument: 'ADE CORAT nº 63/2026',
      sourceReference: 'https://www.gov.br/receitafederal',
      sourcePublishedAt: '2026-08-27',
      verifiedAt: '2026-09-28',
    },
  },
  payments: [],
  supersededById: null,
  createdAt: '2026-09-29T00:00:00.000Z',
};

describe('UI: tax obligation view-model (Phase 4C.2)', () => {
  it('returns null for null input', () => {
    expect(mapToTaxObligationViewModel(null)).toBeNull();
  });

  it('maps an OPEN obligation with official deadline and DARF readiness', () => {
    const vm = mapToTaxObligationViewModel(SAMPLE)!;
    expect(vm.competenceLabel).toBe('08/2026');
    expect(vm.statusLabel).toBe('Aberto');
    expect(vm.revenueCode).toBe('6015');
    expect(vm.principalFormatted).toContain('199,90');
    expect(vm.dueDateFormatted).toBe('30/09/2026');
    expect(vm.darfReadinessLabel).toBe('Prontos');
    expect(vm.isDarfReady).toBe(true);
    expect(vm.sourceNote).toContain('Agenda Tributária');
    expect(vm.sourceDocument).toContain('ADE CORAT');
    expect(vm.bucketLabel).toBe('Fundos imobiliários (alienação)');
  });

  it('renders unavailable values as em dash (never a fake zero)', () => {
    const blocked = mapToTaxObligationViewModel({
      ...SAMPLE,
      status: 'BLOCKED',
      reasonCode: 'MISSING_OFFICIAL_DEADLINE',
      principalAmount: null,
      dueDate: null,
      darfReadiness: 'BLOCKED',
      deadline: null,
      darfPreparation: null,
    })!;
    expect(blocked.principalFormatted).toBe('—');
    expect(blocked.dueDateFormatted).toBe('—');
    expect(blocked.darfReadinessLabel).toBe('Bloqueados');
    expect(blocked.sourceNote).toBeNull();
  });

  it('maps NO_PAYMENT_DUE and PAID states factually', () => {
    const zero = mapToTaxObligationViewModel({
      ...SAMPLE,
      status: 'NO_PAYMENT_DUE',
      principalAmount: null,
      darfReadiness: 'NOT_REQUIRED',
    })!;
    expect(zero.statusLabel).toBe('Sem imposto a recolher');
    expect(zero.darfReadinessLabel).toBe('Não aplicável');

    const paid = mapToTaxObligationViewModel({
      ...SAMPLE,
      status: 'PAID',
      payments: [
        {
          id: 'p1',
          paidAt: '2026-09-29',
          amount: { amount: '199.9', currency: 'BRL' },
          sourceType: 'MANUAL_CONFIRMED',
          sourceReference: null,
          status: 'CONFIRMED',
          confirmedAt: '2026-09-29T00:00:00.000Z',
        },
      ],
    })!;
    expect(paid.statusLabel).toBe('Pago');
    expect(paid.paymentsCount).toBe(1);
    expect(paid.paidFormatted).toContain('199,90');
  });

  it('contains no tax arithmetic and never generates an official DARF', () => {
    const json = JSON.stringify(mapToTaxObligationViewModel(SAMPLE)!);
    expect(json).not.toMatch(/parseFloat|Math\.|taxDue|gerarDarf|generateDarf/);
  });

  it('exposes a factual bucket label fallback', () => {
    expect(taxObligationBucketLabel(null)).toBe('—');
    expect(taxObligationBucketLabel('FII_SALE')).toBe('Fundos imobiliários (alienação)');
    expect(taxObligationBucketLabel('OTHER')).toBe('OTHER');
  });
});
