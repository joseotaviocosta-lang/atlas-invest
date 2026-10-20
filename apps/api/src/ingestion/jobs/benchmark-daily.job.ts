/**
 * Phase 5E (R3-B) - BENCHMARK_IBOV_DAILY and BENCHMARK_CDI_DAILY.
 *
 * IBOV is B3-gated (PRICE_INDEX); CDI is BANKING-gated (RATE_SERIES / SGS 12).
 * Both reuse UpdateBenchmarkDataUseCase and never synthesize rows on closed days.
 */

import { Inject, Injectable } from '@nestjs/common';
import { CalendarResolutionService } from '../../application/calendar';
import { UpdateBenchmarkDataUseCase } from '../../application/benchmark';
import { IngestionJobType, JobExecutionContext, JobExecutionResult } from '../job-types';
import {
  IngestionJobHandler,
  civilDateFromContext,
  completedResult,
  failureResult,
  shiftCivilDate,
  skippedResult,
} from './job-handler';

const LOOKBACK_DAYS = 7;

function mapBenchmarkReceipt(
  receipt: Awaited<ReturnType<UpdateBenchmarkDataUseCase['execute']>>,
  target: string,
): JobExecutionResult {
  const itemsFailed = receipt.providerErrors.length;
  const base = {
    itemsRequested: 1,
    itemsFetched: receipt.observationsFetched,
    itemsInserted: receipt.observationsInserted,
    itemsRevised: receipt.observationsRevised,
    itemsUnchanged: receipt.observationsUnchanged,
    itemsFailed,
    provider: receipt.provider,
    target,
  };

  if (receipt.status === 'FAILED') {
    return completedResult('FAILED', {
      ...base,
      errorCode: 'BENCHMARK.PROVIDER_UNAVAILABLE',
      errorMessage:
        receipt.providerErrors[0] ?? `Benchmark ${receipt.benchmarkId} ingestion failed.`,
    });
  }

  if (itemsFailed > 0) {
    return completedResult('PARTIAL', {
      ...base,
      metadata: { benchmarkId: receipt.benchmarkId },
    });
  }

  return completedResult('SUCCESS', {
    ...base,
    metadata: { benchmarkId: receipt.benchmarkId },
  });
}

@Injectable()
export class BenchmarkIbovDailyJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'BENCHMARK_IBOV_DAILY';

  constructor(
    @Inject(CalendarResolutionService)
    private readonly calendar: CalendarResolutionService,
    @Inject(UpdateBenchmarkDataUseCase)
    private readonly updateBenchmark: UpdateBenchmarkDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    const date = civilDateFromContext(ctx);
    if (!(await this.calendar.isTradingDay(date))) {
      return skippedResult(
        'SKIPPED_MARKET_CLOSED',
        `B3 trading calendar closed on ${ctx.scheduledFor}`,
      );
    }

    try {
      const receipt = await this.updateBenchmark.execute({
        benchmarkId: 'IBOV',
        from: shiftCivilDate(date, -LOOKBACK_DAYS).toString(),
        to: date.toString(),
      });
      return mapBenchmarkReceipt(receipt, ctx.scheduledFor);
    } catch (error: unknown) {
      return failureResult(ctx, error, 'BENCHMARK.PROVIDER_UNAVAILABLE');
    }
  }
}

@Injectable()
export class BenchmarkCdiDailyJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'BENCHMARK_CDI_DAILY';

  constructor(
    @Inject(CalendarResolutionService)
    private readonly calendar: CalendarResolutionService,
    @Inject(UpdateBenchmarkDataUseCase)
    private readonly updateBenchmark: UpdateBenchmarkDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    const date = civilDateFromContext(ctx);
    if (!(await this.calendar.isBankingDay(date))) {
      return skippedResult(
        'SKIPPED_BANKING_CLOSED',
        `BANKING calendar closed on ${ctx.scheduledFor}`,
      );
    }

    try {
      const receipt = await this.updateBenchmark.execute({
        benchmarkId: 'CDI',
        from: shiftCivilDate(date, -LOOKBACK_DAYS).toString(),
        to: date.toString(),
      });
      return mapBenchmarkReceipt(receipt, ctx.scheduledFor);
    } catch (error: unknown) {
      return failureResult(ctx, error, 'BENCHMARK.PROVIDER_UNAVAILABLE');
    }
  }
}
