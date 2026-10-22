import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as cron from 'node-cron';
import { IntegrationSchedulerService, IntegrationWorkerService } from '../../application/imports';

/**
 * Phase 5P-A — local node-cron adapter for the integration scheduler.
 *
 * Default-off: the tick runs only when INTEGRATION_SCHEDULER_ENABLED=true
 * and NODE_ENV is not 'test'. Every tick uses an explicit instant (no
 * hidden clock) and drains a bounded number of claimed jobs. Only safe
 * metadata is logged (counts and ids, never payloads or secrets).
 *
 * This is the only file in the imports surface that imports node-cron.
 */
@Injectable()
export class NodeCronIntegrationScheduler implements OnModuleInit, OnModuleDestroy {
  private task: cron.ScheduledTask | null = null;

  constructor(
    @Inject(IntegrationSchedulerService)
    private readonly planner: IntegrationSchedulerService,
    @Inject(IntegrationWorkerService)
    private readonly worker: IntegrationWorkerService,
  ) {}

  static isEnabled(): boolean {
    return process.env.INTEGRATION_SCHEDULER_ENABLED === 'true' && process.env.NODE_ENV !== 'test';
  }

  onModuleInit(): void {
    if (!NodeCronIntegrationScheduler.isEnabled()) return;
    if (this.task) return;
    this.task = cron.schedule(
      '* * * * *',
      () => {
        void this.tickOnce();
      },
      {
        timezone: 'America/Sao_Paulo',
        name: 'atlas-integration-scheduler',
        noOverlap: true,
      },
    );
  }

  onModuleDestroy(): void {
    this.task?.stop();
    this.task = null;
  }

  isRunning(): boolean {
    return this.task !== null;
  }

  private async tickOnce(): Promise<void> {
    const now = new Date();
    try {
      const planned = await this.planner.tick(now);
      let drained = 0;
      for (let guard = 0; guard < 20; guard += 1) {
        const outcome = await this.worker.executeNext(new Date());
        if (!outcome.claimed) break;
        drained += 1;
      }
      console.info(
        `[Atlas integration] scheduler tick due=${planned.due} enqueued=${planned.enqueued} skippedOverlap=${planned.skippedOverlap} drained=${drained}`,
      );
    } catch (error: unknown) {
      console.error(
        '[Atlas integration] scheduler tick failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
