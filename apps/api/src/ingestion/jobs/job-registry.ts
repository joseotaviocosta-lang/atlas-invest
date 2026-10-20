/**
 * Phase 5E (R3-B) - Deterministic registry of the ten ingestion job handlers.
 *
 * Registration is explicit: a missing or duplicated job type fails at startup,
 * so scheduler/admin surfaces can never silently run an unregistered key.
 */

import { Inject, Injectable } from '@nestjs/common';
import { INGESTION_JOB_TYPES, IngestionJobType } from '../job-types';
import { IngestionJobHandler } from './job-handler';
import { MarketQuotesDailyJob } from './market-quotes-daily.job';
import { BenchmarkCdiDailyJob, BenchmarkIbovDailyJob } from './benchmark-daily.job';
import { FxEurBrlDailyJob, FxUsdBrlDailyJob } from './fx-daily.job';
import { MacroIpcaJob, MacroSelicEffectiveJob, MacroSelicTargetJob } from './macro.job';
import { CalendarB3RefreshJob, CalendarBankingRefreshJob } from './calendar-refresh.job';

@Injectable()
export class IngestionJobRegistry {
  private readonly handlers = new Map<IngestionJobType, IngestionJobHandler>();

  constructor(
    @Inject(MarketQuotesDailyJob) marketQuotes: MarketQuotesDailyJob,
    @Inject(BenchmarkIbovDailyJob) ibov: BenchmarkIbovDailyJob,
    @Inject(BenchmarkCdiDailyJob) cdi: BenchmarkCdiDailyJob,
    @Inject(FxUsdBrlDailyJob) usdBrl: FxUsdBrlDailyJob,
    @Inject(FxEurBrlDailyJob) eurBrl: FxEurBrlDailyJob,
    @Inject(MacroIpcaJob) ipca: MacroIpcaJob,
    @Inject(MacroSelicTargetJob) selicTarget: MacroSelicTargetJob,
    @Inject(MacroSelicEffectiveJob) selicEffective: MacroSelicEffectiveJob,
    @Inject(CalendarB3RefreshJob) calendarB3: CalendarB3RefreshJob,
    @Inject(CalendarBankingRefreshJob) calendarBanking: CalendarBankingRefreshJob,
  ) {
    for (const handler of [
      marketQuotes,
      ibov,
      cdi,
      usdBrl,
      eurBrl,
      ipca,
      selicTarget,
      selicEffective,
      calendarB3,
      calendarBanking,
    ]) {
      if (this.handlers.has(handler.jobType)) {
        throw new Error(`Duplicate ingestion job handler for '${handler.jobType}'`);
      }
      this.handlers.set(handler.jobType, handler);
    }

    for (const jobType of INGESTION_JOB_TYPES) {
      if (!this.handlers.has(jobType)) {
        throw new Error(`Missing ingestion job handler for '${jobType}'`);
      }
    }
  }

  get(jobType: IngestionJobType): IngestionJobHandler {
    const handler = this.handlers.get(jobType);
    if (!handler) throw new Error(`Unregistered ingestion job type '${jobType}'`);
    return handler;
  }

  jobTypes(): IngestionJobType[] {
    return [...this.handlers.keys()].sort();
  }
}
