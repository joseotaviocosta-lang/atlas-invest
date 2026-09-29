import { Prisma, PrismaClient } from '@prisma/client';
import { IOfficialLateFeeRepository, OfficialLateFeeRow } from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  municipalityCode: string;
  dueDate: Date;
  paymentDate: Date;
  principalAmount: Prisma.Decimal;
  lateFeeAmount: Prisma.Decimal;
  lateFeePercent: Prisma.Decimal;
  startBusinessDate: Date | null;
  sourceSystem: string;
  sourceReference: string;
  sourceRetrievedAt: Date;
  verifiedAt: Date;
  version: number;
  fingerprint: string;
  createdAt: Date;
};

/**
 * Phase 4D.2 — immutable official late-fee snapshots. Authoritative for the
 * business-day-sensitive late fee; corrections create a new version (ADR-271).
 */
export class OfficialLateFeeRepository implements IOfficialLateFeeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): OfficialLateFeeRow {
    return {
      id: row.id,
      municipalityCode: row.municipalityCode,
      dueDate: row.dueDate,
      paymentDate: row.paymentDate,
      principalAmount: row.principalAmount.toString(),
      lateFeeAmount: row.lateFeeAmount.toString(),
      lateFeePercent: row.lateFeePercent.toString(),
      startBusinessDate: row.startBusinessDate,
      sourceSystem: row.sourceSystem,
      sourceReference: row.sourceReference,
      sourceRetrievedAt: row.sourceRetrievedAt,
      verifiedAt: row.verifiedAt,
      version: row.version,
      fingerprint: row.fingerprint,
      createdAt: row.createdAt,
    };
  }

  async findLatest(input: {
    municipalityCode: string;
    dueDate: Date;
    paymentDate: Date;
    principalAmount: string;
  }): Promise<OfficialLateFeeRow | null> {
    const row = await this.prisma.officialLateFeeSnapshot.findFirst({
      where: {
        municipalityCode: input.municipalityCode,
        dueDate: input.dueDate,
        paymentDate: input.paymentDate,
        principalAmount: new Prisma.Decimal(input.principalAmount),
      },
      orderBy: { version: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  async create(
    input: Parameters<IOfficialLateFeeRepository['create']>[0],
  ): Promise<{ outcome: 'CREATED' | 'DUPLICATE'; record: OfficialLateFeeRow }> {
    const identity = {
      municipalityCode: input.municipalityCode,
      dueDate: input.dueDate,
      paymentDate: input.paymentDate,
      principalAmount: new Prisma.Decimal(input.principalAmount),
      version: input.version,
    };
    try {
      const existing = await this.prisma.officialLateFeeSnapshot.findUnique({
        where: { official_late_fee_snapshot_identity: identity },
      });
      if (existing) return { outcome: 'DUPLICATE', record: this.map(existing) };
      const created = await this.prisma.officialLateFeeSnapshot.create({
        data: {
          ...identity,
          lateFeeAmount: new Prisma.Decimal(input.lateFeeAmount),
          lateFeePercent: new Prisma.Decimal(input.lateFeePercent),
          startBusinessDate: input.startBusinessDate,
          sourceSystem: input.sourceSystem,
          sourceReference: input.sourceReference,
          sourceRetrievedAt: input.sourceRetrievedAt,
          verifiedAt: input.verifiedAt,
          fingerprint: input.fingerprint,
        },
      });
      return { outcome: 'CREATED', record: this.map(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.officialLateFeeSnapshot.findUnique({
          where: { official_late_fee_snapshot_identity: identity },
        });
        if (again) return { outcome: 'DUPLICATE', record: this.map(again) };
      }
      throw new PersistenceError(`Failed to create late-fee snapshot: ${(error as Error).message}`);
    }
  }
}
