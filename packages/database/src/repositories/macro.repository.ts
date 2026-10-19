import { PrismaClient, Prisma } from '@prisma/client';
import { LocalDate } from '@atlas/domain';
import {
  IMacroRepository,
  MacroObservationRecordRow,
  MacroObservationRevisionRecordRow,
  MacroObservationUpsertInput,
  MacroObservationUpsertOutcome,
} from './interfaces';

export class PrismaMacroRepository implements IMacroRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapRow(row: {
    id: string;
    seriesId: string;
    referenceDate: Date;
    value: Prisma.Decimal;
    unit: string;
    frequency: string;
    source: string;
    publishedAt: Date | null;
    firstFetchedAt: Date;
    lastFetchedAt: Date;
    fetchCount: number;
    revisedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): MacroObservationRecordRow {
    return {
      id: row.id,
      seriesId: row.seriesId,
      referenceDate: LocalDate.fromParts(
        row.referenceDate.getUTCFullYear(),
        row.referenceDate.getUTCMonth() + 1,
        row.referenceDate.getUTCDate(),
      ),
      value: row.value.toString(),
      unit: row.unit,
      frequency: row.frequency,
      source: row.source,
      publishedAt: row.publishedAt,
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
    macroObservationId: string;
    changedAt: Date;
    priorValue: Prisma.Decimal;
    newValue: Prisma.Decimal;
    reason: string | null;
    createdAt: Date;
  }): MacroObservationRevisionRecordRow {
    return {
      id: row.id,
      macroObservationId: row.macroObservationId,
      changedAt: row.changedAt,
      priorValue: row.priorValue.toString(),
      newValue: row.newValue.toString(),
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }

  async findObservation(
    seriesId: string,
    referenceDate: LocalDate,
    source?: string,
  ): Promise<MacroObservationRecordRow | null> {
    const jsDate = new Date(
      Date.UTC(referenceDate.year, referenceDate.month - 1, referenceDate.day),
    );

    const where: Prisma.MacroObservationRecordWhereInput = {
      seriesId,
      referenceDate: jsDate,
    };
    if (source) where.source = source;

    const row = await this.prisma.macroObservationRecord.findFirst({
      where,
      orderBy: { lastFetchedAt: 'desc' },
    });

    return row ? this.mapRow(row) : null;
  }

  async findObservations(
    seriesId: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
  ): Promise<MacroObservationRecordRow[]> {
    const fromDate = new Date(Date.UTC(from.year, from.month - 1, from.day));
    const toDate = new Date(Date.UTC(to.year, to.month - 1, to.day));

    const where: Prisma.MacroObservationRecordWhereInput = {
      seriesId,
      referenceDate: {
        gte: fromDate,
        lte: toDate,
      },
    };
    if (source) where.source = source;

    const rows = await this.prisma.macroObservationRecord.findMany({
      where,
      orderBy: { referenceDate: 'asc' },
    });

    return rows.map((r) => this.mapRow(r));
  }

  async findLatest(seriesId: string, source?: string): Promise<MacroObservationRecordRow | null> {
    const where: Prisma.MacroObservationRecordWhereInput = {
      seriesId,
    };
    if (source) where.source = source;

    const row = await this.prisma.macroObservationRecord.findFirst({
      where,
      orderBy: { referenceDate: 'desc' },
    });

    return row ? this.mapRow(row) : null;
  }

  async upsertObservation(input: MacroObservationUpsertInput): Promise<{
    outcome: MacroObservationUpsertOutcome;
    observation: MacroObservationRecordRow;
    revision?: MacroObservationRevisionRecordRow;
  }> {
    const jsDate = new Date(
      Date.UTC(input.referenceDate.year, input.referenceDate.month - 1, input.referenceDate.day),
    );
    const newValueDecimal = new Prisma.Decimal(input.value);

    const existing = await this.prisma.macroObservationRecord.findUnique({
      where: {
        seriesId_referenceDate_source: {
          seriesId: input.seriesId,
          referenceDate: jsDate,
          source: input.source,
        },
      },
    });

    if (!existing) {
      const created = await this.prisma.macroObservationRecord.create({
        data: {
          seriesId: input.seriesId,
          referenceDate: jsDate,
          value: newValueDecimal,
          unit: input.unit,
          frequency: input.frequency,
          source: input.source,
          publishedAt: input.publishedAt ?? null,
        },
      });
      return {
        outcome: 'INSERTED',
        observation: this.mapRow(created),
      };
    }

    // If identical value: update fetch count and timestamp
    if (existing.value.equals(newValueDecimal)) {
      const updated = await this.prisma.macroObservationRecord.update({
        where: { id: existing.id },
        data: {
          lastFetchedAt: new Date(),
          fetchCount: { increment: 1 },
          publishedAt: input.publishedAt ?? existing.publishedAt,
        },
      });
      return {
        outcome: 'UNCHANGED',
        observation: this.mapRow(updated),
      };
    }

    // If value changed: record revision and update observation
    const [revision, updated] = await this.prisma.$transaction(async (tx) => {
      const rev = await tx.macroObservationRevisionRecord.create({
        data: {
          macroObservationId: existing.id,
          priorValue: existing.value,
          newValue: newValueDecimal,
          reason: input.reason ?? 'Official macro rate revision',
        },
      });

      const obs = await tx.macroObservationRecord.update({
        where: { id: existing.id },
        data: {
          value: newValueDecimal,
          unit: input.unit,
          frequency: input.frequency,
          publishedAt: input.publishedAt ?? existing.publishedAt,
          revisedAt: new Date(),
          lastFetchedAt: new Date(),
          fetchCount: { increment: 1 },
        },
      });

      return [rev, obs];
    });

    return {
      outcome: 'REVISED',
      observation: this.mapRow(updated),
      revision: this.mapRevisionRow(revision),
    };
  }

  async getCoverage(
    seriesId: string,
    source?: string,
  ): Promise<{
    count: number;
    minReferenceDate: LocalDate | null;
    maxReferenceDate: LocalDate | null;
    latestPublishedAt: Date | null;
    source: string | null;
    frequency: string | null;
  }> {
    const where: Prisma.MacroObservationRecordWhereInput = { seriesId };
    if (source) where.source = source;

    const rows = await this.prisma.macroObservationRecord.findMany({
      where,
      select: {
        referenceDate: true,
        source: true,
        frequency: true,
        publishedAt: true,
      },
      orderBy: { referenceDate: 'asc' },
    });

    if (rows.length === 0) {
      return {
        count: 0,
        minReferenceDate: null,
        maxReferenceDate: null,
        latestPublishedAt: null,
        source: null,
        frequency: null,
      };
    }

    const minDateRow = rows[0]!;
    const maxDateRow = rows[rows.length - 1]!;
    let latestPub: Date | null = null;
    for (const r of rows) {
      if (r.publishedAt && (!latestPub || r.publishedAt > latestPub)) {
        latestPub = r.publishedAt;
      }
    }

    return {
      count: rows.length,
      minReferenceDate: LocalDate.fromParts(
        minDateRow.referenceDate.getUTCFullYear(),
        minDateRow.referenceDate.getUTCMonth() + 1,
        minDateRow.referenceDate.getUTCDate(),
      ),
      maxReferenceDate: LocalDate.fromParts(
        maxDateRow.referenceDate.getUTCFullYear(),
        maxDateRow.referenceDate.getUTCMonth() + 1,
        maxDateRow.referenceDate.getUTCDate(),
      ),
      latestPublishedAt: latestPub,
      source: minDateRow.source,
      frequency: minDateRow.frequency,
    };
  }

  async listRevisions(macroObservationId: string): Promise<MacroObservationRevisionRecordRow[]> {
    const rows = await this.prisma.macroObservationRevisionRecord.findMany({
      where: { macroObservationId },
      orderBy: { changedAt: 'desc' },
    });
    return rows.map((r) => this.mapRevisionRow(r));
  }
}
