import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  ITaxpayerConfirmationRepository,
  TaxpayerConfirmationRow,
  TaxpayerConfirmationWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export function computeTaxpayerConfirmationFingerprint(input: {
  taxSubjectId: string;
  calendarYear: number;
  confirmationType: string;
  subjectReference: string;
  decision: string;
  statementVersion: string;
  sourceFingerprint: string;
  source: string;
  revision: number;
}): string {
  return createHash('sha256')
    .update(
      [
        input.taxSubjectId,
        String(input.calendarYear),
        input.confirmationType,
        input.subjectReference,
        input.decision,
        input.statementVersion,
        input.sourceFingerprint,
        input.source,
        String(input.revision),
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

export class TaxpayerConfirmationRepository implements ITaxpayerConfirmationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    taxSubjectId: string;
    calendarYear: number;
    confirmationType: string;
    subjectReference: string;
    decision: string;
    statementVersion: string;
    sourceFingerprint: string;
    source: string;
    createdByPrincipal: string;
    revision: number;
    fingerprint: string;
    supersedesId: string | null;
    notes: string | null;
    confirmedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }): TaxpayerConfirmationRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      calendarYear: row.calendarYear,
      confirmationType: row.confirmationType,
      subjectReference: row.subjectReference,
      decision: row.decision,
      statementVersion: row.statementVersion,
      sourceFingerprint: row.sourceFingerprint,
      source: row.source,
      createdByPrincipal: row.createdByPrincipal,
      revision: row.revision,
      fingerprint: row.fingerprint,
      supersedesId: row.supersedesId,
      notes: row.notes,
      confirmedAt: row.confirmedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<TaxpayerConfirmationRow | null> {
    try {
      const row = await this.prisma.taxpayerConfirmationRecord.findUnique({
        where: { id },
      });
      return row ? this.map(row) : null;
    } catch (err) {
      throw new PersistenceError(`Failed to find taxpayer confirmation by id: ${err}`);
    }
  }

  async findLatest(input: {
    taxSubjectId: string;
    calendarYear: number;
    confirmationType: string;
    subjectReference: string;
  }): Promise<TaxpayerConfirmationRow | null> {
    try {
      const row = await this.prisma.taxpayerConfirmationRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          calendarYear: input.calendarYear,
          confirmationType: input.confirmationType,
          subjectReference: input.subjectReference,
        },
        orderBy: { revision: 'desc' },
      });
      return row ? this.map(row) : null;
    } catch (err) {
      throw new PersistenceError(`Failed to find latest taxpayer confirmation: ${err}`);
    }
  }

  async listByYear(input: {
    taxSubjectId: string;
    calendarYear: number;
  }): Promise<TaxpayerConfirmationRow[]> {
    try {
      const rows = await this.prisma.taxpayerConfirmationRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          calendarYear: input.calendarYear,
        },
        orderBy: [{ confirmationType: 'asc' }, { subjectReference: 'asc' }, { revision: 'desc' }],
      });

      // Keep only latest revision per (confirmationType, subjectReference)
      const seen = new Set<string>();
      const latestRows: TaxpayerConfirmationRow[] = [];

      for (const r of rows) {
        const key = `${r.confirmationType}:${r.subjectReference}`;
        if (!seen.has(key)) {
          seen.add(key);
          latestRows.push(this.map(r));
        }
      }

      return latestRows;
    } catch (err) {
      throw new PersistenceError(`Failed to list taxpayer confirmations by year: ${err}`);
    }
  }

  async listHistory(input: {
    taxSubjectId: string;
    calendarYear: number;
    confirmationType: string;
    subjectReference: string;
  }): Promise<TaxpayerConfirmationRow[]> {
    try {
      const rows = await this.prisma.taxpayerConfirmationRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          calendarYear: input.calendarYear,
          confirmationType: input.confirmationType,
          subjectReference: input.subjectReference,
        },
        orderBy: { revision: 'asc' },
      });
      return rows.map((r) => this.map(r));
    } catch (err) {
      throw new PersistenceError(`Failed to list taxpayer confirmation history: ${err}`);
    }
  }

  async create(input: {
    id?: string;
    taxSubjectId: string;
    calendarYear: number;
    confirmationType: string;
    subjectReference: string;
    decision: string;
    statementVersion: string;
    sourceFingerprint: string;
    source: string;
    createdByPrincipal: string;
    notes?: string | null;
  }): Promise<{ outcome: TaxpayerConfirmationWriteOutcome; record: TaxpayerConfirmationRow }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.taxpayerConfirmationRecord.findFirst({
          where: {
            taxSubjectId: input.taxSubjectId,
            calendarYear: input.calendarYear,
            confirmationType: input.confirmationType,
            subjectReference: input.subjectReference,
          },
          orderBy: { revision: 'desc' },
        });

        if (existing) {
          // Check for idempotency (same decision, version, and sourceFingerprint)
          if (
            existing.decision === input.decision &&
            existing.statementVersion === input.statementVersion &&
            existing.sourceFingerprint === input.sourceFingerprint
          ) {
            return {
              outcome: 'IDEMPOTENT',
              record: this.map(existing),
            };
          }

          // Supersede with next revision
          const revision = existing.revision + 1;
          const fingerprint = computeTaxpayerConfirmationFingerprint({
            taxSubjectId: input.taxSubjectId,
            calendarYear: input.calendarYear,
            confirmationType: input.confirmationType,
            subjectReference: input.subjectReference,
            decision: input.decision,
            statementVersion: input.statementVersion,
            sourceFingerprint: input.sourceFingerprint,
            source: input.source,
            revision,
          });

          const created = await tx.taxpayerConfirmationRecord.create({
            data: {
              id: input.id ?? randomUUID(),
              taxSubjectId: input.taxSubjectId,
              calendarYear: input.calendarYear,
              confirmationType: input.confirmationType,
              subjectReference: input.subjectReference,
              decision: input.decision,
              statementVersion: input.statementVersion,
              sourceFingerprint: input.sourceFingerprint,
              source: input.source,
              createdByPrincipal: input.createdByPrincipal,
              revision,
              fingerprint,
              supersedesId: existing.id,
              notes: input.notes ?? null,
            },
          });

          return {
            outcome: 'SUPERSEDED',
            record: this.map(created),
          };
        }

        // First revision
        const revision = 1;
        const fingerprint = computeTaxpayerConfirmationFingerprint({
          taxSubjectId: input.taxSubjectId,
          calendarYear: input.calendarYear,
          confirmationType: input.confirmationType,
          subjectReference: input.subjectReference,
          decision: input.decision,
          statementVersion: input.statementVersion,
          sourceFingerprint: input.sourceFingerprint,
          source: input.source,
          revision,
        });

        const created = await tx.taxpayerConfirmationRecord.create({
          data: {
            id: input.id ?? randomUUID(),
            taxSubjectId: input.taxSubjectId,
            calendarYear: input.calendarYear,
            confirmationType: input.confirmationType,
            subjectReference: input.subjectReference,
            decision: input.decision,
            statementVersion: input.statementVersion,
            sourceFingerprint: input.sourceFingerprint,
            source: input.source,
            createdByPrincipal: input.createdByPrincipal,
            revision,
            fingerprint,
            supersedesId: null,
            notes: input.notes ?? null,
          },
        });

        return {
          outcome: 'CREATED',
          record: this.map(created),
        };
      });
    } catch (err) {
      throw new PersistenceError(`Failed to create taxpayer confirmation: ${err}`);
    }
  }
}
