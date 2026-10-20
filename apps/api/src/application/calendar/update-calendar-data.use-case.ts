import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import { CalendarType, BrazilianOfficialCalendarProvider } from '@atlas/market-data';
import { ICalendarRepository, CalendarDayUpsertInput } from '@atlas/database';
import { CALENDAR_REPOSITORY } from '../../database/tokens';

export interface UpdateCalendarDataParams {
  calendarType: string;
  year?: number;
  from?: string;
  to?: string;
  /**
   * Phase 5E: scheduled refreshes must never overwrite calendar rows that are
   * already present (including authoritative exceptional overrides). When true,
   * only missing dates are written.
   */
  preserveExisting?: boolean;
}

export interface UpdateCalendarDataReceipt {
  calendarType: CalendarType;
  requestedRange: { from: string; to: string };
  source: string;
  inserted: number;
  updated: number;
  totalDays: number;
}

@Injectable()
export class UpdateCalendarDataUseCase {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendarRepository: ICalendarRepository,
  ) {}

  async execute(params: UpdateCalendarDataParams): Promise<UpdateCalendarDataReceipt> {
    const calType = params.calendarType.trim().toUpperCase() as CalendarType;
    if (calType !== 'B3_TRADING' && calType !== 'BANKING') {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.INVALID_CALENDAR_TYPE',
        message: `Unsupported calendar type '${params.calendarType}'. Must be B3_TRADING or BANKING.`,
      });
    }

    const provider = new BrazilianOfficialCalendarProvider();
    const daysToSave: CalendarDayUpsertInput[] = [];
    let fromStr = '';
    let toStr = '';

    if (params.year) {
      if (params.year < 1990 || params.year > 2100) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'VALIDATION.INVALID_YEAR',
          message: 'Year must be between 1990 and 2100',
        });
      }
      fromStr = `${params.year}-01-01`;
      toStr = `${params.year}-12-31`;
      const generated = provider.generateYear(params.year, calType);
      for (const g of generated) {
        daysToSave.push({
          calendarType: calType,
          date: g.date,
          isOpen: g.isOpen,
          reason: g.reason ?? null,
          source: g.source,
        });
      }
    } else if (params.from && params.to) {
      let fromDate: LocalDate;
      let toDate: LocalDate;
      try {
        fromDate = LocalDate.from(params.from);
        toDate = LocalDate.from(params.to);
      } catch {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'VALIDATION.INVALID_DATE_FORMAT',
          message: 'from and to must be valid dates in YYYY-MM-DD format',
        });
      }

      if (fromDate.compare(toDate) > 0) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'VALIDATION.INVALID_DATE_RANGE',
          message: 'from date cannot be after to date',
        });
      }

      fromStr = fromDate.toString();
      toStr = toDate.toString();

      for (let y = fromDate.year; y <= toDate.year; y++) {
        const yearDays = provider.generateYear(y, calType);
        for (const yd of yearDays) {
          if (yd.date.compare(fromDate) >= 0 && yd.date.compare(toDate) <= 0) {
            daysToSave.push({
              calendarType: calType,
              date: yd.date,
              isOpen: yd.isOpen,
              reason: yd.reason ?? null,
              source: yd.source,
            });
          }
        }
      }
    } else {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.MISSING_PARAMETERS',
        message: 'Must provide either year or both from and to date parameters.',
      });
    }

    if (params.preserveExisting) {
      const from = LocalDate.from(fromStr);
      const to = LocalDate.from(toStr);
      const existing = await this.calendarRepository.findDays(calType, from, to);
      const existingDates = new Set(existing.map((day) => day.date.toString()));
      const missing = daysToSave.filter((day) => !existingDates.has(day.date.toString()));
      daysToSave.length = 0;
      daysToSave.push(...missing);
    }

    const { inserted, updated } = await this.calendarRepository.saveMany(daysToSave);

    return {
      calendarType: calType,
      requestedRange: { from: fromStr, to: toStr },
      source: 'OFFICIAL_BRAZILIAN_CALENDAR',
      inserted,
      updated,
      totalDays: daysToSave.length,
    };
  }
}
