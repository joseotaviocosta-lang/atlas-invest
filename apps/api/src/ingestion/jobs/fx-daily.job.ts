/**
 * Phase 5E (R3-B) - FX_USD_BRL_DAILY and FX_EUR_BRL_DAILY.
 *
 * BANKING calendar gate; the existing BCB/PTAX use case is reused. No weekend
 * synthetic rows, no identity rate, no live provider read from a user GET route.
 */

import { Inject, Injectable } from '@nestjs/common';
import { CalendarResolutionService } from '../../application/calendar';
import { UpdateFxDataUseCase } from '../../application/fx';
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

function mapFxReceipt(
  receipt: Awaited<ReturnType<UpdateFxDataUseCase['execute']>>,
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
      errorCode: 'FX.PROVIDER_UNAVAILABLE',
      errorMessage:
        receipt.providerErrors[0] ??
        `FX ${receipt.baseCurrency}/${receipt.quoteCurrency} ingestion failed.`,
    });
  }

  if (itemsFailed > 0) {
    return completedResult('PARTIAL', {
      ...base,
      metadata: {
        pair: `${receipt.baseCurrency}/${receipt.quoteCurrency}`,
      },
    });
  }

  return completedResult('SUCCESS', {
    ...base,
    metadata: {
      pair: `${receipt.baseCurrency}/${receipt.quoteCurrency}`,
    },
  });
}

@Injectable()
export class FxUsdBrlDailyJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'FX_USD_BRL_DAILY';

  constructor(
    @Inject(CalendarResolutionService)
    private readonly calendar: CalendarResolutionService,
    @Inject(UpdateFxDataUseCase)
    private readonly updateFx: UpdateFxDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    return executeFx(this.calendar, this.updateFx, ctx, 'USD');
  }
}

@Injectable()
export class FxEurBrlDailyJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'FX_EUR_BRL_DAILY';

  constructor(
    @Inject(CalendarResolutionService)
    private readonly calendar: CalendarResolutionService,
    @Inject(UpdateFxDataUseCase)
    private readonly updateFx: UpdateFxDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    return executeFx(this.calendar, this.updateFx, ctx, 'EUR');
  }
}

async function executeFx(
  calendar: CalendarResolutionService,
  updateFx: UpdateFxDataUseCase,
  ctx: JobExecutionContext,
  baseCurrency: 'USD' | 'EUR',
): Promise<JobExecutionResult> {
  const date = civilDateFromContext(ctx);
  if (!(await calendar.isBankingDay(date))) {
    return skippedResult(
      'SKIPPED_BANKING_CLOSED',
      `BANKING calendar closed on ${ctx.targetPeriod}`,
    );
  }

  try {
    const receipt = await updateFx.execute({
      baseCurrency,
      quoteCurrency: 'BRL',
      from: shiftCivilDate(date, -LOOKBACK_DAYS).toString(),
      to: date.toString(),
    });
    return mapFxReceipt(receipt, ctx.targetPeriod);
  } catch (error: unknown) {
    return failureResult(ctx, error, 'FX.PROVIDER_UNAVAILABLE');
  }
}
