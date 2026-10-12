import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxReminderActionRepository,
  TaxReminderActionRow,
  TaxReminderActionWriteInput,
  TaxReminderActionWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

function toDateOnly(value: Date | string): Date {
  const civil = typeof value === 'string' ? value.trim().slice(0, 10) : value;
  return typeof civil === 'string' ? new Date(`${civil}T00:00:00.000Z`) : civil;
}

export class TaxReminderActionRepository implements ITaxReminderActionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    taxSubjectId: string;
    reminderKey: string;
    obligationKey: string;
    reminderKind: string;
    triggerAt: Date;
    sourceFingerprint: string;
    actionType: string;
    snoozedUntil: Date | null;
    revision: number;
    occurredAt: Date;
    createdAt: Date;
  }): TaxReminderActionRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      reminderKey: row.reminderKey,
      obligationKey: row.obligationKey,
      reminderKind: row.reminderKind,
      triggerAt: row.triggerAt,
      sourceFingerprint: row.sourceFingerprint,
      actionType: row.actionType,
      snoozedUntil: row.snoozedUntil,
      revision: row.revision,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    };
  }

  async findLatest(input: {
    taxSubjectId: string;
    reminderKey: string;
  }): Promise<TaxReminderActionRow | null> {
    try {
      const row = await this.prisma.taxComplianceReminderActionRecord.findFirst({
        where: {
          taxSubjectId: input.taxSubjectId,
          reminderKey: input.reminderKey,
        },
        orderBy: { revision: 'desc' },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find latest tax reminder action for reminder ${input.reminderKey}`,
      );
    }
  }

  async listBySubject(input: {
    taxSubjectId: string;
    reminderKey?: string;
  }): Promise<TaxReminderActionRow[]> {
    try {
      const rows = await this.prisma.taxComplianceReminderActionRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          ...(input.reminderKey ? { reminderKey: input.reminderKey } : {}),
        },
        orderBy: [{ occurredAt: 'desc' }, { revision: 'desc' }],
      });
      return rows.map((r) => this.map(r));
    } catch {
      throw new PersistenceError(
        `Failed to list tax reminder actions for subject ${input.taxSubjectId}`,
      );
    }
  }

  async create(
    input: TaxReminderActionWriteInput,
  ): Promise<{ outcome: TaxReminderActionWriteOutcome; record: TaxReminderActionRow }> {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const latest = await this.findLatest({
          taxSubjectId: input.taxSubjectId,
          reminderKey: input.reminderKey,
        });

        const snoozedUntil = input.snoozedUntil ? toDateOnly(input.snoozedUntil) : null;
        if (
          latest &&
          latest.actionType === input.actionType &&
          latest.sourceFingerprint === input.sourceFingerprint &&
          latest.reminderKind === input.reminderKind &&
          (latest.snoozedUntil?.getTime() ?? null) === (snoozedUntil?.getTime() ?? null)
        ) {
          return { outcome: 'IDEMPOTENT', record: latest };
        }

        const nextRevision = latest ? latest.revision + 1 : 1;
        const occurredAtDate = input.occurredAt
          ? typeof input.occurredAt === 'string'
            ? new Date(input.occurredAt)
            : input.occurredAt
          : new Date();

        const created = await this.prisma.taxComplianceReminderActionRecord.create({
          data: {
            id: input.id ?? randomUUID(),
            taxSubjectId: input.taxSubjectId,
            reminderKey: input.reminderKey,
            obligationKey: input.obligationKey,
            reminderKind: input.reminderKind,
            triggerAt: toDateOnly(input.triggerAt),
            sourceFingerprint: input.sourceFingerprint,
            actionType: input.actionType,
            snoozedUntil,
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
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 25 + 5));
          continue;
        }
        if (err instanceof PersistenceError) {
          throw err;
        }
        throw new PersistenceError(
          `Failed to record tax reminder action for reminder ${input.reminderKey}`,
        );
      }
    }
    throw new PersistenceError(
      `Failed to record tax reminder action for reminder ${input.reminderKey}`,
    );
  }
}
