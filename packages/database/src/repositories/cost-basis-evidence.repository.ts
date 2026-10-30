import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  CostBasisEvidenceRow,
  CostBasisEvidenceWriteOutcome,
  ICostBasisEvidenceRepository,
} from './interfaces';
import { DecimalConverter } from '../mappers/decimal-converter';
import { PersistenceError } from '../errors/persistence-error';
import { PersistenceMappingError } from '../errors/persistence-mapping-error';
import {
  COST_EVIDENCE_SOURCES,
  COST_EVIDENCE_STATUSES,
  COST_EVIDENCE_TYPES,
} from '@atlas/domain';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function formatDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

type Row = {
  id: string;
  portfolioId: string;
  accountId: string;
  assetId: string;
  evidenceType: string;
  source: string;
  quantityCovered: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
  currency: string;
  acquisitionDate: Date;
  evidenceDate: Date | null;
  status: string;
  sourceReference: string;
  notes: string | null;
  version: number;
  supersedesId: string | null;
  fingerprint: string;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  rejectedReason: string | null;
  createdAt: Date;
};

/**
 * Cost-basis evidence persistence (ADR-310). Append-only revisions; the
 * unique (portfolioId, fingerprint) identity makes exact resubmission
 * idempotent. Financial fields are validated fail-closed on read: unknown
 * enums, non-positive quantities or malformed decimals never surface as
 * usable evidence.
 */
