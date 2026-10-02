import { describe, expect, it } from 'vitest';
import {
  buildAnnualInvestmentIncomeSummary,
  IncomeEventInputData,
} from '../../packages/tax-engine/src';

describe('Phase 4H.4 / 4H.4A — Annual Investment Income Scale Suite (100 / 1k / 10k / 50k Events & 1 / 5 / 10 / 20 Years)', () => {
  function generateIncomeEvents(count: number, year: number): IncomeEventInputData[] {
    const events: IncomeEventInputData[] = [];
    const payers = ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'BBDC4', 'KNRI11', 'HGLG11', 'XPML11'];
    const types: Array<'DIVIDEND' | 'JCP' | 'FII_INCOME'> = ['DIVIDEND', 'JCP', 'FII_INCOME'];

    for (let i = 0; i < count; i++) {
      const payer = payers[i % payers.length]!;
      const incomeType = types[i % types.length]!;
      const month = ((i % 12) + 1).toString().padStart(2, '0');
      const day = ((i % 28) + 1).toString().padStart(2, '0');

      events.push({
        incomeEventId: `scale-evt-${year}-${i}`,
        incomeType,
        assetId: `asset-${payer.toLowerCase()}`,
        payerId: `asset-${payer.toLowerCase()}`,
        payerDisplayName: payer,
        paymentDate: `${year}-${month}-${day}`,
        grossAmount: '1000.00',
        ...(incomeType === 'FII_INCOME'
          ? {
              fiiEligibility: {
                isListed: true,
                investorCountAtLeast100: true,
                beneficiaryOwnershipLessThan10Percent: true,
              },
            }
          : {}),
      });
    }
    return events;
  }

  it('evaluates 100-event scale dataset', () => {
    const start = performance.now();
    const events = generateIncomeEvents(100, 2025);
    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'scale-user-100',
      events,
    });
    const durationMs = performance.now() - start;

    const totalEvents =
      summary.dividends.eventCount + summary.jcp.eventCount + summary.fiiIncome.eventCount;
    expect(totalEvents).toBe(100);
    expect(summary.isComplete).toBe(true);
    expect(summary.totalGrossIncome.amount).toBe('100000');
    expect(durationMs).toBeLessThan(100);
  });

  it('evaluates 1,000-event scale dataset', () => {
    const start = performance.now();
    const events = generateIncomeEvents(1000, 2025);
    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'scale-user-1k',
      events,
    });
    const durationMs = performance.now() - start;

    const totalEvents =
      summary.dividends.eventCount + summary.jcp.eventCount + summary.fiiIncome.eventCount;
    expect(totalEvents).toBe(1000);
    expect(summary.isComplete).toBe(true);
    expect(summary.totalGrossIncome.amount).toBe('1000000');
    expect(durationMs).toBeLessThan(250);
  });

  it('evaluates 10,000-event scale dataset', () => {
    const start = performance.now();
    const events = generateIncomeEvents(10000, 2025);
    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'scale-user-10k',
      events,
    });
    const durationMs = performance.now() - start;

    const totalEvents =
      summary.dividends.eventCount + summary.jcp.eventCount + summary.fiiIncome.eventCount;
    expect(totalEvents).toBe(10000);
    expect(summary.isComplete).toBe(true);
    expect(summary.totalGrossIncome.amount).toBe('10000000');
    expect(durationMs).toBeLessThan(1500);
  });

  it(
    'evaluates 50,000-event scale dataset within bounded execution budget',
    { timeout: 30000 },
    () => {
      const start = performance.now();
      const events = generateIncomeEvents(50000, 2025);
      const summary = buildAnnualInvestmentIncomeSummary({
        calendarYear: 2025,
        taxSubjectId: 'scale-user-50k',
        events,
      });
      const durationMs = performance.now() - start;

      const totalEvents =
        summary.dividends.eventCount + summary.jcp.eventCount + summary.fiiIncome.eventCount;
      expect(totalEvents).toBe(50000);
      expect(summary.isComplete).toBe(true);
      expect(summary.totalGrossIncome.amount).toBe('50000000');
      expect(durationMs).toBeLessThan(10000);
    },
  );

  it('evaluates multi-annual simulation across 1, 5, 10, and 20 years', () => {
    const start = performance.now();
    for (let y = 2006; y <= 2025; y++) {
      const events = generateIncomeEvents(100, y);
      const summary = buildAnnualInvestmentIncomeSummary({
        calendarYear: y,
        taxSubjectId: 'scale-user-multi-year',
        events,
      });
      const totalEvents =
        summary.dividends.eventCount + summary.jcp.eventCount + summary.fiiIncome.eventCount;
      expect(totalEvents).toBe(100);
      expect(summary.isComplete).toBe(true);
    }
    const durationMs = performance.now() - start;
    expect(durationMs).toBeLessThan(1000);
  });
});
