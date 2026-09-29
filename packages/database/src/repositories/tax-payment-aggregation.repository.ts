import { Prisma, PrismaClient } from '@prisma/client';
import {
  AggregationWriteOutcome,
  ITaxPaymentAggregationRepository,
  TaxPaymentAggregationRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  taxSubjectId: string;
  revenueCode: string;
  targetCompetence: string;
  currency: string;
  currentAmount: Prisma.Decimal;
  carryForwardAmount: Prisma.Decimal;
  totalPayable: Prisma.Decimal;
  minimumThreshold: Prisma.Decimal;
  sourceEntryIds: Prisma.JsonValue;
  currentObligationId: string | null;
  dueDate: Date | null;
  status: string;
  ruleId: string;
  ruleVersion: string;
  fingerprint: string;
  createdAt: Date;
};

function toStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Phase 4E — persisted derived payment aggregations. Deterministic per
 * `(taxSubject, revenueCode, targetCompetence, fingerprint)`; re-materialization
 * is idempotent. Never recalculates tax (ADR-279).
 */
export class TaxPaymentAggregationRepository implements ITaxPaymentAggregationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): TaxPaymentAggregationRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      revenueCode: row.revenueCode,
      targetCompetence: row.targetCompetence,
      currency: row.currency,
      currentAmount: row.currentAmount.toString(),
      carryForwardAmount: row.carryForwardAmount.toString(),
      totalPayable: row.totalPayable.toString(),
      minimumThreshold: row.minimumThreshold.toString(),
      sourceEntryIds: toStringArray(row.sourceEntryIds),
      currentObligationId: row.currentObligationId,
      dueDate: row.dueDate,
      status: row.status,
      ruleId: row.ruleId,
      ruleVersion: row.ruleVersion,
      fingerprint: row.fingerprint,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string, taxSubjectId: string): Promise<TaxPaymentAggregationRow | null> {
    const row = await this.prisma.taxPaymentAggregation.findFirst({ where: { id, taxSubjectId } });
    return row ? this.map(row) : null;
  }

  async findLatestForCompetence(
    taxSubjectId: string,
    revenueCode: string,
    competence: string,
  ): Promise<TaxPaymentAggregationRow | null> {
    const row = await this.prisma.taxPaymentAggregation.findFirst({
      where: { taxSubjectId, revenueCode, targetCompetence: competence },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return row ? this.map(row) : null;
  }

  async create(
    input: Parameters<ITaxPaymentAggregationRepository['create']>[0],
  ): Promise<{ outcome: AggregationWriteOutcome; record: TaxPaymentAggregationRow }> {
    try {
      const existing = await this.prisma.taxPaymentAggregation.findUnique({
        where: {
          tax_payment_aggregation_identity: {
            taxSubjectId: input.taxSubjectId,
            revenueCode: input.revenueCode,
            targetCompetence: input.targetCompetence,
            fingerprint: input.fingerprint,
          },
        },
      });
      if (existing) return { outcome: 'DUPLICATE', record: this.map(existing) };

      const created = await this.prisma.taxPaymentAggregation.create({
        data: {
          taxSubjectId: input.taxSubjectId,
          revenueCode: input.revenueCode,
          targetCompetence: input.targetCompetence,
          currency: input.currency,
          currentAmount: new Prisma.Decimal(input.currentAmount),
          carryForwardAmount: new Prisma.Decimal(input.carryForwardAmount),
          totalPayable: new Prisma.Decimal(input.totalPayable),
          minimumThreshold: new Prisma.Decimal(input.minimumThreshold),
          sourceEntryIds: [...input.sourceEntryIds] as Prisma.InputJsonValue,
          currentObligationId: input.currentObligationId,
          dueDate: input.dueDate,
          status: input.status,
          ruleId: input.ruleId,
          ruleVersion: input.ruleVersion,
          fingerprint: input.fingerprint,
        },
      });
      return { outcome: 'CREATED', record: this.map(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.prisma.taxPaymentAggregation.findUnique({
          where: {
            tax_payment_aggregation_identity: {
              taxSubjectId: input.taxSubjectId,
              revenueCode: input.revenueCode,
              targetCompetence: input.targetCompetence,
              fingerprint: input.fingerprint,
            },
          },
        });
        if (existing) return { outcome: 'DUPLICATE', record: this.map(existing) };
      }
      throw new PersistenceError(
        `Failed to create tax payment aggregation: ${(error as Error).message}`,
      );
    }
  }
}
