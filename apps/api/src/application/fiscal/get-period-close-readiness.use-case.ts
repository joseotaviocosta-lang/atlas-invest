import { Inject, Injectable } from '@nestjs/common';
import {
  assembleEvidenceBinder,
  assembleTaxComplianceActionCenter,
  assessPeriodCloseReadiness,
  deriveTaxPaymentSupport,
  projectTaxComplianceReminders,
  DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
  type PeriodCloseEvidenceRef,
  type TaxCompliancePeriodCloseReadiness,
  type TaxComplianceCloseScope,
  type TaxComplianceEvidenceBinder,
  type TaxComplianceReminder,
  type TaxComplianceReminderActionRecord,
  type TaxComplianceReminderPaymentHint,
  type TaxComplianceReminderPreferences,
  type TaxPaymentEvidenceRecord,
} from '@atlas/tax-engine';
import type {
  ITaxPeriodCloseRepository,
  ITaxReminderActionRepository,
  ITaxReminderPreferencesRepository,
  ITaxSettlementRepository,
  TaxReminderActionRow,
} from '@atlas/database';
import {
  TAX_PERIOD_CLOSE_REPOSITORY,
  TAX_REMINDER_ACTION_REPOSITORY,
  TAX_REMINDER_PREFERENCES_REPOSITORY,
  TAX_SETTLEMENT_REPOSITORY,
} from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxComplianceTimelineUseCase } from './get-tax-compliance-timeline.use-case';
import { mapSettlementRowToEvidenceRecord } from './record-tax-payment-evidence.use-case';

export interface PeriodCloseSnapshotInput {
  readonly taxSubjectId: string;
  readonly scope: TaxComplianceCloseScope;
  readonly calendarYear: number;
  readonly month?: string;
  readonly exercise?: number;
}

export interface PeriodCloseSnapshot {
  readonly readiness: TaxCompliancePeriodCloseReadiness;
  readonly binder: TaxComplianceEvidenceBinder;
  readonly totalCloseCount: number;
}

function toCivilDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

/**
 * Single coherent snapshot path for every 4K.5 read/write surface.
 *
 * Query shape (all bounded, zero N+1): exactly ONE 4K.1 timeline load plus
 * one batch load each for settlements, reminder actions, preferences and
 * close history. The 4K.3/4K.4 pure engines run in-memory over that
 * snapshot — the paginated 4K.4 use-case is deliberately NOT reused here,
 * so large ledgers never trigger page-chasing fan-out.
 *
 * A concurrent upstream write can only shift which snapshot a later read
 * observes — never a mixed-semantics binder.
 */
