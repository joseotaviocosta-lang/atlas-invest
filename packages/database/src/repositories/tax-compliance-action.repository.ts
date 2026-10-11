import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxComplianceActionRepository,
  TaxComplianceActionRow,
  TaxComplianceActionWriteInput,
  TaxComplianceActionWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export class TaxComplianceActionRepository implements ITaxComplianceActionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    taxSubjectId: string;
    obligationKey: string;
    actionType: string;
    sourceFingerprint: string | null;
    note: string | null;
    metadata: Prisma.JsonValue | null;
    revision: number;
    occurredAt: Date;
    createdAt: Date;
  }): TaxComplianceActionRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      obligationKey: row.obligationKey,
      actionType: row.actionType,
      sourceFingerprint: row.sourceFingerprint,
      note: row.note,
      metadata: (row.metadata as Record<string, unknown>) ?? null,
      revision: row.revision,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string): Promise<TaxComplianceActionRow | null> {
    try {
      const row = await this.prisma.taxComplianceActionRecord.findUnique({
        where: { id },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(`Failed to find tax compliance action by id ${id}`);
    }
  }

  async findLatest(input: {
    taxSubjectId: string;
    obligationKey: string;
  }): Promise<TaxComplianceActionRow | null> {
    try {
      const row = await this.prisma.taxComplianceActionRecord.findFirst({
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
        `Failed to find latest tax compliance action for obligation ${input.obligationKey}`,
      );
    }
  }

  async listBySubject(input: {
    taxSubjectId: string;
    obligationKey?: string;
  }): Promise<TaxComplianceActionRow[]> {
    try {
      const rows = await this.prisma.taxComplianceActionRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          ...(input.obligationKey ? { obligationKey: input.obligationKey } : {}),
        },
        orderBy: [{ occurredAt: 'desc' }, { revision: 'desc' }],
      });
      return rows.map((r) => this.map(r));
    } catch {
      throw new PersistenceError(
        `Failed to list tax compliance actions for subject ${input.taxSubjectId}`,
      );
    }
  }

  async listHistory(input: {
    taxSubjectId: string;
    obligationKey: string;
  }): Promise<TaxComplianceActionRow[]> {
    try {
      const rows = await this.prisma.taxComplianceActionRecord.findMany({
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
        `Failed to list tax compliance action history for obligation ${input.obligationKey}`,
      );
    }
  }

  async create(
    input: TaxComplianceActionWriteInput,
  ): Promise<{ outcome: TaxComplianceActionWriteOutcome; record: TaxComplianceActionRow }> {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const latest = await this.findLatest({
          taxSubjectId: input.taxSubjectId,
          obligationKey: input.obligationKey,
        });

        // Idempotency check: if latest action matches actionType and sourceFingerprint and note, return IDEMPOTENT
        if (
          latest &&
          latest.actionType === input.actionType &&
          latest.sourceFingerprint === (input.sourceFingerprint ?? null) &&
          latest.note === (input.note ?? null)
        ) {
          return { outcome: 'IDEMPOTENT', record: latest };
        }

        const nextRevision = latest ? latest.revision + 1 : 1;
        const occurredAtDate = input.occurredAt
          ? typeof input.occurredAt === 'string'
            ? new Date(input.occurredAt)
            : input.occurredAt
          : new Date();

        const created = await this.prisma.taxComplianceActionRecord.create({
          data: {
            id: input.id ?? randomUUID(),
            taxSubjectId: input.taxSubjectId,
            obligationKey: input.obligationKey,
            actionType: input.actionType,
            sourceFingerprint: input.sourceFingerprint ?? null,
            note: input.note ?? null,
            metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
            revision: nextRevision,
            occurredAt: occurredAtDate,
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
          // Retry on unique constraint collision on revision
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 + 5));
          continue;
        }
        if (err instanceof PersistenceError) {
          throw err;
        }
        throw new PersistenceError(
          `Failed to record tax compliance action for obligation ${input.obligationKey}`,
        );
      }
    }
    throw new PersistenceError(
      `Failed to record tax compliance action for obligation ${input.obligationKey}`,
    );
  }
}
