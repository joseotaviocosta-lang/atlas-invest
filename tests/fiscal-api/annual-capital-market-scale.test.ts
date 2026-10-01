import { describe, expect, it } from 'vitest';
import {
  buildAnnualCapitalMarketSummary,
  MonthlyFiscalInputData,
} from '../../packages/tax-engine/src';

describe('Phase 4H.3A — Annual Capital Market Fiscal Summary Scale Suite (1, 5, 10, 20 Years)', () => {
  function generateYearData(year: number): MonthlyFiscalInputData[] {
    const months: MonthlyFiscalInputData[] = [];
    for (let m = 1; m <= 12; m++) {
      const mm = m.toString().padStart(2, '0');
      months.push({
        competence: `${year}-${mm}`,
        normalEquities: {
          grossSaleAmount: '25000.00',
          isExempt: false,
          profitOrLoss: '5000.00',
          lossCompensated: '0.00',
          taxableBase: '5000.00',
          irrfDeducted: '12.50',
          taxDue: '750.00',
        },
        dayTrade: {
          grossSaleAmount: '15000.00',
          profitOrLoss: '2000.00',
          lossCompensated: '0.00',
          taxableBase: '2000.00',
          irrfDeducted: '20.00',
          taxDue: '400.00',
        },
        fii: {
          grossSaleAmount: '10000.00',
          profitOrLoss: '1000.00',
          taxDue: '200.00',
        },
        darf6015: {
          obligationId: `ob-${year}-${mm}`,
          status: 'SETTLED',
          principalAmount: '1350.00',
          paidAmount: '1350.00',
        },
      });
    }
    return months;
  }

  it('evaluates 1-year scale dataset', () => {
    const start = performance.now();
    const months = generateYearData(2025);
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'scale-user-1',
      months,
    });
    const durationMs = performance.now() - start;

    expect(summary.months).toHaveLength(12);
    expect(summary.isComplete).toBe(true);
    expect(summary.normalEquities.totalGrossSales.amount).toBe('300000');
    expect(summary.dayTrade.totalGrossProfits.amount).toBe('24000');
    expect(summary.fii.totalGrossProfits.amount).toBe('12000');
    expect(summary.lossCarry.isConsistent).toBe(true);
    expect(durationMs).toBeLessThan(100);
  });

  it('evaluates 5-year multi-annual continuous simulation', () => {
    const start = performance.now();
    let currentOpeningLoss = '10000.00';

    for (let y = 2021; y <= 2025; y++) {
      const months = generateYearData(y);
      const summary = buildAnnualCapitalMarketSummary({
        calendarYear: y,
        taxSubjectId: 'scale-user-5',
        openingLosses: { normalEquities: currentOpeningLoss },
        months,
      });

      expect(summary.months).toHaveLength(12);
      expect(summary.lossCarry.isConsistent).toBe(true);
      expect(summary.isComplete).toBe(true);
      currentOpeningLoss = summary.lossCarry.normalEquities.closingLossDecember31.amount;
    }
    const durationMs = performance.now() - start;
    expect(durationMs).toBeLessThan(250);
  });

  it('evaluates 10-year multi-annual continuous simulation', () => {
    const start = performance.now();
    for (let y = 2016; y <= 2025; y++) {
      const months = generateYearData(y);
      const summary = buildAnnualCapitalMarketSummary({
        calendarYear: y,
        taxSubjectId: 'scale-user-10',
        months,
      });
      expect(summary.months).toHaveLength(12);
      expect(summary.isComplete).toBe(true);
    }
    const durationMs = performance.now() - start;
    expect(durationMs).toBeLessThan(500);
  });

  it('evaluates 20-year multi-annual continuous simulation', () => {
    const start = performance.now();
    for (let y = 2006; y <= 2025; y++) {
      const months = generateYearData(y);
      const summary = buildAnnualCapitalMarketSummary({
        calendarYear: y,
        taxSubjectId: 'scale-user-20',
        months,
      });
      expect(summary.months).toHaveLength(12);
      expect(summary.isComplete).toBe(true);
    }
    const durationMs = performance.now() - start;
    expect(durationMs).toBeLessThan(1000);
  });
});
