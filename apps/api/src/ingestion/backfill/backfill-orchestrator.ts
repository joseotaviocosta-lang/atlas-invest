/**
 * Phase 5F (I2) - Backfill orchestrator.
 *
 * Plan (persisted-only) -> sequential per-period execution through the
 * existing `JobRunner` (advisory lock + history + bounded retry) with
 * trigger `BACKFILL` -> post-coverage verification.
 *
 * Concurrency is intentionally sequential (1 period at a time) to bound
 * provider load. Same logical key raced concurrently => one executes, one
 * `SKIPPED_LOCKED` (runner guarantee). Different periods are independent.
 */

import { Inject, Injectable } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import { randomUUID } from 'node:crypto';
import { JobRunner } from '../job-runner';
import { assertValidTargetPeriod, getPeriodGranularity, JobExecutionResult } from '../job-types';
import { civilDateInSaoPaulo } from '../scheduler/ingestion-scheduler';
import { CalendarResolutionService } from '../../application/calendar';
import { UpdateBenchmarkDataUseCase } from '../../application/benchmark';
import { UpdateFxDataUseCase } from '../../application/fx';
import { UpdateMacroDataUseCase } from '../../application/macro';
import { UpdateCalendarDataUseCase } from '../../application/calendar';
import { CalendarType } from '@atlas/market-data';
import { UpdatePortfolioMarketDataUseCase } from '../../application/valuation';
import { IIngestionPortfolioDirectory } from '../jobs/portfolio-directory';
import { INGESTION_PORTFOLIO_DIRECTORY } from '../tokens';
import { completedResult, skippedResult } from '../jobs/job-handler';
import { lastDayOfMonth } from '../jobs/job-handler';
import {
  BACKFILL_MAX_PERIODS_PER_EXECUTION,
  BACKFILL_MAX_WINDOWS_PER_EXECUTION,
  BackfillDomain,
  BackfillExecutionReceipt,
  BackfillWindowResult,
} from './backfill-types';
import { BackfillCoveragePlanner } from './coverage-planner';

export interface BackfillRunInput {
  readonly domain: BackfillDomain;
  readonly from: string;
  readonly to: string;
  readonly confirmLargeBackfill?: boolean;
}

@Injectable()
export class BackfillOrchestrator {
  constructor(
    @Inject(BackfillCoveragePlanner)
    private readonly planner: BackfillCoveragePlanner,
    @Inject(JobRunner)
    private readonly runner: JobRunner,
    @Inject(CalendarResolutionService)
    private readonly calendar: CalendarResolutionService,
    @Inject(UpdateBenchmarkDataUseCase)
    private readonly updateBenchmark: UpdateBenchmarkDataUseCase,
    @Inject(UpdateFxDataUseCase)
    private readonly updateFx: UpdateFxDataUseCase,
    @Inject(UpdateMacroDataUseCase)
    private readonly updateMacro: UpdateMacroDataUseCase,
    @Inject(UpdateCalendarDataUseCase)
    private readonly updateCalendar: UpdateCalendarDataUseCase,
    @Inject(UpdatePortfolioMarketDataUseCase)
    private readonly updateMarketData: UpdatePortfolioMarketDataUseCase,
    @Inject(INGESTION_PORTFOLIO_DIRECTORY)
    private readonly portfolios: IIngestionPortfolioDirectory,
  ) {}

