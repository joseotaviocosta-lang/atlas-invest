import { Inject, Injectable } from '@nestjs/common';
import {
  assembleTaxComplianceActionCenter,
  deriveTaxPaymentSupport,
  projectTaxComplianceReminders,
  DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
  type TaxComplianceActionCenter,
  type TaxComplianceActionItem,
  type TaxComplianceActionCenterSummary,
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

export interface GetTaxComplianceActionCenterInput {
  readonly taxSubjectId: string;
  readonly calendarYear?: number;
  readonly month?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly kind?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TaxComplianceActionCenterResult {
  readonly items: readonly TaxComplianceActionItem[];
  readonly summary: TaxComplianceActionCenterSummary;
  readonly centerFingerprint: string;
  readonly generatedAt: string;
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
}

function toCivilDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

/**
 * Assembles the unified action center from one coherent snapshot.
 *
 * Snapshot fence: timeline, settlements, reminder actions and preferences are
 * all loaded up-front into a single immutable input; the pure engines then run
 * exactly once over that snapshot. Every item binds a single source
 * fingerprint, so a concurrent upstream write can only shift which snapshot a
 * later read observes (coherent A or coherent B) — never a mixed A/B item.
 */
@Injectable()
export class GetTaxComplianceActionCenterUseCase {
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

  async execute(
    input: GetTaxComplianceActionCenterInput,
  ): Promise<TaxComplianceActionCenterResult> {
    const today = this.clock.today();
    const calendarYear = input.calendarYear ?? parseInt(today.substring(0, 4), 10);

    // 1. Authoritative compliance timeline (4K.1 — never recomputed here).
    const timeline = await this.timelineUseCase.execute({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
    });

    // 2. Batch loads (one query each — no N+1 per obligation/evidence/reminder).
    const [settlementRows, actionRows, storedPrefs] = await Promise.all([
      this.settlementRepository.listBySubject({ taxSubjectId: input.taxSubjectId }),
      this.reminderActionRepository.listBySubject({ taxSubjectId: input.taxSubjectId }),
      this.preferencesRepository.findBySubject(input.taxSubjectId),
    ]);

    const evidenceByObligation = new Map<string, TaxPaymentEvidenceRecord[]>();
    for (const row of settlementRows) {
      const list = evidenceByObligation.get(row.obligationKey) ?? [];
      list.push(mapSettlementRowToEvidenceRecord(row));
      evidenceByObligation.set(row.obligationKey, list);
    }

    // 3. 4K.2 payment hints derived in-memory (pure engine, zero extra queries).
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

    const preferences: TaxComplianceReminderPreferences = storedPrefs
      ? {
          remindersEnabled: storedPrefs.remindersEnabled,
          upcomingEnabled: storedPrefs.upcomingEnabled,
          overdueEnabled: storedPrefs.overdueEnabled,
          annualEnabled: storedPrefs.annualEnabled,
          leadTimes: [...storedPrefs.leadTimes],
        }
      : { ...DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES };

    const reminderActions: TaxComplianceReminderActionRecord[] = actionRows.map(
      (row: TaxReminderActionRow) => ({
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
      }),
    );

    // 4. 4K.3 reminder projection over the same snapshot (triggers consumed as-is).
    const reminders = projectTaxComplianceReminders({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      obligations: timeline.obligations,
      paymentHints,
      preferences,
      actions: reminderActions,
    });

    // 5. 4K.4 assembly over the same snapshot (single pure pass).
    const center: TaxComplianceActionCenter = assembleTaxComplianceActionCenter({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      obligations: timeline.obligations,
      paymentHints,
      reminders: reminders.reminders,
    });

    // 6. Server-side filters + bounded pagination over the canonical order.
    let items = [...center.items];
    if (input.status) {
      items = items.filter((item) => item.operationalStatus === input.status);
    }
    if (input.priority) {
      items = items.filter((item) => item.priority === input.priority);
    }
    if (input.kind) {
      items = items.filter((item) => item.kind === input.kind);
    }
    if (input.month) {
      items = items.filter(
        (item) =>
          item.period === input.month ||
          (item.dueDate !== null && item.dueDate.startsWith(input.month as string)),
      );
    }

    const totalCount = items.length;
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    const page = items.slice(offset, offset + limit);

    return Object.freeze({
      items: Object.freeze(page),
      summary: center.summary,
      centerFingerprint: center.centerFingerprint,
      generatedAt: center.generatedAt,
      totalCount,
      limit,
      offset,
    });
  }
}
