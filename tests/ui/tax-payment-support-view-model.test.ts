import { describe, expect, it } from 'vitest';
import {
  mapToTaxPaymentSupportViewModel,
  type RawTaxPaymentSupport,
} from '@atlas/ui';

/**
 * Focused tests for H9-01: the payment-support view-model must distinguish a
 * calculated-but-not-payable obligation (provisional, positive amount, no due
 * date) from a genuine no-tax month, and must never render a fabricated date.
 */
const BASE: RawTaxPaymentSupport = {
  obligationKey: 'subject:2026-10:MONTHLY_TAX_PAYMENT:monthly-6015',
  sourceFingerprint: 'fp-h9',
  taxSubjectId: 'subject',
  calendarYear: 2026,
  period: '2026-10',
  kind: 'MONTHLY_TAX_PAYMENT',
  taxCategory: 'VARIABLE_INCOME',
  revenueCode: '6015',
  amount: '15',
  currency: 'BRL',
  dueDate: '',
  supportStatus: 'NOT_APPLICABLE',
  reconciliationStatus: 'NO_EVIDENCE',
  paymentInstructions: [],
  sourceReferences: [],
  latestEvidence: null,
  isOverdue: false,
  disclaimer: 'Apoio operacional. Não é DARF oficial.',
  version: '4K.2',
};

describe('UI: payment-support provisional framing (H9-01)', () => {
  it('flags calculated-but-not-payable support without fabricating a due date', () => {
    const vm = mapToTaxPaymentSupportViewModel(BASE);
    expect(vm.isProvisionalPending).toBe(true);
    expect(vm.dueDateFormatted).toBe('—');
    expect(vm.amountFormatted).toContain('15,00');
  });

  it('does not flag genuine zero-tax months as provisional', () => {
    const vm = mapToTaxPaymentSupportViewModel({ ...BASE, amount: '0.00' });
    expect(vm.isProvisionalPending).toBe(false);
  });

  it('does not flag payable support as provisional', () => {
    const vm = mapToTaxPaymentSupportViewModel({
      ...BASE,
      dueDate: '2026-11-30',
      supportStatus: 'READY',
    });
    expect(vm.isProvisionalPending).toBe(false);
    expect(vm.dueDateFormatted).toBe('30/11/2026');
  });
});
