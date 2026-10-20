/**
 * Phase 5F (I1) - Deterministic coverage planner (persisted-only, zero provider calls).
 *
 * Reuses Phase 5D classification semantics (`classifyObservationStatus`):
 * only `DATA_GAP` is normally eligible for observation backfill.
 * `CLOSED_DAY` / `NOT_PUBLISHED_YET` are never eligible;
 * `CALENDAR_COVERAGE_MISSING` blocks observation planning for that period
 * (calendar backfill must run first).
 *
 * Civil-date handling is explicit and timezone-free: all inputs/outputs are
 * `YYYY-MM-DD` civil strings (months `YYYY-MM`, years `YYYY` only inside the
 * IPCA/calendar branches). No `Date.now()` inside pure helpers; the current
 * civil date is injected (`todayIso`) so tests are deterministic.
 */

import { Inject, Injectable } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import {
  IBenchmarkObservationRepository,
  ICalendarRepository,
  IFxObservationRepository,
  IMacroRepository,
  IMarketQuoteRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  BENCHMARK_OBSERVATION_REPOSITORY,
  CALENDAR_REPOSITORY,
  FX_OBSERVATION_REPOSITORY,
  MACRO_REPOSITORY,
  MARKET_QUOTE_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { IIngestionPortfolioDirectory } from '../jobs/portfolio-directory';
import { INGESTION_PORTFOLIO_DIRECTORY } from '../tokens';
import { assertValidTargetPeriod, getPeriodGranularity, IngestionJobType } from '../job-types';
import {
  BACKFILL_DOMAINS,
  BACKFILL_JOB_TYPE_BY_DOMAIN,
  BACKFILL_LARGE_PLAN_PERIODS,
  BACKFILL_MAX_RANGES,
  assertValidBackfillDomain,
  BackfillDomain,
  BackfillPlan,
  BackfillSkippedPeriod,
  BackfillWindow,
} from './backfill-types';

export interface CoveragePlanInput {
  readonly domain: BackfillDomain | string;
  readonly from: string;
  readonly to: string;
  /** Injected civil today (YYYY-MM-DD) for NOT_PUBLISHED_YET decisions. */
  readonly todayIso?: string;
}

export interface PlannerRepositories {
  readonly calendar: {
    findDay(calendarType: string, date: LocalDate): Promise<{ isOpen: boolean } | null>;
    getCoverage(
      calendarType: string,
    ): Promise<{ minDate: LocalDate | null; maxDate: LocalDate | null }>;
  };
  readonly benchmark: {
    findObservation(benchmarkId: string, referenceDate: LocalDate): Promise<unknown | null>;
  };
  readonly fx: {
    findObservation(base: string, quote: string, date: LocalDate): Promise<unknown | null>;
  };
  readonly macro: {
    findObservations(seriesId: string, from: LocalDate, to: LocalDate): Promise<unknown[]>;
  };
  readonly marketQuote: {
    findByAssetDate(assetId: string, tradingDate: LocalDate): Promise<unknown | null>;
  };
  readonly universe: {
    /** Distinct assetIds with transactions in [from, to] (union across portfolios). */
    listTransactedAssetIds(from: LocalDate, to: LocalDate): Promise<string[]>;
  };
}

const DAY_MS = 86_400_000;

function parseCivilDate(value: string, field: string): LocalDate {
  let parsed: LocalDate;
  try {
    parsed = LocalDate.from(value);
  } catch {
    throw new Error(`Invalid ${field} '${value}'. Expected a real civil date YYYY-MM-DD.`);
  }
  return parsed;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const utc = Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS;
  const shifted = new Date(utc);
  return LocalDate.fromParts(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

function daysBetweenInclusive(from: LocalDate, to: LocalDate): number {
  return Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) /
      DAY_MS,
  );
}

function toMonthKey(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`;
}

function monthRangeFromKey(monthKey: string): { first: LocalDate; last: LocalDate } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) throw new Error(`Invalid month key '${monthKey}'. Expected YYYY-MM.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    first: LocalDate.fromParts(year, month, 1),
    last: LocalDate.fromParts(year, month, lastDay),
  };
}

function calendarTypeFor(domain: BackfillDomain): 'B3_TRADING' | 'BANKING' | null {
  switch (domain) {
    case 'MARKET_QUOTES':
    case 'BENCHMARK_IBOV':
      return 'B3_TRADING';
    case 'BENCHMARK_CDI':
    case 'FX_USD_BRL':
    case 'FX_EUR_BRL':
    case 'MACRO_SELIC_EFFECTIVE':
      return 'BANKING';
    default:
      return null;
  }
}

