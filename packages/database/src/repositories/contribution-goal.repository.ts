import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { IContributionGoalRepository, PortfolioContributionGoalRow } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaGoalRow = {
  id: string;
  portfolioId: string;
  amount: Prisma.Decimal;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toCivilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class ContributionGoalRepository implements IContributionGoalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaGoalRow): PortfolioContributionGoalRow {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      amount: row.amount.toString(),
      currency: row.currency,
      effectiveFrom: toCivilDate(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? toCivilDate(row.effectiveTo) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listByPortfolio(portfolioId: string): Promise<PortfolioContributionGoalRow[]> {
    try {
      const rows = await this.prisma.portfolioContributionGoal.findMany({
        where: { portfolioId },
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError(`Failed to list contribution goals for portfolio ${portfolioId}`);
    }
  }

  async findOpen(portfolioId: string): Promise<PortfolioContributionGoalRow | null> {
    try {
      const row = await this.prisma.portfolioContributionGoal.findFirst({
        where: { portfolioId, effectiveTo: null },
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to load open contribution goal for portfolio ${portfolioId}`,
      );
    }
  }

  async replaceOpen(
    portfolioId: string,
    input: {
      amount: string;
      currency: string;
      effectiveFrom: string;
      closeOpenAt: string | null;
      expectedUpdatedAt?: Date;
    },
  ): Promise<PortfolioContributionGoalRow | null> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (input.closeOpenAt !== null) {
          const closed = await tx.portfolioContributionGoal.updateMany({
            where: {
              portfolioId,
              effectiveTo: null,
              ...(input.expectedUpdatedAt ? { updatedAt: input.expectedUpdatedAt } : {}),
            },
            data: { effectiveTo: new Date(input.closeOpenAt) },
          });
          if (closed.count === 0) return null;
        }
        return tx.portfolioContributionGoal.create({
          data: {
            id: randomUUID(),
            portfolioId,
            amount: new Prisma.Decimal(input.amount),
            currency: input.currency,
            effectiveFrom: new Date(input.effectiveFrom),
          },
        });
      });
      return created ? this.map(created) : null;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(
          `Failed to save contribution goal for portfolio ${portfolioId}: ${error.code}`,
        );
      }
      throw new PersistenceError(`Failed to save contribution goal for portfolio ${portfolioId}`);
    }
  }

  async updateAmountIfOpen(
    goalId: string,
    portfolioId: string,
    amount: string,
    expectedUpdatedAt: Date,
  ): Promise<PortfolioContributionGoalRow | null> {
    try {
      const updated = await this.prisma.portfolioContributionGoal.updateMany({
        where: { id: goalId, portfolioId, effectiveTo: null, updatedAt: expectedUpdatedAt },
        data: { amount: new Prisma.Decimal(amount) },
      });
      if (updated.count === 0) return null;
      const row = await this.prisma.portfolioContributionGoal.findFirst({
        where: { id: goalId, portfolioId },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to update contribution goal ${goalId}`);
    }
  }

  async endOpen(
    portfolioId: string,
    closeMonthFirstDay: string,
  ): Promise<PortfolioContributionGoalRow | null> {
    try {
      const updated = await this.prisma.portfolioContributionGoal.updateMany({
        where: { portfolioId, effectiveTo: null },
        data: { effectiveTo: new Date(closeMonthFirstDay) },
      });
      if (updated.count === 0) return null;
      const row = await this.prisma.portfolioContributionGoal.findFirst({
        where: { portfolioId, effectiveTo: new Date(closeMonthFirstDay) },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to end contribution goal for portfolio ${portfolioId}`);
    }
  }

  async removeById(goalId: string, portfolioId: string): Promise<boolean> {
    try {
      const deleted = await this.prisma.portfolioContributionGoal.deleteMany({
        where: { id: goalId, portfolioId },
      });
      return deleted.count > 0;
    } catch {
      throw new PersistenceError(`Failed to delete contribution goal ${goalId}`);
    }
  }
}
