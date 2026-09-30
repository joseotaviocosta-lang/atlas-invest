import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxCompensationElectionRepository,
  TaxCompensationElectionRow,
  TaxCompensationElectionWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';
import { PersistenceMappingError } from '../errors/persistence-mapping-error';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type Row = {
  id: string;
  taxSubjectId: string;
  competence: string;
  electionType: string;
  value: string;
  version: number;
  source: string;
  supersedesId: string | null;
  fingerprint: string;
  createdAt: Date;
};

/** Deterministic semantic fingerprint (excludes id and createdAt). */
export function computeTaxCompensationElectionRowFingerprint(input: {
  taxSubjectId: string;
  competence: string;
  electionType: string;
  value: string;
  version: number;
  source: string;
}): string {
  return createHash('sha256')
    .update(
      [
        input.taxSubjectId,
        input.competence,
        input.electionType,
        input.value,
        String(input.version),
        input.source,
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

/**
 * Phase 4G.2A.1a — persisted, immutable tax-compensation election revisions.
 * One logical identity `(taxSubjectId, competence, electionType)`; each change
 * inserts a new monotonic version (never an in-place update). Same value is
 * idempotent. Concurrency is resolved via the DB unique constraint with a
 * bounded optimistic retry.
 */
export class TaxCompensationElectionRepository implements ITaxCompensationElectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: Row): TaxCompensationElectionRow {
    // Fail closed on malformed persisted data: never surface an unknown
    // election value/type/source as if it were a valid decision.
    if (row.value !== 'DECLARE_FOR_CARRYFORWARD' && row.value !== 'DO_NOT_DECLARE') {
      throw new PersistenceMappingError(`Unknown election value "${row.value}"`);
    }
    if (row.electionType !== 'EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION') {
      throw new PersistenceMappingError(`Unknown election type "${row.electionType}"`);
    }
    if (row.source !== 'MANUAL_CONFIRMED') {
      throw new PersistenceMappingError(`Unknown election source "${row.source}"`);
    }
    if (!Number.isInteger(row.version) || row.version < 1) {
      throw new PersistenceMappingError(`Invalid election version "${row.version}"`);
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.competence)) {
      throw new PersistenceMappingError(`Invalid election competence "${row.competence}"`);
    }
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      competence: row.competence,
      electionType: row.electionType,
      value: row.value,
      version: row.version,
      source: row.source,
      supersedesId: row.supersedesId,
      fingerprint: row.fingerprint,
      createdAt: row.createdAt,
    };
  }

  async findCurrent(input: {
    taxSubjectId: string;
    competence: string;
    electionType: string;
  }): Promise<TaxCompensationElectionRow | null> {
    const row = await this.prisma.taxCompensationElectionRecord.findFirst({
      where: {
        taxSubjectId: input.taxSubjectId,
        competence: input.competence,
        electionType: input.electionType,
      },
      orderBy: { version: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  async listHistory(input: {
    taxSubjectId: string;
    competence: string;
    electionType: string;
  }): Promise<TaxCompensationElectionRow[]> {
    const rows = await this.prisma.taxCompensationElectionRecord.findMany({
      where: {
        taxSubjectId: input.taxSubjectId,
        competence: input.competence,
        electionType: input.electionType,
      },
      orderBy: [{ version: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async listCurrentBySubject(input: {
    taxSubjectId: string;
    electionType: string;
  }): Promise<TaxCompensationElectionRow[]> {
    const rows = await this.prisma.taxCompensationElectionRecord.findMany({
      where: {
        taxSubjectId: input.taxSubjectId,
        electionType: input.electionType,
      },
      orderBy: [{ competence: 'asc' }, { version: 'desc' }],
    });
    const byCompetence = new Map<string, TaxCompensationElectionRow>();
    for (const row of rows) {
      if (!byCompetence.has(row.competence)) byCompetence.set(row.competence, this.map(row));
    }
    return [...byCompetence.values()];
  }

  async putRevision(input: {
    taxSubjectId: string;
    competence: string;
    electionType: string;
    value: string;
    source: string;
  }): Promise<{
    outcome: TaxCompensationElectionWriteOutcome;
    record: TaxCompensationElectionRow;
  }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.findCurrent(input);
      if (current && current.value === input.value) {
        return { outcome: 'DUPLICATE', record: current };
      }
      const version = (current?.version ?? 0) + 1;
      const fingerprint = computeTaxCompensationElectionRowFingerprint({
        taxSubjectId: input.taxSubjectId,
        competence: input.competence,
        electionType: input.electionType,
        value: input.value,
        version,
        source: input.source,
      });
      try {
        const created = await this.prisma.taxCompensationElectionRecord.create({
          data: {
            taxSubjectId: input.taxSubjectId,
            competence: input.competence,
            electionType: input.electionType,
            value: input.value,
            version,
            source: input.source,
            supersedesId: current?.id ?? null,
            fingerprint,
          },
        });
        return { outcome: 'CREATED', record: this.map(created) };
      } catch (error) {
        if (isUniqueViolation(error)) {
          // A concurrent writer took this version; re-read and retry.
          continue;
        }
        throw new PersistenceError(
          `Failed to persist tax compensation election: ${(error as Error).message}`,
        );
      }
    }
    // After bounded retries, resolve the current state deterministically.
    const current = await this.findCurrent(input);
    if (current) return { outcome: 'DUPLICATE', record: current };
    throw new PersistenceError('Failed to persist tax compensation election after retries');
  }
}
