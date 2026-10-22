import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IIntegrationRunRepository,
  IntegrationRunConfirmationInput,
  IntegrationRunCreateInput,
  IntegrationRunFailureInput,
  IntegrationRunLinkInput,
  IntegrationRunPreviewInput,
  IntegrationRunReconciliation,
  IntegrationRunRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaRunRow = {
  id: string;
  portfolioId: string;
  source: string;
  provider: string | null;
  environment: string | null;
  fileName: string | null;
  sourceAsOf: string | null;
  status: string;
  recordsFetched: number;
  recordsNormalized: number;
  newCandidates: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  confirmed: number;
  ignored: number;
  reconciliationMatched: number | null;
  reconciliationDivergent: number | null;
  reconciliationMissingLocal: number | null;
  reconciliationMissingSource: number | null;
  reconciliationUnresolved: number | null;
  partial: boolean;
  /** Phase 5P-A run origin. Nullable: rows recorded before 5P-PRE follow-up. */
  trigger: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const TERMINAL_STATUSES = new Set(['COMPLETED', 'PARTIAL', 'FAILED']);

export class IntegrationRunRepository implements IIntegrationRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaRunRow): IntegrationRunRow {
    const reconciliation: IntegrationRunReconciliation | null =
      row.reconciliationMatched === null &&
      row.reconciliationDivergent === null &&
      row.reconciliationMissingLocal === null &&
      row.reconciliationMissingSource === null &&
      row.reconciliationUnresolved === null
        ? null
        : {
            matched: row.reconciliationMatched ?? 0,
            divergent: row.reconciliationDivergent ?? 0,
            missingLocal: row.reconciliationMissingLocal ?? 0,
            missingSource: row.reconciliationMissingSource ?? 0,
            unresolved: row.reconciliationUnresolved ?? 0,
          };
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      source: row.source,
      provider: row.provider,
      environment: row.environment,
      fileName: row.fileName,
      sourceAsOf: row.sourceAsOf,
      status: row.status,
      recordsFetched: row.recordsFetched,
      recordsNormalized: row.recordsNormalized,
      newCandidates: row.newCandidates,
      exactDuplicates: row.exactDuplicates,
      probableDuplicates: row.probableDuplicates,
      conflicts: row.conflicts,
      unsupported: row.unsupported,
      invalid: row.invalid,
      confirmed: row.confirmed,
      ignored: row.ignored,
      reconciliation,
      partial: row.partial,
      trigger: row.trigger,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(input: IntegrationRunCreateInput): Promise<IntegrationRunRow> {
    try {
      const row = await this.prisma.integrationRun.create({
        data: {
          id: input.id ?? randomUUID(),
          portfolioId: input.portfolioId,
          source: input.source,
          provider: input.provider ?? null,
          environment: input.environment ?? null,
          fileName: input.fileName ?? null,
          sourceAsOf: input.sourceAsOf ?? null,
          trigger: input.trigger ?? null,
          status: 'STARTED',
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PersistenceError(
          `Integration run id collision for portfolio ${input.portfolioId}`,
        );
      }
      throw new PersistenceError(
        `Failed to create integration run for portfolio ${input.portfolioId}`,
      );
    }
  }

  private async loadForUpdate(id: string, portfolioId: string): Promise<PrismaRunRow> {
    try {
      const row = await this.prisma.integrationRun.findFirst({ where: { id, portfolioId } });
      if (!row) {
        throw new PersistenceError(`Integration run ${id} not found`);
      }
      return row;
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to load integration run ${id}`);
    }
  }

  private static assertUpdatable(row: PrismaRunRow, action: string): void {
    if (TERMINAL_STATUSES.has(row.status)) {
      throw new PersistenceError(
        `Integration run ${row.id} is terminal (${row.status}) and rejects ${action}`,
      );
    }
  }

  async recordPreview(input: IntegrationRunPreviewInput): Promise<IntegrationRunRow> {
    const current = await this.loadForUpdate(input.id, input.portfolioId);
    if (current.status !== 'STARTED') {
      throw new PersistenceError(
        `Integration run ${input.id} cannot record preview from status ${current.status}`,
      );
    }
    try {
      const row = await this.prisma.integrationRun.update({
        where: { id: input.id },
        data: {
          status: input.status,
          recordsFetched: input.recordsFetched,
          recordsNormalized: input.recordsNormalized,
          newCandidates: input.newCandidates,
          exactDuplicates: input.exactDuplicates,
          probableDuplicates: input.probableDuplicates,
          conflicts: input.conflicts,
          unsupported: input.unsupported,
          invalid: input.invalid,
          ...(input.partial !== undefined ? { partial: input.partial } : {}),
          ...(input.sourceAsOf !== undefined ? { sourceAsOf: input.sourceAsOf } : {}),
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to record preview for integration run ${input.id}`);
    }
  }

  async recordConfirmation(input: IntegrationRunConfirmationInput): Promise<IntegrationRunRow> {
    const current = await this.loadForUpdate(input.id, input.portfolioId);
    IntegrationRunRepository.assertUpdatable(current, 'confirmation');
    if (current.status !== 'AWAITING_REVIEW' && current.status !== 'CONFIRMING') {
      throw new PersistenceError(
        `Integration run ${input.id} cannot record confirmation from status ${current.status}`,
      );
    }
    try {
      const row = await this.prisma.integrationRun.update({
        where: { id: input.id },
        data: {
          status: input.status,
          confirmed: input.confirmed,
          ignored: input.ignored,
          partial: input.partial,
          reconciliationMatched: input.reconciliation?.matched ?? null,
          reconciliationDivergent: input.reconciliation?.divergent ?? null,
          reconciliationMissingLocal: input.reconciliation?.missingLocal ?? null,
          reconciliationMissingSource: input.reconciliation?.missingSource ?? null,
          reconciliationUnresolved: input.reconciliation?.unresolved ?? null,
          completedAt: new Date(),
          ...(input.sourceAsOf !== undefined ? { sourceAsOf: input.sourceAsOf } : {}),
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to record confirmation for integration run ${input.id}`);
    }
  }

  async recordFailure(input: IntegrationRunFailureInput): Promise<IntegrationRunRow> {
    const current = await this.loadForUpdate(input.id, input.portfolioId);
    IntegrationRunRepository.assertUpdatable(current, 'failure');
    try {
      const row = await this.prisma.integrationRun.update({
        where: { id: input.id },
        data: {
          status: 'FAILED',
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          completedAt: new Date(),
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to record failure for integration run ${input.id}`);
    }
  }

  async findById(id: string, portfolioId: string): Promise<IntegrationRunRow | null> {
    try {
      const row = await this.prisma.integrationRun.findFirst({ where: { id, portfolioId } });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to find integration run ${id}`);
    }
  }

  /**
   * Links confirmed canonical transactions to a run. Idempotent: the
   * (runId, transactionId) identity makes retries safe. Run-scoped for
   * cross-portfolio safety.
   */
  async linkTransactions(input: IntegrationRunLinkInput): Promise<number> {
    if (input.transactionIds.length === 0) return 0;
    try {
      const result = await this.prisma.integrationRunTransaction.createMany({
        data: input.transactionIds.map((transactionId) => ({
          runId: input.runId,
          portfolioId: input.portfolioId,
          transactionId,
        })),
        skipDuplicates: true,
      });
      return result.count;
    } catch {
      throw new PersistenceError(`Failed to link transactions to integration run ${input.runId}`);
    }
  }

  async listTransactionIdsByRun(runId: string, portfolioId: string): Promise<string[]> {
    try {
      const rows = await this.prisma.integrationRunTransaction.findMany({
        where: { runId, portfolioId },
        orderBy: { createdAt: 'asc' },
        select: { transactionId: true },
      });
      return rows.map((row) => row.transactionId);
    } catch {
      throw new PersistenceError(`Failed to list transactions for integration run ${runId}`);
    }
  }

  async listByPortfolio(
    portfolioId: string,
    input: { limit: number; cursor?: string | null },
  ): Promise<{ rows: IntegrationRunRow[]; hasMore: boolean }> {
    const limit = Math.min(200, Math.max(1, Math.floor(input.limit)));
    try {
      const where = !input.cursor
        ? { portfolioId }
        : await this.cursorWhere(portfolioId, input.cursor);
      const rows = await this.prisma.integrationRun.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      return {
        rows: rows.slice(0, limit).map((row) => this.map(row)),
        hasMore: rows.length > limit,
      };
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to list integration runs for portfolio ${portfolioId}`);
    }
  }

  private async cursorWhere(
    portfolioId: string,
    cursor: string,
  ): Promise<Prisma.IntegrationRunWhereInput> {
    const anchor = await this.prisma.integrationRun.findFirst({
      where: { id: cursor, portfolioId },
    });
    if (!anchor) {
      throw new PersistenceError(`Invalid integration run cursor for portfolio ${portfolioId}`);
    }
    return {
      portfolioId,
      OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ],
    };
  }

  async countByPortfolio(portfolioId: string): Promise<number> {
    try {
      return await this.prisma.integrationRun.count({ where: { portfolioId } });
    } catch {
      throw new PersistenceError(`Failed to count integration runs for portfolio ${portfolioId}`);
    }
  }
}
