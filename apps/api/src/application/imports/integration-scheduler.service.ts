import { Inject, Injectable } from '@nestjs/common';
import type { IIntegrationJobRepository, IIntegrationScheduleRepository } from '@atlas/database';
import { computeNextRunAt, resolveDueSlot } from '@atlas/import-engine';
import { INTEGRATION_JOB_REPOSITORY, INTEGRATION_SCHEDULE_REPOSITORY } from '../../database/tokens';

export interface SchedulerTickResult {
  due: number;
  enqueued: number;
  alreadyEnqueued: number;
  skippedOverlap: number;
}

/**
 * Phase 5P-A — schedule planner (tick).
 *
 * Pure orchestration, no timers inside: the caller supplies `now` so tests
 * drive the planner with a fake clock. Each tick enqueues at most one job
 * per due schedule; `ensure` is idempotent on (schedule, slot) and consumed
 * slots advance nextRunAt, so duplicate ticks never duplicate jobs and
 * offline windows coalesce into the latest missed occurrence.
 */
@Injectable()
export class IntegrationSchedulerService {
  constructor(
    @Inject(INTEGRATION_SCHEDULE_REPOSITORY)
    private readonly schedules: IIntegrationScheduleRepository,
    @Inject(INTEGRATION_JOB_REPOSITORY)
    private readonly jobs: IIntegrationJobRepository,
  ) {}

  async tick(now: Date): Promise<SchedulerTickResult> {
    const due = await this.schedules.listDue(now, 200);
    const result: SchedulerTickResult = {
      due: due.length,
      enqueued: 0,
      alreadyEnqueued: 0,
      skippedOverlap: 0,
    };
    for (const schedule of due) {
      try {
        await this.processSchedule(schedule, now, result);
      } catch (error: unknown) {
        // One unreadable schedule never poisons the tick for the rest.
        // No counter moves: the schedule stays due and surfaces in logs.
        console.error(
          `[Atlas integration] scheduler skipped schedule ${schedule.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return result;
  }

  private async processSchedule(
    schedule: {
      id: string;
      portfolioId: string;
      source: string;
      environment: string;
      cadence: string;
      hourLocal: number | null;
      minuteLocal: number | null;
      timezone: string;
      nextRunAt: Date | null;
    },
    now: Date,
    result: SchedulerTickResult,
  ): Promise<void> {
    const cadence = {
      cadence: schedule.cadence,
      hourLocal: schedule.hourLocal,
      minuteLocal: schedule.minuteLocal,
      timezone: schedule.timezone,
    };
    const slot = resolveDueSlot(cadence, schedule.nextRunAt, now);
    if (!slot) return;
    const active = await this.jobs.findActiveBySchedule(schedule.id);
    if (active) {
      result.skippedOverlap += 1;
      return;
    }
    const { created } = await this.jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: schedule.portfolioId,
      source: schedule.source,
      environment: schedule.environment,
      scheduledFor: slot,
    });
    if (created) {
      result.enqueued += 1;
    } else {
      result.alreadyEnqueued += 1;
    }
    await this.schedules.touch({
      id: schedule.id,
      portfolioId: schedule.portfolioId,
      nextRunAt: computeNextRunAt(cadence, slot),
    });
  }
}
