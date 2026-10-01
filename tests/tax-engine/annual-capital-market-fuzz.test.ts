import { describe, expect, it } from 'vitest';
import { Money } from '../../packages/domain/src';
import {
  buildAnnualCapitalMarketSummary,
  MonthlyFiscalInputData,
} from '../../packages/tax-engine/src';

describe('Tax Engine: Annual Capital Market Fiscal Summary Fuzz & Invariant Verification', () => {
  it('runs 1,000 randomized annual scenarios and validates mathematical and structural invariants', () => {
    // Deterministic pseudo-random seed generator (LCG)
    let seed = 42891337;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    function randMoney(min: number, max: number): string {
      const val = min + rand() * (max - min);
      return val.toFixed(2);
    }

    for (let iteration = 0; iteration < 1000; iteration++) {
      const year = 2020 + Math.floor(rand() * 10);
      const monthCount = Math.floor(rand() * 13); // 0 to 12 months present

      const months: MonthlyFiscalInputData[] = [];
      const includedMonths = new Set<number>();
      while (includedMonths.size < monthCount) {
        includedMonths.add(Math.floor(rand() * 12) + 1);
      }

      for (const m of Array.from(includedMonths).sort((a, b) => a - b)) {
        const mm = m.toString().padStart(2, '0');
        const hasNormal = rand() > 0.3;
        const hasDayTrade = rand() > 0.5;
        const hasFii = rand() > 0.5;

        months.push({
          competence: `${year}-${mm}`,
          ...(hasNormal
            ? {
                normalEquities: {
                  grossSaleAmount: randMoney(0, 50000),
                  isExempt: rand() > 0.5,
                  profitOrLoss: randMoney(-10000, 15000),
                  lossCompensated: randMoney(0, 5000),
                  taxableBase: randMoney(0, 10000),
                  irrfDeducted: randMoney(0, 50),
                  taxDue: randMoney(0, 1500),
                },
              }
            : {}),
          ...(hasDayTrade
            ? {
                dayTrade: {
                  grossSaleAmount: randMoney(0, 30000),
                  profitOrLoss: randMoney(-5000, 8000),
                  lossCompensated: randMoney(0, 3000),
                  taxableBase: randMoney(0, 5000),
                  irrfDeducted: randMoney(0, 100),
                  taxDue: randMoney(0, 1000),
                },
              }
            : {}),
          ...(hasFii
            ? {
                fii: {
                  grossSaleAmount: randMoney(0, 20000),
                  profitOrLoss: randMoney(-3000, 6000),
                  lossCompensated: randMoney(0, 2000),
                  taxableBase: randMoney(0, 4000),
                  irrfDeducted: randMoney(0, 20),
                  taxDue: randMoney(0, 800),
                },
              }
            : {}),
          darf6015: {
            status: rand() > 0.3 ? 'SETTLED' : 'EXEMPT',
            principalAmount: randMoney(0, 1000),
            paidAmount: randMoney(0, 1000),
          },
        });
      }

      const openingNormal = randMoney(0, 20000);
      const openingDayTrade = randMoney(0, 10000);
      const openingFii = randMoney(0, 5000);

      const summary1 = buildAnnualCapitalMarketSummary({
        calendarYear: year,
        taxSubjectId: `user-${iteration}`,
        openingLosses: {
          normalEquities: openingNormal,
          dayTrade: openingDayTrade,
          fii: openingFii,
        },
        months,
      });

      const summary2 = buildAnnualCapitalMarketSummary({
        calendarYear: year,
        taxSubjectId: `user-${iteration}`,
        openingLosses: {
          normalEquities: openingNormal,
          dayTrade: openingDayTrade,
          fii: openingFii,
        },
        months,
      });

      // Invariant 1: Absolute determinism and fingerprint equality
      expect(summary1.fingerprint).toBe(summary2.fingerprint);

      // Invariant 2: Exactly 12 months present in snapshots
      expect(summary1.months).toHaveLength(12);

      // Invariant 3: Loss carry continuity
      const normLoss = summary1.lossCarry.normalEquities;
      const expectedNormClosing = Money.from(normLoss.openingLossJanuary1.amount, 'BRL')
        .add(Money.from(normLoss.lossesAdded.amount, 'BRL'))
        .subtract(Money.from(normLoss.lossesConsumed.amount, 'BRL'));

      if (!expectedNormClosing.isNegative()) {
        expect(normLoss.closingLossDecember31.amount).toBe(expectedNormClosing.amount);
      }

      // Invariant 4: Long-only / Non-negative monetary amounts
      expect(summary1.normalEquities.totalGrossSales.isNegative()).toBe(false);
      expect(summary1.normalEquities.totalTaxDue.isNegative()).toBe(false);
      expect(summary1.dayTrade.totalTaxDue.isNegative()).toBe(false);
      expect(summary1.fii.totalTaxDue.isNegative()).toBe(false);
      expect(summary1.obligations6015.totalPrincipalDue.isNegative()).toBe(false);
    }
  });
});
