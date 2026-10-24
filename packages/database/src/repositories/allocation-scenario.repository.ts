import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IAllocationScenarioRepository,
  PortfolioAllocationScenarioChangeRow,
  PortfolioAllocationScenarioRow,
  PortfolioAllocationScenarioWriteInput,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaScenarioRow = {
  id: string;
  portfolioId: string;
  name: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  changes: Array<{
    id: string;
    scenarioId: string;
    category: string;
    amount: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

const CHANGES_ORDER = [{ category: 'asc' }, { id: 'asc' }] as const;

export class AllocationScenarioRepository implements IAllocationScenarioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaScenarioRow): PortfolioAllocationScenarioRow {
    const changes: PortfolioAllocationScenarioChangeRow[] = row.changes.map((change) => ({
      id: change.id,
      scenarioId: change.scenarioId,
      category: change.category,
      amount: change.amount.toString(),
      createdAt: change.createdAt,
      updatedAt: change.updatedAt,
    }));
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      name: row.name,
      type: row.type,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      changes,
    };
  }

  async countByPortfolio(portfolioId: string): Promise<number> {
    try {
      return await this.prisma.portfolioAllocationScenario.count({ where: { portfolioId } });
    } catch {
      throw new PersistenceError(
        `Failed to count allocation scenarios for portfolio ${portfolioId}`,
      );
    }
  }

  async listByPortfolio(portfolioId: string): Promise<PortfolioAllocationScenarioRow[]> {
    try {
      const rows = await this.prisma.portfolioAllocationScenario.findMany({
        where: { portfolioId },
        include: { changes: { orderBy: [...CHANGES_ORDER] } },
        // Most recently touched first; id tie-break keeps the order deterministic.
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError(
        `Failed to list allocation scenarios for portfolio ${portfolioId}`,
      );
    }
  }

  async findByIdAndPortfolio(
    scenarioId: string,
    portfolioId: string,
  ): Promise<PortfolioAllocationScenarioRow | null> {
    try {
      const row = await this.prisma.portfolioAllocationScenario.findFirst({
        where: { id: scenarioId, portfolioId },
        include: { changes: { orderBy: [...CHANGES_ORDER] } },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to load allocation scenario ${scenarioId}`);
    }
  }

  async create(
    portfolioId: string,
    input: PortfolioAllocationScenarioWriteInput,
  ): Promise<PortfolioAllocationScenarioRow> {
    const scenarioId = randomUUID();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.portfolioAllocationScenario.create({
          data: {
            id: scenarioId,
            portfolioId,
            name: input.name,
            type: input.type,
          },
        });
        if (input.changes.length > 0) {
          await tx.portfolioAllocationScenarioChange.createMany({
            data: input.changes.map((change) => ({
              id: randomUUID(),
              scenarioId,
              category: change.category,
              amount: new Prisma.Decimal(change.amount),
            })),
          });
        }
        return tx.portfolioAllocationScenario.findFirstOrThrow({
          where: { id: scenarioId },
          include: { changes: { orderBy: [...CHANGES_ORDER] } },
        });
      });
      return this.map(created);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(
          `Failed to create allocation scenario for portfolio ${portfolioId}: ${error.code}`,
        );
      }
      throw new PersistenceError(
        `Failed to create allocation scenario for portfolio ${portfolioId}`,
      );
    }
  }

  async replace(
    scenarioId: string,
    portfolioId: string,
    input: PortfolioAllocationScenarioWriteInput,
  ): Promise<PortfolioAllocationScenarioRow | null> {
    try {
      const replaced = await this.prisma.$transaction(async (tx) => {
        // Scoped update first: zero rows means the scenario is absent (or
        // belongs to another portfolio) — nothing is recreated.
        const updated = await tx.portfolioAllocationScenario.updateMany({
          where: { id: scenarioId, portfolioId },
          data: { name: input.name, type: input.type },
        });
        if (updated.count === 0) return null;
        await tx.portfolioAllocationScenarioChange.deleteMany({ where: { scenarioId } });
        if (input.changes.length > 0) {
          await tx.portfolioAllocationScenarioChange.createMany({
            data: input.changes.map((change) => ({
              id: randomUUID(),
              scenarioId,
              category: change.category,
              amount: new Prisma.Decimal(change.amount),
            })),
          });
        }
        return tx.portfolioAllocationScenario.findFirstOrThrow({
          where: { id: scenarioId },
          include: { changes: { orderBy: [...CHANGES_ORDER] } },
        });
      });
      return replaced ? this.map(replaced) : null;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(
          `Failed to replace allocation scenario ${scenarioId}: ${error.code}`,
        );
      }
      throw new PersistenceError(`Failed to replace allocation scenario ${scenarioId}`);
    }
  }

  async remove(scenarioId: string, portfolioId: string): Promise<boolean> {
    try {
      // Scenario delete cascades to changes; a zero count means absent.
      const deleted = await this.prisma.portfolioAllocationScenario.deleteMany({
        where: { id: scenarioId, portfolioId },
      });
      return deleted.count > 0;
    } catch {
      throw new PersistenceError(`Failed to delete allocation scenario ${scenarioId}`);
    }
  }
}
