/**
 * Phase 5E (R3-B) - Scheduler lifecycle.
 *
 * Default-off: the scheduler starts only when INGESTION_SCHEDULER_ENABLED=true
 * and NODE_ENV is not 'test'. Focused tests instantiate the adapter explicitly.
 */

import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { INGESTION_SCHEDULER } from '../tokens';
import { IIngestionScheduler, isIngestionSchedulerEnabled } from './ingestion-scheduler';

@Injectable()
export class IngestionSchedulerLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(INGESTION_SCHEDULER)
    private readonly scheduler: IIngestionScheduler,
  ) {}

  onModuleInit(): void {
    if (!isIngestionSchedulerEnabled()) return;
    this.scheduler.start();
  }

  onModuleDestroy(): void {
    this.scheduler.stop();
  }
}
