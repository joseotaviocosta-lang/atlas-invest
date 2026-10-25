import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IContributionPlanRepository,
  PortfolioContributionPlanItemRow,
  PortfolioContributionPlanRow,
  PortfolioContributionPlanWriteInput,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaPlanItemRow = {
  id: string;
  planId: string;
  category: string;
  amount: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaPlanRow = {
  id: string;
  portfolioId: string;
  name: string;
  plannedDate: Date;
  status: string;
  currency: string;
  sourceScenarioId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: PrismaPlanItemRow[];
};

/** Prisma `@db.Date` round-trips at UTC midnight: the ISO date part is tz-stable. */
function toCivilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const ITEMS_ORDER = [{ category: 'asc' }, { id: 'asc' }] as const;

export class ContributionPlanRepository implements IContributionPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaPlanRow): PortfolioContributionPlanRow {
    const items: PortfolioContributionPlanItemRow[] = row.items.map((item) => ({
      id: item.id,
      planId: item.planId,
      category: item.category,
      amount: item.amount.toString(),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      name: row.name,
      plannedDate: toCivilDate(row.plannedDate),
      status: row.status,
      currency: row.currency,
      sourceScenarioId: row.sourceScenarioId,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      items,
    };
  }

  async countActiveByPortfolio(portfolioId: string): Promise<number> {
    try {
      return await this.prisma.portfolioContributionPlan.count({
        where: { portfolioId, status: 'PLANNED' },
      });
    } catch {
      throw new PersistenceError(`Failed to count contribution plans for portfolio ${portfolioId}`);
    }
  }

  async listByPortfolio(
    portfolioId: string,
    status?: string,
  ): Promise<PortfolioContributionPlanRow[]> {
    try {
      const rows = await this.prisma.portfolioContributionPlan.findMany({
        where: status ? { portfolioId, status } : { portfolioId },
        include: { items: { orderBy: [...ITEMS_ORDER] } },
        // Upcoming first by date; history newest first. Deterministic id tie-break.
        orderBy:
          status === 'PLANNED'
            ? [{ plannedDate: 'asc' }, { id: 'asc' }]
            : [{ plannedDate: 'desc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError(`Failed to list contribution plans for portfolio ${portfolioId}`);
    }
  }

  async findNextPlanned(portfolioId: string): Promise<PortfolioContributionPlanRow | null> {
    try {
      const row = await this.prisma.portfolioContributionPlan.findFirst({
        where: { portfolioId, status: 'PLANNED' },
        include: { items: { orderBy: [...ITEMS_ORDER] } },
        orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to load next contribution plan for portfolio ${portfolioId}`,
      );
    }
  }

  async findByIdAndPortfolio(
    planId: string,
    portfolioId: string,
  ): Promise<PortfolioContributionPlanRow | null> {
    try {
      const row = await this.prisma.portfolioContributionPlan.findFirst({
        where: { id: planId, portfolioId },
        include: { items: { orderBy: [...ITEMS_ORDER] } },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to load contribution plan ${planId}`);
    }
  }

  async create(
    portfolioId: string,
    input: PortfolioContributionPlanWriteInput,
  ): Promise<PortfolioContributionPlanRow> {
    const planId = randomUUID();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.portfolioContributionPlan.create({
          data: {
            id: planId,
            portfolioId,
            name: input.name,
            plannedDate: new Date(input.plannedDate),
            status: 'PLANNED',
            currency: input.currency,
            sourceScenarioId: input.sourceScenarioId ?? null,
          },
        });
        if (input.items.length > 0) {
          await tx.portfolioContributionPlanItem.createMany({
            data: input.items.map((item) => ({
              id: randomUUID(),
              planId,
              category: item.category,
              amount: new Prisma.Decimal(item.amount),
            })),
          });
        }
        return tx.portfolioContributionPlan.findFirstOrThrow({
          where: { id: planId },
          include: { items: { orderBy: [...ITEMS_ORDER] } },
        });
      });
      return this.map(created);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(
          `Failed to create contribution plan for portfolio ${portfolioId}: ${error.code}`,
        );
      }
      throw new PersistenceError(`Failed to create contribution plan for portfolio ${portfolioId}`);
    }
  }

  async replace(
    planId: string,
    portfolioId: string,
    input: PortfolioContributionPlanWriteInput,
  ): Promise<PortfolioContributionPlanRow | null> {
    try {
      const replaced = await this.prisma.$transaction(async (tx) => {
        // Scoped update guarded on PLANNED: terminal plans are immutable —
        // zero rows means absent, foreign, or already finalized.
        const updated = await tx.portfolioContributionPlan.updateMany({
          where: { id: planId, portfolioId, status: 'PLANNED' },
          data: {
            name: input.name,
            plannedDate: new Date(input.plannedDate),
            currency: input.currency,
            sourceScenarioId: input.sourceScenarioId ?? null,
          },
        });
        if (updated.count === 0) return null;
        await tx.portfolioContributionPlanItem.deleteMany({ where: { planId } });
        if (input.items.length > 0) {
          await tx.portfolioContributionPlanItem.createMany({
            data: input.items.map((item) => ({
              id: randomUUID(),
              planId,
              category: item.category,
              amount: new Prisma.Decimal(item.amount),
            })),
          });
        }
        return tx.portfolioContributionPlan.findFirstOrThrow({
          where: { id: planId },
          include: { items: { orderBy: [...ITEMS_ORDER] } },
        });
      });
      return replaced ? this.map(replaced) : null;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(`Failed to replace contribution plan ${planId}: ${error.code}`);
      }
      throw new PersistenceError(`Failed to replace contribution plan ${planId}`);
    }
  }

  async setStatus(
    planId: string,
    portfolioId: string,
    status: 'COMPLETED' | 'CANCELLED',
  ): Promise<PortfolioContributionPlanRow | null> {
    try {
      // Single guarded write: only the PLANNED → terminal transition wins.
      // Concurrent complete × cancel / update × complete converge on one.
      const updated = await this.prisma.portfolioContributionPlan.updateMany({
        where: { id: planId, portfolioId, status: 'PLANNED' },
        data: status === 'COMPLETED' ? { status, completedAt: new Date() } : { status },
      });
      if (updated.count === 0) return null;
      const row = await this.prisma.portfolioContributionPlan.findFirst({
        where: { id: planId, portfolioId },
        include: { items: { orderBy: [...ITEMS_ORDER] } },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to update contribution plan ${planId} status`);
    }
  }

  async remove(planId: string, portfolioId: string): Promise<boolean> {
    try {
      // Only PLANNED plans are deletable; terminal history is preserved.
      const deleted = await this.prisma.portfolioContributionPlan.deleteMany({
        where: { id: planId, portfolioId, status: 'PLANNED' },
      });
      return deleted.count > 0;
    } catch {
      throw new PersistenceError(`Failed to delete contribution plan ${planId}`);
    }
  }
}
