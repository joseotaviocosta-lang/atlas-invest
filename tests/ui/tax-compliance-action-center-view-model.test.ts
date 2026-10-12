import { describe, it, expect } from 'vitest';
import {
  mapToTaxComplianceActionItemViewModel,
  mapToTaxComplianceActionItemListViewModel,
  mapToTaxComplianceCalendarListViewModel,
  groupTaxComplianceCalendarByDate,
  type RawTaxComplianceActionItem,
} from '@atlas/ui';

function sampleItem(
  overrides: Partial<RawTaxComplianceActionItem> = {},
): RawTaxComplianceActionItem {
  return {
    actionKey: 'subj:2026-03:MONTHLY:fp:PAY_TAX:fp',
    taxSubjectId: 'subj-1',
    obligationKey: 'subj-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
    sourceFingerprint: 'f'.repeat(64),
    kind: 'PAY_TAX',
    period: '2026-03',
    calendarYear: 2026,
    exercise: null,
    dueDate: '2026-04-30',
    priority: 'MEDIUM',
    operationalStatus: 'UPCOMING',
    title: 'DARF próximo do vencimento — competência 2026-03',
    summary: 'Revise os dados no Atlas antes de pagar pelos canais oficiais.',
    nextAction: 'REVIEW_OBLIGATION',
    actionTarget: '/tax',
    amount: '500.00',
    currency: 'BRL',
    revenueCode: '6015',
    paymentSupportStatus: 'READY',
    paymentEvidenceStatus: 'NO_EVIDENCE',
    reminderStatus: 'SCHEDULED',
    annualReviewStatus: null,
    isStale: false,
    isSuperseded: false,
    blockingReasons: [],
    sourceVersion: '4K.4',
    ...overrides,
  };
}

describe('UI: tax compliance action center view-model (Phase 4K.4)', () => {
  it('maps statuses, priorities, kinds and next actions to PT-BR labels', () => {
    const vms = mapToTaxComplianceActionItemListViewModel([
      sampleItem(),
      sampleItem({
        actionKey: 'u2',
        kind: 'REVIEW_CHANGED_OBLIGATION',
        operationalStatus: 'REQUIRES_REVIEW',
        priority: 'HIGH',
        nextAction: 'REVIEW_STALE_EVIDENCE',
        isStale: true,
      }),
      sampleItem({
        actionKey: 'u3',
        kind: 'PROVIDE_CONFIRMATION',
        operationalStatus: 'WAITING_USER',
        priority: 'HIGH',
        nextAction: 'CONFIRM_INFORMATION',
      }),
    ]);
    const byKey = new Map(vms.map((v) => [v.actionKey, v]));
    expect(byKey.get('subj:2026-03:MONTHLY:fp:PAY_TAX:fp')?.kindLabel).toBe('Pagar tributo');
    expect(byKey.get('subj:2026-03:MONTHLY:fp:PAY_TAX:fp')?.statusLabel).toBe('Próximo vencimento');
    expect(byKey.get('subj:2026-03:MONTHLY:fp:PAY_TAX:fp')?.nextActionLabel).toBe(
      'Revisar obrigação',
    );
    expect(byKey.get('u2')?.kindLabel).toBe('Dados alterados — revisar');
    expect(byKey.get('u2')?.nextActionLabel).toBe('Revisar dados alterados');
    expect(byKey.get('u3')?.statusLabel).toBe('Aguardando você');
  });

  it('renders null amounts and missing due dates as em-dash, never zero', () => {
    const vm = mapToTaxComplianceActionItemViewModel(
      sampleItem({ amount: null, currency: null, dueDate: null }),
    );
    expect(vm.amountFormatted).toBe('—');
    expect(vm.dueDateFormatted).toBe('—');
    expect(vm.amountFormatted).not.toBe('R$ 0,00');
  });

  it('maps null list input to an empty list', () => {
    expect(mapToTaxComplianceActionItemListViewModel(null)).toEqual([]);
    expect(mapToTaxComplianceActionItemListViewModel(undefined)).toEqual([]);
    expect(mapToTaxComplianceCalendarListViewModel(null)).toEqual([]);
    expect(groupTaxComplianceCalendarByDate([])).toEqual([]);
  });

  it('classifies stale items into attention even when otherwise informational', () => {
    const vm = mapToTaxComplianceActionItemViewModel(
      sampleItem({
        kind: 'INFORMATIONAL',
        operationalStatus: 'INFORMATIONAL',
        priority: 'LOW',
        isStale: true,
      }),
    );
    expect(vm.section).toBe('attention');
  });
});
