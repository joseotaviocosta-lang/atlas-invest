import { Prisma, PrismaClient } from '@prisma/client';
import {
  DeadlineRegistryWriteOutcome,
  FederalTaxDeadlineRow,
  IFederalTaxDeadlineRepository,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

const json = (value: Record<string, unknown> | null | undefined) =>
  (value ?? {}) as Prisma.InputJsonValue;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  revenueCode: string;
  taxBucket: string;
  competence: string;
  dueDate: Date;
  status: string;
  sourceAuthority: string;
  sourceDocument: string;
  sourceReference: string;
  sourcePublishedAt: Date;
  verifiedAt: Date;
  version: number;
  supersedesEntryId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

/**
 * Phase 4C.2 — persisted official federal tax deadline registry (direct
 * authority). Entries are immutable/versioned; corrections create a new version
 * (ADR-263). No network, no generic calendar (ADR-268).
 */
export class FederalTaxDeadlineRepository implements IFederalTaxDeadlineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): FederalTaxDeadlineRow {
    return {
      id: row.id,
      revenueCode: row.revenueCode,
      taxBucket: row.taxBucket,
      competence: row.competence,
      dueDate: row.dueDate,
      status: row.status,
      sourceAuthority: row.sourceAuthority,
      sourceDocument: row.sourceDocument,
      sourceReference: row.sourceReference,
      sourcePublishedAt: row.sourcePublishedAt,
      verifiedAt: row.verifiedAt,
      version: row.version,
      supersedesEntryId: row.supersedesEntryId,
      metadata: (row.metadata ?? null) as Record<string, unknown> | null,
      createdAt: row.createdAt,
    };
  }

  async listAll(): Promise<FederalTaxDeadlineRow[]> {
    const rows = await this.prisma.federalTaxDeadlineEntry.findMany({
      orderBy: [{ revenueCode: 'asc' }, { competence: 'asc' }, { version: 'desc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async listByRevenueCodeAndCompetence(
    revenueCode: string,
    competence: string,
  ): Promise<FederalTaxDeadlineRow[]> {
    const rows = await this.prisma.federalTaxDeadlineEntry.findMany({
      where: { revenueCode, competence },
      orderBy: { version: 'desc' },
    });
    return rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<FederalTaxDeadlineRow | null> {
    const row = await this.prisma.federalTaxDeadlineEntry.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async createEntry(
    input: Parameters<IFederalTaxDeadlineRepository['createEntry']>[0],
  ): Promise<{ outcome: DeadlineRegistryWriteOutcome; record: FederalTaxDeadlineRow }> {
    const versionIdentity = {
      revenueCode: input.revenueCode,
      competence: input.competence,
      version: input.version,
    };
    try {
      const existingVersion = await this.prisma.federalTaxDeadlineEntry.findUnique({
        where: { federal_tax_deadline_version_identity: versionIdentity },
      });
      if (existingVersion) {
        return { outcome: 'DUPLICATE', record: this.map(existingVersion) };
      }
      if (input.status === 'VERIFIED') {
        const active = await this.prisma.federalTaxDeadlineEntry.findFirst({
          where: {
            revenueCode: input.revenueCode,
            competence: input.competence,
            status: 'VERIFIED',
          },
        });
        if (active) {
          return { outcome: 'CONFLICT', record: this.map(active) };
        }
      }
      const created = await this.prisma.federalTaxDeadlineEntry.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          revenueCode: input.revenueCode,
          taxBucket: input.taxBucket,
          competence: input.competence,
          dueDate: input.dueDate,
          status: input.status,
          sourceAuthority: input.sourceAuthority,
          sourceDocument: input.sourceDocument,
          sourceReference: input.sourceReference,
          sourcePublishedAt: input.sourcePublishedAt,
          verifiedAt: input.verifiedAt,
          version: input.version,
          supersedesEntryId: input.supersedesEntryId,
          metadata: json(input.metadata),
        },
      });
      return { outcome: 'CREATED', record: this.map(created) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.federalTaxDeadlineEntry.findUnique({
          where: { federal_tax_deadline_version_identity: versionIdentity },
        });
        if (again) return { outcome: 'DUPLICATE', record: this.map(again) };
        const active = await this.prisma.federalTaxDeadlineEntry.findFirst({
          where: {
            revenueCode: input.revenueCode,
            competence: input.competence,
            status: 'VERIFIED',
          },
        });
        if (active) return { outcome: 'CONFLICT', record: this.map(active) };
      }
      throw new PersistenceError(`Failed to create deadline entry: ${(error as Error).message}`);
    }
  }

  async markSuperseded(
    id: string,
    _supersededByEntryId: string,
  ): Promise<FederalTaxDeadlineRow | null> {
    const row = await this.prisma.federalTaxDeadlineEntry.findUnique({ where: { id } });
    if (!row) return null;
    if (row.status === 'SUPERSEDED') return this.map(row);
    const updated = await this.prisma.federalTaxDeadlineEntry.update({
      where: { id },
      data: { status: 'SUPERSEDED' },
    });
    return this.map(updated);
  }
}
