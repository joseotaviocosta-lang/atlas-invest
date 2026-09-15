import { PrismaClient, Prisma } from '@prisma/client';
import { Transaction } from '@atlas/domain';
import { ITransactionRepository, TransactionLedgerFilter, PaginationOptions } from './interfaces';
import { TransactionMapper } from '../mappers/transaction.mapper';
import { DateConverter } from '../mappers/date-converter';
import { DuplicateExternalTransactionError } from '../errors/duplicate-external-transaction-error';
import { CrossPortfolioIntegrityError } from '../errors/cross-portfolio-integrity-error';
import { PersistenceError } from '../errors/persistence-error';
import { getPrismaClient } from '../client';

export class TransactionRepository implements ITransactionRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async create(transaction: Transaction): Promise<Transaction> {
    try {
      const data = TransactionMapper.toPersistence(transaction);
      const created = await this.prisma.transaction.create({ data });
      return TransactionMapper.toDomain(created);
    } catch (error) {
      this.handlePrismaError(error, transaction);
      throw error;
    }
  }

  async createMany(transactions: Transaction[]): Promise<Transaction[]> {
    const results: Transaction[] = [];
    for (const tx of transactions) {
      const created = await this.create(tx);
      results.push(created);
    }
    return results;
  }

  async findById(id: string): Promise<Transaction | null> {
    const raw = await this.prisma.transaction.findUnique({ where: { id } });
    return raw ? TransactionMapper.toDomain(raw) : null;
  }

  async findByPortfolioId(
    portfolioId: string,
    filter?: TransactionLedgerFilter,
    pagination?: PaginationOptions,
  ): Promise<Transaction[]> {
    const where: Prisma.TransactionWhereInput = { portfolioId };

    if (filter?.accountId) {
      where.accountId = filter.accountId;
    }
    if (filter?.assetId) {
      where.assetId = filter.assetId;
    }
    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.startDate || filter?.endDate) {
      where.tradeDate = {};
      if (filter.startDate) {
        where.tradeDate.gte = DateConverter.toPersistence(filter.startDate) ?? undefined;
      }
      if (filter.endDate) {
        where.tradeDate.lte = DateConverter.toPersistence(filter.endDate) ?? undefined;
      }
    }

    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: pagination?.limit,
      skip: pagination?.skip,
      cursor: pagination?.cursor ? { id: pagination.cursor } : undefined,
    });

    return items.map((item) => TransactionMapper.toDomain(item));
  }

  async findByExternalId(
    portfolioId: string,
    provider: string,
    externalId: string,
  ): Promise<Transaction | null> {
    const raw = await this.prisma.transaction.findUnique({
      where: {
        portfolio_provider_external_id_unique: {
          portfolioId,
          provider,
          externalId,
        },
      },
    });
    return raw ? TransactionMapper.toDomain(raw) : null;
  }

  private handlePrismaError(error: unknown, transaction: Transaction): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const metaStr = JSON.stringify(error.meta ?? {});
      const details = `${metaStr} ${error.message}`;

      // P2002: Unique constraint failed
      if (error.code === 'P2002') {
        if (
          details.includes('provider') ||
          details.includes('external_id') ||
          details.includes('portfolio_provider_external_id_unique')
        ) {
          throw new DuplicateExternalTransactionError(
            transaction.portfolioId,
            transaction.provider ?? '',
            transaction.externalId ?? '',
          );
        }
      }

      // P2003: Foreign key constraint failed
      if (error.code === 'P2003') {
        if (
          details.includes('account_id') ||
          details.includes('portfolio_id') ||
          details.includes('transactions_account_id_portfolio_id_fkey')
        ) {
          throw new CrossPortfolioIntegrityError(
            `Account '${transaction.accountId}' does not belong to portfolio '${transaction.portfolioId}' or does not exist.`,
          );
        }
      }

      throw new PersistenceError(
        `Database request error: ${error.message}`,
        `PRISMA.${error.code}`,
      );
    }
  }
}