/** Compact ascending eligible periods into contiguous windows (daily periods). */
function compactDailyPeriods(periods: readonly string[]): BackfillWindow[] {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort();
  const windows: BackfillWindow[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  let acc: string[] = [prev];
  for (const current of sorted.slice(1)) {
    const prevDate = LocalDate.from(prev);
    const expectedNext = addDays(prevDate, 1).toString();
    if (current === expectedNext) {
      acc.push(current);
      prev = current;
    } else {
      windows.push({ from: start, to: prev, periods: [...acc] });
      start = current;
      prev = current;
      acc = [current];
    }
  }
  windows.push({ from: start, to: prev, periods: [...acc] });
  return windows;
}

function compactGenericPeriods(periods: readonly string[]): BackfillWindow[] {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort();
  return [{ from: sorted[0]!, to: sorted[sorted.length - 1]!, periods: sorted }];
}

export function planBackfillPeriods(
  domain: BackfillDomain,
  eligiblePeriods: readonly string[],
): { windows: BackfillWindow[]; flat: string[] } {
  const flat = [...new Set(eligiblePeriods)].sort();
  const jobType: IngestionJobType = BACKFILL_JOB_TYPE_BY_DOMAIN[domain];
  const granularity = getPeriodGranularity(jobType);
  const windows = granularity === 'DAY' ? compactDailyPeriods(flat) : compactGenericPeriods(flat);
  return { windows, flat };
}

@Injectable()
export class BackfillCoveragePlanner {
  private readonly repos: PlannerRepositories;

  /** Test-only construction from a single fake repositories object. */
  static fromRepositories(repos: PlannerRepositories): BackfillCoveragePlanner {
    const planner = Object.create(BackfillCoveragePlanner.prototype) as BackfillCoveragePlanner;
    (planner as unknown as { repos: PlannerRepositories }).repos = repos;
    return planner;
  }

  constructor(
    @Inject(CALENDAR_REPOSITORY)
    calendars: Pick<ICalendarRepository, 'findDay' | 'getCoverage'>,
    @Inject(BENCHMARK_OBSERVATION_REPOSITORY)
    benchmarks: Pick<IBenchmarkObservationRepository, 'findObservation'>,
    @Inject(FX_OBSERVATION_REPOSITORY)
    fx: Pick<IFxObservationRepository, 'findObservation'>,
    @Inject(MACRO_REPOSITORY)
    macro: Pick<IMacroRepository, 'findObservations'>,
    @Inject(MARKET_QUOTE_REPOSITORY)
    quotes: Pick<IMarketQuoteRepository, 'findByAssetDate'>,
    @Inject(TRANSACTION_REPOSITORY)
    transactions: Pick<ITransactionRepository, 'findByPortfolioId'>,
    @Inject(INGESTION_PORTFOLIO_DIRECTORY)
    portfolios: IIngestionPortfolioDirectory,
  ) {
    this.repos = {
      calendar: {
        findDay: (calendarType: string, date: LocalDate) =>
          calendars.findDay(calendarType as never, date),
        getCoverage: (calendarType: string) => calendars.getCoverage(calendarType as never),
      },
      benchmark: {
        findObservation: (benchmarkId: string, referenceDate: LocalDate) =>
          benchmarks.findObservation(benchmarkId as never, referenceDate),
      },
      fx: {
        findObservation: (base: string, quote: string, date: LocalDate) =>
          fx.findObservation(base as never, quote as never, date),
      },
      macro: {
        findObservations: (seriesId: string, from: LocalDate, to: LocalDate) =>
          macro.findObservations(seriesId as never, from, to),
      },
      marketQuote: {
        findByAssetDate: (assetId: string, tradingDate: LocalDate) =>
          quotes.findByAssetDate(assetId, tradingDate),
      },
      universe: {
        listTransactedAssetIds: async (from: LocalDate, to: LocalDate) => {
          const active = await portfolios.listActive();
          const ids = new Set<string>();
          for (const portfolio of active) {
            const txs = await transactions.findByPortfolioId(portfolio.id);
            for (const tx of txs) {
              const tradeDate = (tx as { tradeDate: LocalDate }).tradeDate;
              const assetId = (tx as { assetId: string | null }).assetId;
              if (!assetId) continue;
              if (tradeDate.compare(from) >= 0 && tradeDate.compare(to) <= 0) {
                ids.add(assetId);
              }
            }
          }
          return [...ids].sort();
        },
      },
    };
  }

  async plan(input: CoveragePlanInput): Promise<BackfillPlan> {
    const domain = assertValidBackfillDomain(input.domain);
    const fromDate = parseCivilDate(input.from, 'from');
    const toDate = parseCivilDate(input.to, 'to');
    if (fromDate.compare(toDate) > 0) {
      throw new Error(`Invalid range: from '${input.from}' must be <= to '${input.to}'.`);
    }
    const todayIso =
      input.todayIso ?? LocalDate.from(new Date().toISOString().slice(0, 10)).toString();
    const today = parseCivilDate(todayIso, 'todayIso');

    const maxDays = BACKFILL_MAX_RANGES[domain].maxDays;
    if (daysBetweenInclusive(fromDate, toDate) + 1 > maxDays) {
      throw new Error(
        `Range ${input.from}..${input.to} exceeds the ${domain} backfill bound of ${maxDays} days. Split the request.`,
      );
    }

    if (domain === 'MACRO_IPCA') return this.planIpcaMonths(domain, fromDate, toDate, today);
    if (domain === 'CALENDAR_B3' || domain === 'CALENDAR_BANKING') {
      return this.planCalendarYears(domain, fromDate, toDate);
    }
    return this.planDaily(domain, fromDate, toDate, today);
  }

  private async planDaily(
    domain: BackfillDomain,
    fromDate: LocalDate,
    toDate: LocalDate,
    today: LocalDate,
  ): Promise<BackfillPlan> {
    const eligible: string[] = [];
    const skipped: BackfillSkippedPeriod[] = [];
    const calendarType = calendarTypeFor(domain);

    let universe: string[] = [];
    if (domain === 'MARKET_QUOTES') {
      universe = await this.repos.universe.listTransactedAssetIds(fromDate, toDate);
      universe.sort();
    }

    const totalDays = daysBetweenInclusive(fromDate, toDate);
    for (let offset = 0; offset <= totalDays; offset += 1) {
      const date = addDays(fromDate, offset);
      const period = date.toString();

      if (date.compare(today) > 0) {
        skipped.push({ targetPeriod: period, reason: 'NOT_PUBLISHED_YET' });
        continue;
      }

      if (calendarType) {
        const coverage = await this.repos.calendar.getCoverage(calendarType);
        const day = await this.repos.calendar.findDay(calendarType, date);
        if (!day || !coverage.minDate || !coverage.maxDate) {
          skipped.push({ targetPeriod: period, reason: 'CALENDAR_COVERAGE_MISSING' });
          continue;
        }
        if (date.compare(coverage.minDate) < 0 || date.compare(coverage.maxDate) > 0) {
          skipped.push({ targetPeriod: period, reason: 'CALENDAR_COVERAGE_MISSING' });
          continue;
        }
        if (!day.isOpen) {
          skipped.push({ targetPeriod: period, reason: 'CLOSED_DAY' });
          continue;
        }
      }

      const hasData = await this.hasDailyData(domain, date, universe);
      if (hasData) {
        skipped.push({ targetPeriod: period, reason: 'ALREADY_COVERED' });
        continue;
      }
      eligible.push(period);
    }

    return this.buildPlan(domain, inputRange(fromDate, toDate), eligible, skipped, universe.length);
  }

  private async planIpcaMonths(
    domain: BackfillDomain,
    fromDate: LocalDate,
    toDate: LocalDate,
    today: LocalDate,
  ): Promise<BackfillPlan> {
    const eligible: string[] = [];
    const skipped: BackfillSkippedPeriod[] = [];
    const currentMonth = toMonthKey(today);
    const months = new Set<string>();
    const totalDays = daysBetweenInclusive(fromDate, toDate);
    for (let offset = 0; offset <= totalDays; offset += 1) {
      months.add(toMonthKey(addDays(fromDate, offset)));
    }
    for (const month of [...months].sort()) {
      if (month >= currentMonth) {
        skipped.push({ targetPeriod: month, reason: 'NOT_PUBLISHED_YET' });
        continue;
      }
      assertValidTargetPeriod('MACRO_IPCA', month);
      const { first, last } = monthRangeFromKey(month);
      const observations = await this.repos.macro.findObservations('IPCA', first, last);
      if (observations.length > 0) {
        skipped.push({ targetPeriod: month, reason: 'ALREADY_COVERED' });
        continue;
      }
      eligible.push(month);
    }
    return this.buildPlan(domain, inputRange(fromDate, toDate), eligible, skipped, 1);
  }

  private async planCalendarYears(
    domain: BackfillDomain,
    fromDate: LocalDate,
    toDate: LocalDate,
  ): Promise<BackfillPlan> {
    const eligible: string[] = [];
    const skipped: BackfillSkippedPeriod[] = [];
    const calendarType = domain === 'CALENDAR_B3' ? 'B3_TRADING' : 'BANKING';
    for (let year = fromDate.year; year <= toDate.year; year += 1) {
      const period = String(year);
      assertValidTargetPeriod(
        domain === 'CALENDAR_B3' ? 'CALENDAR_B3_REFRESH' : 'CALENDAR_BANKING_REFRESH',
        period,
      );
      const yearStart = LocalDate.fromParts(year, 1, 1);
      const yearEnd = LocalDate.fromParts(year, 12, 31);
      const coverage = await this.repos.calendar.getCoverage(calendarType);
      if (!coverage.minDate || !coverage.maxDate) {
        eligible.push(period);
        continue;
      }
      const overlapStart = yearStart.compare(coverage.minDate) > 0 ? yearStart : coverage.minDate;
      const overlapEnd = yearEnd.compare(coverage.maxDate) < 0 ? yearEnd : coverage.maxDate;
      if (overlapStart.compare(overlapEnd) > 0) {
        eligible.push(period);
        continue;
      }
      const expected = daysBetweenInclusive(yearStart, yearEnd) + 1;
      const covered = daysBetweenInclusive(overlapStart, overlapEnd) + 1;
      if (covered >= expected) {
        skipped.push({ targetPeriod: period, reason: 'ALREADY_COVERED' });
      } else {
        eligible.push(period);
      }
    }
    return this.buildPlan(domain, inputRange(fromDate, toDate), eligible, skipped, 1);
  }

  private async hasDailyData(
    domain: BackfillDomain,
    date: LocalDate,
    universe: string[],
  ): Promise<boolean> {
    switch (domain) {
      case 'BENCHMARK_IBOV':
        return (await this.repos.benchmark.findObservation('IBOV', date)) !== null;
      case 'BENCHMARK_CDI':
        return (await this.repos.benchmark.findObservation('CDI', date)) !== null;
      case 'FX_USD_BRL':
        return (await this.repos.fx.findObservation('USD', 'BRL', date)) !== null;
      case 'FX_EUR_BRL':
        return (await this.repos.fx.findObservation('EUR', 'BRL', date)) !== null;
      case 'MACRO_SELIC_TARGET':
        return (await this.repos.macro.findObservations('SELIC_TARGET', date, date)).length > 0;
      case 'MACRO_SELIC_EFFECTIVE':
        return (await this.repos.macro.findObservations('SELIC_EFFECTIVE', date, date)).length > 0;
      case 'MARKET_QUOTES': {
        if (universe.length === 0) return true;
        for (const assetId of universe) {
          const quote = await this.repos.marketQuote.findByAssetDate(assetId, date);
          if (!quote) return false;
        }
        return true;
      }
      default:
        return false;
    }
  }

  private buildPlan(
    domain: BackfillDomain,
    requestedRange: { from: string; to: string },
    eligible: string[],
    skipped: BackfillSkippedPeriod[],
    universeSize: number,
  ): BackfillPlan {
    const jobType = BACKFILL_JOB_TYPE_BY_DOMAIN[domain];
    const { windows, flat } = planBackfillPeriods(domain, eligible);
    void BACKFILL_DOMAINS;
    const assetFactor = domain === 'MARKET_QUOTES' ? Math.max(1, universeSize) : 1;
    return {
      domain,
      jobType,
      requestedRange,
      eligibleWindows: windows,
      eligiblePeriods: flat,
      skippedPeriods: [...skipped].sort((a, b) => (a.targetPeriod < b.targetPeriod ? -1 : 1)),
      estimatedProviderCalls: flat.length * assetFactor,
      requiresConfirmation: flat.length > BACKFILL_LARGE_PLAN_PERIODS,
    };
  }
}

function inputRange(fromDate: LocalDate, toDate: LocalDate): { from: string; to: string } {
  return { from: fromDate.toString(), to: toDate.toString() };
}
