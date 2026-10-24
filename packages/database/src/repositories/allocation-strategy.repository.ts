import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IAllocationStrategyRepository,
  PortfolioAllocationStrategyTargetInput,
  PortfolioAllocationStrategyTargetRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaStrategyTargetRow = {
  id: string;
  portfolioId: string;
  category: string;
  targetBp: number;
  createdAt: Date;
  updatedAt: Date;
};

export class AllocationStrategyRepository implements IAllocationStrategyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaStrategyTargetRow): PortfolioAllocationStrategyTargetRow {
    return { ...row };
  }

  async listByPortfolio(portfolioId: string): Promise<PortfolioAllocationStrategyTargetRow[]> {
    try {
      const rows = await this.prisma.portfolioAllocationStrategyTarget.findMany({
        where: { portfolioId },
        orderBy: [{ category: 'asc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError(
        `Failed to list allocation strategy targets for portfolio ${portfolioId}`,
      );
    }
  }

  async replace(
    portfolioId: string,
    targets: readonly PortfolioAllocationStrategyTargetInput[],
  ): Promise<PortfolioAllocationStrategyTargetRow[]> {
    // Concurrent replacements serialize on the unique (portfolio, category)
    // key: a P2002 loser retries once against the winner's state, so the
    // result is always exactly one complete strategy (last writer wins),
    // never a mixture of two requests.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          await tx.portfolioAllocationStrategyTarget.deleteMany({ where: { portfolioId } });
          if (targets.length === 0) return [];
          await tx.portfolioAllocationStrategyTarget.createMany({
            data: targets.map((target) => ({
              id: randomUUID(),
              portfolioId,
              category: target.category,
              targetBp: target.targetBp,
            })),
          });
          return tx.portfolioAllocationStrategyTarget.findMany({
            where: { portfolioId },
            orderBy: [{ category: 'asc' }, { id: 'asc' }],
          });
        });
        return created.map((row) => this.map(row));
      } catch (error: unknown) {
        lastError = error;
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!retryable) break;
      }
    }
    if (lastError instanceof Prisma.PrismaClientKnownRequestError) {
      throw new PersistenceError(
        `Failed to replace allocation strategy for portfolio ${portfolioId}: ${lastError.code}`,
      );
    }
    throw new PersistenceError(
      `Failed to replace allocation strategy for portfolio ${portfolioId}`,
    );
  }

  async clear(portfolioId: string): Promise<void> {
    try {
      await this.prisma.portfolioAllocationStrategyTarget.deleteMany({ where: { portfolioId } });
    } catch {
      throw new PersistenceError(
        `Failed to clear allocation strategy for portfolio ${portfolioId}`,
      );
    }
  }
}
