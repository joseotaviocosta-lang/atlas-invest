import { Prisma, PrismaClient } from '@prisma/client';
import { ITaxInterestRateRepository, TaxInterestRateRow } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  indexName: string;
  referenceMonth: string;
  ratePercent: Prisma.Decimal;
  sourceAuthority: string;
  sourceReference: string;
  sourceRetrievedAt: Date;
  verifiedAt: Date;
  version: number;
  createdAt: Date;
};

/**
 * Phase 4D.2 — immutable official monthly SELIC rate snapshots. Only official
 * RFB/Sicalc sources; missing rate fails closed (ADR-272).
 */
export class TaxInterestRateRepository implements ITaxInterestRateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): TaxInterestRateRow {
    return {
      id: row.id,
      indexName: row.indexName,
      referenceMonth: row.referenceMonth,
      ratePercent: row.ratePercent.toString(),
      sourceAuthority: row.sourceAuthority,
      sourceReference: row.sourceReference,
      sourceRetrievedAt: row.sourceRetrievedAt,
      verifiedAt: row.verifiedAt,
      version: row.version,
      createdAt: row.createdAt,
    };
  }

  async listByIndexAndMonths(
    indexName: string,
    months: readonly string[],
  ): Promise<TaxInterestRateRow[]> {
    if (months.length === 0) return [];
    const rows = await this.prisma.taxInterestRateSnapshot.findMany({
      where: { indexName, referenceMonth: { in: [...months] } },
      orderBy: [{ referenceMonth: 'asc' }, { version: 'desc' }],
    });
    // Latest version per reference month.
    const latest = new Map<string, TaxInterestRateRow>();
    for (const row of rows) {
      const mapped = this.map(row);
      if (!latest.has(mapped.referenceMonth)) latest.set(mapped.referenceMonth, mapped);
    }
    return [...latest.values()].sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
  }

  async create(
    input: Parameters<ITaxInterestRateRepository['create']>[0],
  ): Promise<{ outcome: 'CREATED' | 'DUPLICATE'; record: TaxInterestRateRow }> {
    const identity = {
      indexName: input.indexName,
      referenceMonth: input.referenceMonth,
      version: input.version,
    };
    try {
      const existing = await this.prisma.taxInterestRateSnapshot.findUnique({
        where: { tax_interest_rate_snapshot_identity: identity },
      });
      if (existing) return { outcome: 'DUPLICATE', record: this.map(existing) };
      const created = await this.prisma.taxInterestRateSnapshot.create({
        data: {
          ...identity,
          ratePercent: new Prisma.Decimal(input.ratePercent),
          sourceAuthority: input.sourceAuthority,
          sourceReference: input.sourceReference,
          sourceRetrievedAt: input.sourceRetrievedAt,
          verifiedAt: input.verifiedAt,
        },
      });
      return { outcome: 'CREATED', record: this.map(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.taxInterestRateSnapshot.findUnique({
          where: { tax_interest_rate_snapshot_identity: identity },
        });
        if (again) return { outcome: 'DUPLICATE', record: this.map(again) };
      }
      throw new PersistenceError(
        `Failed to create interest-rate snapshot: ${(error as Error).message}`,
      );
    }
  }
}
