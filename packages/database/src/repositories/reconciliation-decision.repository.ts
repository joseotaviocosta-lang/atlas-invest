import { Prisma, PrismaClient } from '@prisma/client';
import {
  IReconciliationDecisionRepository,
  ReconciliationDecisionCreateInput,
  ReconciliationDecisionRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaDecisionRow = {
  id: string;
  portfolioId: string;
  integrationRunId: string;
  source: string;
  sourceItemKey: string;
  localTransactionId: string;
  decision: string;
  decidedByPrincipal: string;
  decidedAt: Date;
  createdAt: Date;
};

/**
 * Phase 5S-B-R1 — human reconciliation decisions (append-only).
 *
 * One row asserts a human reviewed a (run, source item, transaction)
 * pair. Unique pair identity makes repeat submissions safe; the
 * repository never updates or deletes. No transaction writes, no
 * run writes — identity reads plus one insert.
 */
export class ReconciliationDecisionRepository implements IReconciliationDecisionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaDecisionRow): ReconciliationDecisionRow {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      integrationRunId: row.integrationRunId,
      source: row.source,
      sourceItemKey: row.sourceItemKey,
      localTransactionId: row.localTransactionId,
      decision: row.decision === 'NOT_A_MATCH' ? 'NOT_A_MATCH' : ('CONFIRM_MATCH' as const),
      decidedByPrincipal: row.decidedByPrincipal,
      decidedAt: row.decidedAt,
      createdAt: row.createdAt,
    };
  }

  async create(input: ReconciliationDecisionCreateInput): Promise<ReconciliationDecisionRow> {
    try {
      const row = await (
        this.prisma as unknown as {
          reconciliationDecisionRecord: {
            create(args: { data: typeof input }): Promise<PrismaDecisionRow>;
          };
        }
      ).reconciliationDecisionRecord.create({ data: input });
      return this.map(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Lost a same-pair race: the winner's row is the idempotent
        // answer. Use-case compares decisions and rejects conflicts
        // with 409; nothing is ever overwritten here.
        const existing = await this.findByIdentity(
          input.portfolioId,
          input.integrationRunId,
          input.sourceItemKey,
          input.localTransactionId,
        );
        if (existing) return existing;
      }
      throw new PersistenceError('Failed to record reconciliation decision');
    }
  }

  async findByIdentity(
    portfolioId: string,
    integrationRunId: string,
    sourceItemKey: string,
    localTransactionId: string,
  ): Promise<ReconciliationDecisionRow | null> {
    try {
      const row = await (
        this.prisma as unknown as {
          reconciliationDecisionRecord: {
            findUnique(args: {
              where: {
                portfolioId_integrationRunId_sourceItemKey_localTransactionId: {
                  portfolioId: string;
                  integrationRunId: string;
                  sourceItemKey: string;
                  localTransactionId: string;
                };
              };
            }): Promise<PrismaDecisionRow | null>;
          };
        }
      ).reconciliationDecisionRecord.findUnique({
        where: {
          portfolioId_integrationRunId_sourceItemKey_localTransactionId: {
            portfolioId,
            integrationRunId,
            sourceItemKey,
            localTransactionId,
          },
        },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError('Failed to load reconciliation decision');
    }
  }

  async listByRun(runId: string, portfolioId: string): Promise<ReconciliationDecisionRow[]> {
    try {
      const rows = await (
        this.prisma as unknown as {
          reconciliationDecisionRecord: {
            findMany(args: {
              where: { integrationRunId: string; portfolioId: string };
              orderBy: { createdAt: 'asc' };
            }): Promise<PrismaDecisionRow[]>;
          };
        }
      ).reconciliationDecisionRecord.findMany({
        where: { integrationRunId: runId, portfolioId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError(`Failed to list reconciliation decisions for run ${runId}`);
    }
  }

  async listByRunIds(runIds: string[], portfolioId: string): Promise<ReconciliationDecisionRow[]> {
    if (runIds.length === 0) return [];
    try {
      const rows = await (
        this.prisma as unknown as {
          reconciliationDecisionRecord: {
            findMany(args: {
              where: { integrationRunId: { in: string[] }; portfolioId: string };
              orderBy: { createdAt: 'asc' };
            }): Promise<PrismaDecisionRow[]>;
          };
        }
      ).reconciliationDecisionRecord.findMany({
        where: { integrationRunId: { in: [...new Set(runIds)] }, portfolioId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError('Failed to list reconciliation decisions for integration runs');
    }
  }

  async listByPortfolio(
    portfolioId: string,
    options: {
      limit: number;
      cursor?: { decidedAt: Date } | null;
    },
  ): Promise<ReconciliationDecisionRow[]> {
    const take = Math.min(200, Math.max(1, Math.floor(options.limit)));
    try {
      const rows = await (
        this.prisma as unknown as {
          reconciliationDecisionRecord: {
            findMany(args: {
              where: {
                portfolioId: string;
                decidedAt?: { lte: Date };
              };
              orderBy: Array<{ decidedAt?: 'desc'; id?: 'desc' }>;
              take: number;
            }): Promise<PrismaDecisionRow[]>;
          };
        }
      ).reconciliationDecisionRecord.findMany({
        where: {
          portfolioId,
          ...(options.cursor ? { decidedAt: { lte: options.cursor.decidedAt } } : {}),
        },
        orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
        take,
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError('Failed to list reconciliation decisions by portfolio');
    }
  }
}
