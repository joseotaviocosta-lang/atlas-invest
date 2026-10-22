import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IIntegrationScheduleRepository,
  IntegrationScheduleCreateInput,
  IntegrationScheduleRow,
  IntegrationScheduleTouchInput,
  IntegrationScheduleUpdateInput,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaScheduleRow = {
  id: string;
  portfolioId: string;
  source: string;
  provider: string;
  environment: string;
  cadence: string;
  hourLocal: number | null;
  minuteLocal: number | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class IntegrationScheduleRepository implements IIntegrationScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaScheduleRow): IntegrationScheduleRow {
    return { ...row };
  }

  async create(input: IntegrationScheduleCreateInput): Promise<IntegrationScheduleRow> {
    try {
      const row = await this.prisma.integrationSchedule.create({
        data: {
          id: input.id ?? randomUUID(),
          portfolioId: input.portfolioId,
          source: input.source,
          provider: input.provider ?? 'SIMULATED',
          environment: input.environment ?? 'SIMULATED',
          cadence: input.cadence,
          hourLocal: input.hourLocal ?? null,
          minuteLocal: input.minuteLocal ?? null,
          timezone: input.timezone ?? 'America/Sao_Paulo',
          enabled: input.enabled ?? false,
          nextRunAt: input.nextRunAt ?? null,
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PersistenceError(
          `Integration schedule already exists for portfolio ${input.portfolioId} and source ${input.source}`,
        );
      }
      throw new PersistenceError(
        `Failed to create integration schedule for portfolio ${input.portfolioId}`,
      );
    }
  }

  private async requireOwned(id: string, portfolioId: string): Promise<void> {
    const existing = await this.prisma.integrationSchedule.findFirst({
      where: { id, portfolioId },
    });
    if (!existing) {
      throw new PersistenceError(`Integration schedule ${id} not found`);
    }
  }

  async update(input: IntegrationScheduleUpdateInput): Promise<IntegrationScheduleRow> {
    await this.requireOwned(input.id, input.portfolioId);
    const data: Prisma.IntegrationScheduleUpdateInput = {};
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.cadence !== undefined) data.cadence = input.cadence;
    if (input.hourLocal !== undefined) data.hourLocal = input.hourLocal;
    if (input.minuteLocal !== undefined) data.minuteLocal = input.minuteLocal;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.nextRunAt !== undefined) data.nextRunAt = input.nextRunAt;
    try {
      const row = await this.prisma.integrationSchedule.update({
        where: { id: input.id },
        data,
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new PersistenceError(`Integration schedule ${input.id} not found`);
      }
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to update integration schedule ${input.id}`);
    }
  }

  async touch(input: IntegrationScheduleTouchInput): Promise<IntegrationScheduleRow> {
    await this.requireOwned(input.id, input.portfolioId);
    const data: Prisma.IntegrationScheduleUpdateInput = { nextRunAt: input.nextRunAt };
    if (input.lastRunAt !== undefined) data.lastRunAt = input.lastRunAt;
    if (input.lastStatus !== undefined) data.lastStatus = input.lastStatus;
    try {
      const row = await this.prisma.integrationSchedule.update({
        where: { id: input.id },
        data,
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new PersistenceError(`Integration schedule ${input.id} not found`);
      }
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to touch integration schedule ${input.id}`);
    }
  }

  async findById(id: string, portfolioId: string): Promise<IntegrationScheduleRow | null> {
    try {
      const row = await this.prisma.integrationSchedule.findFirst({ where: { id, portfolioId } });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to find integration schedule ${id}`);
    }
  }

  async listByPortfolio(portfolioId: string): Promise<IntegrationScheduleRow[]> {
    try {
      const rows = await this.prisma.integrationSchedule.findMany({
        where: { portfolioId },
        orderBy: [{ source: 'asc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError(
        `Failed to list integration schedules for portfolio ${portfolioId}`,
      );
    }
  }

  async listDue(now: Date, limit: number): Promise<IntegrationScheduleRow[]> {
    try {
      const rows = await this.prisma.integrationSchedule.findMany({
        where: { enabled: true, nextRunAt: { lte: now } },
        orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
        take: Math.min(200, Math.max(1, Math.floor(limit))),
      });
      return rows.map((row) => this.map(row));
    } catch {
      throw new PersistenceError('Failed to list due integration schedules');
    }
  }
}
