import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ITaxNotificationEventRepository,
  TaxNotificationEventRow,
  TaxNotificationEventWriteInput,
  TaxNotificationEventWriteOutcome,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export class TaxNotificationEventRepository implements ITaxNotificationEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    taxSubjectId: string;
    reminderKey: string;
    sourceFingerprint: string;
    channel: string;
    triggerAt: Date;
    deliveredAt: Date;
    deliveryStatus: string;
    attempt: number;
    dedupKey: string;
    createdAt: Date;
  }): TaxNotificationEventRow {
    return {
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      reminderKey: row.reminderKey,
      sourceFingerprint: row.sourceFingerprint,
      channel: row.channel,
      triggerAt: row.triggerAt,
      deliveredAt: row.deliveredAt,
      deliveryStatus: row.deliveryStatus,
      attempt: row.attempt,
      dedupKey: row.dedupKey,
      createdAt: row.createdAt,
    };
  }

  async findByDedup(input: {
    taxSubjectId: string;
    dedupKey: string;
  }): Promise<TaxNotificationEventRow | null> {
    try {
      const row = await this.prisma.taxComplianceNotificationEventRecord.findUnique({
        where: {
          tax_compliance_notification_event_dedup_identity: {
            taxSubjectId: input.taxSubjectId,
            dedupKey: input.dedupKey,
          },
        },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find tax notification event by dedup key for subject ${input.taxSubjectId}`,
      );
    }
  }

  async listBySubject(input: {
    taxSubjectId: string;
    reminderKey?: string;
  }): Promise<TaxNotificationEventRow[]> {
    try {
      const rows = await this.prisma.taxComplianceNotificationEventRecord.findMany({
        where: {
          taxSubjectId: input.taxSubjectId,
          ...(input.reminderKey ? { reminderKey: input.reminderKey } : {}),
        },
        orderBy: { deliveredAt: 'desc' },
      });
      return rows.map((r) => this.map(r));
    } catch {
      throw new PersistenceError(
        `Failed to list tax notification events for subject ${input.taxSubjectId}`,
      );
    }
  }

  async create(
    input: TaxNotificationEventWriteInput,
  ): Promise<{ outcome: TaxNotificationEventWriteOutcome; record: TaxNotificationEventRow }> {
    try {
      const existing = await this.findByDedup({
        taxSubjectId: input.taxSubjectId,
        dedupKey: input.dedupKey,
      });
      if (existing) {
        return { outcome: 'IDEMPOTENT', record: existing };
      }

      const triggerAt =
        typeof input.triggerAt === 'string'
          ? new Date(`${input.triggerAt.trim().slice(0, 10)}T00:00:00.000Z`)
          : input.triggerAt;

      const created = await this.prisma.taxComplianceNotificationEventRecord.create({
        data: {
          id: input.id ?? randomUUID(),
          taxSubjectId: input.taxSubjectId,
          reminderKey: input.reminderKey,
          sourceFingerprint: input.sourceFingerprint,
          channel: input.channel,
          triggerAt,
          deliveryStatus: input.deliveryStatus ?? 'DELIVERED',
          dedupKey: input.dedupKey,
        },
      });
      return { outcome: 'DELIVERED', record: this.map(created) };
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const duplicate = await this.findByDedup({
          taxSubjectId: input.taxSubjectId,
          dedupKey: input.dedupKey,
        });
        if (duplicate) {
          return { outcome: 'IDEMPOTENT', record: duplicate };
        }
      }
      if (err instanceof PersistenceError) {
        throw err;
      }
      throw new PersistenceError(
        `Failed to record tax notification event for reminder ${input.reminderKey}`,
      );
    }
  }
}
