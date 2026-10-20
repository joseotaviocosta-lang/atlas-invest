/**
 * Phase 5G (I1) - Calendar-aware freshness computation (persisted-only).
 *
 * Rules:
 * - Weekend/holiday absence is never stale: expected dates come from the
 *   official calendar (open days only) with a per-family cutoff hour.
 * - IPCA is publication-aware: the current (possibly unpublished) month is
 *   never expected; expected = month-1 (or month-2 before publication day).
 * - SELIC_TARGET is event-driven: any persisted observation is healthy.
 * - Calendars are healthy only with current + next year coverage (next-year
 *   missing near year-end is STALE, not a financial failure).
 */

import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import {
  IBenchmarkObservationRepository,
  ICalendarRepository,
  IFxObservationRepository,
  IMacroRepository,
  IMarketQuoteRepository,
} from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { IJobRepository } from '../job-repository';
import { INGESTION_JOB_REPOSITORY } from '../tokens';
import {
  BENCHMARK_OBSERVATION_REPOSITORY,
  CALENDAR_REPOSITORY,
  FX_OBSERVATION_REPOSITORY,
  MACRO_REPOSITORY,
  MARKET_QUOTE_REPOSITORY,
} from '../../database/tokens';
import {
  DAILY_LAG_DEGRADED_MAX,
  DAILY_LAG_STALE_MAX,
  DataFamily,
  FRESHNESS_CUTOFF_HOUR_DEFAULT,
  FRESHNESS_CUTOFF_HOUR_FX,
  IPCA_PUBLICATION_DAY,
  OperationalFreshnessStatus,
  OperationalReasonCode,
  OperationalState,
} from './operational-state';

