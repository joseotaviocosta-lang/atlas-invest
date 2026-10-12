import { Inject, Injectable } from '@nestjs/common';
import {
  projectTaxComplianceReminders,
  deriveTaxPaymentSupport,
  DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
  type TaxComplianceReminder,
  type TaxComplianceReminderActionRecord,
  type TaxComplianceReminderPaymentHint,
  type TaxComplianceReminderPreferences,
  type TaxPaymentEvidenceRecord,
} from '@atlas/tax-engine';
import type {
  ITaxReminderActionRepository,
  ITaxReminderPreferencesRepository,
  ITaxSettlementRepository,
  TaxReminderActionRow,
} from '@atlas/database';
import {
  TAX_REMINDER_ACTION_REPOSITORY,
  TAX_REMINDER_PREFERENCES_REPOSITORY,
  TAX_SETTLEMENT_REPOSITORY,
} from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxComplianceTimelineUseCase } from './get-tax-compliance-timeline.use-case';
import { mapSettlementRowToEvidenceRecord } from './record-tax-payment-evidence.use-case';

export interface GetTaxComplianceRemindersInput {
  readonly taxSubjectId: string;
  readonly calendarYear?: number;
  readonly status?: string;
  readonly kind?: string;
  readonly triggerFrom?: string;
  readonly triggerTo?: string;
}

export interface TaxComplianceReminderListResult {
  readonly reminders: readonly TaxComplianceReminder[];
  readonly generatedAt: string;
  readonly totalCount: number;
}

function toCivilDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function mapActionRowToRecord(row: TaxReminderActionRow): TaxComplianceReminderActionRecord {
  return {
    id: row.id,
    taxSubjectId: row.taxSubjectId,
    reminderKey: row.reminderKey,
    obligationKey: row.obligationKey,
    reminderKind: row.reminderKind as TaxComplianceReminderActionRecord['reminderKind'],
    triggerAt: toCivilDate(row.triggerAt),
    sourceFingerprint: row.sourceFingerprint,
    actionType: row.actionType as TaxComplianceReminderActionRecord['actionType'],
    snoozedUntil: row.snoozedUntil ? toCivilDate(row.snoozedUntil) : null,
    revision: row.revision,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class GetTaxComplianceRemindersUseCase {
  constructor(
    @Inject(GetTaxComplianceTimelineUseCase)
    private readonly timelineUseCase: GetTaxComplianceTimelineUseCase,
    @Inject(TAX_SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ITaxSettlementRepository,
    @Inject(TAX_REMINDER_ACTION_REPOSITORY)
    private readonly reminderActionRepository: ITaxReminderActionRepository,
    @Inject(TAX_REMINDER_PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: ITaxReminderPreferencesRepository,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(input: GetTaxComplianceRemindersInput): Promise<TaxComplianceReminderListResult> {
    const today = this.clock.today();
    const calendarYear = input.calendarYear ?? parseInt(today.substring(0, 4), 10);

    // 1. Authoritative compliance timeline (4K.1 — never recomputed here).
    const timeline = await this.timelineUseCase.execute({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
    });

    // 2. Batch-load settlement evidence for the subject (single query, no N+1).
    const settlementRows = await this.settlementRepository.listBySubject({
      taxSubjectId: input.taxSubjectId,
    });
    const evidenceByObligation = new Map<string, TaxPaymentEvidenceRecord[]>();
    for (const row of settlementRows) {
      const list = evidenceByObligation.get(row.obligationKey) ?? [];
      list.push(mapSettlementRowToEvidenceRecord(row));
      evidenceByObligation.set(row.obligationKey, list);
    }

    // 3. Derive 4K.2 payment hints in-memory (pure engine, zero extra queries).
    const paymentHints: TaxComplianceReminderPaymentHint[] = [];
    for (const obligation of timeline.obligations) {
      if (obligation.kind !== 'MONTHLY_TAX_PAYMENT') {
        continue;
      }
      const support = deriveTaxPaymentSupport({
        obligation,
        evidenceHistory: evidenceByObligation.get(obligation.obligationKey) ?? [],
        todayCivilDate: today,
      });
      if (support) {
        paymentHints.push({
          obligationKey: obligation.obligationKey,
          reconciliationStatus: support.reconciliationStatus,
          supportStatus: support.supportStatus,
        });
      }
    }

    // 4. Stored preferences (defaults when never configured).
    const stored = await this.preferencesRepository.findBySubject(input.taxSubjectId);
    const preferences: TaxComplianceReminderPreferences = stored
      ? {
          remindersEnabled: stored.remindersEnabled,
          upcomingEnabled: stored.upcomingEnabled,
          overdueEnabled: stored.overdueEnabled,
          annualEnabled: stored.annualEnabled,
          leadTimes: [...stored.leadTimes],
        }
      : { ...DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES };

    // 5. Stored reminder actions (single query, no N+1).
    const actionRows = await this.reminderActionRepository.listBySubject({
      taxSubjectId: input.taxSubjectId,
    });
    const actions = actionRows.map(mapActionRowToRecord);

    // 6. Pure deterministic projection.
    const projection = projectTaxComplianceReminders({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      obligations: timeline.obligations,
      paymentHints,
      preferences,
      actions,
    });

    // 7. Server-side filters.
    let reminders = [...projection.reminders];
    if (input.status) {
      reminders = reminders.filter((r) => r.status === input.status);
    }
    if (input.kind) {
      reminders = reminders.filter((r) => r.kind === input.kind);
    }
    if (input.triggerFrom) {
      reminders = reminders.filter((r) => r.effectiveAt >= (input.triggerFrom as string));
    }
    if (input.triggerTo) {
      reminders = reminders.filter((r) => r.effectiveAt <= (input.triggerTo as string));
    }

    return Object.freeze({
      reminders: Object.freeze(reminders),
      generatedAt: projection.generatedAt,
      totalCount: reminders.length,
    });
  }
}
