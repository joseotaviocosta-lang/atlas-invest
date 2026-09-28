import { Prisma, PrismaClient } from '@prisma/client';
import {
  FiiTaxEligibilityRow,
  ITaxInputRepository,
  TaxInputWriteResult,
  TaxTradeClassificationRow,
  TaxWithholdingRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

const json = (value: Record<string, unknown>) => value as Prisma.InputJsonValue;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Phase 4B.3 — canonical tax input persistence.
 *
 * Deduplication is exact (same identity + same fingerprint => idempotent).
 * A same-identity record with a different fingerprint is a CONFLICT and is
 * never silently overwritten. Immutable transaction rows are never mutated.
 */
export class TaxInputRepository implements ITaxInputRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapTrade(row: {
    id: string;
    taxSubjectId: string;
    transactionId: string;
    classification: string;
    sourceType: string;
    sourceReference: string;
    effectiveDate: Date;
    status: string;
    conflictStatus: string;
    fingerprint: string;
    provenance: Prisma.JsonValue;
    createdAt: Date;
    confirmedAt: Date | null;
  }): TaxTradeClassificationRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      transactionId: row.transactionId,
      classification: row.classification,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      effectiveDate: row.effectiveDate,
      status: row.status,
      conflictStatus: row.conflictStatus,
      fingerprint: row.fingerprint,
      provenance: (row.provenance ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt,
    };
  }

  async upsertTradeClassification(
    input: Parameters<ITaxInputRepository['upsertTradeClassification']>[0],
  ): Promise<TaxInputWriteResult<TaxTradeClassificationRow>> {
    const identity = {
      taxSubjectId: input.taxSubjectId,
      transactionId: input.transactionId,
      sourceReference: input.sourceReference,
    };
    try {
      const existing = await this.prisma.taxTradeClassificationRecord.findUnique({
        where: { tax_trade_classification_identity: identity },
      });
      if (existing) {
        if (existing.fingerprint === input.fingerprint) {
          return { outcome: 'DUPLICATE', record: this.mapTrade(existing) };
        }
        const conflicted = await this.prisma.taxTradeClassificationRecord.update({
          where: { id: existing.id },
          data: { conflictStatus: 'CONFLICT' },
        });
        return { outcome: 'CONFLICT', record: this.mapTrade(conflicted) };
      }
      const created = await this.prisma.taxTradeClassificationRecord.create({
        data: {
          ...identity,
          classification: input.classification,
          sourceType: input.sourceType,
          effectiveDate: input.effectiveDate,
          status: input.status,
          fingerprint: input.fingerprint,
          provenance: json(input.provenance),
          confirmedAt: input.status === 'CONFIRMED' ? new Date() : null,
        },
      });
      return { outcome: 'CREATED', record: this.mapTrade(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.taxTradeClassificationRecord.findUnique({
          where: { tax_trade_classification_identity: identity },
        });
        if (again) {
          if (again.fingerprint === input.fingerprint) {
            return { outcome: 'DUPLICATE', record: this.mapTrade(again) };
          }
          const conflicted = await this.prisma.taxTradeClassificationRecord.update({
            where: { id: again.id },
            data: { conflictStatus: 'CONFLICT' },
          });
          return { outcome: 'CONFLICT', record: this.mapTrade(conflicted) };
        }
      }
      throw new PersistenceError(
        `Failed to upsert trade classification: ${(error as Error).message}`,
      );
    }
  }

  async listTradeClassifications(
    taxSubjectId: string,
    transactionIds?: readonly string[],
  ): Promise<TaxTradeClassificationRow[]> {
    const rows = await this.prisma.taxTradeClassificationRecord.findMany({
      where: {
        taxSubjectId,
        ...(transactionIds && transactionIds.length > 0
          ? { transactionId: { in: [...transactionIds] } }
          : {}),
      },
      orderBy: [{ effectiveDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.mapTrade(row));
  }

  private mapWithholding(row: {
    id: string;
    taxSubjectId: string;
    competence: string;
    economicDate: Date;
    category: string;
    amount: Prisma.Decimal | null;
    currency: string;
    status: string;
    sourceType: string;
    sourceReference: string;
    conflictStatus: string;
    fingerprint: string;
    provenance: Prisma.JsonValue;
    createdAt: Date;
    confirmedAt: Date | null;
  }): TaxWithholdingRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      competence: row.competence,
      economicDate: row.economicDate,
      category: row.category,
      amount: row.amount === null ? null : row.amount.toString(),
      currency: row.currency,
      status: row.status,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      conflictStatus: row.conflictStatus,
      fingerprint: row.fingerprint,
      provenance: (row.provenance ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt,
    };
  }

  async upsertWithholding(
    input: Parameters<ITaxInputRepository['upsertWithholding']>[0],
  ): Promise<TaxInputWriteResult<TaxWithholdingRow>> {
    const identity = {
      taxSubjectId: input.taxSubjectId,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
    };
    const data = {
      competence: input.competence,
      economicDate: input.economicDate,
      category: input.category,
      amount: input.amount === null ? null : new Prisma.Decimal(input.amount),
      currency: input.currency,
      status: input.status,
      fingerprint: input.fingerprint,
      provenance: json(input.provenance),
    };
    try {
      const existing = await this.prisma.taxWithholdingInputRecord.findUnique({
        where: { tax_withholding_identity: identity },
      });
      if (existing) {
        if (existing.fingerprint === input.fingerprint) {
          return { outcome: 'DUPLICATE', record: this.mapWithholding(existing) };
        }
        const conflicted = await this.prisma.taxWithholdingInputRecord.update({
          where: { id: existing.id },
          data: { conflictStatus: 'CONFLICT' },
        });
        return { outcome: 'CONFLICT', record: this.mapWithholding(conflicted) };
      }
      const created = await this.prisma.taxWithholdingInputRecord.create({
        data: {
          ...identity,
          ...data,
          confirmedAt: input.status === 'CONFIRMED' ? new Date() : null,
        },
      });
      return { outcome: 'CREATED', record: this.mapWithholding(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.taxWithholdingInputRecord.findUnique({
          where: { tax_withholding_identity: identity },
        });
        if (again) {
          if (again.fingerprint === input.fingerprint) {
            return { outcome: 'DUPLICATE', record: this.mapWithholding(again) };
          }
          const conflicted = await this.prisma.taxWithholdingInputRecord.update({
            where: { id: again.id },
            data: { conflictStatus: 'CONFLICT' },
          });
          return { outcome: 'CONFLICT', record: this.mapWithholding(conflicted) };
        }
      }
      throw new PersistenceError(`Failed to upsert withholding input: ${(error as Error).message}`);
    }
  }

  async listWithholdings(taxSubjectId: string, competence?: string): Promise<TaxWithholdingRow[]> {
    const rows = await this.prisma.taxWithholdingInputRecord.findMany({
      where: { taxSubjectId, ...(competence ? { competence } : {}) },
      orderBy: [{ economicDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.mapWithholding(row));
  }

  private mapFii(row: {
    id: string;
    taxSubjectId: string;
    assetId: string;
    asOfDate: Date;
    holderCount: number | null;
    investorOwnershipPercent: Prisma.Decimal | null;
    isExchangeTraded: boolean | null;
    sourceType: string;
    sourceReference: string;
    status: string;
    conflictStatus: string;
    fingerprint: string;
    provenance: Prisma.JsonValue;
    createdAt: Date;
  }): FiiTaxEligibilityRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      assetId: row.assetId,
      asOfDate: row.asOfDate,
      holderCount: row.holderCount,
      investorOwnershipPercent:
        row.investorOwnershipPercent === null ? null : row.investorOwnershipPercent.toString(),
      isExchangeTraded: row.isExchangeTraded,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      status: row.status,
      conflictStatus: row.conflictStatus,
      fingerprint: row.fingerprint,
      provenance: (row.provenance ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt,
    };
  }

  async upsertFiiEligibility(
    input: Parameters<ITaxInputRepository['upsertFiiEligibility']>[0],
  ): Promise<TaxInputWriteResult<FiiTaxEligibilityRow>> {
    const identity = {
      taxSubjectId: input.taxSubjectId,
      assetId: input.assetId,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      asOfDate: input.asOfDate,
    };
    try {
      const existing = await this.prisma.fiiTaxEligibilityFactRecord.findUnique({
        where: { fii_tax_eligibility_identity: identity },
      });
      if (existing) {
        if (existing.fingerprint === input.fingerprint) {
          return { outcome: 'DUPLICATE', record: this.mapFii(existing) };
        }
        const conflicted = await this.prisma.fiiTaxEligibilityFactRecord.update({
          where: { id: existing.id },
          data: { conflictStatus: 'CONFLICT' },
        });
        return { outcome: 'CONFLICT', record: this.mapFii(conflicted) };
      }
      const created = await this.prisma.fiiTaxEligibilityFactRecord.create({
        data: {
          ...identity,
          holderCount: input.holderCount,
          investorOwnershipPercent:
            input.investorOwnershipPercent === null
              ? null
              : new Prisma.Decimal(input.investorOwnershipPercent),
          isExchangeTraded: input.isExchangeTraded,
          status: input.status,
          fingerprint: input.fingerprint,
          provenance: json(input.provenance),
        },
      });
      return { outcome: 'CREATED', record: this.mapFii(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.fiiTaxEligibilityFactRecord.findUnique({
          where: { fii_tax_eligibility_identity: identity },
        });
        if (again) {
          if (again.fingerprint === input.fingerprint) {
            return { outcome: 'DUPLICATE', record: this.mapFii(again) };
          }
          const conflicted = await this.prisma.fiiTaxEligibilityFactRecord.update({
            where: { id: again.id },
            data: { conflictStatus: 'CONFLICT' },
          });
          return { outcome: 'CONFLICT', record: this.mapFii(conflicted) };
        }
      }
      throw new PersistenceError(
        `Failed to upsert FII eligibility facts: ${(error as Error).message}`,
      );
    }
  }

  async listFiiEligibility(
    taxSubjectId: string,
    assetIds: readonly string[],
    asOfDate: Date,
  ): Promise<FiiTaxEligibilityRow[]> {
    if (assetIds.length === 0) return [];
    const rows = await this.prisma.fiiTaxEligibilityFactRecord.findMany({
      where: {
        taxSubjectId,
        assetId: { in: [...assetIds] },
        asOfDate: { lte: asOfDate },
      },
      orderBy: [{ asOfDate: 'desc' }, { id: 'asc' }],
    });
    // Latest fact at or before asOfDate per (assetId, sourceType, sourceReference):
    // no future leakage.
    const seen = new Set<string>();
    const result: FiiTaxEligibilityRow[] = [];
    for (const row of rows) {
      const key = `${row.assetId}::${row.sourceType}::${row.sourceReference}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(this.mapFii(row));
    }
    return result;
  }
}