  async execute(input: BackfillRunInput): Promise<BackfillExecutionReceipt> {
    const startedAt = new Date().toISOString();
    const executionId = randomUUID();
    const plan = await this.planner.plan({ domain: input.domain, from: input.from, to: input.to });

    if (plan.requiresConfirmation && input.confirmLargeBackfill !== true) {
      throw new Error(
        `Backfill plan for ${input.domain} covers ${plan.eligiblePeriods.length} periods and requires explicit confirmLargeBackfill=true.`,
      );
    }
    if (plan.eligibleWindows.length > BACKFILL_MAX_WINDOWS_PER_EXECUTION) {
      throw new Error(
        `Backfill plan for ${input.domain} spans ${plan.eligibleWindows.length} windows (max ${BACKFILL_MAX_WINDOWS_PER_EXECUTION}). Narrow the range.`,
      );
    }
    if (plan.eligiblePeriods.length > BACKFILL_MAX_PERIODS_PER_EXECUTION) {
      throw new Error(
        `Backfill plan for ${input.domain} covers ${plan.eligiblePeriods.length} periods (max ${BACKFILL_MAX_PERIODS_PER_EXECUTION}). Narrow the range.`,
      );
    }

    const today = civilDateInSaoPaulo();
    const windows: BackfillWindowResult[] = [];
    const childRunIds: string[] = [];
    let inserted = 0;
    let revised = 0;
    let unchanged = 0;
    let failed = 0;
    let succeeded = 0;
    let failedPeriods = 0;

    for (const window of plan.eligibleWindows) {
      let windowInserted = 0;
      let windowRevised = 0;
      let windowUnchanged = 0;
      let windowFailed = 0;
      let windowStatus: BackfillWindowResult['status'] = 'SUCCESS';
      const windowChildIds: string[] = [];

      for (const period of window.periods) {
        const receipt = await this.runner.run({
          jobType: plan.jobType,
          triggerType: 'BACKFILL',
          targetPeriod: period,
          targetPeriodGranularity: getPeriodGranularity(plan.jobType),
          scheduledFor: today,
          execute: () => this.executePeriod(input.domain, period),
          maxAttempts: 3,
        });
        windowChildIds.push(receipt.jobRunId);
        childRunIds.push(receipt.jobRunId);
        windowInserted += receipt.itemsInserted ?? 0;
        windowRevised += receipt.itemsRevised ?? 0;
        windowUnchanged += receipt.itemsUnchanged ?? 0;
        windowFailed += receipt.itemsFailed ?? 0;
        if (receipt.status === 'SUCCESS') succeeded += 1;
        else if (receipt.status === 'SKIPPED_LOCKED') {
          windowStatus = windowStatus === 'SUCCESS' ? 'SKIPPED_LOCKED' : windowStatus;
          succeeded += 1;
        } else if (receipt.status === 'PARTIAL') {
          windowStatus = 'PARTIAL';
          succeeded += 1;
        } else {
          windowStatus = 'FAILED';
          failedPeriods += 1;
        }
      }

      inserted += windowInserted;
      revised += windowRevised;
      unchanged += windowUnchanged;
      failed += windowFailed;
      windows.push({
        window,
        status: windowStatus,
        childRunIds: windowChildIds,
        inserted: windowInserted,
        revised: windowRevised,
        unchanged: windowUnchanged,
        failed: windowFailed,
      });
    }

    const remaining = await this.remainingGaps(input.domain, input.from, input.to);
    const finishedAt = new Date().toISOString();
    const status =
      failedPeriods === 0 && windows.every((w) => w.status === 'SUCCESS')
        ? 'SUCCESS'
        : succeeded > 0 && failedPeriods > 0
          ? 'PARTIAL'
          : windows.length === 0
            ? 'SUCCESS'
            : windows.every((w) => w.status === 'SKIPPED_LOCKED')
              ? 'SKIPPED_LOCKED'
              : failedPeriods > 0 && succeeded === 0
                ? 'FAILED'
                : 'PARTIAL';

    return {
      executionId,
      domain: input.domain,
      jobType: plan.jobType,
      requestedRange: plan.requestedRange,
      triggerType: 'BACKFILL',
      windowsPlanned: plan.eligibleWindows.length,
      windowsCompleted: windows.filter((w) => w.status === 'SUCCESS').length,
      windowsFailed: windows.filter((w) => w.status === 'FAILED').length,
      periodsEligible: plan.eligiblePeriods.length,
      periodsSucceeded: succeeded,
      periodsFailed: failedPeriods,
      inserted,
      revised,
      unchanged,
      failed,
      remainingGaps: remaining,
      status,
      childRunIds,
      windows,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    };
  }

  private async remainingGaps(domain: BackfillDomain, from: string, to: string): Promise<number> {
    const replan = await this.planner.plan({ domain, from, to });
    return replan.eligiblePeriods.length;
  }

  private async executePeriod(domain: BackfillDomain, period: string): Promise<JobExecutionResult> {
    assertValidTargetPeriod(BACKFILL_JOBTYPE[domain], period);
    switch (domain) {
      case 'BENCHMARK_IBOV':
        return this.executeBenchmark('IBOV', period, 'B3_TRADING');
      case 'BENCHMARK_CDI':
        return this.executeBenchmark('CDI', period, 'BANKING');
      case 'FX_USD_BRL':
        return this.executeFx('USD', period);
      case 'FX_EUR_BRL':
        return this.executeFx('EUR', period);
      case 'MACRO_IPCA':
        return this.executeIpca(period);
      case 'MACRO_SELIC_TARGET':
        return this.executeSelicTarget(period);
      case 'MACRO_SELIC_EFFECTIVE':
        return this.executeSelicEffective(period);
      case 'CALENDAR_B3':
        return this.executeCalendar('B3_TRADING', period);
      case 'CALENDAR_BANKING':
        return this.executeCalendar('BANKING', period);
      case 'MARKET_QUOTES':
        return this.executeMarket(period);
      default:
        throw new Error(`Unsupported backfill domain '${domain}'.`);
    }
  }

