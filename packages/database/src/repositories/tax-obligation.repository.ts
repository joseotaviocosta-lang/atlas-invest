import { Prisma, PrismaClient } from '@prisma/client';
import { ITaxObligationRepository, ObligationWriteOutcome, TaxObligationRow } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

const json = (value: Record<string, unknown> | null | undefined) =>
  (value ?? {}) as Prisma.InputJsonValue;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type Row = {
  id: string;
  taxSubjectId: string;
  competence: string;
  taxBucket: string | null;
  revenueCode: string | null;
  liabilityFingerprint: string;
  revision: number;
  deadlineEntryId: string | null;
  principalAmount: Prisma.Decimal | null;
  currency: string | null;
  dueDate: Date | null;
  status: string;
  reasonCode: string | null;
  darfReadiness: string;
  darfReadinessReason: string | null;
  dataQuality: string;
  supersededById: string | null;
  provenance: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Phase 4C.2 — persisted derived tax obligations. Immutable per revision;
 * liability changes supersede the previous revision (ADR-264, ADR-267). The
 * amount is exact decimal (`Decimal` ↔ string); dates are civil (@db.Date).
 */
export class TaxObligationRepository implements ITaxObligationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): TaxObligationRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      competence: row.competence,
      taxBucket: row.taxBucket,
      revenueCode: row.revenueCode,
      liabilityFingerprint: row.liabilityFingerprint,
      revision: row.revision,
      deadlineEntryId: row.deadlineEntryId,
      principalAmount: row.principalAmount === null ? null : row.principalAmount.toString(),
      currency: row.currency,
      dueDate: row.dueDate,
      status: row.status,
      reasonCode: row.reasonCode,
      darfReadiness: row.darfReadiness,
      darfReadinessReason: row.darfReadinessReason,
      dataQuality: row.dataQuality,
      supersededById: row.supersededById,
      provenance: (row.provenance ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string, taxSubjectId: string): Promise<TaxObligationRow | null> {
    const row = await this.prisma.taxObligationRecord.findFirst({
      where: { id, taxSubjectId },
    });
    return row ? this.map(row) : null;
  }

  async list(
    taxSubjectId: string,
    filter?: { competence?: string; status?: string; bucket?: string },
  ): Promise<TaxObligationRow[]> {
    const rows = await this.prisma.taxObligationRecord.findMany({
      where: {
        taxSubjectId,
        ...(filter?.competence ? { competence: filter.competence } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.bucket ? { taxBucket: filter.bucket } : {}),
      },
      orderBy: [{ competence: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async findLatestByIdentity(
    taxSubjectId: string,
    competence: string,
    liabilityFingerprint: string,
  ): Promise<TaxObligationRow | null> {
    const row = await this.prisma.taxObligationRecord.findFirst({
      where: { taxSubjectId, competence, liabilityFingerprint },
      orderBy: { revision: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  private sameBinding(
    row: TaxObligationRow,
    input: Parameters<ITaxObligationRepository['materialize']>[0],
  ): boolean {
    // Operational payment status (OPEN → PAID) is intentionally NOT part of the
    // immutable liability binding: re-materializing an unchanged liability after
    // payment must return the existing revision (DUPLICATE) instead of creating
    // a spurious revision that would "un-pay" the obligation.
    return (
      row.taxBucket === input.taxBucket &&
      row.revenueCode === input.revenueCode &&
      row.deadlineEntryId === input.deadlineEntryId &&
      row.principalAmount === input.principalAmount &&
      row.currency === input.currency &&
      isoDate(row.dueDate) === isoDate(input.dueDate) &&
      row.reasonCode === input.reasonCode &&
      row.darfReadiness === input.darfReadiness &&
      row.darfReadinessReason === input.darfReadinessReason
    );
  }

  async materialize(
    input: Parameters<ITaxObligationRepository['materialize']>[0],
  ): Promise<{ outcome: ObligationWriteOutcome; record: TaxObligationRow }> {
    try {
      const sameFingerprint = await this.findLatestByIdentity(
        input.taxSubjectId,
        input.competence,
        input.liabilityFingerprint,
      );
      if (sameFingerprint && this.sameBinding(sameFingerprint, input)) {
        return { outcome: 'DUPLICATE', record: sameFingerprint };
      }
      // Active (non-terminal) obligations for the same competence. A changed
      // liability (new fingerprint) supersedes them; payment is preserved.
      const active = await this.prisma.taxObligationRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          competence: input.competence,
          status: { in: ['OPEN', 'PAID', 'BLOCKED', 'PROVISIONAL', 'NO_PAYMENT_DUE'] },
        },
        orderBy: [{ createdAt: 'desc' }, { revision: 'desc' }],
      });
      const revision = (sameFingerprint?.revision ?? 0) + 1;
      const created = await this.prisma.taxObligationRecord.create({
        data: {
          taxSubjectId: input.taxSubjectId,
          competence: input.competence,
          taxBucket: input.taxBucket,
          revenueCode: input.revenueCode,
          liabilityFingerprint: input.liabilityFingerprint,
          revision,
          deadlineEntryId: input.deadlineEntryId,
          principalAmount:
            input.principalAmount === null ? null : new Prisma.Decimal(input.principalAmount),
          currency: input.currency,
          dueDate: input.dueDate,
          status: input.status,
          reasonCode: input.reasonCode,
          darfReadiness: input.darfReadiness,
          darfReadinessReason: input.darfReadinessReason,
          dataQuality: input.dataQuality,
          provenance: json(input.provenance),
        },
      });
      for (const previous of active) {
        await this.prisma.taxObligationRecord.update({
          where: { id: previous.id },
          data: {
            // A paid obligation whose liability changed requires explicit
            // reconciliation; payment evidence is preserved (ADR-267).
            status: previous.status === 'PAID' ? 'RECONCILIATION_REQUIRED' : 'SUPERSEDED',
            supersededById: created.id,
          },
        });
      }
      if (active.length > 0 || sameFingerprint) {
        return { outcome: 'SUPERSEDED', record: this.map(created) };
      }
      return { outcome: 'CREATED', record: this.map(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const latest = await this.findLatestByIdentity(
          input.taxSubjectId,
          input.competence,
          input.liabilityFingerprint,
        );
        if (latest) return { outcome: 'DUPLICATE', record: latest };
      }
      throw new PersistenceError(
        `Failed to materialize tax obligation: ${(error as Error).message}`,
      );
    }
  }

  async markPaid(id: string, taxSubjectId: string): Promise<TaxObligationRow | null> {
    const row = await this.prisma.taxObligationRecord.findFirst({ where: { id, taxSubjectId } });
    if (!row) return null;
    if (row.status === 'PAID') return this.map(row);
    const updated = await this.prisma.taxObligationRecord.update({
      where: { id },
      data: { status: 'PAID' },
    });
    return this.map(updated);
  }

  async markReconciliationRequired(
    id: string,
    taxSubjectId: string,
  ): Promise<TaxObligationRow | null> {
    const row = await this.prisma.taxObligationRecord.findFirst({ where: { id, taxSubjectId } });
    if (!row) return null;
    const updated = await this.prisma.taxObligationRecord.update({
      where: { id },
      data: { status: 'RECONCILIATION_REQUIRED' },
    });
    return this.map(updated);
  }
}
