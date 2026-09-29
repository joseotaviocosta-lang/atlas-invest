import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxPaymentEvidenceRepository,
  PaymentWriteOutcome,
  TaxPaymentEvidenceRow,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  obligationId: string;
  taxSubjectId: string;
  paidAt: Date;
  amount: Prisma.Decimal;
  currency: string;
  sourceType: string;
  sourceReference: string | null;
  confirmedAt: Date;
  status: string;
  fingerprint: string;
  createdAt: Date;
};

/**
 * Phase 4C.2 — manual tax payment evidence (operational only). Idempotent on the
 * same source identity; same source with a different value is an explicit
 * conflict (never an overwrite). Payment never mutates the tax liability
 * (ADR-266).
 */
export class TaxPaymentEvidenceRepository implements ITaxPaymentEvidenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): TaxPaymentEvidenceRow {
    return {
      id: row.id,
      obligationId: row.obligationId,
      taxSubjectId: row.taxSubjectId,
      paidAt: row.paidAt,
      amount: row.amount.toString(),
      currency: row.currency,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      confirmedAt: row.confirmedAt,
      status: row.status,
      fingerprint: row.fingerprint,
      createdAt: row.createdAt,
    };
  }

  async listByObligation(
    obligationId: string,
    taxSubjectId: string,
  ): Promise<TaxPaymentEvidenceRow[]> {
    const rows = await this.prisma.taxPaymentEvidenceRecord.findMany({
      where: { obligationId, taxSubjectId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async findById(id: string, taxSubjectId: string): Promise<TaxPaymentEvidenceRow | null> {
    const row = await this.prisma.taxPaymentEvidenceRecord.findFirst({
      where: { id, taxSubjectId },
    });
    return row ? this.map(row) : null;
  }

  async record(
    input: Parameters<ITaxPaymentEvidenceRepository['record']>[0],
  ): Promise<{ outcome: PaymentWriteOutcome; record: TaxPaymentEvidenceRow }> {
    try {
      if (input.sourceReference) {
        const bySource = await this.prisma.taxPaymentEvidenceRecord.findUnique({
          where: {
            tax_payment_evidence_source_identity: {
              obligationId: input.obligationId,
              sourceReference: input.sourceReference,
            },
          },
        });
        if (bySource) {
          return bySource.fingerprint === input.fingerprint
            ? { outcome: 'DUPLICATE', record: this.map(bySource) }
            : { outcome: 'CONFLICT', record: this.map(bySource) };
        }
      }
      const byFingerprint = await this.prisma.taxPaymentEvidenceRecord.findUnique({
        where: {
          tax_payment_evidence_fingerprint_identity: {
            obligationId: input.obligationId,
            fingerprint: input.fingerprint,
          },
        },
      });
      if (byFingerprint) {
        return { outcome: 'DUPLICATE', record: this.map(byFingerprint) };
      }
      const created = await this.prisma.taxPaymentEvidenceRecord.create({
        data: {
          obligationId: input.obligationId,
          taxSubjectId: input.taxSubjectId,
          paidAt: input.paidAt,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          sourceType: input.sourceType,
          sourceReference: input.sourceReference,
          confirmedAt: input.confirmedAt,
          status: input.status,
          fingerprint: input.fingerprint,
        },
      });
      return { outcome: 'CREATED', record: this.map(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const byFingerprint = await this.prisma.taxPaymentEvidenceRecord.findUnique({
          where: {
            tax_payment_evidence_fingerprint_identity: {
              obligationId: input.obligationId,
              fingerprint: input.fingerprint,
            },
          },
        });
        if (byFingerprint) return { outcome: 'DUPLICATE', record: this.map(byFingerprint) };
        if (input.sourceReference) {
          const bySource = await this.prisma.taxPaymentEvidenceRecord.findUnique({
            where: {
              tax_payment_evidence_source_identity: {
                obligationId: input.obligationId,
                sourceReference: input.sourceReference,
              },
            },
          });
          if (bySource) return { outcome: 'CONFLICT', record: this.map(bySource) };
        }
      }
      throw new PersistenceError(`Failed to record payment evidence: ${(error as Error).message}`);
    }
  }
}
