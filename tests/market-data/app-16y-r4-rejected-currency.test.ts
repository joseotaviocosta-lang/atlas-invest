import { describe, it, expect } from 'vitest';
import {
  buildPortfolioMonthlyProgressTimeline,
  deriveContributionPlanMonthlyReview,
  type MonthlyProgressPlanInput,
  type MonthlyProgressTransactionInput,
  type MonthlyProgressTransactionLinkInput,
} from '../../packages/market-data/src/opportunity-radar/contribution-tracking';
import { OPPORTUNITY_MODEL_VERSION } from '../../packages/market-data/src/opportunity-radar/types';

const portfolioId = 'p-app-16y-r4-test';

describe('PROJECT ATLAS — APP-16Y-R4: Rejected Currency Integrity & Linked-vs-Valid Activity Semantics', () => {
  // PARTE X — CRITICAL TEST 1
  it('Critical Test 1: Plan BRL with Rejected USD 500 in APP-16X excludes amount from rejected totals while preserving audit visibility', () => {
    const plan = {
      id: 'plan-brl-1',
      portfolioId,
      name: 'Plano BRL Novembro',
      plannedDate: '2026-11-15',
      currency: 'BRL',
      status: 'PLANNED' as const,
      items: [{ category: 'STOCK', amount: '1000.00' }],
    };

    const review = deriveContributionPlanMonthlyReview({
      plan,
      transactions: [
        {
          id: 'tx-usd-rej',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-10',
          amount: '500.00',
          currency: 'USD',
          linkStatus: 'REJECTED',
          linkedPlanId: 'plan-brl-1',
        },
      ],
      referenceDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    expect(review.rejectedCents).toBe(0);
    expect(review.rejectedAmount).toBe('0.00');
    expect(review.rejectedTransactions.length).toBe(1);
    expect(review.rejectedTransactions[0]!.id).toBe('tx-usd-rej');
    expect(review.dataQuality.currencyMismatchCount).toBe(1);
    expect(
      review.warnings.some(
        (w) =>
          w.includes('tx-usd-rej') &&
          w.includes('possui moeda diferente') &&
          w.includes('USD') &&
          w.includes('BRL'),
      ),
    ).toBe(true);
  });

  // PARTE Y — CRITICAL TEST 2
  it('Critical Test 2: Plan BRL with Confirmed USD 500 in APP-16X excludes amount from confirmed totals while preserving audit visibility', () => {
    const plan = {
      id: 'plan-brl-2',
      portfolioId,
      name: 'Plano BRL Novembro',
      plannedDate: '2026-11-15',
      currency: 'BRL',
      status: 'PLANNED' as const,
      items: [{ category: 'STOCK', amount: '1000.00' }],
    };

    const review = deriveContributionPlanMonthlyReview({
      plan,
      transactions: [
        {
          id: 'tx-usd-conf',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-10',
          amount: '500.00',
          currency: 'USD',
          linkStatus: 'CONFIRMED',
          linkedPlanId: 'plan-brl-2',
        },
      ],
      referenceDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    expect(review.confirmedCents).toBe(0);
    expect(review.confirmedAmount).toBe('0.00');
    expect(review.confirmedTransactions.length).toBe(1);
    expect(review.confirmedTransactions[0]!.id).toBe('tx-usd-conf');
    expect(review.dataQuality.currencyMismatchCount).toBe(1);
    expect(
      review.warnings.some(
        (w) =>
          w.includes('tx-usd-conf') &&
          w.includes('possui moeda diferente') &&
          w.includes('USD') &&
          w.includes('BRL'),
      ),
    ).toBe(true);
  });

  // PARTE Z — CRITICAL TEST 3
  it('Critical Test 3: Same confirmed mismatch in APP-16Y is excluded from confirmed BRL and NOT included in unlinked USD', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-brl-3',
        portfolioId,
        name: 'Plano BRL Novembro',
        plannedDate: '2026-11-15',
        currency: 'BRL',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-usd-conf-3',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-10',
        amount: '500.00',
        currency: 'USD',
      },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'plan-brl-3', transactionId: 'tx-usd-conf-3', status: 'CONFIRMED' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
      links,
      transactions,
    });

    const m = timeline.months[0]!;
    // Confirmed BRL does NOT include the USD transaction
    expect(m.confirmedByCurrency?.BRL).toBeUndefined();
    expect(m.totalConfirmedCents).toBe(0);
    expect(m.totalConfirmedAmount).toBe('0.00');

    // Unlinked USD does NOT include the transaction because it is LINKED to plan-brl-3
    expect(m.unlinkedPurchaseActivityByCurrency?.USD).toBeUndefined();
    expect(m.unlinkedPurchaseActivityCents).toBe(0);

    // Ledger purchase activity accurately reflects the BUY in USD
    expect(m.purchaseActivityByCurrency?.USD?.cents).toBe(50000);
    expect(m.dataQuality.currencyMismatchCount).toBe(1);
    expect(
      m.warnings.some(
        (w) =>
          w.includes('tx-usd-conf-3') &&
          w.includes('possui moeda diferente') &&
          w.includes('USD') &&
          w.includes('BRL'),
      ),
    ).toBe(true);
  });

  // PARTE AA — CRITICAL TEST 4
  it('Critical Test 4: Truly unlinked BUY USD 500 with zero links appears in unlinkedPurchaseActivityByCurrency.USD', () => {
    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-unlinked-usd',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-12',
        amount: '500.00',
        currency: 'USD',
      },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      transactions,
    });

    const m = timeline.months[0]!;
    expect(m.unlinkedPurchaseActivityByCurrency?.USD).toEqual({
      currency: 'USD',
      cents: 50000,
      amount: '500.00',
      transactionCount: 1,
    });
    expect(m.unlinkedPurchaseActivityCents).toBe(50000);
    expect(m.unlinkedPurchaseActivityAmount).toBe('500.00');
  });

  // PARTE AB — CRITICAL TEST 5
  it('Critical Test 5: Rejected BUY USD 500 with link is not counted as unlinked purchase activity', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-brl-5',
        portfolioId,
        name: 'Plano BRL',
        plannedDate: '2026-11-10',
        currency: 'BRL',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-rej-usd-5',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-10',
        amount: '500.00',
        currency: 'USD',
      },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'plan-brl-5', transactionId: 'tx-rej-usd-5', status: 'REJECTED' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
      links,
      transactions,
    });

    const m = timeline.months[0]!;
    // Because it is linked (REJECTED), it is NOT unlinked
    expect(m.unlinkedPurchaseActivityByCurrency?.USD).toBeUndefined();
    expect(m.unlinkedPurchaseActivityCents).toBe(0);
    // But it is recorded in ledger purchases
    expect(m.purchaseActivityByCurrency?.USD?.cents).toBe(50000);
    expect(m.dataQuality.currencyMismatchCount).toBe(1);
  });

  // PARTE AC — CRITICAL TEST 6
  it('Critical Test 6: Rejected BUY BRL 200 with matching currency populates rejectedCents without polluting confirmed or candidate', () => {
    const plan = {
      id: 'plan-brl-6',
      portfolioId,
      name: 'Plano BRL',
      plannedDate: '2026-11-15',
      currency: 'BRL',
      status: 'PLANNED' as const,
      items: [{ category: 'STOCK', amount: '1000.00' }],
    };

    const review = deriveContributionPlanMonthlyReview({
      plan,
      transactions: [
        {
          id: 'tx-rej-brl-6',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-10',
          amount: '200.00',
          currency: 'BRL',
          linkStatus: 'REJECTED',
          linkedPlanId: 'plan-brl-6',
        },
      ],
      referenceDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    expect(review.rejectedCents).toBe(20000);
    expect(review.rejectedAmount).toBe('200.00');
    expect(review.confirmedCents).toBe(0);
    expect(review.candidateCents).toBe(0);
    expect(review.dataQuality.currencyMismatchCount).toBe(0);
  });

  // PARTE AD & AE — CRITICAL TESTS 7 & 8
  it('Critical Tests 7 & 8: Candidate BUY BRL 300 and Confirmed valid BRL 700 are preserved as expected', () => {
    const plan = {
      id: 'plan-brl-78',
      portfolioId,
      name: 'Plano BRL',
      plannedDate: '2026-11-15',
      currency: 'BRL',
      status: 'PLANNED' as const,
      items: [{ category: 'STOCK', amount: '1000.00' }],
    };

    const review = deriveContributionPlanMonthlyReview({
      plan,
      transactions: [
        {
          id: 'tx-conf-700',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-05',
          amount: '700.00',
          currency: 'BRL',
          linkStatus: 'CONFIRMED',
          linkedPlanId: 'plan-brl-78',
        },
        {
          id: 'tx-cand-300',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-10',
          amount: '300.00',
          currency: 'BRL',
        },
      ],
      referenceDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    expect(review.confirmedCents).toBe(70000);
    expect(review.confirmedAmount).toBe('700.00');
    expect(review.candidateCents).toBe(30000);
    expect(review.candidateAmount).toBe('300.00');
    expect(review.rejectedCents).toBe(0);
    expect(review.dataQuality.currencyMismatchCount).toBe(0);
  });

  // PARTE AF — CRITICAL TEST 9
  it('Critical Test 9: Month with valid confirmed BRL 700, invalid confirmed USD 500, and unlinked USD 300', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-brl-9',
        portfolioId,
        name: 'Plano BRL',
        plannedDate: '2026-11-15',
        currency: 'BRL',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      {
        id: 'tx-conf-brl-700',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-05',
        amount: '700.00',
        currency: 'BRL',
      },
      {
        id: 'tx-conf-usd-500',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-06',
        amount: '500.00',
        currency: 'USD',
      },
      {
        id: 'tx-unlinked-usd-300',
        portfolioId,
        type: 'BUY',
        tradeDate: '2026-11-07',
        amount: '300.00',
        currency: 'USD',
      },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'plan-brl-9', transactionId: 'tx-conf-brl-700', status: 'CONFIRMED' },
      { planId: 'plan-brl-9', transactionId: 'tx-conf-usd-500', status: 'CONFIRMED' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
      links,
      transactions,
    });

    const m = timeline.months[0]!;
    // Confirmed BRL contains only valid confirmed
    expect(m.confirmedByCurrency?.BRL?.cents).toBe(70000);
    expect(m.confirmedByCurrency?.BRL?.amount).toBe('700.00');
    expect(m.confirmedByCurrency?.USD).toBeUndefined();

    // Purchase activity includes all BUYs
    expect(m.purchaseActivityByCurrency?.BRL?.cents).toBe(70000);
    expect(m.purchaseActivityByCurrency?.USD?.cents).toBe(80000); // 500 + 300

    // Unlinked purchase activity ONLY includes the unlinked tx (USD 300), NOT USD 800!
    expect(m.unlinkedPurchaseActivityByCurrency?.USD?.cents).toBe(30000);
    expect(m.unlinkedPurchaseActivityByCurrency?.USD?.amount).toBe('300.00');
    expect(m.unlinkedPurchaseActivityByCurrency?.BRL).toBeUndefined();

    expect(m.dataQuality.currencyMismatchCount).toBe(1);
  });

  // PARTE AG — CRITICAL TEST 10
  it('Critical Test 10: 1 confirmed mismatch + 1 rejected mismatch yields currencyMismatchCount = 2 in both Review and Timeline', () => {
    // 1. APP-16X Review
    const plan = {
      id: 'plan-brl-10',
      portfolioId,
      name: 'Plano BRL',
      plannedDate: '2026-11-15',
      currency: 'BRL',
      status: 'PLANNED' as const,
      items: [{ category: 'STOCK', amount: '1000.00' }],
    };

    const review = deriveContributionPlanMonthlyReview({
      plan,
      transactions: [
        {
          id: 'tx-usd-conf-10',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-05',
          amount: '500.00',
          currency: 'USD',
          linkStatus: 'CONFIRMED',
          linkedPlanId: 'plan-brl-10',
        },
        {
          id: 'tx-eur-rej-10',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-06',
          amount: '200.00',
          currency: 'EUR',
          linkStatus: 'REJECTED',
          linkedPlanId: 'plan-brl-10',
        },
      ],
      referenceDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    expect(review.dataQuality.currencyMismatchCount).toBe(2);
    expect(review.confirmedCents).toBe(0);
    expect(review.rejectedCents).toBe(0);
    expect(review.warnings.length).toBe(2);
    expect(review.warnings[0]).toContain('tx-usd-conf-10');
    expect(review.warnings[1]).toContain('tx-eur-rej-10');

    // 2. APP-16Y Timeline
    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans: [
        {
          id: 'plan-brl-10',
          portfolioId,
          name: 'Plano BRL',
          plannedDate: '2026-11-15',
          currency: 'BRL',
          status: 'PLANNED',
          items: [{ category: 'STOCK', amount: '1000.00' }],
        },
      ],
      links: [
        { planId: 'plan-brl-10', transactionId: 'tx-usd-conf-10', status: 'CONFIRMED' },
        { planId: 'plan-brl-10', transactionId: 'tx-eur-rej-10', status: 'REJECTED' },
      ],
      transactions: [
        {
          id: 'tx-usd-conf-10',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-05',
          amount: '500.00',
          currency: 'USD',
        },
        {
          id: 'tx-eur-rej-10',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-06',
          amount: '200.00',
          currency: 'EUR',
        },
      ],
    });

    const m = timeline.months[0]!;
    expect(m.dataQuality.currencyMismatchCount).toBe(2);
    expect(m.warnings.length).toBe(3); // 2 currency mismatch + 1 historical valuation note
  });

  // PARTE S — NO DOUBLE COUNT
  it('No double count mismatch: same transaction cannot increment currencyMismatchCount multiple times', () => {
    const plan = {
      id: 'plan-brl-s',
      portfolioId,
      name: 'Plano BRL',
      plannedDate: '2026-11-15',
      currency: 'BRL',
      status: 'PLANNED' as const,
      items: [{ category: 'STOCK', amount: '1000.00' }],
    };

    // Even if somehow transaction array has a duplicate entry for tx-usd
    const review = deriveContributionPlanMonthlyReview({
      plan,
      transactions: [
        {
          id: 'tx-usd-dup',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-05',
          amount: '500.00',
          currency: 'USD',
          linkStatus: 'CONFIRMED',
          linkedPlanId: 'plan-brl-s',
        },
        {
          id: 'tx-usd-dup',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-05',
          amount: '500.00',
          currency: 'USD',
          linkStatus: 'CONFIRMED',
          linkedPlanId: 'plan-brl-s',
        },
      ],
      referenceDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    expect(review.dataQuality.currencyMismatchCount).toBe(1);
  });

  // Model version integrity
  it('Opportunity model version is strictly opportunity-v2.3.1', () => {
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');
  });
});
