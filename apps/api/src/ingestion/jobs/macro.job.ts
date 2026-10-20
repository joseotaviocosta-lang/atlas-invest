/**
 * Phase 5E (R3-B) - MACRO_IPCA, MACRO_SELIC_TARGET and MACRO_SELIC_EFFECTIVE.
 *
 * IPCA is monthly and fails closed before publication (no DATA_GAP).
 * SELIC_TARGET is event-driven; the bounded daily check is idempotent and never
 * creates fake daily observations. SELIC_EFFECTIVE (SGS 1178) is BANKING-gated.
 */

import { Inject, Injectable } from '@nestjs/common';
import { CalendarResolutionService } from '../../application/calendar';
import { UpdateMacroDataUseCase } from '../../application/macro';
import { IngestionJobType, JobExecutionContext, JobExecutionResult } from '../job-types';
import {
  IngestionJobHandler,
  civilDateFromContext,
  completedResult,
  failureResult,
  lastDayOfMonth,
  shiftCivilDate,
  skippedResult,
} from './job-handler';

function normalizeCivilDate(period: string) {
  return period.length === 7 ? `${period}-01` : period;
}

function parseMonth(period: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})/.exec(period);
  if (!match) throw new Error(`Invalid macro period '${period}'. Expected YYYY-MM or YYYY-MM-DD.`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function mapMacroReceipt(
  receipt: Awaited<ReturnType<UpdateMacroDataUseCase['execute']>>,
  target: string,
): JobExecutionResult {
  const base = {
    itemsRequested: 1,
    itemsFetched: receipt.fetched,
    itemsInserted: receipt.inserted,
    itemsRevised: receipt.revised,
    itemsUnchanged: receipt.unchanged,
    itemsFailed: receipt.failures,
    provider: receipt.seriesId,
    target,
  };

  if (receipt.failures > 0) {
    return completedResult('PARTIAL', base);
  }

  return completedResult('SUCCESS', base);
}

@Injectable()
export class MacroIpcaJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'MACRO_IPCA';

  constructor(
    @Inject(UpdateMacroDataUseCase) private readonly updateMacro: UpdateMacroDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    try {
      const { year, month } = parseMonth(ctx.scheduledFor);
      const previousYear = month === 1 ? year - 1 : year;
      const previousMonth = month === 1 ? 12 : month - 1;
      const from = `${previousYear}-${String(previousMonth).padStart(2, '0')}-01`;
      const to = lastDayOfMonth(previousYear, previousMonth).toString();

      const receipt = await this.updateMacro.execute({ seriesId: 'IPCA', from, to });
      if (receipt.fetched === 0) {
        return skippedResult(
          'SKIPPED_NOT_PUBLISHED_YET',
          `IPCA for ${previousYear}-${String(previousMonth).padStart(2, '0')} is not published yet.`,
          { provider: 'IPCA', target: `${previousYear}-${String(previousMonth).padStart(2, '0')}` },
        );
      }
      return mapMacroReceipt(receipt, ctx.scheduledFor);
    } catch (error: unknown) {
      return failureResult(ctx, error, 'MACRO.PROVIDER_UNAVAILABLE');
    }
  }
}

@Injectable()
export class MacroSelicTargetJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'MACRO_SELIC_TARGET';

  constructor(
    @Inject(UpdateMacroDataUseCase) private readonly updateMacro: UpdateMacroDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    try {
      const date = civilDateFromContext({
        ...ctx,
        scheduledFor: normalizeCivilDate(ctx.scheduledFor),
      });
      const receipt = await this.updateMacro.execute({
        seriesId: 'SELIC_TARGET',
        from: shiftCivilDate(date, -30).toString(),
        to: date.toString(),
      });
      // Event-driven series: zero new observations is a successful no-op.
      return mapMacroReceipt(receipt, ctx.scheduledFor);
    } catch (error: unknown) {
      return failureResult(ctx, error, 'MACRO.PROVIDER_UNAVAILABLE');
    }
  }
}

@Injectable()
export class MacroSelicEffectiveJob implements IngestionJobHandler {
  readonly jobType: IngestionJobType = 'MACRO_SELIC_EFFECTIVE';

  constructor(
    @Inject(CalendarResolutionService)
    private readonly calendar: CalendarResolutionService,
    @Inject(UpdateMacroDataUseCase)
    private readonly updateMacro: UpdateMacroDataUseCase,
  ) {}

  async execute(ctx: JobExecutionContext): Promise<JobExecutionResult> {
    const date = civilDateFromContext({
      ...ctx,
      scheduledFor: normalizeCivilDate(ctx.scheduledFor),
    });
    if (!(await this.calendar.isBankingDay(date))) {
      return skippedResult(
        'SKIPPED_BANKING_CLOSED',
        `BANKING calendar closed on ${ctx.scheduledFor}`,
      );
    }

    try {
      const receipt = await this.updateMacro.execute({
        seriesId: 'SELIC_EFFECTIVE',
        from: shiftCivilDate(date, -7).toString(),
        to: date.toString(),
      });
      return mapMacroReceipt(receipt, ctx.scheduledFor);
    } catch (error: unknown) {
      return failureResult(ctx, error, 'MACRO.PROVIDER_UNAVAILABLE');
    }
  }
}
