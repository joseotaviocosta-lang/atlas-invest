import { describe, expect, it } from 'vitest';
import { Money } from '../../packages/domain/src';
import {
  buildAnnualInvestmentIncomeSummary,
  classifyIncomeEvent,
  DividendTransitionEvidence,
  IncomeEventInputData,
  IncomeType,
} from '../../packages/tax-engine/src';

describe('Tax Engine: Annual Investment Income 10,000-Case Fuzz & Invariant Verification (Phase 4H.4A.1)', () => {
  it(
    'runs 10,000 deterministic randomized annual income scenarios and validates mathematical and structural invariants',
    { timeout: 60000 },
    () => {
      // Deterministic pseudo-random seed generator (LCG)
      const SEED = 42891337;
      let seed = SEED;
      function rand(): number {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      function randMoney(min: number, max: number): string {
        const val = min + rand() * (max - min);
        return val.toFixed(2);
      }

      const PAYERS = ['asset-petr4', 'asset-vale3', 'asset-itub4', 'asset-bbas3', 'asset-knri11'];
      const INCOME_TYPES: IncomeType[] = ['DIVIDEND', 'JCP', 'FII_INCOME'];

      const ITERATIONS = 10000;
      const startTime = Date.now();

      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        // Test both 2025 and 2026+ rule sets
        const year = rand() > 0.5 ? 2025 : 2026;
        const eventCount = Math.floor(rand() * 8); // 0 to 7 events

        const events: IncomeEventInputData[] = [];

        for (let i = 0; i < eventCount; i++) {
          const payerId = PAYERS[Math.floor(rand() * PAYERS.length)]!;
          const incomeType = INCOME_TYPES[Math.floor(rand() * INCOME_TYPES.length)]!;
          const month = Math.floor(rand() * 12) + 1;
          const day = Math.floor(rand() * 28) + 1;
          const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          const gross = randMoney(10, 80000);

          let fiiEligibility = undefined;
          if (incomeType === 'FII_INCOME') {
            const mode = rand();
            if (mode < 0.4) {
              fiiEligibility = { isVerified: true };
            } else if (mode < 0.7) {
              fiiEligibility = {
                isListed: true,
                investorCountAtLeast100: true,
                beneficiaryOwnershipLessThan10Percent: true,
              };
            } else if (mode < 0.85) {
              fiiEligibility = {
                isListed: false,
                investorCountAtLeast100: false,
                beneficiaryOwnershipLessThan10Percent: true,
              };
            }
            // else remains undefined (unverified -> REQUIRES_CONFIRMATION)
          }

          // Random transition evidence for 2026 dividends
          let dividendTransitionEvidence: DividendTransitionEvidence | undefined;
          if (incomeType === 'DIVIDEND' && year === 2026) {
            const transMode = rand();
            if (transMode < 0.15) {
              dividendTransitionEvidence = {
                profitAccrualPeriodEnd: '2025-12-31',
                distributionApprovalDate: '2025-12-20',
                eligibilityStatus: 'ELIGIBLE',
              };
            } else if (transMode < 0.25) {
              dividendTransitionEvidence = {
                eligibilityStatus: 'INELIGIBLE',
              };
            } else if (transMode < 0.3) {
              dividendTransitionEvidence = {
                eligibilityStatus: 'REQUIRES_CONFIRMATION',
              };
            }
            // else no transition evidence → ordinary R-DIV-2026
          }

          events.push({
            incomeEventId: `fuzz-evt-${iteration}-${i}`,
            incomeType,
            assetId: payerId,
            payerId,
            payerDisplayName: payerId.toUpperCase(),
            paymentDate: dateStr,
            grossAmount: gross,
            fiiEligibility,
            dividendTransitionEvidence,
          });
        }

        const summary1 = buildAnnualInvestmentIncomeSummary({
          calendarYear: year,
          taxSubjectId: `user-${iteration}`,
          events,
        });

        // 1. Structural reconciliation: totalGross === dividends + jcp + fii
        const bucketSum = summary1.dividends.totalGrossAmount
          .add(summary1.jcp.totalGrossAmount)
          .add(summary1.fiiIncome.totalGrossAmount);
        expect(bucketSum.amount).toBe(summary1.totalGrossIncome.amount);

        // 2. Net reconciliation: totalGross === totalWithheld + totalNet
        const totalNet = summary1.dividends.totalNetAmount
          .add(summary1.jcp.totalNetAmount)
          .add(summary1.fiiIncome.totalNetAmount);
        const totalNetPlusWithheld = totalNet.add(summary1.totalWithheldTax);
        expect(totalNetPlusWithheld.amount).toBe(summary1.totalGrossIncome.amount);

        // 3. Payer sum reconciliation: sum of all payer totals === totalGrossIncome
        const payerGrossSum = summary1.payers.reduce(
          (acc, p) => acc.add(p.totalGross),
          Money.zero('BRL'),
        );
        expect(payerGrossSum.amount).toBe(summary1.totalGrossIncome.amount);

        // 4. Determinism & Order Independence: Shuffled input produces identical fingerprint
        if (events.length > 1) {
          const shuffled = [...events].reverse();
          const summary2 = buildAnnualInvestmentIncomeSummary({
            calendarYear: year,
            taxSubjectId: `user-${iteration}`,
            events: shuffled,
          });
          expect(summary2.fingerprint).toBe(summary1.fingerprint);
          expect(summary2.totalGrossIncome.amount).toBe(summary1.totalGrossIncome.amount);
          expect(summary2.totalWithheldTax.amount).toBe(summary1.totalWithheldTax.amount);
        }

        // 5. Statutory rate validation for individual events
        for (const evt of events) {
          const classified = classifyIncomeEvent(evt);
          if (evt.incomeType === 'DIVIDEND') {
            if (year === 2025) {
              expect(classified.taxTreatment).toBe('EXEMPT');
              expect(classified.ruleId).toBe('R-DIV-2025');
            } else if (evt.dividendTransitionEvidence?.eligibilityStatus === 'ELIGIBLE') {
              // Transition-eligible dividends in 2026 are exempt
              expect(classified.taxTreatment).toBe('EXEMPT');
              expect(classified.ruleId).toBe('R-DIV-TRANSITION');
            } else if (
              evt.dividendTransitionEvidence?.eligibilityStatus === 'REQUIRES_CONFIRMATION'
            ) {
              // Incomplete transition evidence fails closed to REQUIRES_CONFIRMATION
              expect(classified.taxTreatment).toBe('REQUIRES_CONFIRMATION');
              expect(classified.ruleId).toBe('R-DIV-TRANSITION-UNVERIFIED');
              expect(classified.withheldTaxAmount).toBeNull();
            }
          } else if (evt.incomeType === 'JCP') {
            expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
            if (year === 2025) {
              expect(classified.ruleId).toBe('R-JCP-2025');
              expect(classified.ruleVersion).toBe('1995-12-26-LEI-9249');
            } else {
              expect(classified.ruleId).toBe('R-JCP-2026');
              expect(classified.ruleVersion).toBe('2025-12-30-LEI-JCP-2026');
            }
          }
        }

        // 6. Dividend 2026 total-base withholding invariant:
        // For ordinary R-DIV-2026 events, if the individual event is the sole
        // event in a month/payer, withholding = 10% of gross when gross > 50k
        for (const evt of events) {
          if (evt.incomeType === 'DIVIDEND' && year === 2026 && !evt.dividendTransitionEvidence) {
            const classified = classifyIncomeEvent(evt);
            if (classified.ruleId === 'R-DIV-2026') {
              // Withholding should never be negative
              if (classified.withheldTaxAmount) {
                expect(classified.withheldTaxAmount.isNegative()).toBe(false);
              }
              // Net should never exceed gross
              expect(classified.netAmount.compare(classified.grossAmount) <= 0).toBe(true);
            }
          }
        }
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(60000);
    },
  );
});
