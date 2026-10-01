import { describe, expect, it } from 'vitest';
import {
  annualCapitalMarketQueryKey,
  mapToAnnualCapitalMarketViewModel,
  RawAnnualCapitalMarketFiscalSummary,
} from '../../packages/ui/src';

describe('UI View Model: Annual Capital Market Fiscal Summary', () => {
  it('generates consistent query key', () => {
    expect(annualCapitalMarketQueryKey(2025)).toEqual([
      'fiscal',
      'annual',
      '2025',
      'capital-market',
    ]);
  });

  it('returns null when raw is null', () => {
    expect(mapToAnnualCapitalMarketViewModel(null)).toBeNull();
  });

  it('maps raw summary to view model with formatted currencies and badges', () => {
    const raw: RawAnnualCapitalMarketFiscalSummary = {
      calendarYear: 2025,
      declarationExercise: 2026,
      taxSubjectId: 'user-1',
      currency: 'BRL',
      isComplete: true,
      qualityIssues: [],
      months: [
        {
          competence: '2025-01',
          month: 1,
          normalEquities: {
            grossSaleAmount: '15000.00',
            isExempt: true,
            profitOrLoss: '2000.00',
            lossCompensated: '0.00',
            taxableBase: '0.00',
            irrfDeducted: '0.00',
            taxDue: '0.00',
          },
          dayTrade: {
            grossSaleAmount: '0.00',
            isExempt: false,
            profitOrLoss: '0.00',
            lossCompensated: '0.00',
            taxableBase: '0.00',
            irrfDeducted: '0.00',
            taxDue: '0.00',
          },
          fii: {
            grossSaleAmount: '0.00',
            isExempt: false,
            profitOrLoss: '0.00',
            lossCompensated: '0.00',
            taxableBase: '0.00',
            irrfDeducted: '0.00',
            taxDue: '0.00',
          },
          totalTaxDue: '0.00',
          darf6015: {
            obligationId: null,
            status: 'EXEMPT',
            principalAmount: '0.00',
            paidAmount: '0.00',
          },
        },
      ],
      normalEquities: {
        totalGrossSales: '15000.00',
        totalExemptProfits: '2000.00',
        totalTaxableProfits: '0.00',
        totalLossesIncurred: '0.00',
        totalLossesCompensated: '0.00',
        totalNetTaxableBase: '0.00',
        totalTaxDue: '0.00',
        totalIrrfDeducted: '0.00',
        uncompensatedIrrf: '0.00',
        uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_ANNUAL_ADJUSTMENT',
      },
      dayTrade: {
        totalGrossProfits: '0.00',
        totalLossesIncurred: '0.00',
        totalLossesCompensated: '0.00',
        totalNetTaxableBase: '0.00',
        totalTaxDue: '0.00',
        totalIrrfDeducted: '0.00',
        uncompensatedIrrf: '0.00',
        uncompensatedIrrfTerminalState: 'AVAILABLE_FOR_RESTITUTION',
      },
      fii: {
        totalGrossProfits: '0.00',
        totalLossesIncurred: '0.00',
        totalLossesCompensated: '0.00',
        totalNetTaxableBase: '0.00',
        totalTaxDue: '0.00',
        totalIrrfDeducted: '0.00',
      },
      lossCarry: {
        normalEquities: {
          category: 'NORMAL_EQUITIES',
          openingLossJanuary1: '0.00',
          lossesAdded: '0.00',
          lossesConsumed: '0.00',
          closingLossDecember31: '0.00',
        },
        dayTrade: {
          category: 'DAY_TRADE',
          openingLossJanuary1: '0.00',
          lossesAdded: '0.00',
          lossesConsumed: '0.00',
          closingLossDecember31: '0.00',
        },
        fii: {
          category: 'FII',
          openingLossJanuary1: '0.00',
          lossesAdded: '0.00',
          lossesConsumed: '0.00',
          closingLossDecember31: '0.00',
        },
        isConsistent: true,
      },
      obligations6015: {
        totalPrincipalDue: '0.00',
        totalPaid: '0.00',
        totalOverdue: '0.00',
        monthsWithLiabilityCount: 0,
        monthsSettledCount: 0,
      },
      calculatedAt: '2026-10-01T19:00:00.000Z',
      fingerprint: 'abc12345',
    };

    const vm = mapToAnnualCapitalMarketViewModel(raw);
    expect(vm).not.toBeNull();
    expect(vm?.periodLabel).toBe('Ano-calendário 2025 (Exercício 2026)');
    expect(vm?.statusBadge.label).toBe('CONSOLIDADO');
    expect(vm?.months[0]?.monthLabel).toBe('Janeiro');
    expect(vm?.normalEquities.formattedGrossSales).toContain('15.000,00');
    expect(vm?.normalEquities.uncompensatedIrrfTerminalState).toBe('Ajuste Anual (DIRPF)');
    expect(vm?.dayTrade.uncompensatedIrrfTerminalState).toBe('Restituição / Compensação');
  });
});
