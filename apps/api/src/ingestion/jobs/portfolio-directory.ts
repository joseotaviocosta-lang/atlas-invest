/**
 * Phase 5E (R3-B) - Narrow read port for the portfolios the scheduler must
 * refresh (market quotes are portfolio-scoped by the existing use case).
 *
 * This is a system-level read only. It does not expose Prisma to handlers.
 */

import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import { PRISMA_CLIENT } from '../../database/tokens';

type AtlasPrismaClient = ReturnType<typeof getPrismaClient>;

export interface IngestionPortfolioRef {
  readonly id: string;
  readonly userId: string;
}

export interface IIngestionPortfolioDirectory {
  listActive(): Promise<IngestionPortfolioRef[]>;
}

@Injectable()
export class PrismaIngestionPortfolioDirectory implements IIngestionPortfolioDirectory {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: AtlasPrismaClient) {}

  async listActive(): Promise<IngestionPortfolioRef[]> {
    const rows = await this.prisma.portfolio.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, userId: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, userId: row.userId }));
  }
}
