import { describe, it, expect } from 'vitest';
import {
  isContributionPlanCandidateEligible,
  deriveContributionPlanMonthlyReview,
  buildPortfolioMonthlyProgressTimeline,
  type ContributionCandidateEligibilityInput,
} from '../../packages/market-data/src/opportunity-radar/contribution-tracking';

describe('APP-16Y-R2: Canonical Candidate Match Policy Unification', () => {
  const planId = 'plan-uuid-001';
  const planCurrency = 'BRL';
  const periodStart = '2026-11-01';
  const periodEnd = '2026-11-30';

  describe('Canonical Eligibility Function: isContributionPlanCandidateEligible', () => {
    const baseInput: ContributionCandidateEligibilityInput = {
      transaction: {
        id: 'tx-1',
        type: 'BUY',
        tradeDate: '2026-11-15',
        amountCents: 50000,
        currency: 'BRL',
      },
      planId,
      planCurrency,
      periodStart,
      periodEnd,
    };

    it('Matrix 1: BUY BRL in period with positive amount is ELIGIBLE', () => {
      const res = isContributionPlanCandidateEligible(baseInput);
      expect(res.eligible).toBe(true);
      expect(res.reason).toBe('ELIGIBLE');
    });

    it('Matrix 2: BUY USD / plan BRL is excluded due to CURRENCY_MISMATCH (no silent FX guessing)', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        transaction: {
          ...baseInput.transaction,
          currency: 'USD',
        },
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('CURRENCY_MISMATCH');
    });

    it('Matrix 3: SELL BRL is excluded due to NOT_BUY', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        transaction: {
          ...baseInput.transaction,
          type: 'SELL',
        },
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('NOT_BUY');
    });

    it('Matrix 4: BUY zero amount is excluded due to NON_POSITIVE_AMOUNT', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        transaction: {
          ...baseInput.transaction,
          amountCents: 0,
        },
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('NON_POSITIVE_AMOUNT');
    });

    it('Matrix 5: BUY negative amount is excluded due to NON_POSITIVE_AMOUNT', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        transaction: {
          ...baseInput.transaction,
          amountCents: -5000,
        },
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('NON_POSITIVE_AMOUNT');
    });

    it('Matrix 6: BUY outside period (before) is excluded due to OUT_OF_PERIOD', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        transaction: {
          ...baseInput.transaction,
          tradeDate: '2026-10-31',
        },
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('OUT_OF_PERIOD');
    });

    it('Matrix 6b: BUY outside period (after) is excluded due to OUT_OF_PERIOD', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        transaction: {
          ...baseInput.transaction,
          tradeDate: '2026-12-01',
        },
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('OUT_OF_PERIOD');
    });

    it('Matrix 7: BUY confirmed in current plan is CONFIRMED_CURRENT_PLAN (confirmed wins, not candidate)', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        isConfirmedToCurrentPlan: true,
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('CONFIRMED_CURRENT_PLAN');
    });

    it('Matrix 8: BUY confirmed in other plan is CONFIRMED_OTHER_PLAN (never candidate)', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        confirmedPlanId: 'other-plan-id',
        isConfirmedToAnyPlan: true,
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('CONFIRMED_OTHER_PLAN');
    });

    it('Matrix 9: BUY rejected in current plan is REJECTED_CURRENT_PLAN', () => {
      const res = isContributionPlanCandidateEligible({
        ...baseInput,
        isRejectedForCurrentPlan: true,
      });
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('REJECTED_CURRENT_PLAN');
    });

    it('Matrix 10: BUY unlinked eligible in period is ELIGIBLE', () => {
      const res = isContributionPlanCandidateEligible(baseInput);
      expect(res.eligible).toBe(true);
      expect(res.reason).toBe('ELIGIBLE');
    });

    it('Deterministic: 100 consecutive invocations yield identical classification', () => {
      const first = isContributionPlanCandidateEligible(baseInput);
      for (let i = 0; i < 100; i++) {
        const next = isContributionPlanCandidateEligible(baseInput);
        expect(next.eligible).toBe(first.eligible);
        expect(next.reason).toBe(first.reason);
      }
    });
  });

  describe('Cross-Feature Parity: APP-16X Review vs APP-16Y Timeline', () => {
    it('Critical Test 1: BUY BRL 500 + BUY USD 300 => candidateCents = 50000 in both APP-16X and APP-16Y', () => {
      const plan = {
        id: planId,
        name: 'Plano BRL Novembro',
        plannedDate: '2026-11-10',
        status: 'PLANNED' as const,
        currency: 'BRL',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      };

      const transactions = [
        {
          id: 'tx-brl-1',
          portfolioId: 'p-1',
          accountId: 'acc-1',
          assetId: 'asset-petr4',
          ticker: 'PETR4',
          type: 'BUY',
          tradeDate: '2026-11-12',
          amount: '500.00',
          currency: 'BRL',
        },
        {
          id: 'tx-usd-1',
          portfolioId: 'p-1',
          accountId: 'acc-2',
          assetId: 'asset-aapl',
          ticker: 'AAPL',
          type: 'BUY',
          tradeDate: '2026-11-14',
          amount: '300.00',
          currency: 'USD',
        },
      ];

      // 1. APP-16X Monthly Review
      const review = deriveContributionPlanMonthlyReview({
        plan,
        transactions,
        referenceDate: new Date('2026-11-20T00:00:00.000Z'),
      });

      expect(review.candidateCents).toBe(50000);
      expect(review.candidateAmount).toBe('500.00');
      expect(review.candidateTransactions).toHaveLength(1);
      expect(review.candidateTransactions[0]!.id).toBe('tx-brl-1');

      // 2. APP-16Y Monthly Timeline
      const timeline = buildPortfolioMonthlyProgressTimeline({
        portfolioId: 'p-1',
        fromMonth: '2026-11',
        toMonth: '2026-11',
        plans: [
          {
            id: plan.id,
            portfolioId: 'p-1',
            name: plan.name,
            plannedDate: plan.plannedDate,
            status: plan.status,
            currency: plan.currency,
            items: [{ category: 'STOCK', amount: '1000.00' }],
          },
        ],
        transactions: transactions.map((tx) => ({
          id: tx.id,
          portfolioId: tx.portfolioId,
          accountId: tx.accountId,
          assetId: tx.assetId,
          type: tx.type,
          tradeDate: tx.tradeDate,
          amount: tx.amount,
          currency: tx.currency,
        })),
        links: [],
      });

      const nov = timeline.months[0]!;
      const timelinePlan = nov.plans[0]!;

      // Parity Invariant
      expect(timelinePlan.candidateCents).toBe(review.candidateCents);
      expect(timelinePlan.candidateAmount).toBe(review.candidateAmount);
      expect(nov.totalCandidateCents).toBe(review.candidateCents);
      expect(nov.totalCandidateAmount).toBe(review.candidateAmount);
    });

    it('Property: Review candidateCents strictly equals Timeline plan candidateCents across full test matrix', () => {
      const testCases = [
        { desc: 'Single BRL BUY', txs: [{ id: '1', type: 'BUY', tradeDate: '2026-11-05', amount: '200.00', currency: 'BRL' }] },
        { desc: 'Single USD BUY', txs: [{ id: '2', type: 'BUY', tradeDate: '2026-11-05', amount: '200.00', currency: 'USD' }] },
        { desc: 'Mixed BRL and USD BUYs', txs: [
          { id: '3', type: 'BUY', tradeDate: '2026-11-05', amount: '400.00', currency: 'BRL' },
          { id: '4', type: 'BUY', tradeDate: '2026-11-06', amount: '600.00', currency: 'USD' },
        ]},
        { desc: 'BUY with SELL', txs: [
          { id: '5', type: 'BUY', tradeDate: '2026-11-05', amount: '350.00', currency: 'BRL' },
          { id: '6', type: 'SELL', tradeDate: '2026-11-06', amount: '1000.00', currency: 'BRL' },
        ]},
        { desc: 'BUY out of period', txs: [
          { id: '7', type: 'BUY', tradeDate: '2026-10-25', amount: '800.00', currency: 'BRL' },
          { id: '8', type: 'BUY', tradeDate: '2026-11-15', amount: '150.00', currency: 'BRL' },
        ]},
      ];

      for (const tc of testCases) {
        const plan = {
          id: 'test-plan-id',
          name: tc.desc,
          plannedDate: '2026-11-10',
          status: 'PLANNED' as const,
          currency: 'BRL',
          items: [{ category: 'STOCK', amount: '1000.00' }],
        };

        const txsForReview = tc.txs.map((t) => ({
          ...t,
          portfolioId: 'p-1',
          accountId: 'acc-1',
          assetId: 'asset-1',
        }));

        const review = deriveContributionPlanMonthlyReview({
          plan,
          transactions: txsForReview,
          referenceDate: new Date('2026-11-20T00:00:00.000Z'),
        });

        const timeline = buildPortfolioMonthlyProgressTimeline({
          portfolioId: 'p-1',
          fromMonth: '2026-11',
          toMonth: '2026-11',
          plans: [{
            ...plan,
            portfolioId: 'p-1',
            items: [{ category: 'STOCK', amount: '1000.00' }],
          }],
          transactions: tc.txs.map((t) => ({
            ...t,
            portfolioId: 'p-1',
          })),
          links: [],
        });

        const planInTimeline = timeline.months[0]!.plans[0]!;
        expect(
          planInTimeline.candidateCents,
          `Failed on case: ${tc.desc}`,
        ).toBe(review.candidateCents);
      }
    });

    it('Part AL & AM: Unlinked BUY outside candidate window increases purchaseActivity but candidateCents is 0', () => {
      const plan = {
        id: planId,
        name: 'Plano BRL Novembro',
        plannedDate: '2026-11-10',
        status: 'PLANNED' as const,
        currency: 'BRL',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      };

      // Transaction in November (month window) vs December
      const timeline = buildPortfolioMonthlyProgressTimeline({
        portfolioId: 'p-1',
        fromMonth: '2026-11',
        toMonth: '2026-11',
        plans: [{
          ...plan,
          portfolioId: 'p-1',
          items: [{ category: 'STOCK', amount: '1000.00' }],
        }],
        transactions: [
          {
            id: 'tx-nov',
            portfolioId: 'p-1',
            type: 'BUY',
            tradeDate: '2026-11-10',
            amount: '100.00',
            currency: 'BRL',
          },
        ],
        // tx is confirmed to another plan
        links: [
          {
            planId: 'some-other-plan',
            transactionId: 'tx-nov',
            status: 'CONFIRMED',
          },
        ],
      });

      const nov = timeline.months[0]!;
      // Since it's confirmed to another plan:
      // - It is NOT a candidate for this plan
      // - But purchaseActivity in November includes it (100.00)
      expect(nov.purchaseActivityCents).toBe(10000);
      expect(nov.totalCandidateCents).toBe(0);
      expect(nov.plans[0]!.candidateCents).toBe(0);
    });
  });
});
