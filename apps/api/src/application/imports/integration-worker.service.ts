import { Inject, Injectable } from '@nestjs/common';
import type { IIntegrationJobRepository, IIntegrationScheduleRepository } from '@atlas/database';
import {
  attemptsExhausted,
  computeRetryNotBefore,
  STALE_RUNNING_LEASE_MS,
} from '@atlas/import-engine';
import { INTEGRATION_JOB_REPOSITORY, INTEGRATION_SCHEDULE_REPOSITORY } from '../../database/tokens';
import { SourceSyncExecutorRegistry } from './source-sync-executor';
import { ScheduledSyncFailedError } from './integration-scheduling.tokens';
import { IntegrationConnectionService } from './integration-connection.service';

export interface WorkerExecutionResult {
  claimed: boolean;
  jobId?: string;
  scheduleId?: string;
  runId?: string | null;
  jobStatus?: string;
}

/**
 * Phase 5P-A — job claimer + generic executor.
 *
 * The worker knows how to claim (atomic single-statement claim), resolve an
 * executor by source/provider, fence completions by claim attempt, and bound
 * retries with deterministic backoff. It knows nothing about B3 payloads,
 * dedupe, tax or Transaction construction — all source specifics live in
 * the registered executor. Cross-instance exclusivity comes from the atomic
 * claim plus attempt fencing, never from in-memory mutexes.
 */
@Injectable()
export class IntegrationWorkerService {
  constructor(
    @Inject(INTEGRATION_JOB_REPOSITORY)
    private readonly jobs: IIntegrationJobRepository,
    @Inject(INTEGRATION_SCHEDULE_REPOSITORY)
    private readonly schedules: IIntegrationScheduleRepository,
    @Inject(SourceSyncExecutorRegistry)
    private readonly registry: SourceSyncExecutorRegistry,
    @Inject(IntegrationConnectionService)
    private readonly connections: IntegrationConnectionService,
  ) {}

  async executeNext(now: Date): Promise<WorkerExecutionResult> {
    const job = await this.jobs.claimDue(now, STALE_RUNNING_LEASE_MS);
    if (!job) {
      return { claimed: false };
    }
    const attempt = job.attempt;
    // Phase 5P-D: the connection may have been revoked between enqueue and
    // claim. Cancel without opening a run: no ledger write, no fake
    // failure, schedule preference untouched.
    const ineligible = await this.cancelIfIneligible(job.portfolioId, job.source, {
      id: job.id,
      portfolioId: job.portfolioId,
      attempt,
      scheduleId: job.scheduleId,
    });
    if (ineligible) return ineligible;
    try {
      const schedule = await this.schedules.findById(job.scheduleId, job.portfolioId);
      if (!schedule) {
        const failed = await this.jobs.markFailed({
          id: job.id,
          portfolioId: job.portfolioId,
          attempt,
          errorCode: 'INTEGRATION.SCHEDULE_NOT_FOUND',
          errorMessage: 'Agenda de sincronização não encontrada',
          attemptsExhausted: true,
          notBeforeAt: null,
        });
        return {
          claimed: true,
          jobId: job.id,
          scheduleId: job.scheduleId,
          jobStatus: failed.status,
        };
      }
      const executor = this.registry.resolve(schedule.source, schedule.provider);
      // Phase 5P-E: revalidate immediately before the source call. The
      // connection may have been revoked after the post-claim check; the
      // source must never be consulted without a live authorization.
      const revokedBeforeExecute = await this.cancelIfIneligible(job.portfolioId, job.source, {
        id: job.id,
        portfolioId: job.portfolioId,
        attempt,
        scheduleId: job.scheduleId,
      });
      if (revokedBeforeExecute) return revokedBeforeExecute;
      const outcome = await executor.execute({
        jobId: job.id,
        attempt,
        scheduleId: schedule.id,
        portfolioId: job.portfolioId,
        source: schedule.source,
        timezone: schedule.timezone,
        now,
      });
      const succeeded = await this.jobs.markSucceeded({
        id: job.id,
        portfolioId: job.portfolioId,
        attempt,
        runId: outcome.runId,
      });
      await this.schedules.touch({
        id: schedule.id,
        portfolioId: schedule.portfolioId,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: now,
        lastStatus: 'AWAITING_REVIEW',
      });
      return {
        claimed: true,
        jobId: job.id,
        scheduleId: job.scheduleId,
        runId: outcome.runId,
        jobStatus: succeeded.status,
      };
    } catch (error: unknown) {
      const code =
        error instanceof ScheduledSyncFailedError
          ? error.code
          : 'INTEGRATION.SCHEDULED_SYNC_FAILED';
      const message =
        error instanceof ScheduledSyncFailedError
          ? error.message
          : 'Falha na sincronização agendada. Tente novamente.';
      // Unknown executors are configuration errors: retrying cannot help,
      // so the job fails fast instead of burning the retry budget.
      const exhausted =
        (error instanceof ScheduledSyncFailedError &&
          error.code === 'INTEGRATION.UNSUPPORTED_SCHEDULED_SOURCE') ||
        attemptsExhausted(attempt);
      const failed = await this.jobs.markFailed({
        id: job.id,
        portfolioId: job.portfolioId,
        attempt,
        errorCode: code,
        errorMessage: message,
        attemptsExhausted: exhausted,
        notBeforeAt: exhausted ? null : computeRetryNotBefore(now, attempt),
      });
      return { claimed: true, jobId: job.id, scheduleId: job.scheduleId, jobStatus: failed.status };
    }
  }

  /**
   * Phase 5P-D/5P-E: cancels a claimed job when the connection is not
   * eligible. No run opens, no ledger write, no failure recorded.
   * Returns null when eligible (caller continues).
   */
  private async cancelIfIneligible(
    portfolioId: string,
    source: string,
    claim: { id: string; portfolioId: string; attempt: number; scheduleId: string },
  ): Promise<WorkerExecutionResult | null> {
    if (await this.connections.isEligible(portfolioId, source)) {
      return null;
    }
    const cancelled = await this.jobs.markCancelled({
      id: claim.id,
      portfolioId: claim.portfolioId,
      attempt: claim.attempt,
    });
    return {
      claimed: true,
      jobId: claim.id,
      scheduleId: claim.scheduleId,
      jobStatus: cancelled.status,
    };
  }
}
