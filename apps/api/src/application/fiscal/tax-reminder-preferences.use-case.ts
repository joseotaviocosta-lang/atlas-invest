import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES } from '@atlas/tax-engine';
import type { ITaxReminderPreferencesRepository, TaxReminderPreferencesRow } from '@atlas/database';
import { TAX_REMINDER_PREFERENCES_REPOSITORY } from '../../database/tokens';

export interface TaxReminderPreferences {
  readonly remindersEnabled: boolean;
  readonly upcomingEnabled: boolean;
  readonly overdueEnabled: boolean;
  readonly annualEnabled: boolean;
  readonly leadTimes: readonly number[];
}

export interface UpsertTaxReminderPreferencesInput extends TaxReminderPreferences {
  readonly taxSubjectId: string;
}

export interface UpsertTaxReminderPreferencesResult {
  readonly created: boolean;
  readonly preferences: TaxReminderPreferences;
}

function toPreferences(row: TaxReminderPreferencesRow): TaxReminderPreferences {
  return {
    remindersEnabled: row.remindersEnabled,
    upcomingEnabled: row.upcomingEnabled,
    overdueEnabled: row.overdueEnabled,
    annualEnabled: row.annualEnabled,
    leadTimes: [...row.leadTimes].sort((a, b) => a - b),
  };
}

@Injectable()
export class TaxReminderPreferencesUseCase {
  constructor(
    @Inject(TAX_REMINDER_PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: ITaxReminderPreferencesRepository,
  ) {}

  async getPreferences(taxSubjectId: string): Promise<TaxReminderPreferences> {
    const stored = await this.preferencesRepository.findBySubject(taxSubjectId);
    if (!stored) {
      return {
        ...DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
        leadTimes: [...DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES.leadTimes].sort((a, b) => a - b),
      };
    }
    return toPreferences(stored);
  }

  async upsertPreferences(
    input: UpsertTaxReminderPreferencesInput,
  ): Promise<UpsertTaxReminderPreferencesResult> {
    const leadTimes = [...new Set(input.leadTimes)].sort((a, b) => a - b);
    const result = await this.preferencesRepository.upsert({
      taxSubjectId: input.taxSubjectId,
      remindersEnabled: input.remindersEnabled,
      upcomingEnabled: input.upcomingEnabled,
      overdueEnabled: input.overdueEnabled,
      annualEnabled: input.annualEnabled,
      leadTimes,
    });
    return { created: result.created, preferences: toPreferences(result.record) };
  }
}
