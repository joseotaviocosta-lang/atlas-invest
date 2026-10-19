import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { CalendarType } from '@atlas/market-data';
import { ICalendarRepository } from '@atlas/database';
import { CALENDAR_REPOSITORY } from '../../database/tokens';

export interface CalendarCoverageResult {
  calendarType: CalendarType;
  minDate: string | null;
  maxDate: string | null;
  totalDays: number;
  openDays: number;
  closedDays: number;
  sources: string[];
  latestImportedAt: string | null;
}

@Injectable()
export class GetCalendarCoverageUseCase {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendarRepository: ICalendarRepository,
  ) {}

  async execute(calendarType: string): Promise<CalendarCoverageResult> {
    const calType = calendarType.trim().toUpperCase() as CalendarType;
    if (calType !== 'B3_TRADING' && calType !== 'BANKING') {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION.INVALID_CALENDAR_TYPE',
        message: `Unsupported calendar type '${calendarType}'. Must be B3_TRADING or BANKING.`,
      });
    }

    const cov = await this.calendarRepository.getCoverage(calType);

    return {
      calendarType: calType,
      minDate: cov.minDate ? cov.minDate.toString() : null,
      maxDate: cov.maxDate ? cov.maxDate.toString() : null,
      totalDays: cov.totalDays,
      openDays: cov.openDays,
      closedDays: cov.closedDays,
      sources: cov.sources,
      latestImportedAt: cov.latestImportedAt ? cov.latestImportedAt.toISOString() : null,
    };
  }
}
