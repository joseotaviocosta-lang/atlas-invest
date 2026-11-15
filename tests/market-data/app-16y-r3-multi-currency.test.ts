import { describe, it, expect } from 'vitest';
import {
  buildPortfolioMonthlyProgressTimeline,
  deriveContributionPlanMonthlyReview,
  addMoneyByCurrency,
  toMoneyByCurrency,
  type MonthlyProgressPlanInput,
  type MonthlyProgressTransactionInput,
  type MonthlyProgressTransactionLinkInput,
  type MonthlyProgressGoalInput,
} from '../../packages/market-data/src/opportunity-radar/contribution-tracking';
import { OPPORTUNITY_MODEL_VERSION } from '../../packages/market-data/src/opportunity-radar/types';

const portfolioId = 'p-multi-currency-test';

describe('PROJECT ATLAS — APP-16Y-R3: Multi-Currency Monthly Aggregation Integrity', () => {
  it('Helper: addMoneyByCurrency & toMoneyByCurrency sort keys alphabetically and format cents', () => {
    const map = new Map<string, { cents: number; txCount: number }>();
    addMoneyByCurrency(map, 'USD', 50000, 1);
    addMoneyByCurrency(map, 'BRL', 100000, 2);
    addMoneyByCurrency(map, 'EUR', 30000, 1);

    const result = toMoneyByCurrency(map);
    const keys = Object.keys(result);
    expect(keys).toEqual(['BRL', 'EUR', 'USD']);
    expect(result.BRL).toEqual({
      currency: 'BRL',
      cents: 100000,
      amount: '1000.00',
      transactionCount: 2,
    });
    expect(result.USD).toEqual({
      currency: 'USD',
      cents: 50000,
      amount: '500.00',
      transactionCount: 1,
    });
    expect(result.EUR).toEqual({
      currency: 'EUR',
      cents: 30000,
      amount: '300.00',
      transactionCount: 1,
    });
  });

  it('Part AW — Critical Test 1: BUY BRL 1000 + BUY USD 500 separates purchaseActivityByCurrency without combined fake sum', () => {
    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-1', portfolioId, type: 'BUY', tradeDate: '2026-11-05', amount: '1000.00', currency: 'BRL' },
      { id: 'tx-2', portfolioId, type: 'BUY', tradeDate: '2026-11-06', amount: '500.00', currency: 'USD' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      transactions,
    });

    const m = timeline.months[0]!;
    expect(m.purchaseActivityByCurrency?.BRL).toEqual({
      currency: 'BRL',
      cents: 100000,
      amount: '1000.00',
      transactionCount: 1,
    });
    expect(m.purchaseActivityByCurrency?.USD).toEqual({
      currency: 'USD',
      cents: 50000,
      amount: '500.00',
      transactionCount: 1,
    });
    // Never sum cross-currency
    expect(m.purchaseActivityCents).toBeNull();
    expect(m.purchaseActivityAmount).toBeNull();
    expect(m.monetaryAggregateMode).toBe('MULTI_CURRENCY');
    expect(m.monetaryCurrency).toBeNull();
  });

  it('Part AX — Critical Test 2: Plan BRL with confirmed BRL 700, unlinked BRL 200, unlinked USD 300', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-brl',
        portfolioId,
        name: 'Plano BRL',
        plannedDate: '2026-11-10',
        currency: 'BRL',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-conf', portfolioId, type: 'BUY', tradeDate: '2026-11-10', amount: '700.00', currency: 'BRL' },
      { id: 'tx-unlinked-brl', portfolioId, type: 'BUY', tradeDate: '2026-11-12', amount: '200.00', currency: 'BRL' },
      { id: 'tx-unlinked-usd', portfolioId, type: 'BUY', tradeDate: '2026-11-15', amount: '300.00', currency: 'USD' },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'plan-brl', transactionId: 'tx-conf', status: 'CONFIRMED' },
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
    const plan = m.plans[0]!;
    expect(plan.confirmedCents).toBe(70000);
    expect(plan.confirmedAmount).toBe('700.00');
    expect(plan.candidateCents).toBe(20000); // USD 300 excluded because currency mismatch
    expect(plan.candidateAmount).toBe('200.00');

    expect(m.purchaseActivityByCurrency?.BRL?.cents).toBe(90000);
    expect(m.purchaseActivityByCurrency?.USD?.cents).toBe(30000);
    expect(m.unlinkedPurchaseActivityByCurrency?.BRL?.cents).toBe(20000);
    expect(m.unlinkedPurchaseActivityByCurrency?.USD?.cents).toBe(30000);
  });

  it('Part AY — Critical Test 3: Plan BRL + Plan USD in the same month preserves planned amounts by currency', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-brl',
        portfolioId,
        name: 'Plano BRL',
        plannedDate: '2026-11-05',
        currency: 'BRL',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
      {
        id: 'plan-usd',
        portfolioId,
        name: 'Plano USD',
        plannedDate: '2026-11-15',
        currency: 'USD',
        status: 'PLANNED',
        items: [{ category: 'INTERNATIONAL', amount: '500.00' }],
      },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
    });

    const m = timeline.months[0]!;
    expect(m.plannedByCurrency?.BRL?.cents).toBe(100000);
    expect(m.plannedByCurrency?.BRL?.amount).toBe('1000.00');
    expect(m.plannedByCurrency?.USD?.cents).toBe(50000);
    expect(m.plannedByCurrency?.USD?.amount).toBe('500.00');
    expect(m.totalPlannedCents).toBeNull();
    expect(m.totalPlannedAmount).toBeNull();
  });

  it('Part AZ — Critical Test 4: Candidates for Plan BRL (200 BRL) and Plan USD (100 USD) segregated by currency', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'plan-brl',
        portfolioId,
        name: 'Plano BRL',
        plannedDate: '2026-11-05',
        currency: 'BRL',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '500.00' }],
      },
      {
        id: 'plan-usd',
        portfolioId,
        name: 'Plano USD',
        plannedDate: '2026-11-15',
        currency: 'USD',
        status: 'PLANNED',
        items: [{ category: 'INTERNATIONAL', amount: '300.00' }],
      },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-brl', portfolioId, type: 'BUY', tradeDate: '2026-11-10', amount: '200.00', currency: 'BRL' },
      { id: 'tx-usd', portfolioId, type: 'BUY', tradeDate: '2026-11-12', amount: '100.00', currency: 'USD' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      plans,
      transactions,
    });

    const m = timeline.months[0]!;
    expect(m.candidateByCurrency?.BRL?.cents).toBe(20000);
    expect(m.candidateByCurrency?.USD?.cents).toBe(10000);
    expect(m.totalCandidateCents).toBeNull();
  });

  it('Part BA — Critical Test 5: Confirmed transactions in BRL and USD plans segregated by currency', () => {
    const plans: MonthlyProgressPlanInput[] = [
      { id: 'p-brl', portfolioId, name: 'P BRL', plannedDate: '2026-11-01', currency: 'BRL', status: 'COMPLETED' },
      { id: 'p-usd', portfolioId, name: 'P USD', plannedDate: '2026-11-01', currency: 'USD', status: 'COMPLETED' },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-1', portfolioId, type: 'BUY', tradeDate: '2026-11-02', amount: '600.00', currency: 'BRL' },
      { id: 'tx-2', portfolioId, type: 'BUY', tradeDate: '2026-11-03', amount: '400.00', currency: 'USD' },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'p-brl', transactionId: 'tx-1', status: 'CONFIRMED' },
      { planId: 'p-usd', transactionId: 'tx-2', status: 'CONFIRMED' },
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
    expect(m.confirmedByCurrency?.BRL?.cents).toBe(60000);
    expect(m.confirmedByCurrency?.USD?.cents).toBe(40000);
    expect(m.totalConfirmedCents).toBeNull();
  });

  it('Part BB & BC — Critical Tests 6 & 7: Unlinked BUY and SELL segregated by currency', () => {
    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'buy-brl', portfolioId, type: 'BUY', tradeDate: '2026-11-05', amount: '100.00', currency: 'BRL' },
      { id: 'buy-usd', portfolioId, type: 'BUY', tradeDate: '2026-11-06', amount: '200.00', currency: 'USD' },
      { id: 'sell-brl', portfolioId, type: 'SELL', tradeDate: '2026-11-10', amount: '50.00', currency: 'BRL' },
      { id: 'sell-usd', portfolioId, type: 'SELL', tradeDate: '2026-11-11', amount: '75.00', currency: 'USD' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
      transactions,
    });

    const m = timeline.months[0]!;
    expect(m.unlinkedPurchaseActivityByCurrency?.BRL?.cents).toBe(10000);
    expect(m.unlinkedPurchaseActivityByCurrency?.USD?.cents).toBe(20000);
    expect(m.sellActivityByCurrency?.BRL?.cents).toBe(5000);
    expect(m.sellActivityByCurrency?.USD?.cents).toBe(7500);
    expect(m.sellActivityCents).toBeNull();
    expect(m.sellTransactionCount).toBe(2);
  });

  it('Part BD — Critical Test 8: Summary across multi-month timeline with changing currencies', () => {
    const goals: MonthlyProgressGoalInput[] = [
      { id: 'g-1', amount: '1000.00', currency: 'BRL', effectiveFrom: '2026-01-01', effectiveTo: '2026-07-01' },
      { id: 'g-2', amount: '300.00', currency: 'USD', effectiveFrom: '2026-07-01', effectiveTo: '2027-01-01' },
    ];

    const plans: MonthlyProgressPlanInput[] = [
      { id: 'p-1', portfolioId, name: 'P Jan', plannedDate: '2026-01-10', currency: 'BRL', status: 'COMPLETED', items: [{ amount: '1000.00' }] },
      { id: 'p-2', portfolioId, name: 'P Jul', plannedDate: '2026-07-10', currency: 'USD', status: 'COMPLETED', items: [{ amount: '300.00' }] },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-jan', portfolioId, type: 'BUY', tradeDate: '2026-01-10', amount: '1000.00', currency: 'BRL' },
      { id: 'tx-jul', portfolioId, type: 'BUY', tradeDate: '2026-07-10', amount: '300.00', currency: 'USD' },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'p-1', transactionId: 'tx-jan', status: 'CONFIRMED' },
      { planId: 'p-2', transactionId: 'tx-jul', status: 'CONFIRMED' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-12',
      goals,
      plans,
      links,
      transactions,
    });

    const s = timeline.summary;
    expect(s.monetaryAggregateMode).toBe('MULTI_CURRENCY');
    expect(s.monetaryCurrency).toBeNull();
    expect(s.totalGoalCents).toBeNull();
    expect(s.totalPlannedCents).toBeNull();
    expect(s.totalConfirmedCents).toBeNull();
    expect(s.totalPurchaseActivityCents).toBeNull();

    // Summary totals by currency are deterministic and segregated
    expect(s.totalGoalByCurrency?.BRL?.cents).toBe(600000); // 6 months of BRL 1000
    expect(s.totalGoalByCurrency?.USD?.cents).toBe(180000); // 6 months of USD 300
    expect(s.totalPlannedByCurrency?.BRL?.cents).toBe(100000);
    expect(s.totalPlannedByCurrency?.USD?.cents).toBe(30000);
    expect(s.totalConfirmedByCurrency?.BRL?.cents).toBe(100000);
    expect(s.totalConfirmedByCurrency?.USD?.cents).toBe(30000);
  });

  it('Part BE — Critical Test 9: Single-currency portfolio maintains scalar compatibility', () => {
    const goals: MonthlyProgressGoalInput[] = [
      { id: 'g-1', amount: '2000.00', currency: 'BRL', effectiveFrom: '2026-01-01', effectiveTo: null },
    ];

    const plans: MonthlyProgressPlanInput[] = [
      { id: 'p-1', portfolioId, name: 'P Jan', plannedDate: '2026-01-10', currency: 'BRL', status: 'COMPLETED', items: [{ amount: '2000.00' }] },
    ];

    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-1', portfolioId, type: 'BUY', tradeDate: '2026-01-10', amount: '2000.00', currency: 'BRL' },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'p-1', transactionId: 'tx-1', status: 'CONFIRMED' },
    ];

    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-01',
      toMonth: '2026-01',
      goals,
      plans,
      links,
      transactions,
    });

    const m = timeline.months[0]!;
    expect(m.monetaryAggregateMode).toBe('SINGLE_CURRENCY');
    expect(m.monetaryCurrency).toBe('BRL');
    expect(m.purchaseActivityCents).toBe(200000);
    expect(m.purchaseActivityAmount).toBe('2000.00');
    expect(m.totalConfirmedCents).toBe(200000);
    expect(m.totalConfirmedAmount).toBe('2000.00');
    expect(m.totalPlannedCents).toBe(200000);
    expect(m.totalPlannedAmount).toBe('2000.00');
    expect(m.unlinkedPurchaseActivityCents).toBe(0);

    const s = timeline.summary;
    expect(s.monetaryAggregateMode).toBe('SINGLE_CURRENCY');
    expect(s.monetaryCurrency).toBe('BRL');
    expect(s.totalGoalCents).toBe(200000);
    expect(s.totalConfirmedCents).toBe(200000);
  });

  it('Part BG & BL — Critical Test 11: Confirmed link with currency mismatch is excluded from plan monetary totals and surfaces warning', () => {
    const plans: MonthlyProgressPlanInput[] = [
      {
        id: 'p-brl',
        portfolioId,
        name: 'Plano BRL',
        plannedDate: '2026-11-10',
        currency: 'BRL',
        status: 'PLANNED',
        items: [{ category: 'STOCK', amount: '1000.00' }],
      },
    ];

    // Transaction is USD, but link is CONFIRMED to BRL plan
    const transactions: MonthlyProgressTransactionInput[] = [
      { id: 'tx-usd-1', portfolioId, type: 'BUY', tradeDate: '2026-11-10', amount: '500.00', currency: 'USD' },
    ];

    const links: MonthlyProgressTransactionLinkInput[] = [
      { planId: 'p-brl', transactionId: 'tx-usd-1', status: 'CONFIRMED' },
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
    const plan = m.plans[0]!;
    // Confirmed total in plan MUST NOT include USD transaction
    expect(plan.confirmedCents).toBe(0);
    expect(plan.confirmedAmount).toBe('0.00');

    // Warning is surfaced
    expect(m.warnings.some((w) => w.includes('tx-usd-1') && w.includes('possui moeda diferente'))).toBe(true);
    expect(m.dataQuality.currencyMismatchCount).toBe(1);

    // The transaction remains an unlinked USD purchase
    expect(m.unlinkedPurchaseActivityByCurrency?.USD?.cents).toBe(50000);
  });

  it('Part BH & BI — Critical Test 12: APP-16X Review protects against currency mismatch in confirmed transactions', () => {
    const plan = {
      id: 'p-rev-1',
      portfolioId,
      name: 'Plano Aporte Novembro',
      plannedDate: '2026-11-15',
      currency: 'BRL',
      status: 'PLANNED' as const,
      items: [{ category: 'STOCK', amount: '1000.00' }],
    };

    const review = deriveContributionPlanMonthlyReview({
      plan,
      transactions: [
        {
          id: 'tx-mismatch',
          portfolioId,
          type: 'BUY',
          tradeDate: '2026-11-15',
          amount: '500.00',
          currency: 'USD', // Mismatch with plan.currency (BRL)
          linkStatus: 'CONFIRMED',
          linkedPlanId: 'p-rev-1',
        },
      ],
      referenceDate: new Date('2026-11-20T00:00:00.000Z'),
    });

    // Confirmed amount must exclude the USD transaction
    expect(review.confirmedCents).toBe(0);
    expect(review.confirmedAmount).toBe('0.00');
    expect(review.warnings.some((w) => w.includes('tx-mismatch') && w.includes('possui moeda diferente'))).toBe(true);
    // Link remains visible for audit
    expect(review.confirmedTransactions.length).toBe(1);
    expect(review.confirmedTransactions[0]!.id).toBe('tx-mismatch');
  });

  it('Part AV: Safe copy contains multiCurrencyNote', () => {
    const timeline = buildPortfolioMonthlyProgressTimeline({
      portfolioId,
      fromMonth: '2026-11',
      toMonth: '2026-11',
    });

    expect(timeline.safeCopy.multiCurrencyNote).toBe(
      'Valores em moedas diferentes são apresentados separadamente. O Atlas não aplica conversão cambial histórica nesta visão.',
    );
    expect(timeline.modelVersion).toBe(OPPORTUNITY_MODEL_VERSION);
  });
});