@Injectable()
export class GetPeriodCloseReadinessUseCase {
  constructor(
    @Inject(GetTaxComplianceTimelineUseCase)
    private readonly timelineUseCase: GetTaxComplianceTimelineUseCase,
    @Inject(TAX_SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ITaxSettlementRepository,
    @Inject(TAX_REMINDER_ACTION_REPOSITORY)
    private readonly reminderActionRepository: ITaxReminderActionRepository,
    @Inject(TAX_REMINDER_PREFERENCES_REPOSITORY)
    private readonly preferencesRepository: ITaxReminderPreferencesRepository,
    @Inject(TAX_PERIOD_CLOSE_REPOSITORY)
    private readonly closeRepository: ITaxPeriodCloseRepository,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async executeSnapshot(input: PeriodCloseSnapshotInput): Promise<PeriodCloseSnapshot> {
    const today = this.clock.today();
    const period = input.scope === 'MONTHLY' ? (input.month as string) : String(input.calendarYear);

    // 1. Authoritative timeline (4K.1 — never recomputed here).
    const timeline = await this.timelineUseCase.execute({
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
    });

    // 2. Batch loads (one query each — no N+1 per obligation/evidence/reminder).
    const [settlementRows, actionRows, storedPrefs, latestClose, totalCloseCount] =
      await Promise.all([
        this.settlementRepository.listBySubject({ taxSubjectId: input.taxSubjectId }),
        this.reminderActionRepository.listBySubject({ taxSubjectId: input.taxSubjectId }),
        this.preferencesRepository.findBySubject(input.taxSubjectId),
        this.closeRepository.findLatest({
          taxSubjectId: input.taxSubjectId,
          scope: input.scope,
          period,
        }),
        this.closeRepository.countHistory({
          taxSubjectId: input.taxSubjectId,
          scope: input.scope,
          period,
        }),
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

    // 4. 4K.3 reminder projection + 4K.4 action center over the same snapshot.
    const reminders = projectTaxComplianceReminders({
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
      todayCivilDate: today,
      obligations: timeline.obligations,
      paymentHints,
      preferences,
      actions: reminderActions,
    });
    const center = assembleTaxComplianceActionCenter({
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
      todayCivilDate: today,
      obligations: timeline.obligations,
      paymentHints,
      reminders: reminders.reminders,
    });

    // 5. Scope the snapshot. Monthly covers competence === month (annual
    // items excluded by construction); annual covers the calendar year plus
    // annual-review items. Evidence binds by referencePeriod.
    const scopedObligationKeys = new Set(
      timeline.obligations.filter((o) => o.period === period).map((o) => o.obligationKey),
    );
    const scopedObligations = timeline.obligations.filter((o) => o.period === period);
    const scopedItems = center.items.filter((item) =>
      input.scope === 'MONTHLY'
        ? item.period === period && item.exercise === null
        : item.exercise !== null,
    );
    const scopedHints = paymentHints.filter((hint) => scopedObligationKeys.has(hint.obligationKey));
    const scopedReminders = reminders.reminders.filter((reminder) =>
      scopedObligationKeys.has(reminder.obligationKey),
    );
    const evidence: PeriodCloseEvidenceRef[] = settlementRows
      .map((row) => mapSettlementRowToEvidenceRecord(row))
      .filter((record) =>
        input.scope === 'MONTHLY'
          ? record.referencePeriod === period
          : record.referencePeriod.startsWith(`${input.calendarYear}-`),
      )
      .map((record) => ({
        obligationKey: record.obligationKey,
        amountReported: record.amountReported,
        revenueCodeReported: record.revenueCodeReported,
        referencePeriod: record.referencePeriod,
        paymentDate: toCivilDate(record.paymentDate),
        externalReference: record.externalReference,
        revision: record.revision,
        verificationStatus: record.verificationStatus,
      }));

    const readiness = assessPeriodCloseReadiness({
      taxSubjectId: input.taxSubjectId,
      scope: input.scope,
      period,
      calendarYear: input.calendarYear,
      month: input.scope === 'MONTHLY' ? (input.month as string) : null,
      exercise: input.scope === 'ANNUAL' ? (input.exercise as number) : null,
      todayCivilDate: today,
      obligations: scopedObligations,
      actionItems: scopedItems,
      paymentHints: scopedHints,
      reminders: scopedReminders as unknown as TaxComplianceReminder[],
      evidence,
      centerFingerprint: center.centerFingerprint,
      latestClose: latestClose
        ? {
            revision: latestClose.revision,
            recordStatus: latestClose.recordStatus as 'CLOSED' | 'REOPENED',
            sourceFingerprint: latestClose.sourceFingerprint,
            binderFingerprint: latestClose.binderFingerprint,
            closedAt: latestClose.closedAt ? latestClose.closedAt.toISOString() : null,
          }
        : null,
    });

    const binder = assembleEvidenceBinder({
      readiness,
      obligations: scopedObligations,
      actionItems: scopedItems,
      paymentHints: scopedHints,
      reminders: scopedReminders as unknown as TaxComplianceReminder[],
      evidence,
      actionCenterSummary: { ...center.summary } as Record<string, number>,
      centerFingerprint: center.centerFingerprint,
      todayCivilDate: today,
    });

    return Object.freeze({ readiness, binder, totalCloseCount });
  }
}
