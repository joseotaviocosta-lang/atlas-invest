import { Inject, Injectable, Optional } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IIntegrationConnectionRepository,
  IIntegrationJobRepository,
  IIntegrationRunRepository,
  IIntegrationScheduleRepository,
  IntegrationRunRow,
  IntegrationScheduleRow,
  IPortfolioRepository,
} from '@atlas/database';
import {
  deriveReviewItems,
  resolveIntegrationAvailability,
  resolveIntegrationStatus,
  type IntegrationAvailability,
  type IntegrationConnectionState,
  type IntegrationConnectionStatus,
  type IntegrationLastRunOutcome,
  type IntegrationStatus,
} from '@atlas/import-engine';
import {
  INTEGRATION_CONNECTION_REPOSITORY,
  INTEGRATION_JOB_REPOSITORY,
  INTEGRATION_RUN_REPOSITORY,
  INTEGRATION_SCHEDULE_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../database/tokens';
import {
  INTEGRATION_SCHEDULING_POLICY,
  type IntegrationSchedulingPolicy,
} from './integration-scheduling.tokens';
import { IntegrationScheduleService } from './integration-schedule.service';

export interface IntegrationSourceSettings {
  source: string;
  provider: string;
  environment: string;
  availability: IntegrationAvailability;
  connection: {
    state: IntegrationConnectionState;
    authorizedAt: string | null;
    lastCheckedAt: string | null;
    /** Raw persisted lifecycle (REVOKED vs REQUIRES_REAUTHORIZATION need distinct UX copy). */
    lifecycle: IntegrationConnectionStatus | null;
  };
  canEnable: boolean;
  canDisable: boolean;
  canEditSchedule: boolean;
  schedule: IntegrationScheduleRow | null;
  lastRun: IntegrationRunRow | null;
  lastSuccessfulRun: IntegrationRunRow | null;
  pendingReviewCount: number;
  status: IntegrationStatus;
}

export interface IntegrationSettingsReadModel {
  portfolioId: string;
  sources: IntegrationSourceSettings[];
}

/**
 * Phase 5P-C — integration settings read model.
 *
 * Aggregates availability, connection, schedule intent and execution
 * outcome into one deterministic, read-only view per source. Derives
 * everything from persisted rows; persists nothing, computes no financial
 * math, exposes no secrets. The capability flags (canEnable/canDisable/
 * canEditSchedule) are UX hints only — enforcement stays server-side
 * (schedule service guards, strict DTOs, server-computed nextRunAt).
 */
@Injectable()
export class IntegrationSettingsService {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(INTEGRATION_SCHEDULE_REPOSITORY)
    private readonly schedules: IIntegrationScheduleRepository,
    @Inject(INTEGRATION_JOB_REPOSITORY)
    private readonly jobs: IIntegrationJobRepository,
    @Inject(INTEGRATION_RUN_REPOSITORY)
    private readonly runs: IIntegrationRunRepository,
    @Inject(INTEGRATION_CONNECTION_REPOSITORY)
    private readonly connections: IIntegrationConnectionRepository,
    @Optional()
    @Inject(INTEGRATION_SCHEDULING_POLICY)
    private readonly policy?: IntegrationSchedulingPolicy | null,
  ) {}

  private allowSimulated(): boolean {
    return this.policy?.allowSimulatedSchedules ?? true;
  }

  private toDerivationInput(row: IntegrationRunRow) {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      source: row.source,
      trigger: row.trigger,
      status: row.status,
      newCandidates: row.newCandidates,
      exactDuplicates: row.exactDuplicates,
      probableDuplicates: row.probableDuplicates,
      conflicts: row.conflicts,
      unsupported: row.unsupported,
      invalid: row.invalid,
      partial: row.partial,
      reconciliation: row.reconciliation,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toOutcome(status: string | null): IntegrationLastRunOutcome {
    if (status === 'FAILED') return 'FAILED';
    if (status === 'PARTIAL') return 'PARTIAL';
    if (status === 'COMPLETED' || status === 'AWAITING_REVIEW') return 'OK';
    return null;
  }

  /**
   * Phase 5P-D — persisted connection mapped onto the 5P-C presentation
   * vocabulary. A missing row is NOT_CONNECTED (nothing was ever
   * connected — no implicit authorization). Both REVOKED and
   * REQUIRES_REAUTHORIZATION surface as NEEDS_REAUTH; only
   * AWAITING_AUTHORIZATION keeps its own status.
   */
  private toConnectionState(status: string | null): {
    state: IntegrationConnectionState;
    persisted: IntegrationConnectionStatus | null;
  } {
    if (status === 'AUTHORIZED') return { state: 'AUTHORIZED', persisted: 'AUTHORIZED' };
    if (status === 'AWAITING_AUTHORIZATION') {
      return { state: 'AWAITING_AUTHORIZATION', persisted: 'AWAITING_AUTHORIZATION' };
    }
    if (status === 'REQUIRES_REAUTHORIZATION' || status === 'REVOKED') {
      return {
        state: 'NEEDS_REAUTH',
        persisted: status as IntegrationConnectionStatus,
      };
    }
    return { state: 'NOT_CONNECTED', persisted: null };
  }

  async getSettings(userId: string, portfolioId: string): Promise<IntegrationSettingsReadModel> {
    const portfolio = await this.portfolios.findByIdAndUserId(portfolioId, userId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }

    const [schedules, recentRuns] = await Promise.all([
      this.schedules.listByPortfolio(portfolioId),
      // Bounded newest-first window; enough to find the latest run per
      // source, the latest successful run, and the pending count.
      this.runs.listRecentByPortfolioIds([portfolioId], 200),
    ]);

    const sources: IntegrationSourceSettings[] = [];
    for (const source of IntegrationScheduleService.SCHEDULABLE_SOURCES) {
      const schedule = schedules.find((row) => row.source === source) ?? null;
      const availability = resolveIntegrationAvailability({
        source,
        allowSimulated: this.allowSimulated(),
      });
      // Phase 5P-D: connection comes from the persisted row. No implicit
      // authorization — a missing row is NOT_CONNECTED even for SIMULATED.
      const connectionRow = await this.connections.findByPortfolioAndSource(portfolioId, source);
      const mapped = this.toConnectionState(connectionRow?.status ?? null);
      const connection: IntegrationConnectionState = mapped.state;

      const sourceRuns = recentRuns
        .filter((row) => row.source === source)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      const lastRun = sourceRuns[0] ?? null;
      const lastSuccessfulRun =
        sourceRuns.find(
          (row) =>
            row.status === 'COMPLETED' ||
            row.status === 'AWAITING_REVIEW' ||
            row.status === 'PARTIAL',
        ) ?? null;
      const pendingReviewCount = deriveReviewItems(
        sourceRuns.map((row) => this.toDerivationInput(row)),
      ).length;
      const hasSyncingJob = schedule ? await this.jobs.hasRunningJob(schedule.id) : false;

      const status = resolveIntegrationStatus({
        availability,
        connection,
        hasSchedule: schedule !== null,
        scheduleEnabled: schedule?.enabled ?? false,
        hasSyncingJob,
        lastRunOutcome: lastRun ? this.toOutcome(lastRun.status) : null,
        pendingReviewCount,
      });

      const controlsEnabled = this.allowSimulated();
      sources.push({
        source,
        provider: IntegrationScheduleService.SCHEDULED_PROVIDER,
        environment: IntegrationScheduleService.SCHEDULED_ENVIRONMENT,
        availability,
        connection: {
          state: connection,
          authorizedAt: connectionRow?.authorizedAt
            ? connectionRow.authorizedAt.toISOString()
            : null,
          lastCheckedAt: connectionRow?.lastCheckedAt
            ? connectionRow.lastCheckedAt.toISOString()
            : null,
          lifecycle: mapped.persisted,
        },
        canEnable: controlsEnabled && schedule !== null && !schedule.enabled,
        canDisable: schedule !== null && schedule.enabled,
        canEditSchedule: controlsEnabled && schedule !== null,
        schedule,
        lastRun,
        lastSuccessfulRun,
        pendingReviewCount,
        status,
      });
    }
    return { portfolioId, sources };
  }
}