export interface FreshnessCalendar {
  findDay(calendarType: string, date: LocalDate): Promise<{ isOpen: boolean } | null>;
  findDays(
    calendarType: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<Array<{ date: LocalDate; isOpen: boolean }>>;
  getCoverage(
    calendarType: string,
  ): Promise<{ minDate: LocalDate | null; maxDate: LocalDate | null }>;
}

export interface FreshnessObservations {
  maxReferenceDate(series: 'IBOV' | 'CDI' | 'USD_BRL' | 'EUR_BRL' | 'IPCA' | 'SELIC_TARGET' | 'SELIC_EFFECTIVE'): Promise<LocalDate | null>;
  maxQuoteDate(): Promise<LocalDate | null>;
}

export interface JobRunLite {
  readonly status: string;
  readonly triggerType: string;
  readonly finishedAt: string;
  readonly startedAt: string;
}

export interface FreshnessJobHistory {
  listRecent(jobType: string, limit: number): Promise<JobRunLite[]>;
}

export interface FreshnessResult {
  readonly source: DataFamily;
  readonly expectedThrough: string | null;
  readonly actualThrough: string | null;
  readonly lagPeriods: number;
  readonly hasData: boolean;
}

const DAY_MS = 86_400_000;

export function saoPauloParts(nowIso: string): { date: LocalDate; hour: number } {
  const now = new Date(nowIso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const date = LocalDate.from(`${get('year')}-${get('month')}-${get('day')}`);
  return { date, hour: Number(get('hour')) % 24 };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS);
  return LocalDate.fromParts(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** Latest open date at or before `asOf` (null when coverage has no open day). */
async function latestOpenOnOrBefore(
  calendar: FreshnessCalendar,
  calendarType: string,
  asOf: LocalDate,
  lookbackDays = 14,
): Promise<LocalDate | null> {
  for (let back = 0; back <= lookbackDays; back += 1) {
    const candidate = addDays(asOf, -back);
    const day = await calendar.findDay(calendarType, candidate);
    if (!day) return null;
    if (day.isOpen) return candidate;
  }
  return null;
}

/** Open dates strictly after `exclusiveFrom` up to and including `inclusiveTo`. */
async function openDatesBetween(
  calendar: FreshnessCalendar,
  calendarType: string,
  exclusiveFrom: LocalDate | null,
  inclusiveTo: LocalDate,
): Promise<LocalDate[]> {
  const from = exclusiveFrom ? addDays(exclusiveFrom, 1) : addDays(inclusiveTo, -400);
  const start = from.compare(addDays(inclusiveTo, -400)) < 0 ? addDays(inclusiveTo, -400) : from;
  if (start.compare(inclusiveTo) > 0) return [];
  const days = await calendar.findDays(calendarType, start, inclusiveTo);
  return days.filter((d) => d.isOpen).map((d) => d.date);
}

function classifyDailyLag(lag: number): { state: OperationalState; reason: OperationalReasonCode } {
  if (lag <= 0) return { state: 'HEALTHY', reason: 'UP_TO_DATE' };
  if (lag <= DAILY_LAG_DEGRADED_MAX) return { state: 'DEGRADED', reason: 'LATEST_DATA_MISSING' };
  if (lag <= DAILY_LAG_STALE_MAX) return { state: 'STALE', reason: 'LATEST_DATA_MISSING' };
  return { state: 'FAILED', reason: 'LATEST_DATA_MISSING' };
}

@Injectable()
export class DataFreshnessService {
  private readonly calendars: FreshnessCalendar;
  private readonly observations: FreshnessObservations;
  private readonly history: FreshnessJobHistory;
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    calendars: Pick<ICalendarRepository, 'findDay' | 'findDays' | 'getCoverage'>,
    @Inject(BENCHMARK_OBSERVATION_REPOSITORY)
    benchmarks: Pick<IBenchmarkObservationRepository, 'getCoverage'>,
    @Inject(FX_OBSERVATION_REPOSITORY)
    fx: Pick<IFxObservationRepository, 'getCoverage'>,
    @Inject(MACRO_REPOSITORY)
    macro: Pick<IMacroRepository, 'getCoverage'>,
    @Inject(MARKET_QUOTE_REPOSITORY)
    quotes: Pick<IMarketQuoteRepository, 'findByAssetDate'>,
    @Inject(INGESTION_JOB_REPOSITORY)
    runs: Pick<IJobRepository, 'listRuns'>,
  ) {
    void quotes;
    this.calendars = {
      findDay: (calendarType: string, date: LocalDate) =>
        calendars.findDay(calendarType as never, date),
      findDays: (calendarType: string, from: LocalDate, to: LocalDate) =>
        calendars.findDays(calendarType as never, from, to),
      getCoverage: (calendarType: string) => calendars.getCoverage(calendarType as never),
    };
    this.observations = {
      maxReferenceDate: async (series) => {
        if (series === 'IBOV' || series === 'CDI') {
          const coverage = await benchmarks.getCoverage(series as never);
          return coverage.lastObservationDate ?? null;
        }
        if (series === 'USD_BRL' || series === 'EUR_BRL') {
          const [base, quote] = series === 'USD_BRL' ? (['USD', 'BRL'] as const) : (['EUR', 'BRL'] as const);
          const coverage = await fx.getCoverage(base as never, quote as never);
          return coverage.lastObservationDate ?? null;
        }
        const coverage = await macro.getCoverage(series as never);
        return coverage.maxReferenceDate ?? null;
      },
      maxQuoteDate: async () => {
        const prisma = getPrismaClient();
        const rows = await prisma.$queryRawUnsafe<Array<{ max: Date | null }>>(
          'SELECT MAX(trading_date) AS max FROM market_quotes',
        );
        const max = rows[0]?.max;
        return max ? LocalDate.from(max.toISOString().slice(0, 10)) : null;
      },
    };
    this.history = {
      listRecent: async (jobType: string, limit: number) => {
        const page = await runs.listRuns({ jobType: jobType as never, limit });
        return page.items.map((r) => ({
          status: r.status,
          triggerType: r.triggerType,
          finishedAt: r.finishedAt,
          startedAt: r.startedAt,
        }));
      },
    };
  }

  async evaluateFamily(
    family: DataFamily,
    jobType: string,
    nowIso: string = new Date().toISOString(),
  ): Promise<OperationalFreshnessStatus> {
    const { date: today, hour } = saoPauloParts(nowIso);
    const recent = await this.history.listRecent(jobType, 20);
    const lastAttempt = recent[0] ?? null;
    const lastSuccess = recent.find((r) => r.status === 'SUCCESS') ?? null;
    const lastSuccessAt = lastSuccess?.finishedAt || lastSuccess?.startedAt || null;
    const lastAttemptAt = lastAttempt?.finishedAt || lastAttempt?.startedAt || null;
    const lastJobStatus = lastAttempt?.status ?? null;

    if (family === 'SELIC_TARGET') {
      const actual = await this.observations.maxReferenceDate('SELIC_TARGET');
      if (!actual) {
        return this.status(family, null, null, null, lastSuccessAt, lastAttemptAt, lastJobStatus, recent.length === 0 ? 'UNKNOWN' : 'FAILED', recent.length === 0 ? 'NO_RUN_HISTORY' : 'LATEST_DATA_MISSING');
      }
      return this.status(family, null, actual.toString(), 0, lastSuccessAt, lastAttemptAt, lastJobStatus ?? 'SUCCESS', 'HEALTHY', 'UP_TO_DATE');
    }

    if (family === 'IPCA') {
      return this.evaluateIpca(family, today, lastSuccessAt, lastAttemptAt, lastJobStatus, recent.length);
    }

    if (family === 'B3_CALENDAR' || family === 'BANKING_CALENDAR') {
      return this.evaluateCalendar(family, today);
    }

    return this.evaluateDaily(family, jobType, today, hour, lastSuccessAt, lastAttemptAt, lastJobStatus, recent.length);
  }

  private async evaluateDaily(
    family: DataFamily,
    _jobType: string,
    today: LocalDate,
    hour: number,
    lastSuccessAt: string | null,
    lastAttemptAt: string | null,
    lastJobStatus: string | null,
    runCount: number,
  ): Promise<OperationalFreshnessStatus> {
    const calendarType = family === 'MARKET_QUOTES' || family === 'IBOV' ? 'B3_TRADING' : 'BANKING';
    const cutoff = family === 'USD_BRL' || family === 'EUR_BRL' ? FRESHNESS_CUTOFF_HOUR_FX : FRESHNESS_CUTOFF_HOUR_DEFAULT;
    const asOf = hour >= cutoff ? today : addDays(today, -1);
    const coverage = await this.calendars.getCoverage(calendarType);
    if (!coverage.minDate || !coverage.maxDate) {
      return this.status(family, null, null, null, lastSuccessAt, lastAttemptAt, lastJobStatus, runCount === 0 ? 'UNKNOWN' : 'FAILED', runCount === 0 ? 'NO_RUN_HISTORY' : 'CALENDAR_COVERAGE_MISSING');
    }
    const expected = await latestOpenOnOrBefore(this.calendars, calendarType, asOf);
    if (!expected) {
      return this.status(family, null, null, null, lastSuccessAt, lastAttemptAt, lastJobStatus, 'FAILED', 'CALENDAR_COVERAGE_MISSING');
    }
    const actual = await this.actualFor(family);
    if (!actual) {
      const lagDays = await openDatesBetween(this.calendars, calendarType, null, expected);
      void lagDays;
      return this.status(family, expected.toString(), null, null, lastSuccessAt, lastAttemptAt, lastJobStatus, runCount === 0 ? 'UNKNOWN' : 'FAILED', runCount === 0 ? 'NO_RUN_HISTORY' : 'LATEST_DATA_MISSING');
    }
    const missing = await openDatesBetween(this.calendars, calendarType, actual, expected);
    const lag = missing.length;
    const { state, reason } = classifyDailyLag(lag);
    return this.status(family, expected.toString(), actual.toString(), lag, lastSuccessAt, lastAttemptAt, lastJobStatus ?? 'SUCCESS', state, reason);
  }

  private async evaluateIpca(
    family: DataFamily,
    today: LocalDate,
    lastSuccessAt: string | null,
    lastAttemptAt: string | null,
    lastJobStatus: string | null,
    runCount: number,
  ): Promise<OperationalFreshnessStatus> {
    const expectedMonth = today.day >= IPCA_PUBLICATION_DAY ? addMonths(today, -1) : addMonths(today, -2);
    const expectedKey = toMonthKey(expectedMonth);
    const actual = await this.observations.maxReferenceDate('IPCA');
    if (!actual) {
      return this.status(family, expectedKey, null, null, lastSuccessAt, lastAttemptAt, lastJobStatus, runCount === 0 ? 'UNKNOWN' : 'FAILED', runCount === 0 ? 'NO_RUN_HISTORY' : 'LATEST_DATA_MISSING');
    }
    const actualKey = toMonthKey(actual);
    const lag = monthDiff(actualKey, expectedKey);
    if (lag <= 0) {
      return this.status(family, expectedKey, actualKey, 0, lastSuccessAt, lastAttemptAt, lastJobStatus ?? 'SUCCESS', 'HEALTHY', 'UP_TO_DATE');
    }
    if (lag === 1) {
      return this.status(family, expectedKey, actualKey, 1, lastSuccessAt, lastAttemptAt, lastJobStatus ?? 'SUCCESS', 'STALE', 'LATEST_DATA_MISSING');
    }
    return this.status(family, expectedKey, actualKey, lag, lastSuccessAt, lastAttemptAt, lastJobStatus ?? 'SUCCESS', 'FAILED', 'LATEST_DATA_MISSING');
  }

  private async evaluateCalendar(
    family: DataFamily,
    today: LocalDate,
  ): Promise<OperationalFreshnessStatus> {
    const calendarType = family === 'B3_CALENDAR' ? 'B3_TRADING' : 'BANKING';
    const coverage = await this.calendars.getCoverage(calendarType);
    const yearEnd = LocalDate.fromParts(today.year, 12, 31).toString();
    const nextYearEnd = LocalDate.fromParts(today.year + 1, 12, 31).toString();
    const max = coverage.maxDate?.toString() ?? null;
    if (!coverage.minDate || !max) {
      return this.status(family, nextYearEnd, null, null, null, null, null, 'FAILED', 'CALENDAR_COVERAGE_MISSING');
    }
    if (max < yearEnd) {
      return this.status(family, nextYearEnd, max, null, null, null, null, 'FAILED', 'CALENDAR_COVERAGE_MISSING');
    }
    if (max < nextYearEnd) {
      const state: OperationalState = today.month >= 10 ? 'STALE' : 'DEGRADED';
      return this.status(family, nextYearEnd, max, null, null, null, null, state, 'CALENDAR_COVERAGE_MISSING');
    }
    return this.status(family, nextYearEnd, max, 0, null, null, null, 'HEALTHY', 'UP_TO_DATE');
  }

  private async actualFor(family: DataFamily): Promise<LocalDate | null> {
    switch (family) {
      case 'MARKET_QUOTES':
        return this.observations.maxQuoteDate();
      case 'IBOV':
        return this.observations.maxReferenceDate('IBOV');
      case 'CDI':
        return this.observations.maxReferenceDate('CDI');
      case 'USD_BRL':
        return this.observations.maxReferenceDate('USD_BRL');
      case 'EUR_BRL':
        return this.observations.maxReferenceDate('EUR_BRL');
      case 'SELIC_EFFECTIVE':
        return this.observations.maxReferenceDate('SELIC_EFFECTIVE');
      default:
        return null;
    }
  }

  private status(
    source: DataFamily,
    expectedThrough: string | null,
    actualThrough: string | null,
    lagPeriods: number | null,
    lastSuccessAt: string | null,
    lastAttemptAt: string | null,
    lastJobStatus: string | null,
    state: OperationalState,
    reasonCode: OperationalFreshnessStatus['reasonCode'],
  ): OperationalFreshnessStatus {
    return { source, state, expectedThrough, actualThrough, lagPeriods, lastSuccessAt, lastAttemptAt, lastJobStatus, reasonCode };
  }
}

function addMonths(date: LocalDate, months: number): LocalDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return LocalDate.fromParts(year, month, Math.min(date.day, lastDay));
}

function toMonthKey(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`;
}

function monthDiff(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  return (ty! - fy!) * 12 + (tm! - fm!);
}
