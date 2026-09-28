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

type ModelName =
  'taxTradeClassificationRecord' | 'taxWithholdingInputRecord' | 'fiiTaxEligibilityFactRecord';

/**
 * Phase 4B.3/4B.4 — canonical tax input persistence.
 *
 * Deduplication is exact (same identity + same fingerprint => idempotent).
 * A same-identity record with a different fingerprint is a CONFLICT; the
 * incoming candidate is recorded in provenance (never silently overwriting)
 * and can be explicitly resolved (ADR-255, ADR-260). Immutable transaction
 * rows are never mutated.
 */
export class TaxInputRepository implements ITaxInputRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async markConflict(
    model: ModelName,
    id: string,
    existingProvenance: Prisma.JsonValue,
    candidate: Record<string, unknown>,
  ): Promise<void> {
    const provenance = {
      ...((existingProvenance ?? {}) as Record<string, unknown>),
      conflictingCandidate: { ...candidate, recordedAt: new Date().toISOString() },
    };
    await (
      this.prisma[model] as unknown as {
        update(args: {
          where: { id: string };
          data: Prisma.InputJsonValue & {
            conflictStatus: string;
            provenance: Prisma.InputJsonValue;
          };
        }): Promise<unknown>;
      }
    ).update({ where: { id }, data: { conflictStatus: 'CONFLICT', provenance: json(provenance) } });
  }

  // --- Trade classification ---

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
    const candidate = {
      classification: input.classification,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      effectiveDate: input.effectiveDate.toISOString().slice(0, 10),
      fingerprint: input.fingerprint,
    };
    try {
      const existing = await this.prisma.taxTradeClassificationRecord.findUnique({
        where: { tax_trade_classification_identity: identity },
      });
      if (existing) {
        if (existing.fingerprint === input.fingerprint) {
          return { outcome: 'DUPLICATE', record: this.mapTrade(existing) };
        }
        await this.markConflict(
          'taxTradeClassificationRecord',
          existing.id,
          existing.provenance,
          candidate,
        );
        const refreshed = await this.prisma.taxTradeClassificationRecord.findUniqueOrThrow({
          where: { id: existing.id },
        });
        return { outcome: 'CONFLICT', record: this.mapTrade(refreshed) };
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
          await this.markConflict(
            'taxTradeClassificationRecord',
            again.id,
            again.provenance,
            candidate,
          );
          const refreshed = await this.prisma.taxTradeClassificationRecord.findUniqueOrThrow({
            where: { id: again.id },
          });
          return { outcome: 'CONFLICT', record: this.mapTrade(refreshed) };
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

  async resolveTradeClassification(
    id: string,
    input: {
      action: 'KEEP_EXISTING' | 'ACCEPT_NEW';
      resolutionSource: string;
      taxSubjectId: string;
    },
  ): Promise<TaxTradeClassificationRow | null> {
    const row = await this.prisma.taxTradeClassificationRecord.findFirst({
      where: { id, taxSubjectId: input.taxSubjectId },
    });
    if (!row) return null;
    const provenance = (row.provenance ?? {}) as Record<string, unknown>;
    const candidate = provenance.conflictingCandidate as Record<string, unknown> | undefined;
    const resolution = {
      action: input.action,
      resolutionSource: input.resolutionSource,
      resolvedAt: new Date().toISOString(),
    };
    if (input.action === 'ACCEPT_NEW' && candidate) {
      const history = Array.isArray(provenance.history) ? provenance.history : [];
      const updated = await this.prisma.taxTradeClassificationRecord.update({
        where: { id },
        data: {
          classification: String(candidate.classification),
          sourceType: String(candidate.sourceType),
          sourceReference: String(candidate.sourceReference),
          effectiveDate: new Date(`${String(candidate.effectiveDate)}T00:00:00.000Z`),
          fingerprint: String(candidate.fingerprint),
          status: String(candidate.classification) === 'UNKNOWN' ? 'UNKNOWN' : 'CONFIRMED',
          conflictStatus: 'RESOLVED',
          provenance: json({
            ...provenance,
            history: [
              ...history,
              { previous: row.classification, replacedAt: resolution.resolvedAt },
            ],
            resolution,
          }),
        },
      });
      return this.mapTrade(updated);
    }
    const updated = await this.prisma.taxTradeClassificationRecord.update({
      where: { id },
      data: { conflictStatus: 'RESOLVED', provenance: json({ ...provenance, resolution }) },
    });
    return this.mapTrade(updated);
  }

  // --- Withholding ---

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
    const candidate = {
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      competence: input.competence,
      economicDate: input.economicDate.toISOString().slice(0, 10),
      category: input.category,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      fingerprint: input.fingerprint,
    };
    try {
      const existing = await this.prisma.taxWithholdingInputRecord.findUnique({
        where: { tax_withholding_identity: identity },
      });
      if (existing) {
        if (existing.fingerprint === input.fingerprint) {
          return { outcome: 'DUPLICATE', record: this.mapWithholding(existing) };
        }
        await this.markConflict(
          'taxWithholdingInputRecord',
          existing.id,
          existing.provenance,
          candidate,
        );
        const refreshed = await this.prisma.taxWithholdingInputRecord.findUniqueOrThrow({
          where: { id: existing.id },
        });
        return { outcome: 'CONFLICT', record: this.mapWithholding(refreshed) };
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
          await this.markConflict(
            'taxWithholdingInputRecord',
            again.id,
            again.provenance,
            candidate,
          );
          const refreshed = await this.prisma.taxWithholdingInputRecord.findUniqueOrThrow({
            where: { id: again.id },
          });
          return { outcome: 'CONFLICT', record: this.mapWithholding(refreshed) };
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

  async resolveWithholding(
    id: string,
    input: {
      action: 'KEEP_EXISTING' | 'ACCEPT_NEW';
      resolutionSource: string;
      taxSubjectId: string;
    },
  ): Promise<TaxWithholdingRow | null> {
    const row = await this.prisma.taxWithholdingInputRecord.findFirst({
      where: { id, taxSubjectId: input.taxSubjectId },
    });
    if (!row) return null;
    const provenance = (row.provenance ?? {}) as Record<string, unknown>;
    const candidate = provenance.conflictingCandidate as Record<string, unknown> | undefined;
    const resolution = {
      action: input.action,
      resolutionSource: input.resolutionSource,
      resolvedAt: new Date().toISOString(),
    };
    if (input.action === 'ACCEPT_NEW' && candidate) {
      const history = Array.isArray(provenance.history) ? provenance.history : [];
      const updated = await this.prisma.taxWithholdingInputRecord.update({
        where: { id },
        data: {
          amount: candidate.amount === null ? null : new Prisma.Decimal(String(candidate.amount)),
          currency: String(candidate.currency),
          status: String(candidate.status),
          category: String(candidate.category),
          fingerprint: String(candidate.fingerprint),
          conflictStatus: 'RESOLVED',
          provenance: json({
            ...provenance,
            history: [
              ...history,
              {
                previousAmount: row.amount ? row.amount.toString() : null,
                replacedAt: resolution.resolvedAt,
              },
            ],
            resolution,
          }),
        },
      });
      return this.mapWithholding(updated);
    }
    const updated = await this.prisma.taxWithholdingInputRecord.update({
      where: { id },
      data: { conflictStatus: 'RESOLVED', provenance: json({ ...provenance, resolution }) },
    });
    return this.mapWithholding(updated);
  }

  // --- FII eligibility ---

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
    const candidate = {
      holderCount: input.holderCount,
      investorOwnershipPercent: input.investorOwnershipPercent,
      isExchangeTraded: input.isExchangeTraded,
      status: input.status,
      asOfDate: input.asOfDate.toISOString().slice(0, 10),
      sourceType: input.sourceType,
      sourceReference: input.sourceReference,
      fingerprint: input.fingerprint,
    };
    try {
      const existing = await this.prisma.fiiTaxEligibilityFactRecord.findUnique({
        where: { fii_tax_eligibility_identity: identity },
      });
      if (existing) {
        if (existing.fingerprint === input.fingerprint) {
          return { outcome: 'DUPLICATE', record: this.mapFii(existing) };
        }
        await this.markConflict(
          'fiiTaxEligibilityFactRecord',
          existing.id,
          existing.provenance,
          candidate,
        );
        const refreshed = await this.prisma.fiiTaxEligibilityFactRecord.findUniqueOrThrow({
          where: { id: existing.id },
        });
        return { outcome: 'CONFLICT', record: this.mapFii(refreshed) };
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
          await this.markConflict(
            'fiiTaxEligibilityFactRecord',
            again.id,
            again.provenance,
            candidate,
          );
          const refreshed = await this.prisma.fiiTaxEligibilityFactRecord.findUniqueOrThrow({
            where: { id: again.id },
          });
          return { outcome: 'CONFLICT', record: this.mapFii(refreshed) };
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
      where: { taxSubjectId, assetId: { in: [...assetIds] }, asOfDate: { lte: asOfDate } },
      orderBy: [{ asOfDate: 'desc' }, { id: 'asc' }],
    });
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

  async resolveFiiEligibility(
    id: string,
    input: {
      action: 'KEEP_EXISTING' | 'ACCEPT_NEW';
      resolutionSource: string;
      taxSubjectId: string;
    },
  ): Promise<FiiTaxEligibilityRow | null> {
    const row = await this.prisma.fiiTaxEligibilityFactRecord.findFirst({
      where: { id, taxSubjectId: input.taxSubjectId },
    });
    if (!row) return null;
    const provenance = (row.provenance ?? {}) as Record<string, unknown>;
    const candidate = provenance.conflictingCandidate as Record<string, unknown> | undefined;
    const resolution = {
      action: input.action,
      resolutionSource: input.resolutionSource,
      resolvedAt: new Date().toISOString(),
    };
    if (input.action === 'ACCEPT_NEW' && candidate) {
      const history = Array.isArray(provenance.history) ? provenance.history : [];
      const updated = await this.prisma.fiiTaxEligibilityFactRecord.update({
        where: { id },
        data: {
          holderCount:
            candidate.holderCount === null || candidate.holderCount === undefined
              ? null
              : Number(candidate.holderCount),
          investorOwnershipPercent:
            candidate.investorOwnershipPercent === null ||
            candidate.investorOwnershipPercent === undefined
              ? null
              : new Prisma.Decimal(String(candidate.investorOwnershipPercent)),
          isExchangeTraded:
            candidate.isExchangeTraded === null || candidate.isExchangeTraded === undefined
              ? null
              : Boolean(candidate.isExchangeTraded),
          status: String(candidate.status),
          fingerprint: String(candidate.fingerprint),
          conflictStatus: 'RESOLVED',
          provenance: json({
            ...provenance,
            history: [
              ...history,
              { previousHolderCount: row.holderCount, replacedAt: resolution.resolvedAt },
            ],
            resolution,
          }),
        },
      });
      return this.mapFii(updated);
    }
    const updated = await this.prisma.fiiTaxEligibilityFactRecord.update({
      where: { id },
      data: { conflictStatus: 'RESOLVED', provenance: json({ ...provenance, resolution }) },
    });
    return this.mapFii(updated);
  }
}