  private async executeBenchmark(
    benchmarkId: 'IBOV' | 'CDI',
    period: string,
    calendar: 'B3_TRADING' | 'BANKING',
  ): Promise<JobExecutionResult> {
    const date = LocalDate.from(period);
    const isOpen =
      calendar === 'B3_TRADING'
        ? await this.calendar.isTradingDay(date)
        : await this.calendar.isBankingDay(date);
    if (!isOpen) {
      return skippedResult(
        calendar === 'B3_TRADING' ? 'SKIPPED_MARKET_CLOSED' : 'SKIPPED_BANKING_CLOSED',
        `${calendar} calendar closed on ${period}`,
        { target: period },
      );
    }
    const receipt = await this.updateBenchmark.execute({ benchmarkId, from: period, to: period });
    return this.toResult(receipt, period);
  }

  private async executeFx(base: 'USD' | 'EUR', period: string): Promise<JobExecutionResult> {
    const date = LocalDate.from(period);
    if (!(await this.calendar.isBankingDay(date))) {
      return skippedResult('SKIPPED_BANKING_CLOSED', `BANKING calendar closed on ${period}`, {
        target: period,
      });
    }
    const receipt = await this.updateFx.execute({
      baseCurrency: base,
      quoteCurrency: 'BRL',
      from: period,
      to: period,
    });
    return this.toResult(receipt, period);
  }

  private async executeIpca(period: string): Promise<JobExecutionResult> {
    const [year, month] = period.split('-').map(Number);
    const lastDay = lastDayOfMonth(year!, month!).toString();
    const receipt = await this.updateMacro.execute({
      seriesId: 'IPCA',
      from: `${period}-01`,
      to: lastDay,
    });
    if (receipt.fetched === 0) {
      return skippedResult(
        'SKIPPED_NOT_PUBLISHED_YET',
        `IPCA for ${period} is not published yet.`,
        {
          provider: 'IPCA',
          target: period,
        },
      );
    }
    return completedResult(receipt.failures > 0 ? 'PARTIAL' : 'SUCCESS', {
      itemsRequested: 1,
      itemsFetched: receipt.fetched,
      itemsInserted: receipt.inserted,
      itemsRevised: receipt.revised,
      itemsUnchanged: receipt.unchanged,
      itemsFailed: receipt.failures,
      provider: receipt.seriesId,
      target: period,
    });
  }

  private async executeSelicTarget(period: string): Promise<JobExecutionResult> {
    const receipt = await this.updateMacro.execute({
      seriesId: 'SELIC_TARGET',
      from: period,
      to: period,
    });
    return completedResult('SUCCESS', {
      itemsRequested: 1,
      itemsFetched: receipt.fetched,
      itemsInserted: receipt.inserted,
      itemsRevised: receipt.revised,
      itemsUnchanged: receipt.unchanged,
      itemsFailed: receipt.failures,
      provider: receipt.seriesId,
      target: period,
    });
  }

  private async executeSelicEffective(period: string): Promise<JobExecutionResult> {
    const date = LocalDate.from(period);
    if (!(await this.calendar.isBankingDay(date))) {
      return skippedResult('SKIPPED_BANKING_CLOSED', `BANKING calendar closed on ${period}`, {
        target: period,
      });
    }
    const receipt = await this.updateMacro.execute({
      seriesId: 'SELIC_EFFECTIVE',
      from: period,
      to: period,
    });
    return completedResult('SUCCESS', {
      itemsRequested: 1,
      itemsFetched: receipt.fetched,
      itemsInserted: receipt.inserted,
      itemsRevised: receipt.revised,
      itemsUnchanged: receipt.unchanged,
      itemsFailed: receipt.failures,
      provider: receipt.seriesId,
      target: period,
    });
  }

  private async executeCalendar(
    calendarType: CalendarType,
    period: string,
  ): Promise<JobExecutionResult> {
    const year = Number(period);
    const current = await this.updateCalendar.execute({
      calendarType,
      year,
      preserveExisting: true,
    });
    return completedResult('SUCCESS', {
      itemsRequested: current.totalDays,
      itemsFetched: current.totalDays,
      itemsInserted: current.inserted,
      itemsRevised: 0,
      itemsUnchanged: current.updated,
      itemsFailed: 0,
      provider: 'OFFICIAL_BRAZILIAN_CALENDAR',
      target: period,
      metadata: { calendarType },
    });
  }

