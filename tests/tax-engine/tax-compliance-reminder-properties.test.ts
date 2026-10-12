import { describe, it, expect } from 'vitest';
import {
  projectTaxComplianceReminders,
  DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
  type TaxComplianceObligation,
  type TaxComplianceReminderActionRecord,
  type TaxComplianceReminderPreferences,
} from '../../packages/tax-engine/src';

function mockObligation(overrides: Partial<TaxComplianceObligation> = {}): TaxComplianceObligation {
  return {
    obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
    taxSubjectId: 'user-1',
    calendarYear: 2026,
    period: '2026-03',
    kind: 'MONTHLY_TAX_PAYMENT',
    sourceModule: '4G',
    sourceRef: 'monthly-6015',
    sourceFingerprint: 'fp-source-v1',
    status: 'OPEN',
    severity: 'ACTION',
    actionType: 'PAY',
    amount: '500.00',
    currency: 'BRL',
    dueDate: '2026-04-30',
    title: 'Pagamento de DARF 6015 — Competência 2026-03',
    description: 'DARF código 6015 referente às operações de 2026-03.',
    links: [{ label: 'Ver Detalhes', href: '/tax' }],
    metadata: { revenueCode: '6015', competence: '2026-03' },
    userAction: null,
    isOverdue: false,
    ...overrides,
  };
}

function mockAction(
  overrides: Partial<TaxComplianceReminderActionRecord> = {},
): TaxComplianceReminderActionRecord {
  const obligationKey =
    overrides.obligationKey ?? 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015';
  const kind = overrides.reminderKind ?? 'UPCOMING_DUE';
  const triggerAt = overrides.triggerAt ?? '2026-04-23';
  return {
    id: 'act-1',
    taxSubjectId: 'user-1',
    reminderKey: overrides.reminderKey ?? `${obligationKey}:${kind}:${triggerAt}`,
    obligationKey,
    reminderKind: kind,
    triggerAt,
    sourceFingerprint: 'fp-source-v1',
    actionType: 'ACKNOWLEDGE',
    snoozedUntil: null,
    revision: 1,
    occurredAt: '2026-04-20T00:00:00.000Z',
    createdAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  };
}

const PREFS: TaxComplianceReminderPreferences = {
  ...DEFAULT_TAX_COMPLIANCE_REMINDER_PREFERENCES,
};

