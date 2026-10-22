import { Inject, Injectable, Optional } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IIntegrationScheduleRepository,
  IntegrationScheduleRow,
  IPortfolioRepository,
} from '@atlas/database';
import {
  assertValidScheduleInput,
  computeNextRunAt,
  INTEGRATION_SCHEDULE_DEFAULT_TIMEZONE,
  InvalidScheduleInputError,
  type IntegrationScheduleCadence,
} from '@atlas/import-engine';
import { INTEGRATION_SCHEDULE_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import {
  INTEGRATION_SCHEDULING_POLICY,
  type IntegrationSchedulingPolicy,
} from './integration-scheduling.tokens';

export interface CreateIntegrationScheduleCommand {
  portfolioId: string;
  userId?: string;
  source: string;
  cadence: string;
  hourLocal?: number | null;
  minuteLocal?: number | null;
  timezone?: string | null;
  enabled?: boolean;
}

export interface UpdateIntegrationScheduleCommand {
  scheduleId: string;
  portfolioId: string;
  userId?: string;
  enabled?: boolean;
  cadence?: string;
  hourLocal?: number | null;
  minuteLocal?: number | null;
  timezone?: string | null;
}

interface ResolvedCadence {
  cadence: IntegrationScheduleCadence;
  hourLocal: number | null;
  minuteLocal: number | null;
  timezone: string;
}

/**
 * Phase 5P-A — schedule lifecycle.
 *
 * Guardrails (all server-side, never client-controlled):
 * - schedulable sources are an explicit allow-list (B3 only in this phase);
 * - provider/environment are server constants (SIMULATED) — the API never
 *   accepts them, so CERT/PROD cannot be enabled by request or row edit
 *   (the DB CHECK is the second barrier);
 * - enabling a simulated schedule in production is rejected unless the
 *   deployment explicitly opts in;
 * - new schedules default to disabled (production default = no automatic sync).
 */
@Injectable()
export class IntegrationScheduleService {
  /** Sources with a registered background executor in this phase. */
  static readonly SCHEDULABLE_SOURCES: readonly string[] = ['B3'];
  static readonly SCHEDULED_ENVIRONMENT = 'SIMULATED';
  static readonly SCHEDULED_PROVIDER = 'SIMULATED';

  constructor(
    @Inject(INTEGRATION_SCHEDULE_REPOSITORY)
    private readonly schedules: IIntegrationScheduleRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Optional()
    @Inject(INTEGRATION_SCHEDULING_POLICY)
    private readonly policy?: IntegrationSchedulingPolicy | null,
  ) {}

  private allowSimulated(): boolean {
    return this.policy?.allowSimulatedSchedules ?? true;
  }

  private async verifyOwnership(portfolioId: string, userId?: string): Promise<void> {
    const portfolio = userId
      ? await this.portfolios.findByIdAndUserId(portfolioId, userId)
      : await this.portfolios.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
  }

  private resolveCadence(input: {
    cadence: string;
    hourLocal?: number | null;
    minuteLocal?: number | null;
    timezone?: string | null;
  }): ResolvedCadence {
    assertValidScheduleInput({
      cadence: input.cadence,
      hourLocal: input.hourLocal,
      minuteLocal: input.minuteLocal,
      timezone: input.timezone,
    });
    return {
      cadence: input.cadence as IntegrationScheduleCadence,
      hourLocal: input.hourLocal ?? null,
      minuteLocal: input.minuteLocal ?? null,
      timezone: input.timezone ?? INTEGRATION_SCHEDULE_DEFAULT_TIMEZONE,
    };
  }

  private nextRunAtFor(resolved: ResolvedCadence, enabled: boolean, from: Date): Date | null {
    if (!enabled) return null;
    return computeNextRunAt(
      {
        cadence: resolved.cadence,
        hourLocal: resolved.hourLocal,
        minuteLocal: resolved.minuteLocal,
        timezone: resolved.timezone,
      },
      from,
    );
  }

  async createSchedule(
    command: CreateIntegrationScheduleCommand,
    now: Date = new Date(),
  ): Promise<IntegrationScheduleRow> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    if (!IntegrationScheduleService.SCHEDULABLE_SOURCES.includes(command.source)) {
      throw new InvalidScheduleInputError(
        `Fonte "${command.source}" não possui sincronização agendada`,
      );
    }
    const enabled = command.enabled ?? false;
    if (enabled && !this.allowSimulated()) {
      throw new InvalidScheduleInputError(
        'Sincronização automática simulada indisponível neste ambiente',
      );
    }
    const resolved = this.resolveCadence(command);
    const existing = await this.schedules.listByPortfolio(command.portfolioId);
    if (existing.some((row) => row.source === command.source)) {
      throw new InvalidScheduleInputError('Já existe uma agenda para esta fonte');
    }
    return this.schedules.create({
      portfolioId: command.portfolioId,
      source: command.source,
      provider: IntegrationScheduleService.SCHEDULED_PROVIDER,
      environment: IntegrationScheduleService.SCHEDULED_ENVIRONMENT,
      cadence: resolved.cadence,
      hourLocal: resolved.hourLocal,
      minuteLocal: resolved.minuteLocal,
      timezone: resolved.timezone,
      enabled,
      nextRunAt: this.nextRunAtFor(resolved, enabled, now),
    });
  }

  async updateSchedule(
    command: UpdateIntegrationScheduleCommand,
    now: Date = new Date(),
  ): Promise<IntegrationScheduleRow> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const current = await this.schedules.findById(command.scheduleId, command.portfolioId);
    if (!current) {
      throw new EntityNotFoundError('IntegrationSchedule', command.scheduleId);
    }
    if (command.enabled === true && !this.allowSimulated()) {
      throw new InvalidScheduleInputError(
        'Sincronização automática simulada indisponível neste ambiente',
      );
    }
    const resolved = this.resolveCadence({
      cadence: command.cadence ?? current.cadence,
      hourLocal: command.hourLocal !== undefined ? command.hourLocal : current.hourLocal,
      minuteLocal: command.minuteLocal !== undefined ? command.minuteLocal : current.minuteLocal,
      timezone: command.timezone !== undefined ? command.timezone : current.timezone,
    });
    const enabled = command.enabled ?? current.enabled;
    return this.schedules.update({
      id: command.scheduleId,
      portfolioId: command.portfolioId,
      enabled,
      cadence: command.cadence ?? current.cadence,
      ...(command.hourLocal !== undefined ? { hourLocal: command.hourLocal } : {}),
      ...(command.minuteLocal !== undefined ? { minuteLocal: command.minuteLocal } : {}),
      ...(command.timezone !== undefined
        ? { timezone: command.timezone ?? INTEGRATION_SCHEDULE_DEFAULT_TIMEZONE }
        : {}),
      nextRunAt: this.nextRunAtFor(resolved, enabled, now),
    });
  }

  async listSchedules(portfolioId: string, userId?: string): Promise<IntegrationScheduleRow[]> {
    await this.verifyOwnership(portfolioId, userId);
    return this.schedules.listByPortfolio(portfolioId);
  }
}
