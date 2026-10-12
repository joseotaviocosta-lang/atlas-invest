import { PrismaClient } from '@prisma/client';
import {
  ITaxReminderPreferencesRepository,
  TaxReminderPreferencesRow,
  TaxReminderPreferencesWriteInput,
} from './interfaces';
import { PersistenceError } from '../errors/persistence-error';

export class TaxReminderPreferencesRepository implements ITaxReminderPreferencesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    taxSubjectId: string;
    remindersEnabled: boolean;
    upcomingEnabled: boolean;
    overdueEnabled: boolean;
    annualEnabled: boolean;
    leadTimes: number[];
    createdAt: Date;
    updatedAt: Date;
  }): TaxReminderPreferencesRow {
    return {
      taxSubjectId: row.taxSubjectId,
      remindersEnabled: row.remindersEnabled,
      upcomingEnabled: row.upcomingEnabled,
      overdueEnabled: row.overdueEnabled,
      annualEnabled: row.annualEnabled,
      leadTimes: [...row.leadTimes],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findBySubject(taxSubjectId: string): Promise<TaxReminderPreferencesRow | null> {
    try {
      const row = await this.prisma.taxComplianceReminderPreferenceRecord.findUnique({
        where: { taxSubjectId },
      });
      return row ? this.map(row) : null;
    } catch {
      throw new PersistenceError(
        `Failed to find tax reminder preferences for subject ${taxSubjectId}`,
      );
    }
  }

  async upsert(
    input: TaxReminderPreferencesWriteInput,
  ): Promise<{ created: boolean; record: TaxReminderPreferencesRow }> {
    try {
      const existing = await this.findBySubject(input.taxSubjectId);
      const record = await this.prisma.taxComplianceReminderPreferenceRecord.upsert({
        where: { taxSubjectId: input.taxSubjectId },
        create: {
          taxSubjectId: input.taxSubjectId,
          remindersEnabled: input.remindersEnabled,
          upcomingEnabled: input.upcomingEnabled,
          overdueEnabled: input.overdueEnabled,
          annualEnabled: input.annualEnabled,
          leadTimes: input.leadTimes,
        },
        update: {
          remindersEnabled: input.remindersEnabled,
          upcomingEnabled: input.upcomingEnabled,
          overdueEnabled: input.overdueEnabled,
          annualEnabled: input.annualEnabled,
          leadTimes: input.leadTimes,
        },
      });
      return { created: existing === null, record: this.map(record) };
    } catch {
      throw new PersistenceError(
        `Failed to save tax reminder preferences for subject ${input.taxSubjectId}`,
      );
    }
  }
}
