import { Injectable, Inject } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import {
  CalendarType,
  ObservationClassificationResult,
  classifyObservationStatus,
  addDays,
} from '@atlas/market-data';
import { ICalendarRepository } from '@atlas/database';
import { CALENDAR_REPOSITORY } from '../../database/tokens';

export interface ClassifyObservationParams {
  seriesId: string;
  date: LocalDate;
  asOfDate: LocalDate;
  hasData: boolean;
  calendarType?: CalendarType;
}

@Injectable()
export class CalendarResolutionService {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendarRepository: ICalendarRepository,
  ) {}

  async isTradingDay(date: LocalDate): Promise<boolean> {
    const day = await this.calendarRepository.findDay('B3_TRADING', date);
    return day ? day.isOpen : false;
  }

  async isBankingDay(date: LocalDate): Promise<boolean> {
    const day = await this.calendarRepository.findDay('BANKING', date);
    return day ? day.isOpen : false;
  }

  async previousTradingDay(date: LocalDate, maxLookbackDays = 14): Promise<LocalDate | null> {
    for (let i = 1; i <= maxLookbackDays; i++) {
      const prev = addDays(date, -i);
      const isTrading = await this.isTradingDay(prev);
      if (isTrading) return prev;
    }
    return null;
  }

  async nextTradingDay(date: LocalDate, maxForwardDays = 14): Promise<LocalDate | null> {
    for (let i = 1; i <= maxForwardDays; i++) {
      const next = addDays(date, i);
      const isTrading = await this.isTradingDay(next);
      if (isTrading) return next;
    }
    return null;
  }

  async tradingDaysBetween(from: LocalDate, to: LocalDate): Promise<LocalDate[]> {
    const days = await this.calendarRepository.findDays('B3_TRADING', from, to);
    return days.filter((d) => d.isOpen).map((d) => d.date);
  }

  async classifyObservation(
    params: ClassifyObservationParams,
  ): Promise<ObservationClassificationResult> {
    const calendarType = params.calendarType ?? 'B3_TRADING';
    const day = await this.calendarRepository.findDay(calendarType, params.date);
    const coverage = await this.calendarRepository.getCoverage(calendarType);

    return classifyObservationStatus({
      seriesId: params.seriesId,
      date: params.date,
      asOfDate: params.asOfDate,
      hasData: params.hasData,
      calendarDay: day
        ? {
            calendarType: day.calendarType as CalendarType,
            date: day.date,
            isOpen: day.isOpen,
            reason: day.reason ?? undefined,
            source: day.source,
          }
        : null,
      coverageMin: coverage.minDate ?? undefined,
      coverageMax: coverage.maxDate ?? undefined,
    });
  }
}