  private async executeMarket(period: string): Promise<JobExecutionResult> {
    const date = LocalDate.from(period);
    if (!(await this.calendar.isTradingDay(date))) {
      return skippedResult('SKIPPED_MARKET_CLOSED', `B3 trading calendar closed on ${period}`, {
        target: period,
      });
    }
    const active = await this.portfolios.listActive();
    let requested = 0;
    let fetched = 0;
    let inserted = 0;
    let revised = 0;
    let unchanged = 0;
    let failed = 0;
    for (const portfolio of active) {
      try {
        const receipt = await this.updateMarketData.execute({
          portfolioId: portfolio.id,
          userId: portfolio.userId,
          from: period,
          to: period,
        });
        requested += receipt.requestedAssets;
        fetched += receipt.quotesFetched;
        inserted += receipt.quotesInserted;
        revised += receipt.quotesRevised;
        unchanged += receipt.quotesUnchanged;
        failed +=
          receipt.providerErrors.length +
          receipt.authRequiredAssets.length +
          receipt.missingAssets.length +
          receipt.rateLimitedAssets.length;
      } catch {
        failed += 1;
      }
    }
    if (requested === 0) {
      return completedResult('SUCCESS', {
        itemsRequested: 0,
        itemsFetched: 0,
        itemsFailed: 0,
        provider: 'MARKET_DATA',
        target: period,
        metadata: { portfolios: active.length },
      });
    }
    if (failed > 0 && inserted + revised + unchanged === 0) {
      return completedResult('FAILED', {
        itemsRequested: requested,
        itemsFetched: fetched,
        itemsInserted: inserted,
        itemsFailed: failed,
        provider: 'MARKET_DATA',
        target: period,
        errorCode: 'MARKET_DATA.PROVIDER_UNAVAILABLE',
        errorMessage: `Market backfill for ${period} failed on all portfolios.`,
      });
    }
    return completedResult(failed > 0 ? 'PARTIAL' : 'SUCCESS', {
      itemsRequested: requested,
      itemsFetched: fetched,
      itemsInserted: inserted,
      itemsRevised: revised,
      itemsUnchanged: unchanged,
      itemsFailed: failed,
      provider: 'MARKET_DATA',
      target: period,
      metadata: { portfolios: active.length },
    });
  }

  private toResult(
    receipt: {
      observationsFetched: number;
      observationsInserted: number;
      observationsUnchanged: number;
      observationsRevised: number;
      providerErrors: string[];
      provider: string;
      status: string;
    },
    period: string,
  ): JobExecutionResult {
    const failed = receipt.providerErrors.length;
    if (receipt.status === 'FAILED') {
      return completedResult('FAILED', {
        itemsRequested: 1,
        itemsFetched: receipt.observationsFetched,
        itemsInserted: receipt.observationsInserted,
        itemsFailed: Math.max(1, failed),
        provider: receipt.provider,
        target: period,
        errorCode: 'BENCHMARK.PROVIDER_UNAVAILABLE',
        errorMessage: receipt.providerErrors[0] ?? `Backfill for ${period} failed.`,
      });
    }
    if (failed > 0) {
      return completedResult('PARTIAL', {
        itemsRequested: 1,
        itemsFetched: receipt.observationsFetched,
        itemsInserted: receipt.observationsInserted,
        itemsRevised: receipt.observationsRevised,
        itemsUnchanged: receipt.observationsUnchanged,
        itemsFailed: failed,
        provider: receipt.provider,
        target: period,
      });
    }
    return completedResult('SUCCESS', {
      itemsRequested: 1,
      itemsFetched: receipt.observationsFetched,
      itemsInserted: receipt.observationsInserted,
      itemsRevised: receipt.observationsRevised,
      itemsUnchanged: receipt.observationsUnchanged,
      itemsFailed: 0,
      provider: receipt.provider,
      target: period,
    });
  }
}

const BACKFILL_JOBTYPE: Record<BackfillDomain, Parameters<typeof assertValidTargetPeriod>[0]> = {
  MARKET_QUOTES: 'MARKET_QUOTES_DAILY',
  BENCHMARK_IBOV: 'BENCHMARK_IBOV_DAILY',
  BENCHMARK_CDI: 'BENCHMARK_CDI_DAILY',
  FX_USD_BRL: 'FX_USD_BRL_DAILY',
  FX_EUR_BRL: 'FX_EUR_BRL_DAILY',
  MACRO_IPCA: 'MACRO_IPCA',
  MACRO_SELIC_TARGET: 'MACRO_SELIC_TARGET',
  MACRO_SELIC_EFFECTIVE: 'MACRO_SELIC_EFFECTIVE',
  CALENDAR_B3: 'CALENDAR_B3_REFRESH',
  CALENDAR_BANKING: 'CALENDAR_BANKING_REFRESH',
};
