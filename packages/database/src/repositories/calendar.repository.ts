import { PrismaClient } from '@prisma/client';
import { LocalDate } from '@atlas/domain';
import { ICalendarRepository, CalendarDayRow, CalendarDayUpsertInput } from './interfaces';

export class PrismaCalendarRepository implements ICalendarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapRow(row: {
    id: string;
    calendarType: string;
    date: Date;
    isOpen: boolean;
    reason: string | null;
    source: string;
    createdAt: Date;
    updatedAt: Date;
  }): CalendarDayRow {
    return {
      id: row.id,
      calendarType: row.calendarType,
      date: LocalDate.fromParts(
        row.date.getUTCFullYear(),
        row.date.getUTCMonth() + 1,
        row.date.getUTCDate(),
      ),
      isOpen: row.isOpen,
      reason: row.reason,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findDay(calendarType: string, date: LocalDate): Promise<CalendarDayRow | null> {
    const jsDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
    const row = await this.prisma.calendarDayRecord.findUnique({
      where: {
        calendarType_date: {
          calendarType,
          date: jsDate,
        },
      },
    });
    return row ? this.mapRow(row) : null;
  }

  async findDays(calendarType: string, from: LocalDate, to: LocalDate): Promise<CalendarDayRow[]> {
    const fromDate = new Date(Date.UTC(from.year, from.month - 1, from.day));
    const toDate = new Date(Date.UTC(to.year, to.month - 1, to.day));

    const rows = await this.prisma.calendarDayRecord.findMany({
      where: {
        calendarType,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    return rows.map((r) => this.mapRow(r));
  }

  async saveMany(days: CalendarDayUpsertInput[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    for (const d of days) {
      const jsDate = new Date(Date.UTC(d.date.year, d.date.month - 1, d.date.day));
      const existing = await this.prisma.calendarDayRecord.findUnique({
        where: {
          calendarType_date: {
            calendarType: d.calendarType,
            date: jsDate,
          },
        },
      });

      if (!existing) {
        await this.prisma.calendarDayRecord.create({
          data: {
            calendarType: d.calendarType,
            date: jsDate,
            isOpen: d.isOpen,
            reason: d.reason ?? null,
            source: d.source,
          },
        });
        inserted++;
      } else {
        await this.prisma.calendarDayRecord.update({
          where: {
            calendarType_date: {
              calendarType: d.calendarType,
              date: jsDate,
            },
          },
          data: {
            isOpen: d.isOpen,
            reason: d.reason ?? null,
            source: d.source,
          },
        });
        updated++;
      }
    }

    return { inserted, updated };
  }

  async getCoverage(calendarType: string): Promise<{
    minDate: LocalDate | null;
    maxDate: LocalDate | null;
    totalDays: number;
    openDays: number;
    closedDays: number;
    sources: string[];
    latestImportedAt: Date | null;
  }> {
    const rows = await this.prisma.calendarDayRecord.findMany({
      where: { calendarType },
      select: {
        date: true,
        isOpen: true,
        source: true,
        updatedAt: true,
      },
      orderBy: { date: 'asc' },
    });

    if (rows.length === 0) {
      return {
        minDate: null,
        maxDate: null,
        totalDays: 0,
        openDays: 0,
        closedDays: 0,
        sources: [],
        latestImportedAt: null,
      };
    }

    const minDateRow = rows[0]!;
    const maxDateRow = rows[rows.length - 1]!;

    let openDays = 0;
    let closedDays = 0;
    const sourcesSet = new Set<string>();
    let latestImportedAt: Date | null = null;

    for (const r of rows) {
      if (r.isOpen) openDays++;
      else closedDays++;
      if (r.source) sourcesSet.add(r.source);
      if (!latestImportedAt || r.updatedAt > latestImportedAt) {
        latestImportedAt = r.updatedAt;
      }
    }

    return {
      minDate: LocalDate.fromParts(
        minDateRow.date.getUTCFullYear(),
        minDateRow.date.getUTCMonth() + 1,
        minDateRow.date.getUTCDate(),
      ),
      maxDate: LocalDate.fromParts(
        maxDateRow.date.getUTCFullYear(),
        maxDateRow.date.getUTCMonth() + 1,
        maxDateRow.date.getUTCDate(),
      ),
      totalDays: rows.length,
      openDays,
      closedDays,
      sources: Array.from(sourcesSet),
      latestImportedAt,
    };
  }
}
