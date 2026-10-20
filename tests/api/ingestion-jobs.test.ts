/**
 * Phase 5E (R3-B) - Ten ingestion jobs and local scheduler.
 *
 * Deterministic, no network, no owner database. Handlers receive fakes; the
 * scheduler adapter is started/stopped explicitly.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  INGESTION_JOB_TYPES,
  IngestionJobType,
  JobExecutionContext,
  JobExecutionResult,
  getPeriodGranularity,
} from '../../apps/api/src/ingestion/job-types';
import { IngestionJobRegistry } from '../../apps/api/src/ingestion/jobs/job-registry';
import { MarketQuotesDailyJob } from '../../apps/api/src/ingestion/jobs/market-quotes-daily.job';
import {
  BenchmarkCdiDailyJob,
  BenchmarkIbovDailyJob,
} from '../../apps/api/src/ingestion/jobs/benchmark-daily.job';
import { FxEurBrlDailyJob, FxUsdBrlDailyJob } from '../../apps/api/src/ingestion/jobs/fx-daily.job';
import {
  MacroIpcaJob,
  MacroSelicEffectiveJob,
  MacroSelicTargetJob,
} from '../../apps/api/src/ingestion/jobs/macro.job';
import {
  CalendarB3RefreshJob,
  CalendarBankingRefreshJob,
} from '../../apps/api/src/ingestion/jobs/calendar-refresh.job';
import { IngestionJobService } from '../../apps/api/src/ingestion/ingestion-job.service';
import { NodeCronIngestionScheduler } from '../../apps/api/src/ingestion/scheduler/node-cron-ingestion.scheduler';
import {
  INGESTION_CRON_DEFINITIONS,
  INGESTION_SCHEDULER_TIMEZONE,
  civilDateInSaoPaulo,
  isIngestionSchedulerEnabled,
  resolveScheduledPeriod,
} from '../../apps/api/src/ingestion/scheduler/ingestion-scheduler';
import { CalendarResolutionService } from '../../apps/api/src/application/calendar';
import { UpdatePortfolioMarketDataUseCase } from '../../apps/api/src/application/valuation';
import { UpdateBenchmarkDataUseCase } from '../../apps/api/src/application/benchmark';
import { UpdateFxDataUseCase } from '../../apps/api/src/application/fx';
import { UpdateMacroDataUseCase } from '../../apps/api/src/application/macro';
import { UpdateCalendarDataUseCase } from '../../apps/api/src/application/calendar';
import { IIngestionPortfolioDirectory } from '../../apps/api/src/ingestion/jobs/portfolio-directory';

function context(jobType: IngestionJobType, targetPeriod: string): JobExecutionContext {
  const granularity = getPeriodGranularity(jobType);
  const scheduledFor =
    granularity === 'DAY'
      ? targetPeriod
      : granularity === 'MONTH'
        ? `${targetPeriod}-01`
        : `${targetPeriod}-01-01`;
  return {
    jobRunId: 'run-test',
    logicalJobKey: `${jobType}:${targetPeriod}`,
    jobType,
    triggerType: 'SCHEDULED',
    targetPeriod,
    targetPeriodGranularity: granularity,
    scheduledFor,
    attempt: 1,
    startedAt: new Date().toISOString(),
  };
}

function fakeHandler(jobType: IngestionJobType) {
  return {
    jobType,
    execute: async (): Promise<JobExecutionResult> => ({
      status: 'SUCCESS',
      finishedAt: new Date().toISOString(),
      durationMs: 1,
    }),
  };
}

function buildRegistry(): IngestionJobRegistry {
  return new IngestionJobRegistry(
    fakeHandler('MARKET_QUOTES_DAILY') as unknown as MarketQuotesDailyJob,
    fakeHandler('BENCHMARK_IBOV_DAILY') as unknown as BenchmarkIbovDailyJob,
    fakeHandler('BENCHMARK_CDI_DAILY') as unknown as BenchmarkCdiDailyJob,
    fakeHandler('FX_USD_BRL_DAILY') as unknown as FxUsdBrlDailyJob,
    fakeHandler('FX_EUR_BRL_DAILY') as unknown as FxEurBrlDailyJob,
    fakeHandler('MACRO_IPCA') as unknown as MacroIpcaJob,
    fakeHandler('MACRO_SELIC_TARGET') as unknown as MacroSelicTargetJob,
    fakeHandler('MACRO_SELIC_EFFECTIVE') as unknown as MacroSelicEffectiveJob,
    fakeHandler('CALENDAR_B3_REFRESH') as unknown as CalendarB3RefreshJob,
    fakeHandler('CALENDAR_BANKING_REFRESH') as unknown as CalendarBankingRefreshJob,
  );
}

const marketReceipt = () => ({
  portfolioId: 'portfolio-1',
  provider: 'TEST',
  requestedAssets: 1,
  resolvedAssets: 1,
  skippedAssets: 0,
  quotesFetched: 1,
  quotesInserted: 1,
  quotesUnchanged: 0,
  quotesRevised: 0,
  authRequiredAssets: [],
  missingAssets: [],
  rateLimitedAssets: [],
  providerErrors: [],
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  status: 'COMPLETED' as const,
});

const benchmarkReceipt = (benchmarkId: 'IBOV' | 'CDI') => ({
  benchmarkId,
  provider: 'TEST',
  from: '2026-10-12',
  to: '2026-10-19',
  observationsFetched: 1,
  observationsInserted: 1,
  observationsUnchanged: 0,
  observationsRevised: 0,
  providerErrors: [],
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  status: 'COMPLETED' as const,
});

const fxReceipt = () => ({
  baseCurrency: 'USD' as const,
  quoteCurrency: 'BRL' as const,
  provider: 'TEST',
  from: '2026-10-12',
  to: '2026-10-19',
  observationsFetched: 1,
  observationsInserted: 1,
  observationsUnchanged: 0,
  observationsRevised: 0,
  providerErrors: [],
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  status: 'COMPLETED' as const,
});

const macroReceipt = (seriesId: 'IPCA' | 'SELIC_TARGET' | 'SELIC_EFFECTIVE', fetched = 1) => ({
  seriesId,
  requestedRange: { from: '2026-09-01', to: '2026-09-30' },
  fetched,
  inserted: fetched,
  unchanged: 0,
  revised: 0,
  failures: 0,
});

describe('Phase 5E R3-B - registration and schedule policy', () => {
  it('registers exactly the ten canonical job types once', () => {
    const registry = buildRegistry();
    expect(registry.jobTypes()).toHaveLength(10);
    expect(registry.jobTypes()).toEqual([...INGESTION_JOB_TYPES].sort());
  });

  it('uses the approved cron baseline and São Paulo timezone', () => {
    expect(INGESTION_CRON_DEFINITIONS).toHaveLength(10);
    expect(
      INGESTION_CRON_DEFINITIONS.every((d) => d.timezone === INGESTION_SCHEDULER_TIMEZONE),
    ).toBe(true);
    const byType = new Map(INGESTION_CRON_DEFINITIONS.map((d) => [d.jobType, d.expression]));
    expect(byType.get('MARKET_QUOTES_DAILY')).toBe('0 19 * * 1-5');
    expect(byType.get('BENCHMARK_IBOV_DAILY')).toBe('0 19 * * 1-5');
    expect(byType.get('BENCHMARK_CDI_DAILY')).toBe('0 19 * * 1-5');
    expect(byType.get('FX_USD_BRL_DAILY')).toBe('0 14 * * 1-5');
    expect(byType.get('FX_EUR_BRL_DAILY')).toBe('0 14 * * 1-5');
    expect(byType.get('MACRO_IPCA')).toBe('0 10 8-12 * *');
    expect(byType.get('MACRO_SELIC_TARGET')).toBe('0 10 * * 1-5');
    expect(byType.get('MACRO_SELIC_EFFECTIVE')).toBe('0 19 * * 1-5');
    expect(byType.get('CALENDAR_B3_REFRESH')).toBe('0 6 1 1 *');
    expect(byType.get('CALENDAR_BANKING_REFRESH')).toBe('0 6 1 1 *');
  });

  it('is default-off and never auto-enables under NODE_ENV=test', () => {
    expect(isIngestionSchedulerEnabled({})).toBe(false);
    expect(isIngestionSchedulerEnabled({ INGESTION_SCHEDULER_ENABLED: 'false' })).toBe(false);
    expect(
      isIngestionSchedulerEnabled({
        INGESTION_SCHEDULER_ENABLED: 'true',
        NODE_ENV: 'test',
      }),
    ).toBe(false);
    expect(
      isIngestionSchedulerEnabled({
        INGESTION_SCHEDULER_ENABLED: 'true',
        NODE_ENV: 'development',
      }),
    ).toBe(true);
  });

  it('resolves periods and São Paulo civil dates deterministically', () => {
    expect(civilDateInSaoPaulo(new Date('2026-10-20T01:00:00Z'))).toBe('2026-10-19');
    expect(resolveScheduledPeriod('MARKET_QUOTES_DAILY', '2026-10-19')).toBe('2026-10-19');
    expect(resolveScheduledPeriod('MACRO_IPCA', '2026-10-19')).toBe('2026-10');
    expect(resolveScheduledPeriod('CALENDAR_B3_REFRESH', '2026-10-19')).toBe('2026');
  });

  it('registers all ten schedules when started explicitly', () => {
    const jobs = { run: vi.fn(async () => undefined) } as unknown as IngestionJobService;
    const scheduler = new NodeCronIngestionScheduler(jobs);
    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.scheduledJobTypes()).toHaveLength(10);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});

describe('Phase 5E R3-B - calendar gates and publication semantics', () => {
  it('MARKET_QUOTES_DAILY performs zero provider calls on a closed B3 day', async () => {
    const calendar = {
      isTradingDay: vi.fn(async () => false),
    } as unknown as CalendarResolutionService;
    const portfolios = {
      listActive: vi.fn(async () => {
        throw new Error('must not list portfolios on a closed day');
      }),
    } as unknown as IIngestionPortfolioDirectory;
    const update = {
      execute: vi.fn(async () => marketReceipt()),
    } as unknown as UpdatePortfolioMarketDataUseCase;

    const job = new MarketQuotesDailyJob(calendar, portfolios, update);
    const result = await job.execute(context('MARKET_QUOTES_DAILY', '2026-10-18'));

    expect(result.status).toBe('SKIPPED_MARKET_CLOSED');
    expect(update.execute).not.toHaveBeenCalled();
    expect(portfolios.listActive).not.toHaveBeenCalled();
  });

  it('BENCHMARK_CDI_DAILY performs zero provider calls on a closed BANKING day', async () => {
    const calendar = {
      isBankingDay: vi.fn(async () => false),
    } as unknown as CalendarResolutionService;
    const update = {
      execute: vi.fn(async () => benchmarkReceipt('CDI')),
    } as unknown as UpdateBenchmarkDataUseCase;

    const job = new BenchmarkCdiDailyJob(calendar, update);
    const result = await job.execute(context('BENCHMARK_CDI_DAILY', '2026-10-18'));

    expect(result.status).toBe('SKIPPED_BANKING_CLOSED');
    expect(update.execute).not.toHaveBeenCalled();
  });

  it('FX jobs perform zero provider calls on a closed BANKING day', async () => {
    const calendar = {
      isBankingDay: vi.fn(async () => false),
    } as unknown as CalendarResolutionService;
    const update = {
      execute: vi.fn(async () => fxReceipt()),
    } as unknown as UpdateFxDataUseCase;

    const usd = await new FxUsdBrlDailyJob(calendar, update).execute(
      context('FX_USD_BRL_DAILY', '2026-10-18'),
    );
    const eur = await new FxEurBrlDailyJob(calendar, update).execute(
      context('FX_EUR_BRL_DAILY', '2026-10-18'),
    );

    expect(usd.status).toBe('SKIPPED_BANKING_CLOSED');
    expect(eur.status).toBe('SKIPPED_BANKING_CLOSED');
    expect(update.execute).not.toHaveBeenCalled();
  });

  it('MACRO_IPCA reports SKIPPED_NOT_PUBLISHED_YET before publication', async () => {
    const update = {
      execute: vi.fn(async () => macroReceipt('IPCA', 0)),
    } as unknown as UpdateMacroDataUseCase;

    const result = await new MacroIpcaJob(update).execute(context('MACRO_IPCA', '2026-10'));

    expect(result.status).toBe('SKIPPED_NOT_PUBLISHED_YET');
    expect(result.itemsFetched ?? 0).toBe(0);
    expect(result.errorCode).toBe('SKIPPED_NOT_PUBLISHED_YET');
  });

  it('MACRO_SELIC_EFFECTIVE is BANKING-gated and uses the existing macro use case', async () => {
    const calendar = {
      isBankingDay: vi.fn(async () => false),
    } as unknown as CalendarResolutionService;
    const update = {
      execute: vi.fn(async () => macroReceipt('SELIC_EFFECTIVE')),
    } as unknown as UpdateMacroDataUseCase;

    const result = await new MacroSelicEffectiveJob(calendar, update).execute(
      context('MACRO_SELIC_EFFECTIVE', '2026-10-18'),
    );

    expect(result.status).toBe('SKIPPED_BANKING_CLOSED');
    expect(update.execute).not.toHaveBeenCalled();
  });
});

describe('Phase 5E R3-B - open-day behavior', () => {
  it('MARKET_QUOTES_DAILY reuses the existing use case per active portfolio', async () => {
    const calendar = {
      isTradingDay: vi.fn(async () => true),
    } as unknown as CalendarResolutionService;
    const portfolios = {
      listActive: vi.fn(async () => [
        { id: 'p1', userId: 'u1' },
        { id: 'p2', userId: 'u2' },
      ]),
    } as unknown as IIngestionPortfolioDirectory;
    const update = {
      execute: vi.fn(async () => marketReceipt()),
    } as unknown as UpdatePortfolioMarketDataUseCase;

    const job = new MarketQuotesDailyJob(calendar, portfolios, update);
    const result = await job.execute(context('MARKET_QUOTES_DAILY', '2026-10-19'));

    expect(result.status).toBe('SUCCESS');
    expect(update.execute).toHaveBeenCalledTimes(2);
    expect(result.itemsRequested).toBe(2);
    expect(result.itemsInserted).toBe(2);
  });

  it('CALENDAR refreshes current and next year without destructive overwrite', async () => {
    const seen: Array<{ year: number; preserveExisting?: boolean; calendarType: string }> = [];
    const update = {
      execute: vi.fn(
        async (params: { year?: number; preserveExisting?: boolean; calendarType: string }) => {
          seen.push(params);
          return {
            calendarType: params.calendarType,
            requestedRange: { from: `${params.year}-01-01`, to: `${params.year}-12-31` },
            source: 'OFFICIAL_BRAZILIAN_CALENDAR',
            inserted: 1,
            updated: 0,
            totalDays: 365,
          };
        },
      ),
    } as unknown as UpdateCalendarDataUseCase;

    const result = await new CalendarB3RefreshJob(update).execute(
      context('CALENDAR_B3_REFRESH', '2027'),
    );

    expect(result.status).toBe('SUCCESS');
    expect(seen.map((s) => s.year)).toEqual([2027, 2028]);
    expect(seen.every((s) => s.preserveExisting === true)).toBe(true);
    expect(seen.every((s) => s.calendarType === 'B3_TRADING')).toBe(true);
  });
});
