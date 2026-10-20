/**
 * Phase 5E (R3-B) - CALENDAR_B3_REFRESH and CALENDAR_BANKING_REFRESH.
 *
 * Refreshes the current civil year and the next year. Existing rows are
 * preserved (authoritative exceptional overrides are never overwritten).
 */

import { Inject, Injectable } from '@nestjs/common';
import { UpdateCalendarDataUseCase } from '../../application/calendar';
import { CalendarType } from '@atlas/market-data';
import { IngestionJobType, JobExecutionContext, JobExecutionResult } from '../job-types';
import { IngestionJobHandler, completedResult, failureResult } from './job-handler';

function yearFromPeriod(period: string): number {
  const match = /^(\d{4})/.exec(period);
  if (!match) throw new Error(`Invalid calendar period '${period}'. Expected YYYY.`);
  return Number(match[1]);
}

async function refreshCalendar(
  useCase: UpdateCalendarDataUseCase,
  calendarType: CalendarType,
  ctx: JobExecutionContext,
): Promise<JobExecutionResult> {
  try {
    const year = yearFromPeriod(ctx.scheduledFor);
    const current = await useCase.execute({ calendarType, year, preserveExisting: true });
    const next = await useCase.execute({ calendarType, year: year + 1, preserveExisting: true });

    return completedResult('SUCCESS', {
      itemsRequested: 2,
      itemsFetched: current.totalDays + next.totalDays,
      itemsInserted: current.inserted + next.inserted,
      itemsRevised: 0,
      itemsUnchanged: current.updated + next.updated,
      itemsFailed: 0,
      provider: 'OFFICIAL_BRAZILIAN_CALENDAR',
      target: `${year},${year + 1}`,
      metadata: { calendarType },
    });
  } catch (error: unknown) {
    return failureResult(ctx, error, 'EXECUTION.UNEXPECTED_ERROR');
  }
}

@Injectable()
export class CalendarB3RefreshJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'CALENDAR_B3_REFRESH';

  constructor(
    @Inject(UpdateCalendarDataUseCase) private readonly updateCalendar: UpdateCalendarDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    return refreshCalendar(this.updateCalendar, 'B3_TRADING', ctx);
  }
}

@Injectable()
export class CalendarBankingRefreshJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'CALENDAR_BANKING_REFRESH';

  constructor(
    @Inject(UpdateCalendarDataUseCase) private readonly updateCalendar: UpdateCalendarDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    return refreshCalendar(this.updateCalendar, 'BANKING', ctx);
  }
}
