import { Prisma, PrismaClient } from '@prisma/client';
import {
  CarryForwardConsumptionOutcome,
  CarryForwardWriteOutcome,
  ITaxCarryForwardRepository,
  TaxCarryForwardEntryRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  taxSubjectId: string;
  sourceObligationId: string;
  sourceCompetence: string;
  revenueCode: string;
  currency: string;
  amount: Prisma.Decimal;
  status: string;
  targetCompetence: string | null;
  consumedByAggregationId: string | null;
  consumedAt: Date | null;
  ruleId: string;
  ruleVersion: string;
  fingerprint: string;
  createdAt: Date;
};

/**
 * Phase 4E — persisted carry-forward entries. Append-only facts: corrections
 * supersede, never rewrite. Consumption is explicit and exactly-once (ADR-281).
 * Amounts are exact decimals (`Decimal` ↔ string); competences are civil
 * `YYYY-MM`; no IEEE-754.
 */
export class TaxCarryForwardRepository implements ITaxCarryForwardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): TaxCarryForwardEntryRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      sourceObligationId: row.sourceObligationId,
      sourceCompetence: row.sourceCompetence,
      revenueCode: row.revenueCode,
      currency: row.currency,
      amount: row.amount.toString(),
      status: row.status,
      targetCompetence: row.targetCompetence,
      consumedByAggregationId: row.consumedByAggregationId,
      consumedAt: row.consumedAt,
      ruleId: row.ruleId,
      ruleVersion: row.ruleVersion,
      fingerprint: row.fingerprint,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string, taxSubjectId: string): Promise<TaxCarryForwardEntryRow | null> {
    const row = await this.prisma.taxCarryForwardEntry.findFirst({ where: { id, taxSubjectId } });
    return row ? this.map(row) : null;
  }

  async listOpenForCompetence(
    taxSubjectId: string,
    revenueCode: string,
    competence: string,
  ): Promise<TaxCarryForwardEntryRow[]> {
    const rows = await this.prisma.taxCarryForwardEntry.findMany({
      where: {
        taxSubjectId,
        revenueCode,
        status: 'OPEN',
        OR: [{ targetCompetence: null }, { targetCompetence: { lte: competence } }],
      },
      orderBy: [{ sourceCompetence: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async listBySubject(
    taxSubjectId: string,
    filter?: { revenueCode?: string },
  ): Promise<TaxCarryForwardEntryRow[]> {
    const rows = await this.prisma.taxCarryForwardEntry.findMany({
      where: { taxSubjectId, ...(filter?.revenueCode ? { revenueCode: filter.revenueCode } : {}) },
      orderBy: [{ sourceCompetence: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async createEntry(
    input: Parameters<ITaxCarryForwardRepository['createEntry']>[0],
  ): Promise<{ outcome: CarryForwardWriteOutcome; record: TaxCarryForwardEntryRow }> {
    try {
      const existing = await this.prisma.taxCarryForwardEntry.findUnique({
        where: {
          tax_carry_forward_source_identity: {
            sourceObligationId: input.sourceObligationId,
            ruleId: input.ruleId,
            ruleVersion: input.ruleVersion,
          },
        },
      });
      if (existing) return { outcome: 'DUPLICATE', record: this.map(existing) };

      const created = await this.prisma.taxCarryForwardEntry.create({
        data: {
          taxSubjectId: input.taxSubjectId,
          sourceObligationId: input.sourceObligationId,
          sourceCompetence: input.sourceCompetence,
          revenueCode: input.revenueCode,
          currency: input.currency,
          amount: new Prisma.Decimal(input.amount),
          status: 'OPEN',
          targetCompetence: input.targetCompetence,
          ruleId: input.ruleId,
          ruleVersion: input.ruleVersion,
          fingerprint: input.fingerprint,
        },
      });
      return { outcome: 'CREATED', record: this.map(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.prisma.taxCarryForwardEntry.findUnique({
          where: {
            tax_carry_forward_source_identity: {
              sourceObligationId: input.sourceObligationId,
              ruleId: input.ruleId,
              ruleVersion: input.ruleVersion,
            },
          },
        });
        if (existing) return { outcome: 'DUPLICATE', record: this.map(existing) };
      }
      throw new PersistenceError(
        `Failed to create carry-forward entry: ${(error as Error).message}`,
      );
    }
  }

  async consumeEntries(input: {
    taxSubjectId: string;
    entryIds: readonly string[];
    aggregationId: string;
    consumedAt: Date;
  }): Promise<{ outcome: CarryForwardConsumptionOutcome; consumed: number }> {
    if (input.entryIds.length === 0) return { outcome: 'CONSUMED', consumed: 0 };
    try {
      // Idempotent re-settlement: if this aggregation already consumed every
      // entry, do nothing (exactly-once) instead of attempting a second claim.
      const current = await this.prisma.taxCarryForwardEntry.findMany({
        where: { id: { in: [...input.entryIds] }, taxSubjectId: input.taxSubjectId },
        select: { id: true, status: true, consumedByAggregationId: true },
      });
      if (
        current.length === input.entryIds.length &&
        current.every(
          (entry) =>
            entry.status === 'CONSUMED' && entry.consumedByAggregationId === input.aggregationId,
        )
      ) {
        return { outcome: 'ALREADY_CONSUMED', consumed: 0 };
      }

      // Single atomic statement: it either claims every currently-OPEN entry or
      // none. A short count means at least one entry was already consumed by
      // another aggregation; the partial claim is then compensated so
      // consumption stays all-or-nothing and exactly-once.
      const result = await this.prisma.taxCarryForwardEntry.updateMany({
        where: {
          id: { in: [...input.entryIds] },
          taxSubjectId: input.taxSubjectId,
          status: 'OPEN',
        },
        data: {
          status: 'CONSUMED',
          consumedByAggregationId: input.aggregationId,
          consumedAt: input.consumedAt,
        },
      });
      if (result.count === input.entryIds.length) {
        return { outcome: 'CONSUMED', consumed: result.count };
      }
      await this.prisma.taxCarryForwardEntry.updateMany({
        where: {
          id: { in: [...input.entryIds] },
          taxSubjectId: input.taxSubjectId,
          status: 'CONSUMED',
          consumedByAggregationId: input.aggregationId,
          consumedAt: input.consumedAt,
        },
        data: { status: 'OPEN', consumedByAggregationId: null, consumedAt: null },
      });
      return { outcome: 'ALREADY_CONSUMED', consumed: 0 };
    } catch (error) {
      throw new PersistenceError(
        `Failed to consume carry-forward entries: ${(error as Error).message}`,
      );
    }
  }

  async markSuperseded(id: string, taxSubjectId: string): Promise<TaxCarryForwardEntryRow | null> {
    const row = await this.prisma.taxCarryForwardEntry.findFirst({ where: { id, taxSubjectId } });
    if (!row) return null;
    if (row.status === 'CONSUMED') return this.map(row);
    const updated = await this.prisma.taxCarryForwardEntry.update({
      where: { id },
      data: { status: 'SUPERSEDED' },
    });
    return this.map(updated);
  }
}
