/**
 * Phase 5E (R3-B) - Ingestion module: job core, ten handlers, local scheduler.
 *
 * R3-C adds the privileged admin surface. The scheduler is default-off and the
 * module has no cloud-specific coupling.
 */
import { Module } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import { ApplicationModule } from '../application';
import { CalendarsModule } from '../modules/calendars/calendars.module';
import { FxModule } from '../modules/fx/fx.module';
import { MacroModule } from '../modules/macro/macro.module';
import { PrismaJobRepository } from './job-repository';
import { PrismaJobLock } from './job-lock';
import { JobRunner } from './job-runner';
import { IngestionJobService } from './ingestion-job.service';
import { IngestionJobRegistry } from './jobs/job-registry';
import { PrismaIngestionPortfolioDirectory } from './jobs/portfolio-directory';
import { MarketQuotesDailyJob } from './jobs/market-quotes-daily.job';
import { BenchmarkCdiDailyJob, BenchmarkIbovDailyJob } from './jobs/benchmark-daily.job';
import { FxEurBrlDailyJob, FxUsdBrlDailyJob } from './jobs/fx-daily.job';
import { MacroIpcaJob, MacroSelicEffectiveJob, MacroSelicTargetJob } from './jobs/macro.job';
import { CalendarB3RefreshJob, CalendarBankingRefreshJob } from './jobs/calendar-refresh.job';
import { NodeCronIngestionScheduler } from './scheduler/node-cron-ingestion.scheduler';
import { IngestionSchedulerLifecycle } from './scheduler/ingestion-scheduler.lifecycle';
import {
  INGESTION_JOB_LOCK,
  INGESTION_JOB_REGISTRY,
  INGESTION_JOB_REPOSITORY,
  INGESTION_PORTFOLIO_DIRECTORY,
  INGESTION_SCHEDULER,
} from './tokens';

@Module({
  imports: [ApplicationModule, FxModule, CalendarsModule, MacroModule],
  providers: [
    {
      provide: INGESTION_JOB_REPOSITORY,
      useFactory: () => new PrismaJobRepository(getPrismaClient()),
    },
    {
      provide: INGESTION_JOB_LOCK,
      useFactory: () => new PrismaJobLock(getPrismaClient()),
    },
    JobRunner,
    IngestionJobService,
    IngestionJobRegistry,
    {
      provide: INGESTION_JOB_REGISTRY,
      useExisting: IngestionJobRegistry,
    },
    PrismaIngestionPortfolioDirectory,
    {
      provide: INGESTION_PORTFOLIO_DIRECTORY,
      useExisting: PrismaIngestionPortfolioDirectory,
    },
    MarketQuotesDailyJob,
    BenchmarkIbovDailyJob,
    BenchmarkCdiDailyJob,
    FxUsdBrlDailyJob,
    FxEurBrlDailyJob,
    MacroIpcaJob,
    MacroSelicTargetJob,
    MacroSelicEffectiveJob,
    CalendarB3RefreshJob,
    CalendarBankingRefreshJob,
    NodeCronIngestionScheduler,
    {
      provide: INGESTION_SCHEDULER,
      useExisting: NodeCronIngestionScheduler,
    },
    IngestionSchedulerLifecycle,
  ],
  exports: [
    INGESTION_JOB_REPOSITORY,
    INGESTION_JOB_LOCK,
    INGESTION_SCHEDULER,
    JobRunner,
    IngestionJobService,
    IngestionJobRegistry,
    INGESTION_JOB_REGISTRY,
  ],
})
export class IngestionModule {}
