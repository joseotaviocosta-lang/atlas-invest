import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  AnnualOpeningPositionRow,
  AnnualOpeningPositionWriteOutcome,
  IAnnualOpeningPositionRepository,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function formatDateOnly(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeOpeningPositionRowFingerprint(input: {
  taxSubjectId: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  effectiveDate: string;
  quantity: string;
  totalHistoricalCost: string;
  currency: string;
  source: string;
  revision: number;
}): string {
  return createHash('sha256')
    .update(
      [
        input.taxSubjectId,
        input.portfolioId,
        input.accountId,
        input.assetId,
        input.effectiveDate,
        input.quantity,
        input.totalHistoricalCost,
        input.currency,
        input.source,
        String(input.revision),
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

export class AnnualOpeningPositionRepository implements IAnnualOpeningPositionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    taxSubjectId: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    effectiveDate: Date;
    quantity: Prisma.Decimal;
    totalHistoricalCost: Prisma.Decimal;
    currency: string;
    source: string;
    status: string;
    revision: number;
    fingerprint: string;
    notes: string | null;
    supersedesId: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AnnualOpeningPositionRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      portfolioId: row.portfolioId,
      accountId: row.accountId,
      assetId: row.assetId,
      effectiveDate: row.effectiveDate,
      quantity: row.quantity.toString(),
      totalHistoricalCost: row.totalHistoricalCost.toString(),
      currency: row.currency,
      source: row.source,
      status: row.status,
      revision: row.revision,
      fingerprint: row.fingerprint,
      notes: row.notes,
      supersedesId: row.supersedesId,
      confirmedAt: row.confirmedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<AnnualOpeningPositionRow | null> {
    try {
      const row = await this.prisma.annualOpeningPositionInputRecord.findUnique({
        where: { id },
      });
      return row ? this.map(row) : null;
    } catch (err) {
      throw new PersistenceError(`Failed to find opening position by id: ${err}`);
    }
  }

  async findCurrentByAsset(input: {
    taxSubjectId: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
  }): Promise<AnnualOpeningPositionRow | null> {
    try {
      const row = await this.prisma.annualOpeningPositionInputRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          assetId: input.assetId,
          status: { in: ['CONFIRMED', 'DRAFT'] },
        },
        orderBy: { revision: 'desc' },
      });
      return row ? this.map(row) : null;
    } catch (err) {
      throw new PersistenceError(`Failed to find current opening position by asset: ${err}`);
    }
  }

  async listByPortfolio(input: {
    taxSubjectId: string;
    portfolioId: string;
    status?: string;
  }): Promise<AnnualOpeningPositionRow[]> {
    try {
      const rows = await this.prisma.annualOpeningPositionInputRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          portfolioId: input.portfolioId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { revision: 'asc' }],
      });
      return rows.map((r) => this.map(r));
    } catch (err) {
      throw new PersistenceError(`Failed to list opening positions by portfolio: ${err}`);
    }
  }

  async listBySubject(input: {
    taxSubjectId: string;
    status?: string;
  }): Promise<AnnualOpeningPositionRow[]> {
    try {
      const rows = await this.prisma.annualOpeningPositionInputRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { revision: 'asc' }],
      });
      return rows.map((r) => this.map(r));
    } catch (err) {
      throw new PersistenceError(`Failed to list opening positions by subject: ${err}`);
    }
  }

  async create(input: {
    id?: string;
    taxSubjectId: string;
    portfolioId: string;
    accountId: string;
    assetId: string;
    effectiveDate: Date;
    quantity: string;
    totalHistoricalCost: string;
    currency: string;
    source: string;
    status?: string;
    notes?: string;
  }): Promise<{ outcome: AnnualOpeningPositionWriteOutcome; record: AnnualOpeningPositionRow }> {
    try {
      const status = input.status ?? 'CONFIRMED';
      const effectiveDateStr = formatDateOnly(input.effectiveDate);

      // Find current existing record for same asset/account
      const existing = await this.prisma.annualOpeningPositionInputRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          assetId: input.assetId,
          status: { in: ['CONFIRMED', 'DRAFT'] },
        },
        orderBy: { revision: 'desc' },
      });

      if (existing) {
        const existingEffectiveDateStr = formatDateOnly(existing.effectiveDate);
        // Check if candidate payload is identical to existing confirmed record
        if (
          existing.status === 'CONFIRMED' &&
          status === 'CONFIRMED' &&
          existingEffectiveDateStr === effectiveDateStr &&
          new Prisma.Decimal(existing.quantity).equals(new Prisma.Decimal(input.quantity)) &&
          new Prisma.Decimal(existing.totalHistoricalCost).equals(
            new Prisma.Decimal(input.totalHistoricalCost),
          ) &&
          existing.currency === input.currency &&
          existing.source === input.source
        ) {
          return { outcome: 'IDEMPOTENT_CONFIRMED', record: this.map(existing) };
        }

        // Supersede and increment revision
        const nextRevision = existing.revision + 1;
        const fingerprint = computeOpeningPositionRowFingerprint({
          taxSubjectId: input.taxSubjectId,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          assetId: input.assetId,
          effectiveDate: effectiveDateStr,
          quantity: input.quantity,
          totalHistoricalCost: input.totalHistoricalCost,
          currency: input.currency,
          source: input.source,
          revision: nextRevision,
        });

        const newId = input.id ?? randomUUID();
        const now = new Date();

        const created = await this.prisma.$transaction(async (tx) => {
          await tx.annualOpeningPositionInputRecord.update({
            where: { id: existing.id },
            data: { status: 'SUPERSEDED' },
          });

          return tx.annualOpeningPositionInputRecord.create({
            data: {
              id: newId,
              taxSubjectId: input.taxSubjectId,
              portfolioId: input.portfolioId,
              accountId: input.accountId,
              assetId: input.assetId,
              effectiveDate: input.effectiveDate,
              quantity: new Prisma.Decimal(input.quantity),
              totalHistoricalCost: new Prisma.Decimal(input.totalHistoricalCost),
              currency: input.currency,
              source: input.source,
              status,
              revision: nextRevision,
              fingerprint,
              notes: input.notes,
              supersedesId: existing.id,
              confirmedAt: status === 'CONFIRMED' ? now : null,
              createdAt: now,
              updatedAt: now,
            },
          });
        });

        return { outcome: 'SUPERSEDED', record: this.map(created) };
      }

      // First revision
      const revision = 1;
      const fingerprint = computeOpeningPositionRowFingerprint({
        taxSubjectId: input.taxSubjectId,
        portfolioId: input.portfolioId,
        accountId: input.accountId,
        assetId: input.assetId,
        effectiveDate: effectiveDateStr,
        quantity: input.quantity,
        totalHistoricalCost: input.totalHistoricalCost,
        currency: input.currency,
        source: input.source,
        revision,
      });

      const newId = input.id ?? randomUUID();
      const now = new Date();

      const created = await this.prisma.annualOpeningPositionInputRecord.create({
        data: {
          id: newId,
          taxSubjectId: input.taxSubjectId,
          portfolioId: input.portfolioId,
          accountId: input.accountId,
          assetId: input.assetId,
          effectiveDate: input.effectiveDate,
          quantity: new Prisma.Decimal(input.quantity),
          totalHistoricalCost: new Prisma.Decimal(input.totalHistoricalCost),
          currency: input.currency,
          source: input.source,
          status,
          revision,
          fingerprint,
          notes: input.notes,
          confirmedAt: status === 'CONFIRMED' ? now : null,
          createdAt: now,
          updatedAt: now,
        },
      });

      return { outcome: 'CREATED', record: this.map(created) };
    } catch (err) {
      throw new PersistenceError(`Failed to create annual opening position: ${err}`);
    }
  }

  async confirm(id: string, taxSubjectId: string): Promise<AnnualOpeningPositionRow | null> {
    try {
      const existing = await this.prisma.annualOpeningPositionInputRecord.findUnique({
        where: { id },
      });
      if (!existing || existing.taxSubjectId !== taxSubjectId) {
        return null;
      }
      if (existing.status === 'CONFIRMED') {
        return this.map(existing);
      }

      const updated = await this.prisma.annualOpeningPositionInputRecord.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
      });
      return this.map(updated);
    } catch (err) {
      throw new PersistenceError(`Failed to confirm opening position: ${err}`);
    }
  }
}
