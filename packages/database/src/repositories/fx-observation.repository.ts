import { PrismaClient, Prisma } from '@prisma/client';
import { LocalDate } from '@atlas/domain';
import {
  IFxObservationRepository,
  FxObservationRecordRow,
  FxObservationRevisionRecordRow,
  FxObservationUpsertInput,
  FxObservationUpsertOutcome,
} from './interfaces';

export class PrismaFxObservationRepository implements IFxObservationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapObservationRow(row: {
    id: string;
    baseCurrency: string;
    quoteCurrency: string;
    observationDate: Date;
    rate: Prisma.Decimal;
    rateType: string;
    source: string;
    providerSeriesId: string | null;
    firstFetchedAt: Date;
    lastFetchedAt: Date;
    fetchCount: number;
    revisedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): FxObservationRecordRow {
    return {
      id: row.id,
      baseCurrency: row.baseCurrency,
      quoteCurrency: row.quoteCurrency,
      observationDate: LocalDate.fromParts(
        row.observationDate.getUTCFullYear(),
        row.observationDate.getUTCMonth() + 1,
        row.observationDate.getUTCDate(),
      ),
      rate: row.rate.toString(),
      rateType: row.rateType,
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
    fxObservationId: string;
    changedAt: Date;
    priorRate: Prisma.Decimal;
    newRate: Prisma.Decimal;
    reason: string | null;
    createdAt: Date;
  }): FxObservationRevisionRecordRow {
    return {
      id: row.id,
      fxObservationId: row.fxObservationId,
      changedAt: row.changedAt,
      priorRate: row.priorRate.toString(),
      newRate: row.newRate.toString(),
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }

  async findObservation(
    baseCurrency: string,
    quoteCurrency: string,
    observationDate: LocalDate,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow | null> {
    const jsDate = new Date(
      Date.UTC(observationDate.year, observationDate.month - 1, observationDate.day),
    );

    const where: Prisma.FxObservationRecordWhereInput = {
      baseCurrency,
      quoteCurrency,
      observationDate: jsDate,
    };
    if (source) where.source = source;
    if (rateType) where.rateType = rateType;

    const row = await this.prisma.fxObservationRecord.findFirst({
      where,
      orderBy: { lastFetchedAt: 'desc' },
    });

    return row ? this.mapObservationRow(row) : null;
  }

  async findObservations(
    baseCurrency: string,
    quoteCurrency: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow[]> {
    const fromDate = new Date(Date.UTC(from.year, from.month - 1, from.day));
    const toDate = new Date(Date.UTC(to.year, to.month - 1, to.day));

    const where: Prisma.FxObservationRecordWhereInput = {
      baseCurrency,
      quoteCurrency,
      observationDate: {
        gte: fromDate,
        lte: toDate,
      },
    };
    if (source) where.source = source;
    if (rateType) where.rateType = rateType;

    const rows = await this.prisma.fxObservationRecord.findMany({
      where,
      orderBy: { observationDate: 'asc' },
    });

    return rows.map((r) => this.mapObservationRow(r));
  }

  async findLatest(
    baseCurrency: string,
    quoteCurrency: string,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow | null> {
    const where: Prisma.FxObservationRecordWhereInput = {
      baseCurrency,
      quoteCurrency,
    };
    if (source) where.source = source;
    if (rateType) where.rateType = rateType;

    const row = await this.prisma.fxObservationRecord.findFirst({
      where,
      orderBy: { observationDate: 'desc' },
    });

    return row ? this.mapObservationRow(row) : null;
  }

  async upsertObservation(input: FxObservationUpsertInput): Promise<{
    outcome: FxObservationUpsertOutcome;
    observation: FxObservationRecordRow;
    revision?: FxObservationRevisionRecordRow;
  }> {
    const jsDate = new Date(
      Date.UTC(
        input.observationDate.year,
        input.observationDate.month - 1,
        input.observationDate.day,
      ),
    );
    const rateType = input.rateType ?? 'MID';
    const rateDecimal = new Prisma.Decimal(input.rate);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.fxObservationRecord.findUnique({
        where: {
          baseCurrency_quoteCurrency_observationDate_source_rateType: {
            baseCurrency: input.baseCurrency,
            quoteCurrency: input.quoteCurrency,
            observationDate: jsDate,
            source: input.source,
            rateType,
          },
        },
      });

      if (!existing) {
        const created = await tx.fxObservationRecord.create({
          data: {
            baseCurrency: input.baseCurrency,
            quoteCurrency: input.quoteCurrency,
            observationDate: jsDate,
            rate: rateDecimal,
            rateType,
            source: input.source,
            providerSeriesId: input.providerSeriesId ?? null,
            firstFetchedAt: new Date(),
            lastFetchedAt: new Date(),
            fetchCount: 1,
          },
        });
        return {
          outcome: 'INSERTED',
          observation: this.mapObservationRow(created),
        };
      }

      if (existing.rate.equals(rateDecimal)) {
        const updated = await tx.fxObservationRecord.update({
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

      // Rate revision detected
      const rev = await tx.fxObservationRevisionRecord.create({
        data: {
          fxObservationId: existing.id,
          priorRate: existing.rate,
          newRate: rateDecimal,
          reason: input.reason ?? 'Upstream official PTAX rate revision',
        },
      });

      const revised = await tx.fxObservationRecord.update({
        where: { id: existing.id },
        data: {
          rate: rateDecimal,
          lastFetchedAt: new Date(),
          fetchCount: { increment: 1 },
          revisedAt: new Date(),
        },
      });

      return {
        outcome: 'REVISED',
        observation: this.mapObservationRow(revised),
        revision: this.mapRevisionRow(rev),
      };
    });
  }

  async getCoverage(
    baseCurrency: string,
    quoteCurrency: string,
    source?: string,
    rateType?: string,
  ): Promise<{
    totalObservations: number;
    firstObservationDate: LocalDate | null;
    lastObservationDate: LocalDate | null;
  }> {
    const where: Prisma.FxObservationRecordWhereInput = {
      baseCurrency,
      quoteCurrency,
    };
    if (source) where.source = source;
    if (rateType) where.rateType = rateType;

    const count = await this.prisma.fxObservationRecord.count({ where });
    if (count === 0) {
      return {
        totalObservations: 0,
        firstObservationDate: null,
        lastObservationDate: null,
      };
    }

    const firstRow = await this.prisma.fxObservationRecord.findFirst({
      where,
      orderBy: { observationDate: 'asc' },
      select: { observationDate: true },
    });

    const lastRow = await this.prisma.fxObservationRecord.findFirst({
      where,
      orderBy: { observationDate: 'desc' },
      select: { observationDate: true },
    });

    return {
      totalObservations: count,
      firstObservationDate: firstRow
        ? LocalDate.fromParts(
            firstRow.observationDate.getUTCFullYear(),
            firstRow.observationDate.getUTCMonth() + 1,
            firstRow.observationDate.getUTCDate(),
          )
        : null,
      lastObservationDate: lastRow
        ? LocalDate.fromParts(
            lastRow.observationDate.getUTCFullYear(),
            lastRow.observationDate.getUTCMonth() + 1,
            lastRow.observationDate.getUTCDate(),
          )
        : null,
    };
  }

  async listRevisions(fxObservationId: string): Promise<FxObservationRevisionRecordRow[]> {
    const rows = await this.prisma.fxObservationRevisionRecord.findMany({
      where: { fxObservationId },
      orderBy: { changedAt: 'desc' },
    });
    return rows.map((r) => this.mapRevisionRow(r));
  }
}
