import { describe, expect, it } from 'vitest';
import { mapToTaxPaymentEligibilityViewModel, type RawTaxPaymentSummary } from '@atlas/ui';

function summary(
  overrides: Partial<RawTaxPaymentSummary['eligibility']> = {},
): RawTaxPaymentSummary {
  return {
    competence: '2026-08',
    eligibility: {
      status: 'CARRIED_FORWARD',
      reasonCode: null,
      revenueCode: '6015',
      targetCompetence: '2026-08',
      currency: 'BRL',
      currentAmount: { amount: '4', currency: 'BRL' },
      carryForwardAmount: null,
      totalPayable: { amount: '4', currency: 'BRL' },
      minimumThreshold: { amount: '10', currency: 'BRL' },
      dueDate: '2026-09-30',
      sources: [
        {
          kind: 'CURRENT',
          sourceObligationId: 'o1',
          sourceCompetence: '2026-08',
          amount: { amount: '4', currency: 'BRL' },
          entryId: null,
        },
      ],
      rule: {
        ruleId: 'BR-FEDERAL-MINIMUM-DARF-10',
        ruleVersion: '1.0.0',
        minimumAmount: { amount: '10', currency: 'BRL' },
        sourceDocument: 'Lei nº 9.430/1996, art. 68, caput e § 1º',
        verifiedAt: '2026-09-29',
      },
      darfPreparationV2: null,
      dataQuality: 'COMPLETE',
      disclaimer: 'x',
      ...overrides,
    },
    aggregation: {
      id: 'agg1',
      status: 'CARRIED_FORWARD',
      totalPayable: { amount: '4', currency: 'BRL' },
    },
    openCarryForwardEntries: [],
  };
}

describe('UI: minimum-DARF payment eligibility view-model (Phase 4E)', () => {
  it('returns null for null input', () => {
    expect(mapToTaxPaymentEligibilityViewModel(null)).toBeNull();
  });

  it('renders a below-minimum deferral without discarding the value', () => {
    const vm = mapToTaxPaymentEligibilityViewModel(summary())!;
    expect(vm.statusLabel).toBe('Abaixo do mínimo (acumulado)');
    expect(vm.isDeferred).toBe(true);
    expect(vm.isPayable).toBe(false);
    expect(vm.currentFormatted).toContain('4,00');
    expect(vm.totalPayableFormatted).toContain('4,00');
    expect(vm.minimumThresholdFormatted).toContain('10,00');
    expect(vm.notice).toContain('acumulado para o período subsequente');
    expect(vm.ruleNote).toContain('Lei nº 9.430/1996');
    expect(vm.breakdown).toHaveLength(1);
  });

  it('renders a payable aggregation with prior-period breakdown', () => {
    const vm = mapToTaxPaymentEligibilityViewModel(
      summary({
        status: 'PAYABLE',
        currentAmount: { amount: '6', currency: 'BRL' },
        carryForwardAmount: { amount: '4', currency: 'BRL' },
        totalPayable: { amount: '10', currency: 'BRL' },
        sources: [
          {
            kind: 'CURRENT',
            sourceObligationId: 'o2',
            sourceCompetence: '2026-09',
            amount: { amount: '6', currency: 'BRL' },
            entryId: null,
          },
          {
            kind: 'CARRY_FORWARD',
            sourceObligationId: 'o1',
            sourceCompetence: '2026-08',
            amount: { amount: '4', currency: 'BRL' },
            entryId: 'cf1',
          },
        ],
      }),
    )!;
    expect(vm.statusLabel).toBe('Valor a pagar');
    expect(vm.isPayable).toBe(true);
    expect(vm.hasCarryForward).toBe(true);
    expect(vm.totalPayableFormatted).toContain('10,00');
    expect(vm.breakdown).toHaveLength(2);
    expect(vm.breakdown[1]!.label).toContain('acumulado');
    expect(vm.dueDateFormatted).toBe('30/09/2026');
  });

  it('never fabricates amounts when unavailable (BLOCKED uses —)', () => {
    const vm = mapToTaxPaymentEligibilityViewModel(
      summary({
        status: 'BLOCKED',
        currentAmount: null,
        carryForwardAmount: null,
        totalPayable: null,
        minimumThreshold: null,
        dueDate: null,
        sources: [],
        rule: null,
      }),
    )!;
    expect(vm.statusLabel).toBe('Bloqueado');
    expect(vm.totalPayableFormatted).toBe('—');
    expect(vm.dueDateFormatted).toBe('—');
    expect(vm.ruleNote).toBeNull();
    expect(vm.isPayable).toBe(false);
  });

  it('exposes DARF preparation V2 without generating an official DARF', () => {
    const vm = mapToTaxPaymentEligibilityViewModel(
      summary({
        status: 'PAYABLE',
        carryForwardAmount: { amount: '4', currency: 'BRL' },
        totalPayable: { amount: '10', currency: 'BRL' },
        darfPreparationV2: {
          revenueCode: '6015',
          targetCompetence: '2026-08',
          currentPrincipal: { amount: '6', currency: 'BRL' },
          carryForwardAmount: { amount: '4', currency: 'BRL' },
          totalPayable: { amount: '10', currency: 'BRL' },
          minimumThreshold: { amount: '10', currency: 'BRL' },
          dueDate: '2026-09-30',
          eligibilityStatus: 'PAYABLE',
          lateFee: null,
          interest: null,
          officialUpdatedAmount: null,
        },
      }),
    )!;
    expect(vm.darfPreparationV2?.eligibilityStatus).toBe('PAYABLE');
    expect(vm.darfPreparationV2?.lateFeeFormatted).toBe('—');
    expect(vm.darfPreparationV2?.officialUpdatedAmountFormatted).toBe('—');
    expect(vm.darfPreparationV2?.totalPayableFormatted).toContain('10,00');
  });
});
