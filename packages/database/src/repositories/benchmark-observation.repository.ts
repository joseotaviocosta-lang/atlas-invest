import { PrismaClient, Prisma } from '@prisma/client';
import { LocalDate } from '@atlas/domain';
import {
  IBenchmarkObservationRepository,
  BenchmarkObservationRecordRow,
  BenchmarkObservationRevisionRecordRow,
  BenchmarkObservationUpsertInput,
  BenchmarkObservationUpsertOutcome,
} from './interfaces';

export class PrismaBenchmarkObservationRepository implements IBenchmarkObservationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapObservationRow(row: {
    id: string;
    benchmarkId: string;
    referenceDate: Date;
    value: Prisma.Decimal;
    unit: string;
    frequency: string;
    source: string;
    providerSeriesId: string | null;
    firstFetchedAt: Date;
    lastFetchedAt: Date;
    fetchCount: number;
    revisedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): BenchmarkObservationRecordRow {
    return {
      id: row.id,
      benchmarkId: row.benchmarkId,
      referenceDate: LocalDate.fromParts(
        row.referenceDate.getUTCFullYear(),
        row.referenceDate.getUTCMonth() + 1,
        row.referenceDate.getUTCDate(),
      ),
      value: row.value.toString(),
      unit: row.unit,
      frequency: row.frequency,
      source: row.source,
      providerSeriesId: row.providerSeriesId,
      firstFetchedAt: row.firstFetchedAt,
      lastFetchedAt: row.lastFetchedAt,
      fetchCount: row.fetchCount,
      revisedAt: row.revisedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapRevisionRow(row: {
    id: string;
    benchmarkObservationId: string;
    changedAt: Date;
    priorValue: Prisma.Decimal;
    newValue: Prisma.Decimal;
    reason: string | null;
    createdAt: Date;
  }): BenchmarkObservationRevisionRecordRow {
    return {
      id: row.id,
      benchmarkObservationId: row.benchmarkObservationId,
      changedAt: row.changedAt,
      priorValue: row.priorValue.toString(),
      newValue: row.newValue.toString(),
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }

  async findObservation(
    benchmarkId: string,
    referenceDate: LocalDate,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow | null> {
    const jsDate = new Date(
      Date.UTC(referenceDate.year, referenceDate.month - 1, referenceDate.day),
    );

    const where: Prisma.BenchmarkObservationRecordWhereInput = {
      benchmarkId,
      referenceDate: jsDate,
    };
    if (source) where.source = source;

    const row = await this.prisma.benchmarkObservationRecord.findFirst({
      where,
      orderBy: { lastFetchedAt: 'desc' },
    });

    return row ? this.mapObservationRow(row) : null;
  }

  async findObservations(
    benchmarkId: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow[]> {
    const fromJsDate = new Date(Date.UTC(from.year, from.month - 1, from.day));
    const toJsDate = new Date(Date.UTC(to.year, to.month - 1, to.day));

    const where: Prisma.BenchmarkObservationRecordWhereInput = {
      benchmarkId,
      referenceDate: {
        gte: fromJsDate,
        lte: toJsDate,
      },
    };
    if (source) where.source = source;

    const rows = await this.prisma.benchmarkObservationRecord.findMany({
      where,
      orderBy: { referenceDate: 'asc' },
    });

    return rows.map((r) => this.mapObservationRow(r));
  }

  async findLatest(
    benchmarkId: string,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow | null> {
    const where: Prisma.BenchmarkObservationRecordWhereInput = { benchmarkId };
    if (source) where.source = source;

    const row = await this.prisma.benchmarkObservationRecord.findFirst({
      where,
      orderBy: { referenceDate: 'desc' },
    });

    return row ? this.mapObservationRow(row) : null;
  }

  async upsertObservation(input: BenchmarkObservationUpsertInput): Promise<{
    outcome: BenchmarkObservationUpsertOutcome;
    observation: BenchmarkObservationRecordRow;
    revision?: BenchmarkObservationRevisionRecordRow;
  }> {
    const refDate = new Date(
      Date.UTC(input.referenceDate.year, input.referenceDate.month - 1, input.referenceDate.day),
    );
    const incomingDecimal = new Prisma.Decimal(input.value);

    // Look for existing row
    const existing = await this.prisma.benchmarkObservationRecord.findUnique({
      where: {
        benchmarkId_referenceDate_source: {
          benchmarkId: input.benchmarkId,
          referenceDate: refDate,
          source: input.source,
        },
      },
    });

    if (!existing) {
      // CASE A: INSERTED
      const created = await this.prisma.benchmarkObservationRecord.create({
        data: {
          benchmarkId: input.benchmarkId,
          referenceDate: refDate,
          value: incomingDecimal,
          unit: input.unit,
          frequency: input.frequency,
          source: input.source,
          providerSeriesId: input.providerSeriesId ?? null,
          fetchCount: 1,
        },
      });

      return {
        outcome: 'INSERTED',
        observation: this.mapObservationRow(created),
      };
    }

    // Existing found. Check if value changed
    if (existing.value.equals(incomingDecimal)) {
      // CASE B: UNCHANGED
      const updated = await this.prisma.benchmarkObservationRecord.update({
        where: { id: existing.id },
        data: {
          lastFetchedAt: new Date(),
          fetchCount: { increment: 1 },
        },
      });

      return {
        outcome: 'UNCHANGED',
        observation: this.mapObservationRow(updated),
      };
    }

    // CASE C: REVISED
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const revision = await tx.benchmarkObservationRevisionRecord.create({
        data: {
          benchmarkObservationId: existing.id,
          changedAt: now,
          priorValue: existing.value,
          newValue: incomingDecimal,
          reason: input.reason ?? 'Provider published revised benchmark observation',
        },
      });

      const updated = await tx.benchmarkObservationRecord.update({
        where: { id: existing.id },
        data: {
          value: incomingDecimal,
          lastFetchedAt: now,
          revisedAt: now,
          fetchCount: { increment: 1 },
        },
      });

      return { revision, updated };
    });

    return {
      outcome: 'REVISED',
      observation: this.mapObservationRow(result.updated),
      revision: this.mapRevisionRow(result.revision),
    };
  }

  async getCoverage(benchmarkId: string): Promise<{
    totalObservations: number;
    firstObservationDate: LocalDate | null;
    lastObservationDate: LocalDate | null;
  }> {
    const agg = await this.prisma.benchmarkObservationRecord.aggregate({
      where: { benchmarkId },
      _count: { id: true },
      _min: { referenceDate: true },
      _max: { referenceDate: true },
    });

    const firstDate = agg._min.referenceDate
      ? LocalDate.fromParts(
          agg._min.referenceDate.getUTCFullYear(),
          agg._min.referenceDate.getUTCMonth() + 1,
          agg._min.referenceDate.getUTCDate(),
        )
      : null;

    const lastDate = agg._max.referenceDate
      ? LocalDate.fromParts(
          agg._max.referenceDate.getUTCFullYear(),
          agg._max.referenceDate.getUTCMonth() + 1,
          agg._max.referenceDate.getUTCDate(),
        )
      : null;

    return {
      totalObservations: agg._count.id,
      firstObservationDate: firstDate,
      lastObservationDate: lastDate,
    };
  }

  async listRevisions(
    benchmarkObservationId: string,
  ): Promise<BenchmarkObservationRevisionRecordRow[]> {
    const rows = await this.prisma.benchmarkObservationRevisionRecord.findMany({
      where: { benchmarkObservationId },
      orderBy: { changedAt: 'asc' },
    });

    return rows.map((r) => this.mapRevisionRow(r));
  }
}
