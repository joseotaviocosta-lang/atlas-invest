import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITransactionRectificationRepository,
  TransactionRectificationLinkInput,
  TransactionRectificationRow,
} from './interfaces';
import type { Transaction } from '@atlas/domain';
import { TransactionMapper } from '../mappers/transaction.mapper';
import { PersistenceError } from '../errors/persistence-error';
import { DuplicateRectificationError } from '../errors/duplicate-rectification-error';

type PrismaRectificationRow = {
  id: string;
  portfolioId: string;
  originalTransactionId: string;
  compensatingTransactionId: string;
  replacementTransactionId: string | null;
  mode: string;
  reason: string;
  decidedByPrincipal: string;
  decidedAt: Date;
  createdAt: Date;
};

/**
 * Phase 5S-C — append-only transaction rectifications.
 *
 * The only writer of reconciliation-safe corrections: compensating and
 * replacement legs plus the identity link commit in a single
 * interactive transaction. Partial application is impossible. Reads
 * are bounded lookups for detail, history badges and chain
 * resolution. The ledger itself is never updated or deleted through
 * this repository.
 */
export class TransactionRectificationRepository implements ITransactionRectificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaRectificationRow): TransactionRectificationRow {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      originalTransactionId: row.originalTransactionId,
      compensatingTransactionId: row.compensatingTransactionId,
      replacementTransactionId: row.replacementTransactionId,
      mode: row.mode === 'CANCEL' ? 'CANCEL' : 'RECTIFY',
      reason: row.reason,
      decidedByPrincipal: row.decidedByPrincipal,
      decidedAt: row.decidedAt,
      createdAt: row.createdAt,
    };
  }

  async createWithTransactions(input: {
    transactions: Transaction[];
    link: TransactionRectificationLinkInput;
  }): Promise<{ transactions: Transaction[]; record: TransactionRectificationRow }> {
    try {
      const created = await this.prisma.$transaction(async (txClient) => {
        const typed = txClient as unknown as Prisma.TransactionClient;
        const persisted: Transaction[] = [];
        for (const tx of input.transactions) {
          const data = TransactionMapper.toPersistence(tx);
          const createdRow = await typed.transaction.create({ data });
          persisted.push(TransactionMapper.toDomain(createdRow));
        }
        const record = await (
          txClient as unknown as {
            transactionRectificationRecord: {
              create(args: { data: typeof input.link }): Promise<PrismaRectificationRow>;
            };
          }
        ).transactionRectificationRecord.create({ data: input.link });
        return { persisted, record: this.map(record) };
      });
      return { transactions: created.persisted, record: created.record };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateRectificationError(input.link.originalTransactionId);
      }
      throw error;
    }
  }

  async findByOriginalTransactionId(
    originalTransactionId: string,
    portfolioId: string,
  ): Promise<TransactionRectificationRow | null> {
    try {
      const row = await (
        this.prisma as unknown as {
          transactionRectificationRecord: {
            findUnique(args: {
              where: { originalTransactionId: string };
            }): Promise<PrismaRectificationRow | null>;
          };
        }
      ).transactionRectificationRecord.findUnique({
        where: { originalTransactionId },
      });
      if (!row || row.portfolioId !== portfolioId) return null;
      return this.map(row);
    } catch {
      throw new PersistenceError('Failed to load transaction rectification');
    }
  }

  async findByReplacementTransactionId(
    replacementTransactionId: string,
    portfolioId: string,
  ): Promise<TransactionRectificationRow | null> {
    try {
      const row = await (
        this.prisma as unknown as {
          transactionRectificationRecord: {
            findFirst(args: {
              where: { portfolioId: string; replacementTransactionId: string };
            }): Promise<PrismaRectificationRow | null>;
          };
        }
      ).transactionRectificationRecord.findFirst({
        where: { portfolioId, replacementTransactionId },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError('Failed to load transaction rectification');
    }
  }

  async listByOriginalTransactionIds(
    originalTransactionIds: string[],
    portfolioId: string,
  ): Promise<TransactionRectificationRow[]> {
    if (originalTransactionIds.length === 0) return [];
    try {
      const rows = await (
        this.prisma as unknown as {
          transactionRectificationRecord: {
            findMany(args: {
              where: { portfolioId: string; originalTransactionId: { in: string[] } };
            }): Promise<PrismaRectificationRow[]>;
          };
        }
      ).transactionRectificationRecord.findMany({
        where: { portfolioId, originalTransactionId: { in: [...new Set(originalTransactionIds)] } },
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError('Failed to list transaction rectifications');
    }
  }

  async listByReplacementTransactionIds(
    replacementTransactionIds: string[],
    portfolioId: string,
  ): Promise<TransactionRectificationRow[]> {
    if (replacementTransactionIds.length === 0) return [];
    try {
      const rows = await (
        this.prisma as unknown as {
          transactionRectificationRecord: {
            findMany(args: {
              where: { portfolioId: string; replacementTransactionId: { in: string[] } };
            }): Promise<PrismaRectificationRow[]>;
          };
        }
      ).transactionRectificationRecord.findMany({
        where: {
          portfolioId,
          replacementTransactionId: { in: [...new Set(replacementTransactionIds)] },
        },
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError('Failed to list transaction rectifications');
    }
  }

  async listByPortfolio(
    portfolioId: string,
    options: {
      limit: number;
      cursor?: { decidedAt: Date } | null;
    },
  ): Promise<TransactionRectificationRow[]> {
    const take = Math.min(200, Math.max(1, Math.floor(options.limit)));
    try {
      const rows = await (
        this.prisma as unknown as {
          transactionRectificationRecord: {
            findMany(args: {
              where: {
                portfolioId: string;
                decidedAt?: { lte: Date };
              };
              orderBy: Array<{ decidedAt?: 'desc'; id?: 'desc' }>;
              take: number;
            }): Promise<PrismaRectificationRow[]>;
          };
        }
      ).transactionRectificationRecord.findMany({
        where: {
          portfolioId,
          ...(options.cursor ? { decidedAt: { lte: options.cursor.decidedAt } } : {}),
        },
        orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
        take,
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError('Failed to list transaction rectifications by portfolio');
    }
  }

  async resolveEffectiveTransactionId(
    originalTransactionId: string,
    portfolioId: string,
  ): Promise<string | null> {
    const visited = new Set<string>();
    let current: string | null = originalTransactionId;
    let guard = 0;
    while (current !== null && guard < 25) {
      guard += 1;
      if (visited.has(current)) return null;
      visited.add(current);
      const link = await this.findByOriginalTransactionId(current, portfolioId);
      if (link) {
        current = link.replacementTransactionId;
        continue;
      }
      const legacy = await this.prisma.transaction
        .findFirst({
          where: {
            portfolioId,
            provider: 'ATLAS_RECTIFY',
            externalId: { startsWith: `replacement:${current}` },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
        .catch(() => null);
      current = legacy ? (legacy as { id: string }).id : current;
      break;
    }
    return current;
  }
}
