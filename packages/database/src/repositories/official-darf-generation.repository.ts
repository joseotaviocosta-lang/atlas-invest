import { Prisma, PrismaClient } from '@prisma/client';
import { IOfficialDarfGenerationRepository, OfficialDarfGenerationRow } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  taxSubjectId: string;
  taxObligationId: string | null;
  taxPaymentAggregationId: string | null;
  generationMode: string;
  revenueCode: string;
  competence: string;
  dueDate: Date | null;
  principalAmount: Prisma.Decimal;
  lateFeeAmount: Prisma.Decimal | null;
  interestAmount: Prisma.Decimal | null;
  totalAmount: Prisma.Decimal;
  currency: string;
  officialDocumentId: string | null;
  officialReference: string | null;
  sourceSystem: string;
  status: string;
  version: number;
  fingerprint: string;
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Phase 4F — immutable official DARF generation/handoff records. Idempotent per
 * `(taxSubjectId, taxObligationId, fingerprint)`; a changed preparation
 * supersedes the previous record (ADR-288). Never stores a locally rendered
 * document (Atlas does not generate the official DARF).
 */
export class OfficialDarfGenerationRepository implements IOfficialDarfGenerationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): OfficialDarfGenerationRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      taxObligationId: row.taxObligationId,
      taxPaymentAggregationId: row.taxPaymentAggregationId,
      generationMode: row.generationMode,
      revenueCode: row.revenueCode,
      competence: row.competence,
      dueDate: row.dueDate,
      principalAmount: row.principalAmount.toString(),
      lateFeeAmount: row.lateFeeAmount === null ? null : row.lateFeeAmount.toString(),
      interestAmount: row.interestAmount === null ? null : row.interestAmount.toString(),
      totalAmount: row.totalAmount.toString(),
      currency: row.currency,
      officialDocumentId: row.officialDocumentId,
      officialReference: row.officialReference,
      sourceSystem: row.sourceSystem,
      status: row.status,
      version: row.version,
      fingerprint: row.fingerprint,
      supersededById: row.supersededById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string, taxSubjectId: string): Promise<OfficialDarfGenerationRow | null> {
    const row = await this.prisma.officialDarfGenerationRecord.findFirst({
      where: { id, taxSubjectId },
    });
    return row ? this.map(row) : null;
  }

  async list(
    taxSubjectId: string,
    filter?: { status?: string; obligationId?: string },
  ): Promise<OfficialDarfGenerationRow[]> {
    const rows = await this.prisma.officialDarfGenerationRecord.findMany({
      where: {
        taxSubjectId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.obligationId ? { taxObligationId: filter.obligationId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async findLatestByIdentity(
    taxSubjectId: string,
    taxObligationId: string,
    fingerprint: string,
  ): Promise<OfficialDarfGenerationRow | null> {
    const row = await this.prisma.officialDarfGenerationRecord.findFirst({
      where: { taxSubjectId, taxObligationId, fingerprint },
      orderBy: { version: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  async materialize(
    input: Parameters<IOfficialDarfGenerationRepository['materialize']>[0],
  ): Promise<{
    outcome: 'CREATED' | 'DUPLICATE' | 'SUPERSEDED';
    record: OfficialDarfGenerationRow;
  }> {
    try {
      const same = input.taxObligationId
        ? await this.findLatestByIdentity(
            input.taxSubjectId,
            input.taxObligationId,
            input.fingerprint,
          )
        : null;
      if (same) return { outcome: 'DUPLICATE', record: same };

      const previous = input.taxObligationId
        ? await this.prisma.officialDarfGenerationRecord.findMany({
            where: {
              taxSubjectId: input.taxSubjectId,
              taxObligationId: input.taxObligationId,
              status: { in: ['PREPARATION_READY', 'USER_ACTION_REQUIRED', 'GENERATING'] },
            },
            orderBy: [{ createdAt: 'desc' }],
          })
        : [];

      const version = (previous[0]?.version ?? 0) + 1;
      const created = await this.prisma.officialDarfGenerationRecord.create({
        data: {
          taxSubjectId: input.taxSubjectId,
          taxObligationId: input.taxObligationId,
          taxPaymentAggregationId: input.taxPaymentAggregationId,
          generationMode: input.generationMode,
          revenueCode: input.revenueCode,
          competence: input.competence,
          dueDate: input.dueDate,
          principalAmount: new Prisma.Decimal(input.principalAmount),
          lateFeeAmount:
            input.lateFeeAmount === null ? null : new Prisma.Decimal(input.lateFeeAmount),
          interestAmount:
            input.interestAmount === null ? null : new Prisma.Decimal(input.interestAmount),
          totalAmount: new Prisma.Decimal(input.totalAmount),
          currency: input.currency,
          officialDocumentId: null,
          officialReference: null,
          sourceSystem: input.sourceSystem,
          status: input.status,
          version,
          fingerprint: input.fingerprint,
        },
      });
      for (const prior of previous) {
        await this.prisma.officialDarfGenerationRecord.update({
          where: { id: prior.id },
          data: { status: 'SUPERSEDED', supersededById: created.id },
        });
      }
      return {
        outcome: previous.length > 0 ? 'SUPERSEDED' : 'CREATED',
        record: this.map(created),
      };
    } catch (error) {
      if (isUniqueViolation(error) && input.taxObligationId) {
        const latest = await this.findLatestByIdentity(
          input.taxSubjectId,
          input.taxObligationId,
          input.fingerprint,
        );
        if (latest) return { outcome: 'DUPLICATE', record: latest };
      }
      throw new PersistenceError(
        `Failed to materialize DARF generation record: ${(error as Error).message}`,
      );
    }
  }
}
