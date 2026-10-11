import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxSettlementRepository,
  TaxSettlementRow,
  TaxSettlementWriteInput,
  TaxSettlementWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function computeFallbackEvidenceFingerprint(input: {
  taxSubjectId: string;
  obligationKey: string;
  sourceFingerprint: string;
  paymentDate: Date | string;
  amountReported: string;
  revenueCodeReported?: string | null;
  referencePeriod: string;
  externalReference?: string | null;
  note?: string | null;
  verificationStatus?: string;
}): string {
  const pDateStr =
    typeof input.paymentDate === 'string'
      ? input.paymentDate.trim().slice(0, 10)
      : input.paymentDate.toISOString().slice(0, 10);

  const trimmedAmt = input.amountReported.trim();
  let canonicalAmt = trimmedAmt;
  if (trimmedAmt.includes('.')) {
    const [intP, fracP] = trimmedAmt.split('.');
    const cleanInt = (intP ?? '0').replace(/^0+(?=\d)/, '') || '0';
    const cleanFrac = (fracP ?? '').replace(/0+$/, '');
    canonicalAmt = cleanFrac ? `${cleanInt}.${cleanFrac}` : cleanInt;
  } else {
    canonicalAmt = trimmedAmt.replace(/^0+(?=\d)/, '') || '0';
  }

  const payload = {
    amountReported: canonicalAmt,
    externalReference: input.externalReference ? input.externalReference.trim() : null,
    note: input.note ? input.note.trim() : null,
    obligationKey: input.obligationKey.trim(),
    paymentDate: pDateStr,
    referencePeriod: input.referencePeriod.trim(),
    revenueCodeReported: input.revenueCodeReported ? input.revenueCodeReported.trim() : null,
    sourceFingerprint: input.sourceFingerprint.trim(),
    taxSubjectId: input.taxSubjectId.trim().toLowerCase(),
    verificationStatus: (input.verificationStatus ?? 'USER_REPORTED').trim(),
  };

  const entries = Object.entries(payload).sort(([a], [b]) => a.localeCompare(b));
  const serialized = `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',')}}`;
  return createHash('sha256').update(serialized).digest('hex');
}

export class TaxSettlementRepository implements ITaxSettlementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    taxSubjectId: string;
    obligationKey: string;
    sourceFingerprint: string;
    evidenceFingerprint: string;
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
      evidenceFingerprint: row.evidenceFingerprint,
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
    const evidenceFingerprint =
      input.evidenceFingerprint ?? computeFallbackEvidenceFingerprint(input);

    // 1. Semantic uniqueness lookup: If identical evidence was already recorded for this
    // (taxSubjectId, obligationKey, sourceFingerprint, evidenceFingerprint), return IDEMPOTENT.
    const existing = await this.prisma.taxSettlementRecord.findUnique({
      where: {
        tax_settlement_record_semantic_identity: {
          taxSubjectId: input.taxSubjectId,
          obligationKey: input.obligationKey,
          sourceFingerprint: input.sourceFingerprint,
          evidenceFingerprint,
        },
      },
    });
    if (existing) {
      return { outcome: 'IDEMPOTENT', record: this.map(existing) };
    }

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const latest = await this.findLatest({
          taxSubjectId: input.taxSubjectId,
          obligationKey: input.obligationKey,
        });

        // Double check latest matches semantic fingerprint
        if (
          latest &&
          latest.sourceFingerprint === input.sourceFingerprint &&
          latest.evidenceFingerprint === evidenceFingerprint
        ) {
          return { outcome: 'IDEMPOTENT', record: latest };
        }

        const nextRevision = latest ? latest.revision + 1 : 1;
        const paymentDateObj =
          typeof input.paymentDate === 'string'
            ? new Date(`${input.paymentDate.trim().slice(0, 10)}T00:00:00.000Z`)
            : input.paymentDate;

        const created = await this.prisma.taxSettlementRecord.create({
          data: {
            id: input.id ?? randomUUID(),
            taxSubjectId: input.taxSubjectId,
            obligationKey: input.obligationKey,
            sourceFingerprint: input.sourceFingerprint,
            evidenceFingerprint,
            revision: nextRevision,
            paymentDate: paymentDateObj,
            amountReported: new Prisma.Decimal(input.amountReported),
            revenueCodeReported: input.revenueCodeReported
              ? input.revenueCodeReported.trim()
              : null,
            referencePeriod: input.referencePeriod.trim(),
            externalReference: input.externalReference ? input.externalReference.trim() : null,
            note: input.note ? input.note.trim() : null,
            verificationStatus: input.verificationStatus ?? 'USER_REPORTED',
          },
        });

        return {
          outcome: latest ? 'SUPERSEDED' : 'CREATED',
          record: this.map(created),
        };
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Check if collision occurred on the semantic uniqueness constraint
          const duplicate = await this.prisma.taxSettlementRecord.findUnique({
            where: {
              tax_settlement_record_semantic_identity: {
                taxSubjectId: input.taxSubjectId,
                obligationKey: input.obligationKey,
                sourceFingerprint: input.sourceFingerprint,
                evidenceFingerprint,
              },
            },
          });
          if (duplicate) {
            return { outcome: 'IDEMPOTENT', record: this.map(duplicate) };
          }

          // Otherwise collision occurred on (taxSubjectId, obligationKey, revision).
          // Concurrent distinct submissions raced for the same revision slot — retry with backoff.
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 + 5));
            continue;
          }
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
