import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IIntegrationConnectionRepository,
  IntegrationConnectionEnsureInput,
  IntegrationConnectionRow,
  IntegrationConnectionUpdateInput,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

type PrismaConnectionRow = {
  id: string;
  portfolioId: string;
  source: string;
  provider: string;
  environment: string;
  status: string;
  authorizedAt: Date | null;
  revokedAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class IntegrationConnectionRepository implements IIntegrationConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: PrismaConnectionRow): IntegrationConnectionRow {
    return { ...row };
  }

  async findByPortfolioAndSource(
    portfolioId: string,
    source: string,
  ): Promise<IntegrationConnectionRow | null> {
    try {
      const row = await this.prisma.integrationConnection.findFirst({
        where: { portfolioId, source },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find integration connection for portfolio ${portfolioId} and source ${source}`,
      );
    }
  }

  async ensure(input: IntegrationConnectionEnsureInput): Promise<IntegrationConnectionRow> {
    try {
      const row = await this.prisma.integrationConnection.create({
        data: {
          id: randomUUID(),
          portfolioId: input.portfolioId,
          source: input.source,
          provider: input.provider ?? 'SIMULATED',
          environment: input.environment ?? 'SIMULATED',
          status: 'NOT_CONNECTED',
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Concurrent begin: the unique (portfolio, source) row already
        // exists; return it instead of duplicating the connection.
        const existing = await this.findByPortfolioAndSource(input.portfolioId, input.source);
        if (existing) return existing;
      }
      throw new PersistenceError(
        `Failed to ensure integration connection for portfolio ${input.portfolioId}`,
      );
    }
  }

  async update(input: IntegrationConnectionUpdateInput): Promise<IntegrationConnectionRow> {
    try {
      const existing = await this.prisma.integrationConnection.findFirst({
        where: { id: input.id, portfolioId: input.portfolioId },
      });
      if (!existing) {
        throw new PersistenceError(
          `Integration connection ${input.id} not found for portfolio ${input.portfolioId}`,
        );
      }
      const row = await this.prisma.integrationConnection.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          authorizedAt: input.authorizedAt ?? null,
          revokedAt: input.revokedAt ?? null,
          lastCheckedAt: input.lastCheckedAt ?? null,
        },
      });
      return this.map(row);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(`Failed to update integration connection ${input.id}`);
    }
  }
}
