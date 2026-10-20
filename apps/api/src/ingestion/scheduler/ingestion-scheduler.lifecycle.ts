/**
 * Phase 5E (R3-B) + 5G - Scheduler lifecycle with readiness gate.
 *
 * Default-off: the scheduler starts only when INGESTION_SCHEDULER_ENABLED=true
 * and NODE_ENV is not 'test'. Focused tests instantiate the adapter explicitly.
 *
 * Phase 5G: when the flag is enabled, the readiness gate runs first. If the
 * environment is NOT_READY (missing config, unreachable DB, insufficient
 * calendar coverage, migrations behind), jobs are never registered and a
 * structured reason is logged. Fail safe, never fail open.
 */

import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { INGESTION_SCHEDULER } from '../tokens';
import { IIngestionScheduler, isIngestionSchedulerEnabled } from './ingestion-scheduler';
import { SchedulerReadinessService } from '../operations/scheduler-readiness.service';

@Injectable()
export class IngestionSchedulerLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(INGESTION_SCHEDULER)
    private readonly scheduler: IIngestionScheduler,
    @Inject(SchedulerReadinessService)
    private readonly readiness: SchedulerReadinessService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isIngestionSchedulerEnabled()) return;
    const verdict = await this.readiness.check();
    if (!verdict.ready) {
      console.error('[Atlas ingestion] scheduler NOT_READY; jobs not started', {
        reasons: verdict.checks.filter((c) => !c.pass).map((c) => `${c.name}:${c.reasonCode}`),
      });
      return;
    }
    this.scheduler.start();
  }

  onModuleDestroy(): void {
    this.scheduler.stop();
  }
}
