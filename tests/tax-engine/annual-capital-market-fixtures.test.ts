import { describe, expect, it } from 'vitest';
import {
  buildAnnualCapitalMarketSummary,
  MonthlyFiscalInputData,
} from '../../packages/tax-engine/src';
import { Money } from '../../packages/domain/src';

describe('Tax Engine: Annual Capital Market Fiscal Summary Fixtures A–Y (Phase 4H.3A)', () => {
  // Fixture A — EMPTY YEAR
  it('Fixture A — EMPTY YEAR: No capital-market activity returns 12 empty monthly snapshots and zero totals', () => {
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

  // Fixture B — NORMAL ONLY
  it('Fixture B — NORMAL ONLY: Only normal-equity monthly activity reflects monthly states exactly', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-01',
          normalEquities: {
            grossSaleAmount: '25000.00',
            isExempt: false,
            profitOrLoss: '5000.00',
            taxableBase: '5000.00',
            taxDue: '750.00',
          },
        },
      ],
    });

    expect(summary.normalEquities.totalGrossSales.amount).toBe('25000');
    expect(summary.normalEquities.totalTaxableProfits.amount).toBe('5000');
    expect(summary.normalEquities.totalTaxDue.amount).toBe('750');
    expect(summary.dayTrade.totalGrossProfits.amount).toBe('0');
    expect(summary.fii.totalGrossProfits.amount).toBe('0');
  });

  // Fixture C — DAY TRADE ONLY
  it('Fixture C — DAY TRADE ONLY: Only day-trade monthly activity reflects monthly states exactly', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-03',
          dayTrade: {
            grossSaleAmount: '40000.00',
            profitOrLoss: '6000.00',
            taxableBase: '6000.00',
            irrfDeducted: '60.00',
            taxDue: '1200.00',
          },
        },
      ],
    });

    expect(summary.dayTrade.totalGrossProfits.amount).toBe('6000');
    expect(summary.dayTrade.totalTaxDue.amount).toBe('1200');
    expect(summary.dayTrade.totalIrrfDeducted.amount).toBe('60');
    expect(summary.normalEquities.totalGrossSales.amount).toBe('0');
    expect(summary.fii.totalGrossProfits.amount).toBe('0');
  });

  // Fixture D — FII ONLY
  it('Fixture D — FII ONLY: Only FII monthly activity reflects monthly states exactly', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-07',
          fii: {
            grossSaleAmount: '30000.00',
            profitOrLoss: '4500.00',
            taxableBase: '4500.00',
            taxDue: '900.00',
          },
        },
      ],
    });

    expect(summary.fii.totalGrossProfits.amount).toBe('4500');
    expect(summary.fii.totalTaxDue.amount).toBe('900');
    expect(summary.normalEquities.totalGrossSales.amount).toBe('0');
    expect(summary.dayTrade.totalGrossProfits.amount).toBe('0');
  });

  // Fixture E — ALL THREE
  it('Fixture E — ALL THREE: Normal + day trade + FII coexist with full isolation', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-02',
          normalEquities: {
            grossSaleAmount: '30000.00',
            profitOrLoss: '3000.00',
            taxDue: '450.00',
          },
          dayTrade: {
            grossSaleAmount: '10000.00',
            profitOrLoss: '2000.00',
            taxDue: '400.00',
          },
          fii: {
            grossSaleAmount: '15000.00',
            profitOrLoss: '1000.00',
            taxDue: '200.00',
          },
        },
      ],
    });

    expect(summary.normalEquities.totalGrossSales.amount).toBe('30000');
    expect(summary.normalEquities.totalTaxDue.amount).toBe('450');
    expect(summary.dayTrade.totalGrossProfits.amount).toBe('2000');
    expect(summary.dayTrade.totalTaxDue.amount).toBe('400');
    expect(summary.fii.totalGrossProfits.amount).toBe('1000');
    expect(summary.fii.totalTaxDue.amount).toBe('200');
  });

  // Fixture F — EXEMPT NORMAL MONTHS
  it('Fixture F — EXEMPT NORMAL MONTHS: Normal months under R$ 20k aggregate exempt gains without recalculation', () => {
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

  // Fixture G — TAXABLE NORMAL MONTHS
  it('Fixture G — TAXABLE NORMAL MONTHS: Taxable results derived from monthly values only', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-05',
          normalEquities: {
            grossSaleAmount: '50000.00',
            isExempt: false,
            profitOrLoss: '10000.00',
            taxableBase: '10000.00',
            taxDue: '1500.00',
          },
        },
      ],
    });

    expect(summary.normalEquities.totalGrossSales.amount).toBe('50000');
    expect(summary.normalEquities.totalTaxableProfits.amount).toBe('10000');
    expect(summary.normalEquities.totalTaxDue.amount).toBe('1500');
  });

  // Fixture H — OPENING LOSS
  it('Fixture H — OPENING LOSS: January opening loss matches provided opening state', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      openingLosses: {
        normalEquities: '12500.00',
      },
      months: [],
    });

    expect(summary.lossCarry.normalEquities.openingLossJanuary1.amount).toBe('12500');
    expect(summary.lossCarry.normalEquities.closingLossDecember31.amount).toBe('12500');
  });

  // Fixture I — CLOSING LOSS
  it('Fixture I — CLOSING LOSS: December closing loss accounts for additions and consumptions', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      openingLosses: { normalEquities: '10000.00' },
      months: [
        {
          competence: '2025-04',
          normalEquities: {
            profitOrLoss: '4000.00',
            lossCompensated: '4000.00',
          },
        },
        {
          competence: '2025-09',
          normalEquities: {
            profitOrLoss: '-2000.00',
          },
        },
      ],
    });

    expect(summary.lossCarry.normalEquities.openingLossJanuary1.amount).toBe('10000');
    expect(summary.lossCarry.normalEquities.lossesConsumed.amount).toBe('4000');
    expect(summary.lossCarry.normalEquities.lossesAdded.amount).toBe('2000');
    expect(summary.lossCarry.normalEquities.closingLossDecember31.amount).toBe('8000');
  });

  // Fixture J — LOSS CATEGORY ISOLATION
  it('Fixture J — LOSS CATEGORY ISOLATION: Normal, day trade, and FII losses maintain independent buckets', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      openingLosses: {
        normalEquities: '5000.00',
        dayTrade: '3000.00',
        fii: '1000.00',
      },
      months: [
        {
          competence: '2025-06',
          normalEquities: { profitOrLoss: '-1000.00' },
          dayTrade: { profitOrLoss: '1000.00', lossCompensated: '1000.00' },
          fii: { profitOrLoss: '-500.00' },
        },
      ],
    });

    expect(summary.lossCarry.normalEquities.closingLossDecember31.amount).toBe('6000');
    expect(summary.lossCarry.dayTrade.closingLossDecember31.amount).toBe('2000');
    expect(summary.lossCarry.fii.closingLossDecember31.amount).toBe('1500');
  });

  // Fixture K — NORMAL IRRF TERMINAL
  it('Fixture K — NORMAL IRRF TERMINAL: Normal equities uncompensated IRRF is designated AVAILABLE_FOR_ANNUAL_ADJUSTMENT', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-11',
          normalEquities: {
            irrfDeducted: '15.50',
          },
        },
      ],
    });

    expect(summary.normalEquities.uncompensatedIrrfTerminalState).toBe(
      'AVAILABLE_FOR_ANNUAL_ADJUSTMENT',
    );
    expect(summary.normalEquities.totalIrrfDeducted.amount).toBe('15.5');
  });

  // Fixture L — DAY-TRADE IRRF TERMINAL
  it('Fixture L — DAY-TRADE IRRF TERMINAL: Day trade uncompensated IRRF is designated AVAILABLE_FOR_RESTITUTION', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-11',
          dayTrade: {
            irrfDeducted: '45.00',
          },
        },
      ],
    });

    expect(summary.dayTrade.uncompensatedIrrfTerminalState).toBe('AVAILABLE_FOR_RESTITUTION');
    expect(summary.dayTrade.totalIrrfDeducted.amount).toBe('45');
  });

  // Fixture M — IRRF FULLY USED
  it('Fixture M — IRRF FULLY USED: Zero residual IRRF reflects accurate totals', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-01',
          normalEquities: {
            irrfDeducted: '0.00',
          },
        },
      ],
    });

    expect(summary.normalEquities.totalIrrfDeducted.amount).toBe('0');
  });

  // Fixture N — 6015 PAID
  it('Fixture N — 6015 PAID: Authoritative settled obligations reflect exact paid amounts', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-03',
          darf6015: {
            obligationId: 'ob-1',
            status: 'SETTLED',
            principalAmount: '500.00',
            paidAmount: '500.00',
          },
        },
      ],
    });

    expect(summary.obligations6015.totalPrincipalDue.amount).toBe('500');
    expect(summary.obligations6015.totalPaid.amount).toBe('500');
    expect(summary.obligations6015.monthsSettledCount).toBe(1);
  });

  // Fixture O — 6015 UNPAID
  it('Fixture O — 6015 UNPAID: Payable obligations without payment evidence report unpaid accurately', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-08',
          darf6015: {
            obligationId: 'ob-2',
            status: 'PENDING',
            principalAmount: '1200.00',
            paidAmount: '0.00',
          },
        },
      ],
    });

    expect(summary.obligations6015.totalPrincipalDue.amount).toBe('1200');
    expect(summary.obligations6015.totalPaid.amount).toBe('0');
    expect(summary.obligations6015.monthsSettledCount).toBe(0);
    expect(summary.obligations6015.monthsWithLiabilityCount).toBe(1);
  });

  // Fixture P — 6015 CARRY
  it('Fixture P — 6015 CARRY: Sub-minimum obligations carried forward are accurately noted', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-02',
          darf6015: {
            status: 'EXEMPT',
            principalAmount: '7.50',
            paidAmount: '0.00',
          },
        },
      ],
    });

    expect(summary.obligations6015.totalPrincipalDue.amount).toBe('7.5');
    expect(summary.obligations6015.monthsWithLiabilityCount).toBe(1);
  });

  // Fixture Q — OVERDUE
  it('Fixture Q — OVERDUE: Overdue obligation status is preserved without recalculation', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-01',
          darf6015: {
            obligationId: 'ob-overdue',
            status: 'OVERDUE',
            principalAmount: '350.00',
            paidAmount: '0.00',
          },
        },
      ],
    });

    expect(summary.months[0].darf6015.status).toBe('OVERDUE');
    expect(summary.obligations6015.totalPrincipalDue.amount).toBe('350');
  });

  // Fixture R — BLOCKED MONTH
  it('Fixture R — BLOCKED MONTH: Incomplete fiscal evidence in one month marks annual summary isComplete=false', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-05',
          qualityIssues: ['MISSING_OPENING_POSITION'],
        },
      ],
    });

    expect(summary.isComplete).toBe(false);
    expect(summary.qualityIssues).toContain('MISSING_OPENING_POSITION');
  });

  // Fixture S — HISTORICAL REVISION
  it('Fixture S — HISTORICAL REVISION: Revision updates summary deterministically', () => {
    const original = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-03',
          normalEquities: { grossSaleAmount: '20000.00', taxDue: '0.00' },
        },
      ],
    });

    const revised = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-03',
          normalEquities: { grossSaleAmount: '25000.00', taxDue: '750.00' },
        },
      ],
    });

    expect(original.normalEquities.totalGrossSales.amount).toBe('20000');
    expect(revised.normalEquities.totalGrossSales.amount).toBe('25000');
    expect(revised.normalEquities.totalTaxDue.amount).toBe('750');
    expect(original.fingerprint).not.toBe(revised.fingerprint);
  });

  // Fixture T — YEAR CONTINUITY
  it('Fixture T — YEAR CONTINUITY: Closing loss of Year Y becomes opening loss of Year Y+1', () => {
    const summary2024 = buildAnnualCapitalMarketSummary({
      calendarYear: 2024,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2024-11',
          normalEquities: { profitOrLoss: '-8000.00' },
        },
      ],
    });

    const summary2025 = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      openingLosses: {
        normalEquities: summary2024.lossCarry.normalEquities.closingLossDecember31,
      },
      months: [
        {
          competence: '2025-03',
          normalEquities: {
            profitOrLoss: '5000.00',
            lossCompensated: '5000.00',
          },
        },
      ],
    });

    expect(summary2024.lossCarry.normalEquities.closingLossDecember31.amount).toBe('8000');
    expect(summary2025.lossCarry.normalEquities.openingLossJanuary1.amount).toBe('8000');
    expect(summary2025.lossCarry.normalEquities.closingLossDecember31.amount).toBe('3000');
  });

  // Fixture U — YEAR BOUNDARY
  it('Fixture U — YEAR BOUNDARY: Strict period isolation between 2025-12 and 2026-01', () => {
    const summary2025 = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [{ competence: '2025-12', normalEquities: { grossSaleAmount: '10000.00' } }],
    });

    const summary2026 = buildAnnualCapitalMarketSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      months: [{ competence: '2026-01', normalEquities: { grossSaleAmount: '20000.00' } }],
    });

    expect(summary2025.months[11].competence).toBe('2025-12');
    expect(summary2026.months[0].competence).toBe('2026-01');
    expect(summary2025.normalEquities.totalGrossSales.amount).toBe('10000');
    expect(summary2026.normalEquities.totalGrossSales.amount).toBe('20000');
  });

  // Fixture V — CROSS-USER
  it('Fixture V — CROSS-USER: Distinct taxSubjectIds generate distinct fingerprints', () => {
    const summaryUserA = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-a',
      months: [{ competence: '2025-01', normalEquities: { grossSaleAmount: '10000.00' } }],
    });

    const summaryUserB = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-b',
      months: [{ competence: '2025-01', normalEquities: { grossSaleAmount: '10000.00' } }],
    });

    expect(summaryUserA.taxSubjectId).toBe('user-a');
    expect(summaryUserB.taxSubjectId).toBe('user-b');
    expect(summaryUserA.fingerprint).not.toBe(summaryUserB.fingerprint);
  });

  // Fixture W — MIXED COMPLETE/BLOCKED
  it('Fixture W — MIXED COMPLETE/BLOCKED: Metric-level completeness explicit without coercion to zero', () => {
    const summary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        { competence: '2025-01', normalEquities: { grossSaleAmount: '10000.00' } },
        { competence: '2025-02', qualityIssues: ['UNRESOLVED_COST'] },
      ],
    });

    expect(summary.isComplete).toBe(false);
    expect(summary.qualityIssues).toEqual(['UNRESOLVED_COST']);
    expect(summary.normalEquities.totalGrossSales.amount).toBe('10000');
  });

  // Fixture X — DUPLICATE SOURCE REPLAY
  it('Fixture X — DUPLICATE SOURCE REPLAY: Same inputs produce strictly identical results', () => {
    const input: Parameters<typeof buildAnnualCapitalMarketSummary>[0] = {
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [{ competence: '2025-04', dayTrade: { profitOrLoss: '5000.00', taxDue: '1000.00' } }],
    };

    const run1 = buildAnnualCapitalMarketSummary(input);
    const run2 = buildAnnualCapitalMarketSummary(input);

    expect(run1.fingerprint).toBe(run2.fingerprint);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  // Fixture Y — PAYMENT REVISION / LATE EVIDENCE
  it('Fixture Y — PAYMENT REVISION / LATE EVIDENCE: Late payment updates annual payment summary deterministically', () => {
    const beforePayment = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-05',
          darf6015: {
            obligationId: 'ob-late',
            status: 'PENDING',
            principalAmount: '1500.00',
            paidAmount: '0.00',
          },
        },
      ],
    });

    const afterPayment = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      months: [
        {
          competence: '2025-05',
          darf6015: {
            obligationId: 'ob-late',
            status: 'SETTLED',
            principalAmount: '1500.00',
            paidAmount: '1500.00',
          },
        },
      ],
    });

    expect(beforePayment.obligations6015.totalPaid.amount).toBe('0');
    expect(afterPayment.obligations6015.totalPaid.amount).toBe('1500');
    expect(afterPayment.obligations6015.monthsSettledCount).toBe(1);
  });
});
