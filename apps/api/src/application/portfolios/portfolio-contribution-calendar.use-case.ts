import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import type {
  IContributionGoalRepository,
  IContributionPlanLinkRepository,
  IContributionPlanRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import { addDecimals } from '@atlas/portfolio-strategy';
import {
  deriveContributionPlanningCalendar,
  InvalidContributionCalendarError,
  validateCalendarRange,
  type ContributionPlanningMonth,
  type CalendarSummaryByCurrency,
} from '@atlas/portfolio-strategy';
import {
  CONTRIBUTION_GOAL_REPOSITORY,
  CONTRIBUTION_PLAN_LINK_REPOSITORY,
  CONTRIBUTION_PLAN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { planTransactionAmount } from './contribution-tracking-read';

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
 * Phase 5Q-K — contribution planning calendar (read-only temporal view).
 *
 * Composes goal versions + plans + CONFIRMED ledger links into calendar
 * months. Nothing is created, planned, scheduled or executed here:
 * zero writes, zero persistence, zero recommendations. Bounded constant
 * query plan (goals + plans + batched links + batched transactions),
 * never per-month or per-plan reads.
 */
@Injectable()
export class PortfolioContributionCalendarUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(CONTRIBUTION_PLAN_REPOSITORY)
    private readonly plans: IContributionPlanRepository,
    @Inject(CONTRIBUTION_PLAN_LINK_REPOSITORY)
    private readonly links: IContributionPlanLinkRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
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
    return portfolio;
  }

  async getCalendar(command: {
    portfolioId: string;
    userId?: string;
    from?: string;
    to?: string;
    today?: string;
  }): Promise<{
    range: { from: string; to: string };
    generatedAt: string;
    currencies: string[];
    months: ContributionPlanningMonth[];
    summaryByCurrency: CalendarSummaryByCurrency[];
    limitations: string[];
  }> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const today = command.today ?? todayCivilString();
    const currentMonth = today.slice(0, 7);
    const currentYear = today.slice(0, 4);
    const range = validateCalendarRange(
      command.from ?? `${currentYear}-01`,
      command.to ?? `${currentYear}-12`,
    );
    if (!range.valid) {
      throw new InvalidContributionCalendarError(`Invalid calendar range: ${range.reason}`);
    }

    const [planned, completed, cancelled, goalRows] = await Promise.all([
      this.plans.listByPortfolio(command.portfolioId, 'PLANNED'),
      this.plans.listByPortfolio(command.portfolioId, 'COMPLETED'),
      this.plans.listByPortfolio(command.portfolioId, 'CANCELLED'),
      this.goals.listByPortfolio(command.portfolioId),
    ]);
    const allPlans = [...planned, ...completed, ...cancelled];
    const planById = new Map(allPlans.map((plan) => [plan.id, plan]));

    // Single batched link read for every plan (never per-plan, never per-month).
    const linksByPlan = await this.links.listByPlanIds(allPlans.map((plan) => plan.id));
    const confirmedIds: string[] = [];
    const ownerByTransaction = new Map<string, string>();
    for (const [planId, planLinks] of linksByPlan) {
      for (const link of planLinks) {
        if (link.status !== 'CONFIRMED') continue;
        confirmedIds.push(link.transactionId);
        ownerByTransaction.set(link.transactionId, planId);
      }
    }
    const confirmedTxs = await this.transactions.findByIds([...new Set(confirmedIds)]);
    const actuals: Array<{
      tradeDate: string;
      amount: string;
      currency: string;
      type: string;
      planId: string;
      planName: string;
    }> = [];
    for (const tx of confirmedTxs) {
      const parsed = planTransactionAmount(tx as Transaction);
      const owner = ownerByTransaction.get((tx as { id: string }).id);
      const ownerPlan = owner ? planById.get(owner) : undefined;
      if (!parsed || !owner || !ownerPlan) continue;
      actuals.push({
        tradeDate: parsed.tradeDate,
        amount: parsed.amount,
        currency: parsed.currency,
        type: (tx as { type: string }).type,
        planId: owner,
        planName: ownerPlan.name,
      });
    }

    const planInputs = allPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      plannedDate: plan.plannedDate,
      status: plan.status,
      currency: plan.currency,
      total: sumAmounts(plan.items.map((item) => item.amount)),
    }));
    const goalVersions = goalRows.map((goal) => ({
      amount: goal.amount,
      currency: goal.currency,
      effectiveFromMonth: goal.effectiveFrom.slice(0, 7),
      effectiveToMonth: goal.effectiveTo ? goal.effectiveTo.slice(0, 7) : null,
    }));

    const calendar = deriveContributionPlanningCalendar({
      months: range.months,
      currentMonth,
      goals: goalVersions,
      plans: planInputs,
      actuals,
    });
    return {
      range: {
        from: range.months[0] as string,
        to: range.months[range.months.length - 1] as string,
      },
      generatedAt: new Date().toISOString(),
      currencies: calendar.currencies,
      months: calendar.months,
      summaryByCurrency: calendar.summaryByCurrency,
      limitations: calendar.limitations,
    };
  }
}