describe('Phase 4K.3 — Tax Compliance Reminder Property Tests (All 8 Required)', () => {
  it('1. reminder determinism: identical inputs yield byte-for-byte identical frozen projections', () => {
    const input = {
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [mockObligation()],
      preferences: PREFS,
      actions: [mockAction()],
    };
    const reference = JSON.stringify(projectTaxComplianceReminders(input));
    for (let i = 0; i < 200; i++) {
      const res = projectTaxComplianceReminders(input);
      expect(JSON.stringify(res)).toBe(reference);
      expect(Object.isFrozen(res)).toBe(true);
      expect(Object.isFrozen(res.reminders)).toBe(true);
      for (const reminder of res.reminders) {
        expect(Object.isFrozen(reminder)).toBe(true);
      }
    }
  });

  it('2. semantic reminder-key stability: key derives only from obligationKey, kind and triggerAt', () => {
    const res = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [mockObligation()],
      preferences: PREFS,
    });
    const upcoming = res.reminders.filter((r) => r.kind === 'UPCOMING_DUE');
    expect(upcoming.length).toBe(3);
    const keys = upcoming.map((r) => r.reminderKey).sort();
    expect(keys).toEqual([
      'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-23',
      'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-27',
      'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-29',
    ]);
    for (const reminder of upcoming) {
      expect(reminder.dedupKey).toBe(`${reminder.reminderKey}:fp-source-v1`);
      expect(reminder.sourceVersion).toBe('4K.3');
    }
  });

  it('3. trigger-time determinism: reminderAt equals authoritative dueDate minus policy lead time', () => {
    const res = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-01',
      obligations: [mockObligation({ dueDate: '2026-04-30' })],
      preferences: { ...PREFS, leadTimes: [7, 3, 1] },
    });
    const triggers = res.reminders
      .filter((r) => r.kind === 'UPCOMING_DUE')
      .map((r) => r.triggerAt)
      .sort();
    expect(triggers).toEqual(['2026-04-23', '2026-04-27', '2026-04-29']);
    // Legal due date itself is never recomputed: obligation untouched, only offsets.
    expect(res.reminders.every((r) => r.obligationKey.includes('2026-03'))).toBe(true);
  });

  it('4. dedup determinism: one canonical instance per semantic trigger, no spam across cycles', () => {
    const base = {
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      obligations: [mockObligation()],
      preferences: PREFS,
    };
    const early = projectTaxComplianceReminders({ ...base, todayCivilDate: '2026-04-10' });
    const late = projectTaxComplianceReminders({ ...base, todayCivilDate: '2026-05-05' });
    const countByKey = (list: readonly { reminderKey: string }[]): number =>
      new Set(list.map((r) => r.reminderKey)).size;
    // Re-projecting on different days never duplicates a semantic instance.
    expect(countByKey(early.reminders)).toBe(early.reminders.length);
    expect(countByKey(late.reminders)).toBe(
      late.reminders.filter((r) => r.status !== 'SUPERSEDED').length +
        late.reminders.filter((r) => r.status === 'SUPERSEDED').length,
    );
    // Single overdue obligation yields exactly one OVERDUE instance (no per-cycle spam).
    expect(late.reminders.filter((r) => r.kind === 'OVERDUE').length).toBe(1);
  });

  it('5. source-fingerprint sensitivity: changed source supersedes old instances and never reuses suppression', () => {
    const oldAction = mockAction({ sourceFingerprint: 'fp-source-v1' });
    const res = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [mockObligation({ sourceFingerprint: 'fp-source-v2' })],
      preferences: PREFS,
      actions: [oldAction],
    });
    const shells = res.reminders.filter((r) => r.status === 'SUPERSEDED');
    expect(shells.length).toBeGreaterThan(0);
    expect(shells.every((r) => r.isStale)).toBe(true);
    // Fresh instances for the new fingerprint are actionable, never suppressed.
    const fresh = res.reminders.filter(
      (r) => r.sourceFingerprint === 'fp-source-v2' && r.kind === 'UPCOMING_DUE',
    );
    expect(fresh.length).toBe(3);
    expect(fresh.every((r) => r.status === 'DELIVERED' || r.status === 'SCHEDULED')).toBe(true);
  });

  it('6. supersession determinism: snooze/dismiss/acknowledge never resolve compliance and never cross fingerprints', () => {
    const key = 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-23';
    const dismissed = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-24',
      obligations: [mockObligation()],
      preferences: PREFS,
      actions: [mockAction({ reminderKey: key, actionType: 'DISMISS' })],
    });
    const target = dismissed.reminders.find((r) => r.reminderKey === key);
    expect(target?.status).toBe('DISMISSED');
    // Sibling instances stay actionable: dismissal is per-instance, not per-obligation.
    const siblings = dismissed.reminders.filter(
      (r) =>
        r.obligationKey === mockObligation().obligationKey &&
        r.reminderKey !== key &&
        r.sourceFingerprint === 'fp-source-v1',
    );
    expect(siblings.length).toBeGreaterThan(0);
    expect(siblings.every((r) => r.status === 'DELIVERED' || r.status === 'SCHEDULED')).toBe(true);
  });

  it('7. preference application determinism: disabled categories cancel deterministically without deleting history', () => {
    const off: TaxComplianceReminderPreferences = {
      remindersEnabled: true,
      upcomingEnabled: false,
      overdueEnabled: false,
      annualEnabled: false,
      leadTimes: [7, 3, 1],
    };
    const res = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-05-05',
      obligations: [
        mockObligation(),
        mockObligation({
          obligationKey: 'user-1:2026:ANNUAL_REVIEW:annual-req-x',
          kind: 'ANNUAL_REVIEW',
          period: '2026',
          dueDate: null,
          amount: null,
          status: 'ACTION_REQUIRED',
        }),
      ],
      preferences: off,
    });
    expect(res.reminders.length).toBeGreaterThan(0);
    expect(
      res.reminders
        .filter((r) => r.kind === 'UPCOMING_DUE' || r.kind === 'OVERDUE')
        .every((r) => r.status === 'CANCELLED'),
    ).toBe(true);
    const rerun = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-05-05',
      obligations: [
        mockObligation(),
        mockObligation({
          obligationKey: 'user-1:2026:ANNUAL_REVIEW:annual-req-x',
          kind: 'ANNUAL_REVIEW',
          period: '2026',
          dueDate: null,
          amount: null,
          status: 'ACTION_REQUIRED',
        }),
      ],
      preferences: off,
    });
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(res));
  });

  it('8. history preservation: snoozed reminders resurface and acted states survive reprojection', () => {
    const key = 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-23';
    const snoozed = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-24',
      obligations: [mockObligation()],
      preferences: PREFS,
      actions: [
        mockAction({
          reminderKey: key,
          actionType: 'SNOOZE',
          snoozedUntil: '2026-04-28',
          occurredAt: '2026-04-24T00:00:00.000Z',
        }),
      ],
    });
    const target = snoozed.reminders.find((r) => r.reminderKey === key);
    expect(target?.status).toBe('SNOOZED');
    expect(target?.effectiveAt).toBe('2026-04-28');
    // After the snooze horizon the same instance resurfaces as DELIVERED.
    const resurfaced = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-28',
      obligations: [mockObligation()],
      preferences: PREFS,
      actions: [
        mockAction({
          reminderKey: key,
          actionType: 'SNOOZE',
          snoozedUntil: '2026-04-28',
          occurredAt: '2026-04-24T00:00:00.000Z',
        }),
      ],
    });
    expect(resurfaced.reminders.find((r) => r.reminderKey === key)?.status).toBe('DELIVERED');
  });

  it('9. evidence-kind mapping: annual EVIDENCE_REQUIRED and mismatched payment evidence project exact kinds', () => {
    const annualEvidence = mockObligation({
      obligationKey: 'user-1:2026:EVIDENCE_REQUIRED:annual-req-ev',
      kind: 'EVIDENCE_REQUIRED',
      period: '2026',
      dueDate: null,
      amount: null,
      status: 'AWAITING_EVIDENCE',
    });
    const res = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [mockObligation(), annualEvidence],
      paymentHints: [
        {
          obligationKey: mockObligation().obligationKey,
          reconciliationStatus: 'USER_REPORTED_MISMATCH',
          supportStatus: 'REQUIRES_REVIEW',
        },
      ],
      preferences: PREFS,
    });
    const evidence = res.reminders.filter((r) => r.kind === 'EVIDENCE_REQUIRED');
    expect(evidence.length).toBe(1);
    expect(evidence[0]!.obligationKey).toBe(annualEvidence.obligationKey);
    const review = res.reminders.filter((r) => r.kind === 'PAYMENT_EVIDENCE_REVIEW');
    expect(review.length).toBe(1);
    expect(review[0]!.status).toBe('DELIVERED');
    const matched = projectTaxComplianceReminders({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [mockObligation()],
      paymentHints: [
        {
          obligationKey: mockObligation().obligationKey,
          reconciliationStatus: 'USER_REPORTED_MATCH',
          supportStatus: 'READY',
        },
      ],
      preferences: PREFS,
    });
    expect(
      matched.reminders.filter(
        (r) => r.kind === 'PAYMENT_EVIDENCE_REVIEW' || r.kind === 'STALE_SOURCE',
      ),
    ).toEqual([]);
  });
});
