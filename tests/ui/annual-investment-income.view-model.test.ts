import { describe, expect, it } from 'vitest';
import {
  annualInvestmentIncomeQueryKey,
  formatAnnualInvestmentIncomeViewModel,
  RawAnnualInvestmentIncomeSummary,
} from '../../packages/ui/src';

describe('UI View Model: Annual Investment Income Summary (Phase 4H.4)', () => {
  it('generates consistent query key', () => {
    expect(annualInvestmentIncomeQueryKey(2025)).toEqual(['fiscal', 'annual', '2025', 'income']);
  });

  it('maps complete annual investment income summary to formatted view model', () => {
    const raw: RawAnnualInvestmentIncomeSummary = {
      calendarYear: 2025,
      declarationExercise: 2026,
      isComplete: true,
      status: 'COMPLETE',
      currency: 'BRL',
      qualityIssues: [],
      blockingReasons: [],
      dividends: {
        incomeType: 'DIVIDEND',
        totalGrossAmount: '12500.50',
        totalWithheldTax: '0.00',
        totalNetAmount: '12500.50',
        eventCount: 4,
        taxTreatmentSummary: 'Isento',
        isComplete: true,
      },
      jcp: {
        incomeType: 'JCP',
        totalGrossAmount: '1000.00',
        totalWithheldTax: '150.00',
        totalNetAmount: '850.00',
        eventCount: 1,
        taxTreatmentSummary: 'Tributação Exclusiva (15%)',
        isComplete: true,
      },
      fiiIncome: {
        incomeType: 'FII_INCOME',
        totalGrossAmount: '3200.00',
        totalWithheldTax: '0.00',
        totalNetAmount: '3200.00',
        eventCount: 12,
        taxTreatmentSummary: 'Isento',
        isComplete: true,
      },
      totalGrossIncome: '16700.50',
      totalWithheldTax: '150.00',
      payers: [
        {
          payerId: 'asset-petr4',
          payerDisplayName: 'PETROBRAS PN',
          dividendGross: '12500.50',
          jcpGross: '1000.00',
          jcpWithheld: '150.00',
          fiiIncomeGross: '0.00',
          totalGross: '13500.50',
          totalWithheld: '150.00',
          isComplete: true,
        },
      ],
      months: [
        {
          competence: '2025-01',
          month: 1,
          dividendsGross: '12500.50',
          jcpGross: '1000.00',
          jcpWithheld: '150.00',
          fiiIncomeGross: '0.00',
          totalGross: '13500.50',
          totalWithheld: '150.00',
          eventCount: 2,
        },
      ],
      fingerprint: 'test-fingerprint-abc',
    };

    const vm = formatAnnualInvestmentIncomeViewModel(raw);
    expect(vm.calendarYear).toBe(2025);
    expect(vm.declarationExercise).toBe(2026);
    expect(vm.isComplete).toBe(true);
    expect(vm.statusLabel).toBe('Completo');
    expect(vm.formattedTotalGrossIncome).toContain('16.700,50');
    expect(vm.formattedTotalWithheldTax).toContain('150,00');

    expect(vm.dividends.formattedGrossAmount).toContain('12.500,50');
    expect(vm.dividends.eventCount).toBe(4);

    expect(vm.jcp.formattedGrossAmount).toContain('1.000,00');
    expect(vm.jcp.formattedWithheldTax).toContain('150,00');

    expect(vm.fiiIncome.formattedGrossAmount).toContain('3.200,00');
    expect(vm.payers).toHaveLength(1);
    expect(vm.payers[0].payerDisplayName).toBe('PETROBRAS PN');
    expect(vm.payers[0].formattedTotalGross).toContain('13.500,50');

    expect(vm.months).toHaveLength(1);
    expect(vm.months[0].monthLabel).toBe('Janeiro');
  });

  it('maps unconfirmed or blocked summary with proper status badges', () => {
    const raw: RawAnnualInvestmentIncomeSummary = {
      calendarYear: 2025,
      declarationExercise: 2026,
      isComplete: false,
      status: 'REQUIRES_CONFIRMATION',
      currency: 'BRL',
      qualityIssues: ['FII_ELIGIBILITY_UNVERIFIED'],
      blockingReasons: [],
      dividends: {
        incomeType: 'DIVIDEND',
        totalGrossAmount: '0.00',
        totalWithheldTax: '0.00',
        totalNetAmount: '0.00',
        eventCount: 0,
        taxTreatmentSummary: 'Isento',
        isComplete: true,
      },
      jcp: {
        incomeType: 'JCP',
        totalGrossAmount: '0.00',
        totalWithheldTax: '0.00',
        totalNetAmount: '0.00',
        eventCount: 0,
        taxTreatmentSummary: 'Tributação Exclusiva',
        isComplete: true,
      },
      fiiIncome: {
        incomeType: 'FII_INCOME',
        totalGrossAmount: '500.00',
        totalWithheldTax: '0.00',
        totalNetAmount: '500.00',
        eventCount: 1,
        taxTreatmentSummary: 'Requer Confirmação',
        isComplete: false,
      },
      totalGrossIncome: '500.00',
      totalWithheldTax: '0.00',
      payers: [],
      months: [],
      fingerprint: 'test-fingerprint-def',
    };

    const vm = formatAnnualInvestmentIncomeViewModel(raw);
    expect(vm.isComplete).toBe(false);
    expect(vm.statusLabel).toBe('Requer Confirmação');
  });
});
