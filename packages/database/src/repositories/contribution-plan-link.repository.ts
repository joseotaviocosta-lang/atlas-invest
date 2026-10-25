import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { ContributionPlanLinkRow, IContributionPlanLinkRepository } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaLinkRow = {
  id: string;
  planId: string;
  transactionId: string;
  status: string;
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class ContributionPlanLinkRepository implements IContributionPlanLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaLinkRow): ContributionPlanLinkRow {
    if (row.status !== 'CONFIRMED' && row.status !== 'REJECTED') {
      throw new PersistenceError(`Unknown contribution plan link status '${row.status}'`);
    }
    return {
      id: row.id,
      planId: row.planId,
      transactionId: row.transactionId,
      status: row.status,
      confirmedAt: row.confirmedAt,
      rejectedAt: row.rejectedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listByPlan(planId: string): Promise<ContributionPlanLinkRow[]> {
    try {
      const rows = await this.prisma.contributionPlanTransactionLink.findMany({
        where: { planId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError(`Failed to list tracking links for plan ${planId}`);
    }
  }

  async findConfirmedByTransaction(transactionId: string): Promise<ContributionPlanLinkRow | null> {
    try {
      const row = await this.prisma.contributionPlanTransactionLink.findFirst({
        where: { transactionId, status: 'CONFIRMED' },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to load confirmed link for transaction ${transactionId}`);
    }
  }

  async findConfirmedByTransactionIds(
    transactionIds: readonly string[],
  ): Promise<Map<string, string>> {
    try {
      if (transactionIds.length === 0) return new Map();
      const rows = await this.prisma.contributionPlanTransactionLink.findMany({
        where: { transactionId: { in: [...transactionIds] }, status: 'CONFIRMED' },
      });
      return new Map(rows.map((row) => [row.transactionId, row.planId]));
    } catch {
      throw new PersistenceError('Failed to load confirmed links for transactions');
    }
  }

  async confirm(planId: string, transactionId: string): Promise<ContributionPlanLinkRow> {
    try {
      // Upsert keyed on (plan, transaction): idempotent re-confirm wins
      // silently; REJECTED flips back to CONFIRMED on explicit confirm.
      const row = await this.prisma.contributionPlanTransactionLink.upsert({
        where: { planId_transactionId: { planId, transactionId } },
        update: { status: 'CONFIRMED', confirmedAt: new Date(), rejectedAt: null },
        create: {
          id: randomUUID(),
          planId,
          transactionId,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(
          `Failed to confirm tracking link for plan ${planId}: ${error.code}`,
        );
      }
      throw new PersistenceError(`Failed to confirm tracking link for plan ${planId}`);
    }
  }

  async confirmMany(
    planId: string,
    transactionIds: readonly [string, string],
  ): Promise<ContributionPlanLinkRow[]> {
    try {
      // One transaction: both upserts land or neither does. Partial
      // unique violations roll everything back (fail-closed).
      const rows = await this.prisma.$transaction(
        transactionIds.map((transactionId) =>
          this.prisma.contributionPlanTransactionLink.upsert({
            where: { planId_transactionId: { planId, transactionId } },
            update: { status: 'CONFIRMED', confirmedAt: new Date(), rejectedAt: null },
            create: {
              id: randomUUID(),
              planId,
              transactionId,
              status: 'CONFIRMED',
              confirmedAt: new Date(),
            },
          }),
        ),
      );
      return rows.map((row) => this.map(row));
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(
          `Failed to confirm tracking links for plan ${planId}: ${error.code}`,
        );
      }
      throw new PersistenceError(`Failed to confirm tracking links for plan ${planId}`);
    }
  }

  async reject(planId: string, transactionId: string): Promise<ContributionPlanLinkRow> {
    try {
      const row = await this.prisma.contributionPlanTransactionLink.upsert({
        where: { planId_transactionId: { planId, transactionId } },
        update: { status: 'REJECTED', rejectedAt: new Date() },
        create: {
          id: randomUUID(),
          planId,
          transactionId,
          status: 'REJECTED',
          rejectedAt: new Date(),
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new PersistenceError(
          `Failed to reject tracking link for plan ${planId}: ${error.code}`,
        );
      }
      throw new PersistenceError(`Failed to reject tracking link for plan ${planId}`);
    }
  }

  async unlink(planId: string, transactionId: string): Promise<ContributionPlanLinkRow | null> {
    try {
      // Unlink keeps the audit row: CONFIRMED → REJECTED. Already-rejected
      // is a no-op success; absent is null (caller maps to 404).
      const existing = await this.prisma.contributionPlanTransactionLink.findUnique({
        where: { planId_transactionId: { planId, transactionId } },
      });
      if (!existing) return null;
      if (existing.status === 'REJECTED') return this.map(existing);
      const row = await this.prisma.contributionPlanTransactionLink.update({
        where: { planId_transactionId: { planId, transactionId } },
        data: { status: 'REJECTED', rejectedAt: new Date() },
      });
      return this.map(row);
    } catch {
      throw new PersistenceError(`Failed to unlink tracking link for plan ${planId}`);
    }
  }
}