export class CostBasisEvidenceRepository implements ICostBasisEvidenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): CostBasisEvidenceRow {
    if (!(COST_EVIDENCE_TYPES as readonly string[]).includes(row.evidenceType)) {
      throw new PersistenceMappingError(`Unknown evidence type "${row.evidenceType}"`);
    }
    if (!(COST_EVIDENCE_SOURCES as readonly string[]).includes(row.source)) {
      throw new PersistenceMappingError(`Unknown evidence source "${row.source}"`);
    }
    if (!(COST_EVIDENCE_STATUSES as readonly string[]).includes(row.status)) {
      throw new PersistenceMappingError(`Unknown evidence status "${row.status}"`);
    }
    const quantityCovered = DecimalConverter.toCanonicalString(row.quantityCovered);
    if (quantityCovered === null) {
      throw new PersistenceMappingError('Evidence quantityCovered is missing');
    }
    const unitCost = DecimalConverter.toCanonicalString(row.unitCost);
    const totalCost = DecimalConverter.toCanonicalString(row.totalCost);
    if (totalCost === null) {
      throw new PersistenceMappingError('Evidence totalCost is missing');
    }
    if (!Number.isInteger(row.version) || row.version < 1) {
      throw new PersistenceMappingError(`Invalid evidence version "${row.version}"`);
    }
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      accountId: row.accountId,
      assetId: row.assetId,
      evidenceType: row.evidenceType,
      source: row.source,
      quantityCovered,
      unitCost,
      totalCost,
      currency: row.currency,
      acquisitionDate: formatDateOnly(row.acquisitionDate),
      evidenceDate: row.evidenceDate ? formatDateOnly(row.evidenceDate) : null,
      status: row.status,
      sourceReference: row.sourceReference,
      notes: row.notes,
      version: row.version,
      supersedesId: row.supersedesId,
      fingerprint: row.fingerprint,
      confirmedBy: row.confirmedBy,
      confirmedAt: row.confirmedAt,
      rejectedReason: row.rejectedReason,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string): Promise<CostBasisEvidenceRow | null> {
    const row = await this.prisma.costBasisEvidenceRecord.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async listByScope(input: {
    portfolioId: string;
    accountId?: string;
    assetId?: string;
    statuses?: string[];
  }): Promise<CostBasisEvidenceRow[]> {
    const rows = await this.prisma.costBasisEvidenceRecord.findMany({
      where: {
        portfolioId: input.portfolioId,
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.assetId ? { assetId: input.assetId } : {}),
        ...(input.statuses ? { status: { in: input.statuses } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async listCurrentByScope(input: {
    portfolioId: string;
    accountId?: string;
    assetId?: string;
  }): Promise<CostBasisEvidenceRow[]> {
    const rows = await this.listByScope(input);
    const superseded = new Set<string>();
    for (const row of rows) {
      if (row.supersedesId) superseded.add(row.supersedesId);
    }
    return rows.filter((row) => !superseded.has(row.id));
  }

  async create(input: {
    portfolioId: string;
    accountId: string;
    assetId: string;
    evidenceType: string;
    source: string;
    quantityCovered: string;
    unitCost?: string | null;
    totalCost?: string | null;
    currency: string;
    acquisitionDate: string;
    evidenceDate?: string | null;
    status: string;
    sourceReference: string;
    notes?: string | null;
    supersedesId?: string | null;
    fingerprint: string;
    confirmedBy?: string | null;
    rejectedReason?: string | null;
  }): Promise<{ outcome: CostBasisEvidenceWriteOutcome; record: CostBasisEvidenceRow }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Revisions/transitions carry a parent: they always insert a new
      // version row (the per-version identity permits the same fingerprint).
      // Only parent-less creates are deduplicated by fingerprint.
      if (!input.supersedesId) {
        const existing = await this.prisma.costBasisEvidenceRecord.findFirst({
          where: { portfolioId: input.portfolioId, fingerprint: input.fingerprint },
        });
        if (existing) {
          return { outcome: 'DUPLICATE', record: this.map(existing) };
        }
      }
      let version = 1;
      if (input.supersedesId) {
        const parent = await this.prisma.costBasisEvidenceRecord.findFirst({
          where: { id: input.supersedesId, portfolioId: input.portfolioId },
        });
        if (!parent) {
          throw new PersistenceError(
            `Cannot revise unknown evidence '${input.supersedesId}'`,
          );
        }
        version = parent.version + 1;
      }
      try {
        const quantityCovered = DecimalConverter.toPersistence(input.quantityCovered);
        if (quantityCovered === null) {
          throw new PersistenceMappingError('Evidence quantityCovered is missing');
        }
        const created = await this.prisma.costBasisEvidenceRecord.create({
          data: {
            id: randomUUID(),
            portfolioId: input.portfolioId,
            accountId: input.accountId,
            assetId: input.assetId,
            evidenceType: input.evidenceType,
            source: input.source,
            quantityCovered,
            unitCost: DecimalConverter.toPersistence(input.unitCost),
            totalCost: DecimalConverter.toPersistence(input.totalCost),
            currency: input.currency,
            acquisitionDate: new Date(`${input.acquisitionDate}T00:00:00.000Z`),
            evidenceDate: input.evidenceDate ? new Date(`${input.evidenceDate}T00:00:00.000Z`) : null,
            status: input.status,
            sourceReference: input.sourceReference,
            notes: input.notes ?? null,
            version,
            supersedesId: input.supersedesId ?? null,
            fingerprint: input.fingerprint,
            confirmedBy: input.confirmedBy ?? null,
            confirmedAt: input.status === 'VERIFIED' ? new Date() : null,
            rejectedReason: input.rejectedReason ?? null,
          },
        });
        return { outcome: 'CREATED', record: this.map(created) };
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Concurrent identical insert; re-read for an idempotent outcome.
          // For revisions this converges on the concurrently-inserted row
          // when it carries the same fingerprint+version.
          const raced = await this.prisma.costBasisEvidenceRecord.findFirst({
            where: {
              portfolioId: input.portfolioId,
              fingerprint: input.fingerprint,
              version,
            },
          });
          if (raced) return { outcome: 'DUPLICATE', record: this.map(raced) };
          continue;
        }
        throw new PersistenceError(
          `Failed to persist cost-basis evidence: ${(error as Error).message}`,
        );
      }
    }
    const existing = await this.prisma.costBasisEvidenceRecord.findFirst({
      where: { portfolioId: input.portfolioId, fingerprint: input.fingerprint },
    });
    if (existing) return { outcome: 'DUPLICATE', record: this.map(existing) };
    throw new PersistenceError('Failed to persist cost-basis evidence after retries');
  }
}
