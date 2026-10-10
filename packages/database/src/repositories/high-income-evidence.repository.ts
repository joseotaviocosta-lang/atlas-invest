import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  IHighIncomeEvidenceRepository,
  HighIncomeEvidenceRow,
  HighIncomeEvidenceWriteInput,
  HighIncomeEvidenceWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

const ANNUAL_PAYER_KEY = '_ANNUAL_';

export function highIncomeEvidencePayerKey(payerId?: string | null): string {
  return payerId ?? ANNUAL_PAYER_KEY;
}

export function computeHighIncomeEvidenceContentFingerprint(input: {
  taxSubjectId: string;
  calendarYear: number;
  payerKey: string;
  payerId: string | null;
  evidenceType: string;
  payerType: string | null;
  profitPeriodExercise: number | null;
  evidenceMode: string | null;
  accountingProfit: string | null;
  irDue: string | null;
  csllDue: string | null;
  prouniTaxCredit: string | null;
  simplifiedRevenue: string | null;
  adjustmentAmount: string | null;
  authority: string;
  evidenceSource: string;
  conflictStatus: string;
  upstreamFingerprint: string | null;
  resolutionNote: string | null;
}): string {
  const pick = (value: string | null): string => value ?? 'NULL';
  return createHash('sha256')
    .update(
      [
        input.taxSubjectId,
        String(input.calendarYear),
        input.payerKey,
        pick(input.payerId),
        input.evidenceType,
        pick(input.payerType),
        input.profitPeriodExercise === null ? 'NULL' : String(input.profitPeriodExercise),
        pick(input.evidenceMode),
        pick(input.accountingProfit),
        pick(input.irDue),
        pick(input.csllDue),
        pick(input.prouniTaxCredit),
        pick(input.simplifiedRevenue),
        pick(input.adjustmentAmount),
        input.authority,
        input.evidenceSource,
        input.conflictStatus,
        pick(input.upstreamFingerprint),
        pick(input.resolutionNote),
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

export function computeHighIncomeEvidenceFingerprint(
  contentFingerprint: string,
  revision: number,
): string {
  return createHash('sha256').update(`${contentFingerprint}|${revision}`, 'utf8').digest('hex');
}

type EvidenceRecordShape = {
  id: string;
  taxSubjectId: string;
  calendarYear: number;
  payerKey: string;
  payerId: string | null;
  evidenceType: string;
  payerType: string | null;
  profitPeriodExercise: number | null;
  evidenceMode: string | null;
  accountingProfit: { toString(): string } | null;
  irDue: { toString(): string } | null;
  csllDue: { toString(): string } | null;
  prouniTaxCredit: { toString(): string } | null;
  simplifiedRevenue: { toString(): string } | null;
  adjustmentAmount: { toString(): string } | null;
  authority: string;
  evidenceSource: string;
  conflictStatus: string;
  upstreamFingerprint: string | null;
  sourceFingerprint: string;
  revision: number;
  fingerprint: string;
  supersedesId: string | null;
  resolutionNote: string | null;
  createdByPrincipal: string;
  createdAt: Date;
  updatedAt: Date;
};

export class HighIncomeEvidenceRepository implements IHighIncomeEvidenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: EvidenceRecordShape): HighIncomeEvidenceRow {
    const decimal = (value: { toString(): string } | null): string | null =>
      value === null ? null : value.toString();
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      calendarYear: row.calendarYear,
      payerKey: row.payerKey,
      payerId: row.payerId,
      evidenceType: row.evidenceType as HighIncomeEvidenceRow['evidenceType'],
      payerType: row.payerType,
      profitPeriodExercise: row.profitPeriodExercise,
      evidenceMode: row.evidenceMode,
      accountingProfit: decimal(row.accountingProfit),
      irDue: decimal(row.irDue),
      csllDue: decimal(row.csllDue),
      prouniTaxCredit: decimal(row.prouniTaxCredit),
      simplifiedRevenue: decimal(row.simplifiedRevenue),
      adjustmentAmount: decimal(row.adjustmentAmount),
      authority: row.authority as HighIncomeEvidenceRow['authority'],
      evidenceSource: row.evidenceSource as HighIncomeEvidenceRow['evidenceSource'],
      conflictStatus: row.conflictStatus as HighIncomeEvidenceRow['conflictStatus'],
      upstreamFingerprint: row.upstreamFingerprint,
      sourceFingerprint: row.sourceFingerprint,
      revision: row.revision,
      fingerprint: row.fingerprint,
      supersedesId: row.supersedesId,
      resolutionNote: row.resolutionNote,
      createdByPrincipal: row.createdByPrincipal,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private contentInputOf(input: HighIncomeEvidenceWriteInput, conflictStatus: string) {
    const payerKey = highIncomeEvidencePayerKey(input.payerId);
    return {
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
      payerKey,
      payerId: input.payerId ?? null,
      evidenceType: input.evidenceType,
      payerType: input.payerType ?? null,
      profitPeriodExercise: input.profitPeriodExercise ?? null,
      evidenceMode: input.evidenceMode ?? null,
      accountingProfit: input.accountingProfit ?? null,
      irDue: input.irDue ?? null,
      csllDue: input.csllDue ?? null,
      prouniTaxCredit: input.prouniTaxCredit ?? null,
      simplifiedRevenue: input.simplifiedRevenue ?? null,
      adjustmentAmount: input.adjustmentAmount ?? null,
      authority: input.authority,
      evidenceSource: input.evidenceSource,
      conflictStatus,
      upstreamFingerprint: input.upstreamFingerprint ?? null,
      resolutionNote: input.resolutionNote ?? null,
    };
  }

  async findById(id: string): Promise<HighIncomeEvidenceRow | null> {
    try {
      const row = await this.prisma.highIncomeEvidenceRecord.findUnique({ where: { id } });
      return row ? this.map(row) : null;
    } catch (err) {
      throw new PersistenceError(`Failed to find high-income evidence by id: ${err}`);
    }
  }

  async findCurrent(input: {
    taxSubjectId: string;
    calendarYear: number;
    payerKey: string;
    evidenceType: HighIncomeEvidenceRow['evidenceType'];
    profitPeriodExercise?: number | null;
  }): Promise<HighIncomeEvidenceRow | null> {
    try {
      const row = await this.prisma.highIncomeEvidenceRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          calendarYear: input.calendarYear,
          payerKey: input.payerKey,
          evidenceType: input.evidenceType,
          profitPeriodExercise: input.profitPeriodExercise ?? null,
        },
        orderBy: { revision: 'desc' },
      });
      return row ? this.map(row) : null;
    } catch (err) {
      throw new PersistenceError(`Failed to find current high-income evidence: ${err}`);
    }
  }

  async listCurrentBySubjectYear(input: {
    taxSubjectId: string;
    calendarYear: number;
  }): Promise<HighIncomeEvidenceRow[]> {
    try {
      const rows = await this.prisma.highIncomeEvidenceRecord.findMany({
        where: { taxSubjectId: input.taxSubjectId, calendarYear: input.calendarYear },
        orderBy: [
          { payerKey: 'asc' },
          { evidenceType: 'asc' },
          { profitPeriodExercise: 'asc' },
          { revision: 'desc' },
        ],
      });
      const seen = new Set<string>();
      const latest: HighIncomeEvidenceRow[] = [];
      for (const row of rows) {
        const key = `${row.payerKey}:${row.evidenceType}:${row.profitPeriodExercise ?? 'NULL'}`;
        if (!seen.has(key)) {
          seen.add(key);
          latest.push(this.map(row));
        }
      }
      return latest;
    } catch (err) {
      throw new PersistenceError(`Failed to list high-income evidence by year: ${err}`);
    }
  }

  async listHistory(input: {
    taxSubjectId: string;
    calendarYear: number;
    payerKey: string;
    evidenceType: HighIncomeEvidenceRow['evidenceType'];
    profitPeriodExercise?: number | null;
  }): Promise<HighIncomeEvidenceRow[]> {
    try {
      const rows = await this.prisma.highIncomeEvidenceRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          calendarYear: input.calendarYear,
          payerKey: input.payerKey,
          evidenceType: input.evidenceType,
          profitPeriodExercise: input.profitPeriodExercise ?? null,
        },
        orderBy: { revision: 'asc' },
      });
      return rows.map((row) => this.map(row));
    } catch (err) {
      throw new PersistenceError(`Failed to list high-income evidence history: ${err}`);
    }
  }

  async create(
    input: HighIncomeEvidenceWriteInput,
  ): Promise<{ outcome: HighIncomeEvidenceWriteOutcome; record: HighIncomeEvidenceRow }> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const payerKey = highIncomeEvidencePayerKey(input.payerId);
            const profitPeriodExercise = input.profitPeriodExercise ?? null;
            const existing = await tx.highIncomeEvidenceRecord.findFirst({
              where: {
                taxSubjectId: input.taxSubjectId,
                calendarYear: input.calendarYear,
                payerKey,
                evidenceType: input.evidenceType,
                profitPeriodExercise,
              },
              orderBy: { revision: 'desc' },
            });

            if (!existing) {
              const content = this.contentInputOf(input, 'NONE');
              const sourceFingerprint =
                input.sourceFingerprint ?? computeHighIncomeEvidenceContentFingerprint(content);
              const revision = 1;
              const created = await tx.highIncomeEvidenceRecord.create({
                data: {
                  id: input.id ?? randomUUID(),
                  taxSubjectId: input.taxSubjectId,
                  calendarYear: input.calendarYear,
                  payerKey,
                  payerId: input.payerId ?? null,
                  evidenceType: input.evidenceType,
                  payerType: input.payerType ?? null,
                  profitPeriodExercise: input.profitPeriodExercise ?? null,
                  evidenceMode: input.evidenceMode ?? null,
                  accountingProfit: input.accountingProfit ?? null,
                  irDue: input.irDue ?? null,
                  csllDue: input.csllDue ?? null,
                  prouniTaxCredit: input.prouniTaxCredit ?? null,
                  simplifiedRevenue: input.simplifiedRevenue ?? null,
                  adjustmentAmount: input.adjustmentAmount ?? null,
                  authority: input.authority,
                  evidenceSource: input.evidenceSource,
                  conflictStatus: 'NONE',
                  upstreamFingerprint: input.upstreamFingerprint ?? null,
                  sourceFingerprint,
                  revision,
                  fingerprint: computeHighIncomeEvidenceFingerprint(sourceFingerprint, revision),
                  supersedesId: null,
                  resolutionNote: input.resolutionNote ?? null,
                  createdByPrincipal: input.createdByPrincipal,
                },
              });
              return { outcome: 'CREATED' as const, record: this.map(created) };
            }

            const candidate = this.contentInputOf(input, existing.conflictStatus);
            const candidateSourceFingerprint =
              input.sourceFingerprint ?? computeHighIncomeEvidenceContentFingerprint(candidate);
            if (
              existing.sourceFingerprint === candidateSourceFingerprint &&
              existing.authority === input.authority &&
              existing.evidenceSource === input.evidenceSource
            ) {
              return { outcome: 'IDEMPOTENT' as const, record: this.map(existing) };
            }

            const revision = existing.revision + 1;
            const conflictStatus =
              existing.authority === 'AUTHORITATIVE' &&
              existing.evidenceSource !== input.evidenceSource
                ? 'CONFLICT'
                : 'NONE';
            const withConflict = this.contentInputOf(input, conflictStatus);
            const sourceFingerprint =
              input.sourceFingerprint ?? computeHighIncomeEvidenceContentFingerprint(withConflict);
            const created = await tx.highIncomeEvidenceRecord.create({
              data: {
                id: input.id ?? randomUUID(),
                taxSubjectId: input.taxSubjectId,
                calendarYear: input.calendarYear,
                payerKey,
                payerId: input.payerId ?? null,
                evidenceType: input.evidenceType,
                payerType: input.payerType ?? null,
                profitPeriodExercise: input.profitPeriodExercise ?? null,
                evidenceMode: input.evidenceMode ?? null,
                accountingProfit: input.accountingProfit ?? null,
                irDue: input.irDue ?? null,
                csllDue: input.csllDue ?? null,
                prouniTaxCredit: input.prouniTaxCredit ?? null,
                simplifiedRevenue: input.simplifiedRevenue ?? null,
                adjustmentAmount: input.adjustmentAmount ?? null,
                authority: input.authority,
                evidenceSource: input.evidenceSource,
                conflictStatus,
                upstreamFingerprint: input.upstreamFingerprint ?? null,
                sourceFingerprint,
                revision,
                fingerprint: computeHighIncomeEvidenceFingerprint(sourceFingerprint, revision),
                supersedesId: existing.id,
                resolutionNote: input.resolutionNote ?? null,
                createdByPrincipal: input.createdByPrincipal,
              },
            });
            return { outcome: 'SUPERSEDED' as const, record: this.map(created) };
          },
          { maxWait: 10000, timeout: 15000 },
        );
      } catch (err: unknown) {
        const isUniqueConstraint =
          typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
        if (isUniqueConstraint && attempt < maxAttempts) {
          continue;
        }
        throw new PersistenceError(`Failed to create high-income evidence: ${err}`);
      }
    }
    throw new PersistenceError('Failed to create high-income evidence after maximum attempts');
  }

  async resolve(input: {
    id: string;
    taxSubjectId: string;
    decision: 'KEEP_EXISTING' | 'ACCEPT_NEW';
    createdByPrincipal: string;
  }): Promise<{ outcome: HighIncomeEvidenceWriteOutcome; record: HighIncomeEvidenceRow }> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const current = await tx.highIncomeEvidenceRecord.findFirst({
              where: { id: input.id, taxSubjectId: input.taxSubjectId },
            });
            if (!current) {
              throw new PersistenceError(`High-income evidence ${input.id} not found for subject`);
            }
            const latest = await tx.highIncomeEvidenceRecord.findFirst({
              where: {
                taxSubjectId: input.taxSubjectId,
                calendarYear: current.calendarYear,
                payerKey: current.payerKey,
                evidenceType: current.evidenceType,
                profitPeriodExercise: current.profitPeriodExercise,
              },
              orderBy: { revision: 'desc' },
            });
            if (!latest || latest.id !== current.id) {
              throw new PersistenceError(
                `High-income evidence ${input.id} is not the current revision`,
              );
            }
            if (latest.conflictStatus !== 'CONFLICT') {
              throw new PersistenceError(`High-income evidence ${input.id} is not in conflict`);
            }

            let restore: EvidenceRecordShape | null = null;
            if (input.decision === 'KEEP_EXISTING') {
              if (!latest.supersedesId) {
                throw new PersistenceError(
                  `High-income evidence ${input.id} has no previous revision to keep`,
                );
              }
              restore = await tx.highIncomeEvidenceRecord.findUnique({
                where: { id: latest.supersedesId },
              });
              if (!restore) {
                throw new PersistenceError(
                  `Previous high-income evidence revision ${latest.supersedesId} not found`,
                );
              }
            }

            const source = restore ?? latest;
            const revision = latest.revision + 1;
            const content = {
              taxSubjectId: source.taxSubjectId,
              calendarYear: source.calendarYear,
              payerKey: source.payerKey,
              payerId: source.payerId,
              evidenceType: source.evidenceType,
              payerType: source.payerType,
              profitPeriodExercise: source.profitPeriodExercise,
              evidenceMode: source.evidenceMode,
              accountingProfit: source.accountingProfit?.toString() ?? null,
              irDue: source.irDue?.toString() ?? null,
              csllDue: source.csllDue?.toString() ?? null,
              prouniTaxCredit: source.prouniTaxCredit?.toString() ?? null,
              simplifiedRevenue: source.simplifiedRevenue?.toString() ?? null,
              adjustmentAmount: source.adjustmentAmount?.toString() ?? null,
              authority: source.authority,
              evidenceSource: source.evidenceSource,
              conflictStatus: 'NONE',
              upstreamFingerprint: source.upstreamFingerprint,
              resolutionNote: input.decision,
            };
            const sourceFingerprint = computeHighIncomeEvidenceContentFingerprint(content);
            const created = await tx.highIncomeEvidenceRecord.create({
              data: {
                id: randomUUID(),
                taxSubjectId: source.taxSubjectId,
                calendarYear: source.calendarYear,
                payerKey: source.payerKey,
                payerId: source.payerId,
                evidenceType: source.evidenceType,
                payerType: source.payerType,
                profitPeriodExercise: source.profitPeriodExercise,
                evidenceMode: source.evidenceMode,
                accountingProfit: source.accountingProfit?.toString() ?? null,
                irDue: source.irDue?.toString() ?? null,
                csllDue: source.csllDue?.toString() ?? null,
                prouniTaxCredit: source.prouniTaxCredit?.toString() ?? null,
                simplifiedRevenue: source.simplifiedRevenue?.toString() ?? null,
                adjustmentAmount: source.adjustmentAmount?.toString() ?? null,
                authority: source.authority,
                evidenceSource: source.evidenceSource,
                conflictStatus: 'NONE',
                upstreamFingerprint: source.upstreamFingerprint,
                sourceFingerprint,
                revision,
                fingerprint: computeHighIncomeEvidenceFingerprint(sourceFingerprint, revision),
                supersedesId: latest.id,
                resolutionNote: input.decision,
                createdByPrincipal: input.createdByPrincipal,
              },
            });
            return { outcome: 'SUPERSEDED' as const, record: this.map(created) };
          },
          { maxWait: 10000, timeout: 15000 },
        );
      } catch (err: unknown) {
        if (err instanceof PersistenceError) {
          throw err;
        }
        const isUniqueConstraint =
          typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
        if (isUniqueConstraint && attempt < maxAttempts) {
          continue;
        }
        throw new PersistenceError(`Failed to resolve high-income evidence: ${err}`);
      }
    }
    throw new PersistenceError('Failed to resolve high-income evidence after maximum attempts');
  }

  async watermark(input: {
    taxSubjectId: string;
    calendarYear: number;
  }): Promise<{ count: number; maxUpdatedAt: string | null }> {
    try {
      const aggregate = await this.prisma.highIncomeEvidenceRecord.aggregate({
        where: { taxSubjectId: input.taxSubjectId, calendarYear: input.calendarYear },
        _count: { _all: true },
        _max: { updatedAt: true },
      });
      return {
        count: aggregate._count._all,
        maxUpdatedAt: aggregate._max.updatedAt ? aggregate._max.updatedAt.toISOString() : null,
      };
    } catch (err) {
      throw new PersistenceError(`Failed to read high-income evidence watermark: ${err}`);
    }
  }
}
