import { describe, expect, it } from 'vitest';
import {
  buildAnnualCapitalMarketSummary,
  MonthlyFiscalInputData,
} from '../../packages/tax-engine/src';

describe('Tax Engine: Annual Capital Market Fiscal Summary Fixtures (Phase 4H.3)', () => {
  it('Fixture A: Zero transactions year returns 12 empty monthly snapshots and zero totals', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [],
    });

    expect(summary.calendarYear).toBe(2025);
    expect(summary.declarationExercise).toBe(2026);
    expect(summary.months).toHaveLength(12);
    expect(summary.isComplete).toBe(true);
    expect(summary.qualityIssues).toHaveLength(0);
    expect(summary.normalEquities.totalGrossSales.amount).toBe('0');
    expect(summary.normalEquities.totalTaxDue.amount).toBe('0');
    expect(summary.dayTrade.totalGrossProfits.amount).toBe('0');
    expect(summary.fii.totalGrossProfits.amount).toBe('0');
    expect(summary.lossCarry.isConsistent).toBe(true);
    expect(summary.fingerprint).toBeDefined();
  });

  it('Fixture B: 12 months of normal equity sales under R$ 20k with exempt profits', () => {
    const months: MonthlyFiscalInputData[] = [];
    for (let m = 1; m <= 12; m++) {
      const mm = m.toString().padStart(2, '0');
      months.push({
        competence: `2025-${mm}`,
        normalEquities: {
          grossSaleAmount: '15000.00',
          isExempt: true,
          profitOrLoss: '2000.00',
          taxDue: '0.00',
        },
      });
    }

    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months,
    });

    expect(summary.normalEquities.totalGrossSales.amount).toBe('180000');
    expect(summary.normalEquities.totalExemptProfits.amount).toBe('24000');
    expect(summary.normalEquities.totalTaxableProfits.amount).toBe('0');
    expect(summary.normalEquities.totalTaxDue.amount).toBe('0');
  });

  it('Fixture C: Normal equity sales over R$ 20k with losses and compensations', () => {
    const months: MonthlyFiscalInputData[] = [
      {
        competence: '2025-01',
        normalEquities: {
          grossSaleAmount: '30000.00',
          isExempt: false,
          profitOrLoss: '-5000.00',
          lossCompensated: '0.00',
          taxableBase: '0.00',
          taxDue: '0.00',
        },
      },
      {
        competence: '2025-02',
        normalEquities: {
          grossSaleAmount: '40000.00',
          isExempt: false,
          profitOrLoss: '8000.00',
          lossCompensated: '5000.00',
          taxableBase: '3000.00',
          irrfDeducted: '2.00',
          taxDue: '450.00',
        },
      },
    ];

    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months,
    });

    expect(summary.normalEquities.totalGrossSales.amount).toBe('70000');
    expect(summary.normalEquities.totalLossesIncurred.amount).toBe('5000');
    expect(summary.normalEquities.totalLossesCompensated.amount).toBe('5000');
    expect(summary.normalEquities.totalNetTaxableBase.amount).toBe('3000');
    expect(summary.normalEquities.totalTaxDue.amount).toBe('450');
    expect(summary.lossCarry.normalEquities.closingLossDecember31.amount).toBe('0');
    expect(summary.lossCarry.isConsistent).toBe(true);
  });

  it('Fixture D: Day Trade operations and IRRF terminal state', () => {
    const months: MonthlyFiscalInputData[] = [
      {
        competence: '2025-05',
        dayTrade: {
          grossSaleAmount: '50000.00',
          profitOrLoss: '10000.00',
          lossCompensated: '0.00',
          taxableBase: '10000.00',
          irrfDeducted: '100.00',
          taxDue: '2000.00',
        },
      },
    ];

    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months,
    });

    expect(summary.dayTrade.totalGrossProfits.amount).toBe('10000');
    expect(summary.dayTrade.totalTaxDue.amount).toBe('2000');
    expect(summary.dayTrade.totalIrrfDeducted.amount).toBe('100');
    expect(summary.dayTrade.uncompensatedIrrfTerminalState).toBe('AVAILABLE_FOR_RESTITUTION');
    expect(summary.normalEquities.uncompensatedIrrfTerminalState).toBe(
      'AVAILABLE_FOR_ANNUAL_ADJUSTMENT',
    );
  });

  it('Fixture E: FII operations and 6015 obligations aggregation', () => {
    const months: MonthlyFiscalInputData[] = [
      {
        competence: '2025-03',
        fii: {
          grossSaleAmount: '20000.00',
          profitOrLoss: '4000.00',
          lossCompensated: '0.00',
          taxableBase: '4000.00',
          taxDue: '800.00',
        },
        darf6015: {
          obligationId: 'ob-1',
          status: 'SETTLED',
          principalAmount: '800.00',
          paidAmount: '800.00',
        },
      },
    ];

    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months,
    });

    expect(summary.fii.totalGrossProfits.amount).toBe('4000');
    expect(summary.fii.totalTaxDue.amount).toBe('800');
    expect(summary.obligations6015.totalPrincipalDue.amount).toBe('800');
    expect(summary.obligations6015.totalPaid.amount).toBe('800');
    expect(summary.obligations6015.monthsWithLiabilityCount).toBe(1);
    expect(summary.obligations6015.monthsSettledCount).toBe(1);
  });

  it('Fixture F: Year-over-year loss continuity across calendar years', () => {
    // Year 2024: generates 3,000 loss in normal equities
    const summary2024 = buildAnnualCapitalMarketSummary({
      calendarYear: 2024,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2024-11',
          normalEquities: {
            grossSaleAmount: '25000.00',
            profitOrLoss: '-3000.00',
          },
        },
      ],
    });

    expect(summary2024.lossCarry.normalEquities.closingLossDecember31.amount).toBe('3000');

    // Year 2025: opens with 3,000 loss from Year 2024 and compensates 2,000
    const summary2025 = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      openingLosses: {
        normalEquities: summary2024.lossCarry.normalEquities.closingLossDecember31,
      },
      months: [
        {
          competence: '2025-04',
          normalEquities: {
            grossSaleAmount: '35000.00',
            profitOrLoss: '5000.00',
            lossCompensated: '2000.00',
            taxableBase: '3000.00',
            taxDue: '450.00',
          },
        },
      ],
    });

    expect(summary2025.lossCarry.normalEquities.openingLossJanuary1.amount).toBe('3000');
    expect(summary2025.lossCarry.normalEquities.lossesConsumed.amount).toBe('2000');
    expect(summary2025.lossCarry.normalEquities.closingLossDecember31.amount).toBe('1000');
  });

  it('Fixture G: Data quality issues propagate and mark isComplete=false', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-06',
          qualityIssues: ['UNKNOWN_COST_BASIS', 'MISSING_PROCEEDS'],
        },
      ],
    });

    expect(summary.isComplete).toBe(false);
    expect(summary.qualityIssues).toContain('UNKNOWN_COST_BASIS');
    expect(summary.qualityIssues).toContain('MISSING_PROCEEDS');
  });
});
