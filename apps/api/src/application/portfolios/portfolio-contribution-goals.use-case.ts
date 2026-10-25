import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError, PersistenceError } from '@atlas/database';
import type {
  IContributionGoalRepository,
  IPortfolioRepository,
  PortfolioContributionGoalRow,
} from '@atlas/database';
import {
  InvalidContributionGoalError,
  parseScenarioAmountToCanonical,
  validateGoalMonth,
} from '@atlas/portfolio-strategy';
import { CONTRIBUTION_GOAL_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';

export interface ContributionGoalView {
  id: string;
  portfolioId: string;
  amount: string;
  currency: string;
  /** Inclusive first effective day of the month. */
  effectiveFrom: string;
  /** Exclusive end day, or null when open-ended. */
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Local civil "today" as `YYYY-MM-DD` from wall-clock fields (no instants). */
function todayCivilString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function toMonthDay(month: string): string {
  return `${month}-01`;
}

function toView(row: PortfolioContributionGoalRow): ContributionGoalView {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    amount: row.amount,
    currency: row.currency,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asConcurrentConflict(error: unknown): Error {
  if (error instanceof PersistenceError && error.message.includes('P2002')) {
    return new InvalidContributionGoalError('Goal changed concurrently; retry the request');
  }
  throw error;
}

/**
 * Phase 5Q-J — user-defined monthly contribution goals (versioned intent).
 *
 * The user declares a monthly amount; the Atlas only compares plans and
 * confirmed actuals against it. No suggested amounts, no auto-tuning, no
 * background jobs, no ledger writes. Effective months are user-chosen
 * (>= current month); history is preserved by closing the open version
 * and opening a new one — never rewritten.
 */
@Injectable()
export class PortfolioContributionGoalsUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(CONTRIBUTION_GOAL_REPOSITORY)
    private readonly goals: IContributionGoalRepository,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
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

  private async resolveGoalCurrency(portfolioId: string, userId?: string): Promise<string | null> {
    const allocation = await this.allocation.execute({ portfolioId, userId: userId ?? '' });
    const translated = allocation.translatedAllocation;
    if (translated && translated.status === 'AVAILABLE') {
      return translated.reportingCurrency;
    }
    const buckets = Object.values(allocation.currencies);
    if (buckets.length === 1 && buckets[0]) {
      return buckets[0].currency;
    }
    if (buckets.length === 0) {
      const portfolio = await this.verifyOwnership(portfolioId, userId);
      const baseCurrency = (portfolio as { baseCurrency?: unknown }).baseCurrency;
      return typeof baseCurrency === 'string' && baseCurrency !== '' ? baseCurrency : null;
    }
    return null;
  }

  async getGoal(command: { portfolioId: string; userId?: string }): Promise<{
    current: ContributionGoalView | null;
    upcoming: ContributionGoalView | null;
    history: ContributionGoalView[];
  }> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const rows = await this.goals.listByPortfolio(command.portfolioId);
    const todayMonth = todayCivilString().slice(0, 7);
    const open = rows.find((row) => row.effectiveTo === null) ?? null;
    let current: ContributionGoalView | null = null;
    let upcoming: ContributionGoalView | null = null;
    if (open) {
      if (open.effectiveFrom.slice(0, 7) <= todayMonth) current = toView(open);
      else upcoming = toView(open);
    }
    const history = rows
      .filter((row) => row.effectiveTo !== null)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
      .map(toView);
    return { current, upcoming, history };
  }

  async putGoal(command: {
    portfolioId: string;
    userId?: string;
    amount: unknown;
    effectiveMonth: unknown;
    today?: string;
  }): Promise<{ goal: ContributionGoalView; created: boolean }> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const parsedAmount =
      typeof command.amount === 'string' ? parseScenarioAmountToCanonical(command.amount) : null;
    if (parsedAmount === null || parsedAmount === '0') {
      throw new InvalidContributionGoalError('Invalid goal: INVALID_AMOUNT');
    }
    const monthValidation = validateGoalMonth(command.effectiveMonth);
    if (!monthValidation.valid) {
      throw new InvalidContributionGoalError('Invalid goal: INVALID_MONTH');
    }
    const effectiveMonth = monthValidation.month;
    const currentMonth = (command.today ?? todayCivilString()).slice(0, 7);
    if (effectiveMonth < currentMonth) {
      throw new InvalidContributionGoalError('Invalid goal: PAST_MONTH');
    }
    const currency = await this.resolveGoalCurrency(command.portfolioId, command.userId);
    if (!currency) {
      throw new InvalidContributionGoalError(
        'Cannot determine a consolidated currency for this goal',
      );
    }
    const open = await this.goals.findOpen(command.portfolioId);
    const effectiveFrom = toMonthDay(effectiveMonth);
    if (!open) {
      try {
        const created = await this.goals.replaceOpen(command.portfolioId, {
          amount: parsedAmount,
          currency,
          effectiveFrom,
          closeOpenAt: null,
        });
        if (!created) {
          throw new InvalidContributionGoalError('Goal changed concurrently; retry the request');
        }
        return { goal: toView(created), created: true };
      } catch (error) {
        throw asConcurrentConflict(error);
      }
    }
    const openMonth = open.effectiveFrom.slice(0, 7);
    if (openMonth > currentMonth) {
      // A scheduled future version that never took effect: replace it.
      const removed = await this.goals.removeById(open.id, command.portfolioId);
      if (!removed) {
        throw new InvalidContributionGoalError('Goal changed concurrently; retry the request');
      }
      try {
        const created = await this.goals.replaceOpen(command.portfolioId, {
          amount: parsedAmount,
          currency,
          effectiveFrom,
          closeOpenAt: null,
        });
        if (!created) {
          throw new InvalidContributionGoalError('Goal changed concurrently; retry the request');
        }
        return { goal: toView(created), created: true };
      } catch (error) {
        throw asConcurrentConflict(error);
      }
    }
    if (openMonth === effectiveMonth) {
      // Same effective month: in-place amount update (optimistic guard).
      const updated = await this.goals.updateAmountIfOpen(
        open.id,
        command.portfolioId,
        parsedAmount,
        open.updatedAt,
      );
      if (!updated) {
        throw new InvalidContributionGoalError('Goal changed concurrently; retry the request');
      }
      return { goal: toView(updated), created: false };
    }
    // Version switch: close the open row at the new month, open the new one.
    const replaced = await this.goals.replaceOpen(command.portfolioId, {
      amount: parsedAmount,
      currency,
      effectiveFrom,
      closeOpenAt: effectiveFrom,
      expectedUpdatedAt: open.updatedAt,
    });
    if (!replaced) {
      throw new InvalidContributionGoalError('Goal changed concurrently; retry the request');
    }
    return { goal: toView(replaced), created: false };
  }

  async endGoal(command: {
    portfolioId: string;
    userId?: string;
    today?: string;
  }): Promise<{ ended: boolean; goal: ContributionGoalView | null }> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const currentMonth = (command.today ?? todayCivilString()).slice(0, 7);
    const open = await this.goals.findOpen(command.portfolioId);
    if (!open) {
      throw new EntityNotFoundError('ContributionGoal', command.portfolioId);
    }
    if (open.effectiveFrom.slice(0, 7) > currentMonth) {
      // Scheduled future that never took effect: remove it entirely.
      await this.goals.removeById(open.id, command.portfolioId);
      return { ended: true, goal: null };
    }
    const closed = await this.goals.endOpen(command.portfolioId, toMonthDay(currentMonth));
    if (!closed) {
      throw new EntityNotFoundError('ContributionGoal', command.portfolioId);
    }
    return { ended: true, goal: toView(closed) };
  }
}
