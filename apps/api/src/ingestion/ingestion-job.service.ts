/**
 * Phase 5E (R3-B/C) - Application entry point for running an ingestion job.
 *
 * Resolves the deterministic period, delegates to the registered handler and
 * the R3-A runner (advisory lock + history). Scheduler and admin API share this
 * exact path; neither can bypass locking or validation.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  assertValidExecutionDate,
  assertValidTargetPeriod,
  buildLogicalJobKey,
  getPeriodGranularity,
  IngestionJobType,
  JobReceipt,
  TriggerType,
} from './job-types';
import { JobRunner, RunJobInput } from './job-runner';
import { IJobRepository, ListRunsInput, ListRunsResult } from './job-repository';
import { INGESTION_JOB_REGISTRY, INGESTION_JOB_REPOSITORY } from './tokens';
import { IngestionJobRegistry } from './jobs/job-registry';
import { civilDateInSaoPaulo, resolveTargetPeriod } from './scheduler/ingestion-scheduler';

export interface RunIngestionJobOptions {
  maxAttempts?: number;
  backoffBaseMs?: number;
  sleep?: RunJobInput['sleep'];
}

@Injectable()
export class IngestionJobService {
  constructor(
    @Inject(INGESTION_JOB_REGISTRY)
    private readonly registry: IngestionJobRegistry,
    @Inject(JobRunner)
    private readonly runner: JobRunner,
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly repository: IJobRepository,
  ) {}

  async run(
    jobType: IngestionJobType,
    triggerType: TriggerType,
    civilDate: string = civilDateInSaoPaulo(),
    options: RunIngestionJobOptions = {},
  ): Promise<JobReceipt> {
    assertValidExecutionDate(civilDate);
    const targetPeriod = resolveTargetPeriod(jobType, civilDate);
    const targetPeriodGranularity = getPeriodGranularity(jobType);
    assertValidTargetPeriod(jobType, targetPeriod);
    const handler = this.registry.get(jobType);

    return this.runner.run({
      jobType,
      triggerType,
      targetPeriod,
      targetPeriodGranularity,
      scheduledFor: civilDate,
      execute: (ctx) => handler.execute(ctx),
      maxAttempts: options.maxAttempts,
      backoffBaseMs: options.backoffBaseMs,
      sleep: options.sleep,
    });
  }

  logicalKey(jobType: IngestionJobType, civilDate: string): string {
    return buildLogicalJobKey(jobType, resolveTargetPeriod(jobType, civilDate));
  }

  async findById(runId: string): Promise<JobReceipt | null> {
    return this.repository.findById(runId);
  }

  async listRuns(input: ListRunsInput): Promise<ListRunsResult> {
    return this.repository.listRuns(input);
  }
}
