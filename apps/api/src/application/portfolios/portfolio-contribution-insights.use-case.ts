import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import type {
  IAssetRepository,
  IContributionGoalRepository,
  IContributionPlanLinkRepository,
  IContributionPlanRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  addDecimals,
  compareMonthKeys,
  deriveGoalProgress,
  enumerateGoalMonths,
  goalForMonth,
} from '@atlas/portfolio-strategy';
import {
  deriveContributionInsights,
  INSIGHT_DEFAULT_PERIOD,
  INSIGHT_PERIODS,
  InvalidContributionInsightsError,
  resolveInsightPeriod,
  type ContributionInsights,
} from '@atlas/portfolio-strategy';
import {
  ASSET_REPOSITORY,
  CONTRIBUTION_GOAL_REPOSITORY,
  CONTRIBUTION_PLAN_LINK_REPOSITORY,
  CONTRIBUTION_PLAN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { classifyPlanTransactions, planTransactionAmount } from './contribution-tracking-read';

/** Local civil "today" as `YYYY-MM-DD` from wall-clock fields (no instants). */
function todayCivilString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function sumAmounts(amounts: readonly string[]): string {
  let total = '0';
  for (const amount of amounts) total = addDecimals(total, amount);
  return total;
}

/**
 * Phase 5Q-I — read-only contribution insights (facts only).
 *
 * Derives everything from plans + CONFIRMED links + ledger rows.
 * Candidates never enter totals; REJECTED links are invisible;
 * cancelled plans stay out of planned totals. Zero writes, zero
 * persistence, zero recommendations. Bounded constant query plan:
 * plans (3 status lists), one batched link read, one batched
 * transaction read, one batched asset read — no per-plan or per-month
 * queries, no N+1.
 */
@Injectable()
export class PortfolioContributionInsightsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(CONTRIBUTION_PLAN_REPOSITORY)
    private readonly plans: IContributionPlanRepository,
    @Inject(CONTRIBUTION_PLAN_LINK_REPOSITORY)
    private readonly links: IContributionPlanLinkRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(CONTRIBUTION_GOAL_REPOSITORY)
    private readonly goals: IContributionGoalRepository,
  ) {}

  private async verifyOwnership(portfolioId: string, userId?: string) {
    const portfolio = userId
      ? await this.portfolios.findByIdAndUserId(portfolioId, userId)
      : await this.portfolios.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
  }

  async getInsights(command: {
    portfolioId: string;
    userId?: string;
    period?: string;
    today?: string;
  }): Promise<{
    period: string;
    generatedAt: string;
    currency: string | null;
    summary: ContributionInsights | null;
    summariesByCurrency: Array<ContributionInsights & { currency: string }>;
    timeline: Array<ContributionInsights['timeline'][number] & { goalAmount: string | null }>;
    statusBreakdown: ContributionInsights['statusBreakdown'];
    byCategory: ContributionInsights['byCategory'];
    recentPlans: ContributionInsights['recentPlans'];
    goal: { amount: string; currency: string; effectiveFromMonth: string } | null;
    goalProgress: {
      periodGoalTotal: string;
      plannedTotal: string;
      confirmedTotal: string;
      plannedDifference: string | null;
      confirmedDifference: string | null;
      completionBp: number | null;
      status: 'NO_GOAL' | 'BELOW' | 'AT' | 'ABOVE';
      monthsWithGoal: number;
      monthsWithoutGoal: number;
    } | null;
    limitations: string[];
  }> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const period = command.period ?? INSIGHT_DEFAULT_PERIOD;
    if (!(INSIGHT_PERIODS as readonly string[]).includes(period)) {
      throw new InvalidContributionInsightsError(`Invalid period '${period}'`);
    }
    const today = command.today ?? todayCivilString();
    const range = resolveInsightPeriod(period, today);
    if (!range) {
      throw new InvalidContributionInsightsError(`Invalid period '${period}'`);
    }

    const [planned, completed, cancelled] = await Promise.all([
      this.plans.listByPortfolio(command.portfolioId, 'PLANNED'),
      this.plans.listByPortfolio(command.portfolioId, 'COMPLETED'),
      this.plans.listByPortfolio(command.portfolioId, 'CANCELLED'),
    ]);
    const all = [...planned, ...completed, ...cancelled];
    const inScope = all.filter(
      (plan) =>
        (range.start === null || plan.plannedDate >= range.start) && plan.plannedDate <= range.end,
    );
    if (inScope.length === 0) {
      return {
        period,
        generatedAt: new Date().toISOString(),
        currency: null,
        summary: null,
        summariesByCurrency: [],
        timeline: [],
        statusBreakdown: [],
        byCategory: [],
        recentPlans: [],
        goal: null,
        goalProgress: null,
        limitations: ['NO_PLANS_IN_PERIOD'],
      };
    }

    const linksByPlan = await this.links.listByPlanIds(inScope.map((plan) => plan.id));
    const confirmedIds = new Set<string>();
    for (const planLinks of linksByPlan.values()) {
      for (const link of planLinks) {
        if (link.status === 'CONFIRMED') confirmedIds.add(link.transactionId);
      }
    }
    const confirmedTxs = await this.transactions.findByIds([...confirmedIds]);
    const confirmedById = new Map<string, Transaction>(confirmedTxs.map((tx) => [tx.id, tx]));
    const categories = await classifyPlanTransactions(
      confirmedTxs.map((tx) => ({
        id: tx.id,
        assetId: (tx as { assetId?: string | null }).assetId ?? null,
        type: tx.type,
      })),
      (ids) => this.assets.findByIds(ids),
    );
    // Owner lookup: which in-scope plan confirmed each transaction.
    // A transaction confirmed to an out-of-scope plan never leaks in.
    const ownerByTransaction = new Map<string, string>();
    for (const [planId, planLinks] of linksByPlan) {
      for (const link of planLinks) {
        if (link.status === 'CONFIRMED') ownerByTransaction.set(link.transactionId, planId);
      }
    }
    const scopedIds = new Set(inScope.map((plan) => plan.id));
    const confirmedRows = [...confirmedIds].flatMap((id) => {
      const owner = ownerByTransaction.get(id);
      if (!owner || !scopedIds.has(owner)) return [];
      const tx = confirmedById.get(id);
      const parsed = tx ? planTransactionAmount(tx) : null;
      if (!tx || !parsed) return [];
      return [
        {
          planId: owner,
          transactionId: id,
          tradeDate: parsed.tradeDate,
          amount: parsed.amount,
          currency: parsed.currency,
          category: categories.get(id) ?? 'OTHER',
        },
      ];
    });

    const planInputs = inScope.map((plan) => ({
      id: plan.id,
      name: plan.name,
      plannedDate: plan.plannedDate,
      status: plan.status,
      currency: plan.currency,
      total: sumAmounts(plan.items.map((item) => item.amount)),
      items: plan.items.map((item) => ({ category: item.category, amount: item.amount })),
    }));
    const currencies = Array.from(new Set(inScope.map((plan) => plan.currency)));

    if (currencies.length > 1) {
      // Fail-closed consolidated view: per-currency summaries instead of
      // a mixed total. BRL + USD are never summed.
      const summariesByCurrency = currencies.map((currency) => {
        const scoped = planInputs.filter((plan) => plan.currency === currency);
        const scopedIds = new Set(scoped.map((plan) => plan.id));
        const scopedConfirmed = confirmedRows.filter((row) => scopedIds.has(row.planId));
        const summary = deriveContributionInsights({
          plans: scoped,
          confirmed: scopedConfirmed,
          currency,
          range,
        });
        return { ...summary, currency };
      });
      return {
        period,
        generatedAt: new Date().toISOString(),
        currency: null,
        summary: null,
        summariesByCurrency,
        timeline: [],
        statusBreakdown: [],
        byCategory: [],
        recentPlans: [],
        goal: null,
        goalProgress: null,
        limitations: ['MIXED_CURRENCIES'],
      };
    }

    const summary = deriveContributionInsights({
      plans: planInputs,
      confirmed: confirmedRows,
      currency: currencies[0] as string,
      range,
    });

    // Goal overlay: versioned user-defined monthly target, same currency
    // only. Never mixed across currencies; history is never rewritten.
    const goalRows = await this.goals.listByPortfolio(command.portfolioId);
    const goalVersions = goalRows
      .filter((goal) => goal.currency === currencies[0])
      .map((goal) => ({
        amount: goal.amount,
        currency: goal.currency,
        effectiveFromMonth: goal.effectiveFrom.slice(0, 7),
        effectiveToMonth: goal.effectiveTo ? goal.effectiveTo.slice(0, 7) : null,
      }));
    if (goalRows.length > 0 && goalVersions.length === 0) {
      const limitations: string[] = [];
      if (confirmedRows.length === 0) limitations.push('NO_CONFIRMED_ACTUALS');
      limitations.push('GOAL_CURRENCY_MISMATCH');
      return {
        period,
        generatedAt: new Date().toISOString(),
        currency: currencies[0] as string,
        summary,
        summariesByCurrency: [],
        timeline: summary.timeline.map((row) => ({ ...row, goalAmount: null })),
        statusBreakdown: summary.statusBreakdown,
        byCategory: summary.byCategory,
        recentPlans: summary.recentPlans,
        goal: null,
        goalProgress: null,
        limitations,
      };
    }
    const goalMonths = enumerateGoalMonths(
      range,
      summary.timeline.map((row) => row.month),
    );
    let periodGoalTotal = '0';
    let monthsWithGoal = 0;
    for (const month of goalMonths) {
      const amount = goalForMonth(goalVersions, month);
      if (amount !== null) {
        monthsWithGoal += 1;
        periodGoalTotal = addDecimals(periodGoalTotal, amount);
      }
    }
    const endMonth = range.end.slice(0, 7);
    const currentGoalAmount = goalForMonth(goalVersions, endMonth);
    let currentGoalVersion: (typeof goalVersions)[number] | null = null;
    for (const version of goalVersions) {
      if (
        compareMonthKeys(version.effectiveFromMonth, endMonth) <= 0 &&
        (currentGoalVersion === null ||
          compareMonthKeys(version.effectiveFromMonth, currentGoalVersion.effectiveFromMonth) > 0)
      ) {
        currentGoalVersion = version;
      }
    }
    const goal =
      currentGoalAmount === null || currentGoalVersion === null
        ? null
        : {
            amount: currentGoalAmount,
            currency: currentGoalVersion.currency,
            effectiveFromMonth: currentGoalVersion.effectiveFromMonth,
          };
    const progress =
      monthsWithGoal === 0
        ? null
        : deriveGoalProgress({
            goalAmount: periodGoalTotal,
            plannedAmount: summary.plannedTotal,
            confirmedAmount: summary.confirmedTotal,
          });
    const goalProgress =
      progress === null
        ? null
        : {
            periodGoalTotal,
            plannedTotal: progress.plannedAmount,
            confirmedTotal: progress.confirmedAmount,
            plannedDifference: progress.plannedDifference,
            confirmedDifference: progress.confirmedDifference,
            completionBp: progress.completionBp,
            status: progress.status,
            monthsWithGoal,
            monthsWithoutGoal: goalMonths.length - monthsWithGoal,
          };
    const timeline = summary.timeline.map((row) => ({
      ...row,
      goalAmount: goalForMonth(goalVersions, row.month),
    }));

    const limitations: string[] = [];
    if (confirmedRows.length === 0) limitations.push('NO_CONFIRMED_ACTUALS');
    if (summary.byCategory.some((row) => row.category === 'OTHER' && row.confirmed !== '0')) {
      limitations.push('UNCLASSIFIED_ACTUALS');
    }
    const plannedNonCash = sumAmounts(
      summary.byCategory.filter((row) => row.category !== 'CASH').map((row) => row.planned),
    );
    if (
      plannedNonCash !== '0' &&
      summary.byCategory.some((row) => row.category === 'CASH' && row.confirmed !== '0')
    ) {
      limitations.push('CASH_ACTUAL_SEMANTICS');
    }
    return {
      period,
      generatedAt: new Date().toISOString(),
      currency: currencies[0] as string,
      summary,
      summariesByCurrency: [],
      timeline,
      statusBreakdown: summary.statusBreakdown,
      byCategory: summary.byCategory,
      recentPlans: summary.recentPlans,
      goal,
      goalProgress,
      limitations,
    };
  }
}
