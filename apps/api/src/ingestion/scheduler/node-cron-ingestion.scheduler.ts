/**
 * Phase 5E (R3-B) - Local node-cron adapter for the vendor-neutral scheduler.
 *
 * This is the only file in the ingestion module that imports node-cron. The
 * scheduler is default-off and every tick still passes through the R3-A
 * PostgreSQL advisory lock, so multiple API instances cannot double-ingest.
 */

import { Inject, Injectable } from '@nestjs/common';
import * as cron from 'node-cron';
import { IngestionJobType } from '../job-types';
import { IngestionJobService } from '../ingestion-job.service';
import { INGESTION_CRON_DEFINITIONS, IIngestionScheduler } from './ingestion-scheduler';

@Injectable()
export class NodeCronIngestionScheduler implements IIngestionScheduler {
  private tasks: cron.ScheduledTask[] = [];

  constructor(@Inject(IngestionJobService) private readonly jobs: IngestionJobService) {}

  start(): void {
    if (this.tasks.length > 0) return;

    for (const definition of INGESTION_CRON_DEFINITIONS) {
      const task = cron.schedule(
        definition.expression,
        () => {
          void this.runScheduled(definition.jobType);
        },
        {
          timezone: definition.timezone,
          name: `atlas-ingestion-${definition.jobType}`,
          noOverlap: true,
        },
      );
      this.tasks.push(task);
    }
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }

  isRunning(): boolean {
    return this.tasks.length > 0;
  }

  scheduledJobTypes(): IngestionJobType[] {
    return INGESTION_CRON_DEFINITIONS.map((definition) => definition.jobType).sort();
  }

  private async runScheduled(jobType: IngestionJobType): Promise<void> {
    try {
      await this.jobs.run(jobType, 'SCHEDULED');
    } catch (error: unknown) {
      // Operational metadata only; never log financial payloads.
      console.error('[Atlas ingestion] scheduled job failed', {
        jobType,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
