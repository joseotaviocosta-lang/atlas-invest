import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxSettlementRepository,
  TaxSettlementRow,
  TaxSettlementWriteInput,
  TaxSettlementWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export class TaxSettlementRepository implements ITaxSettlementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    taxSubjectId: string;
    obligationKey: string;
    sourceFingerprint: string;
    revision: number;
    paymentDate: Date;
    amountReported: Prisma.Decimal;
    revenueCodeReported: string | null;
    referencePeriod: string;
    externalReference: string | null;
    note: string | null;
    verificationStatus: string;
    createdAt: Date;
  }): TaxSettlementRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      obligationKey: row.obligationKey,
      sourceFingerprint: row.sourceFingerprint,
      revision: row.revision,
      paymentDate: row.paymentDate,
      amountReported: row.amountReported.toString(),
      revenueCodeReported: row.revenueCodeReported,
      referencePeriod: row.referencePeriod,
      externalReference: row.externalReference,
      note: row.note,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string): Promise<TaxSettlementRow | null> {
    try {
      const row = await this.prisma.taxSettlementRecord.findUnique({
        where: { id },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to find tax settlement record by id ${id}`);
    }
  }

  async findLatest(input: {
    taxSubjectId: string;
    obligationKey: string;
  }): Promise<TaxSettlementRow | null> {
    try {
      const row = await this.prisma.taxSettlementRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          obligationKey: input.obligationKey,
        },
        orderBy: {
          revision: 'desc',
        },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find latest tax settlement record for obligation ${input.obligationKey}`,
      );
    }
  }

  async listBySubject(input: {
    taxSubjectId: string;
    obligationKey?: string;
  }): Promise<TaxSettlementRow[]> {
    try {
      const rows = await this.prisma.taxSettlementRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          ...(input.obligationKey ? { obligationKey: input.obligationKey } : {}),
        },
        orderBy: [{ paymentDate: 'desc' }, { revision: 'desc' }],
      });
      return rows.map((r) => this.map(r));
    } catch {
      throw new PersistenceError(
        `Failed to list tax settlement records for subject ${input.taxSubjectId}`,
      );
    }
  }

  async listHistory(input: {
    taxSubjectId: string;
    obligationKey: string;
  }): Promise<TaxSettlementRow[]> {
    try {
      const rows = await this.prisma.taxSettlementRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          obligationKey: input.obligationKey,
        },
        orderBy: {
          revision: 'desc',
        },
      });
      return rows.map((r) => this.map(r));
    } catch {
      throw new PersistenceError(
        `Failed to list tax settlement history for obligation ${input.obligationKey}`,
      );
    }
  }

  async create(
    input: TaxSettlementWriteInput,
  ): Promise<{ outcome: TaxSettlementWriteOutcome; record: TaxSettlementRow }> {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const latest = await this.findLatest({
          taxSubjectId: input.taxSubjectId,
          obligationKey: input.obligationKey,
        });

        const paymentDateStr =
          typeof input.paymentDate === 'string'
            ? input.paymentDate
            : input.paymentDate.toISOString().slice(0, 10);

        // Idempotency check: if all reported fields match the latest record, return IDEMPOTENT
        if (
          latest &&
          latest.sourceFingerprint === input.sourceFingerprint &&
          latest.amountReported === input.amountReported &&
          latest.paymentDate.toISOString().slice(0, 10) === paymentDateStr &&
          latest.referencePeriod === input.referencePeriod &&
          latest.externalReference === (input.externalReference ?? null) &&
          latest.revenueCodeReported === (input.revenueCodeReported ?? null) &&
          latest.note === (input.note ?? null)
        ) {
          return { outcome: 'IDEMPOTENT', record: latest };
        }

        const nextRevision = latest ? latest.revision + 1 : 1;
        const paymentDateObj =
          typeof input.paymentDate === 'string'
            ? new Date(`${input.paymentDate}T00:00:00.000Z`)
            : input.paymentDate;

        const created = await this.prisma.taxSettlementRecord.create({
          data: {
            id: input.id ?? randomUUID(),
            taxSubjectId: input.taxSubjectId,
            obligationKey: input.obligationKey,
            sourceFingerprint: input.sourceFingerprint,
            revision: nextRevision,
            paymentDate: paymentDateObj,
            amountReported: new Prisma.Decimal(input.amountReported),
            revenueCodeReported: input.revenueCodeReported ?? null,
            referencePeriod: input.referencePeriod,
            externalReference: input.externalReference ?? null,
            note: input.note ?? null,
            verificationStatus: input.verificationStatus ?? 'USER_REPORTED',
          },
        });

        return {
          outcome: latest ? 'SUPERSEDED' : 'CREATED',
          record: this.map(created),
        };
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < maxRetries
        ) {
          // Retry on unique constraint collision on (taxSubjectId, obligationKey, revision)
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 + 5));
          continue;
        }
        if (err instanceof PersistenceError) {
          throw err;
        }
        throw new PersistenceError(
          `Failed to record tax settlement for obligation ${input.obligationKey}`,
        );
      }
    }
    throw new PersistenceError(
      `Failed to record tax settlement for obligation ${input.obligationKey}`,
    );
  }
}
