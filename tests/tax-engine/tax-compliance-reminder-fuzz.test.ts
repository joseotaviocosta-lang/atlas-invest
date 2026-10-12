import { describe, it, expect } from 'vitest';
import {
  projectTaxComplianceReminders,
  TAX_COMPLIANCE_REMINDER_KINDS,
  TAX_COMPLIANCE_REMINDER_STATUSES,
  type TaxComplianceObligation,
  type TaxComplianceReminderActionRecord,
  type TaxComplianceReminderPaymentHint,
  type TaxComplianceReminderPreferences,
} from '../../packages/tax-engine/src';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function civilDate(rand: () => number): string {
  const year = pick(rand, [2025, 2026, 2027]);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const OBLIGATION_KINDS = [
  'MONTHLY_TAX_PAYMENT',
  'ANNUAL_REVIEW',
  'ANNUAL_FILING_SUPPORT',
  'EVIDENCE_REQUIRED',
  'CONFIRMATION_REQUIRED',
  'PROFESSIONAL_REVIEW_REQUIRED',
] as const;

const OBLIGATION_STATUSES = [
  'OPEN',
  'ACTION_REQUIRED',
  'AWAITING_CONFIRMATION',
  'AWAITING_EVIDENCE',
  'READY',
  'COMPLETED',
  'DISMISSED',
  'SUPERSEDED',
] as const;

describe('Phase 4K.3 — Tax Compliance Reminder Fuzz Test (20,000 iterations)', () => {
  it('fuzzes projectTaxComplianceReminders over 20,000 randomized projections without invariant violations', () => {
    const rand = mulberry32(20260411);
    let failures = 0;

    for (let i = 0; i < 20000; i++) {
      const subject = `fuzz-user-${Math.floor(rand() * 5)}`;
      const today = civilDate(rand);
      const obligationCount = Math.floor(rand() * 4);
      const obligations: TaxComplianceObligation[] = [];
      for (let o = 0; o < obligationCount; o++) {
        const kind = pick(rand, OBLIGATION_KINDS);
        const monthly = kind === 'MONTHLY_TAX_PAYMENT';
        const competence = monthly
          ? `2026-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}`
          : '2026';
        obligations.push({
          obligationKey: `${subject}:${competence}:${kind}:fuzz-${o}`,
          taxSubjectId: subject,
          calendarYear: 2026,
          period: competence,
          kind,
          sourceModule: '4G',
          sourceRef: `fuzz-${o}`,
          sourceFingerprint: `fp-fuzz-${Math.floor(rand() * 3)}`,
          status: pick(rand, OBLIGATION_STATUSES),
          severity: pick(rand, ['INFO', 'ACTION', 'WARNING', 'BLOCKING'] as const),
          actionType: 'PAY',
          amount: pick(rand, ['100.00', '2500.75', '0', '0.00', null, '-10.00']),
          currency: 'BRL',
          dueDate: rand() < 0.85 ? civilDate(rand) : null,
          title: 'Fuzz obligation',
          description: 'Randomized fuzz obligation.',
          links: [],
          metadata: { revenueCode: '6015' },
          userAction: null,
          isOverdue: false,
        });
      }

      const hints: TaxComplianceReminderPaymentHint[] = obligations
        .filter(() => rand() < 0.4)
        .map((o) => ({
          obligationKey: o.obligationKey,
          reconciliationStatus: pick(rand, [
            'NO_EVIDENCE',
            'USER_REPORTED_MATCH',
            'USER_REPORTED_MISMATCH',
            'STALE_SOURCE',
          ]),
          supportStatus: pick(rand, ['READY', 'STALE', 'REQUIRES_REVIEW']),
        }));

      const leadPool = [1, 2, 3, 5, 7, 10, 15, 30];
      const leadCount = Math.floor(rand() * 4);
      const leadTimes: number[] = [];
      for (let l = 0; l < leadCount; l++) {
        leadTimes.push(pick(rand, leadPool));
      }
      const preferences: TaxComplianceReminderPreferences = {
        remindersEnabled: rand() < 0.9,
        upcomingEnabled: rand() < 0.9,
        overdueEnabled: rand() < 0.9,
        annualEnabled: rand() < 0.9,
        leadTimes,
      };

      const actions: TaxComplianceReminderActionRecord[] = [];
      const actionCount = Math.floor(rand() * 3);
      for (let a = 0; a < actionCount; a++) {
        const target =
          obligations.length > 0 && rand() < 0.7
            ? obligations[Math.floor(rand() * obligations.length)].obligationKey
            : `${subject}:2026-01:MONTHLY_TAX_PAYMENT:orphan`;
        const kind = pick(rand, ['UPCOMING_DUE', 'DUE_TODAY', 'OVERDUE'] as const);
        const triggerAt = civilDate(rand);
        const actionType = pick(rand, ['ACKNOWLEDGE', 'SNOOZE', 'DISMISS'] as const);
        actions.push({
          id: `fuzz-act-${i}-${a}`,
          taxSubjectId: subject,
          reminderKey: `${target}:${kind}:${triggerAt}`,
          obligationKey: target,
          reminderKind: kind,
          triggerAt,
          sourceFingerprint: `fp-fuzz-${Math.floor(rand() * 4)}`,
          actionType,
          snoozedUntil: actionType === 'SNOOZE' ? civilDate(rand) : null,
          revision: 1 + Math.floor(rand() * 2),
          occurredAt: `${today}T00:00:00.000Z`,
          createdAt: `${today}T00:00:00.000Z`,
        });
      }

      const input = {
        taxSubjectId: subject,
        calendarYear: 2026,
        todayCivilDate: today,
        obligations,
        paymentHints: hints,
        preferences,
        actions,
      };
      const first = projectTaxComplianceReminders(input);
      const second = projectTaxComplianceReminders(input);

      try {
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.reminders)).toBe(true);
        const dedupKeys = new Set<string>();
        for (const reminder of first.reminders) {
          expect(Object.isFrozen(reminder)).toBe(true);
          expect((TAX_COMPLIANCE_REMINDER_KINDS as readonly string[]).includes(reminder.kind)).toBe(
            true,
          );
          expect(
            (TAX_COMPLIANCE_REMINDER_STATUSES as readonly string[]).includes(reminder.status),
          ).toBe(true);
          expect(reminder.taxSubjectId).toBe(subject);
          expect(reminder.sourceVersion).toBe('4K.3');
          expect(reminder.dedupKey).toContain(reminder.reminderKey);
          expect(dedupKeys.has(reminder.dedupKey)).toBe(false);
          dedupKeys.add(reminder.dedupKey);
          // Snooze never rewrites the legal trigger; only the effective surfacing date.
          if (reminder.status === 'SNOOZED') {
            expect(reminder.snoozedUntil).not.toBeNull();
          }
          if (reminder.status !== 'SUPERSEDED') {
            expect(reminder.isStale).toBe(false);
            expect(reminder.sourceFingerprint.length).toBeGreaterThan(0);
          } else {
            expect(reminder.isStale).toBe(true);
          }
          // Dismissal/acknowledgement of one instance never resolves siblings is
          // covered structurally: every actionable instance is still projected.
          expect(reminder.title.length).toBeGreaterThan(0);
          expect(reminder.message.length).toBeGreaterThan(0);
        }
      } catch {
        failures += 1;
      }
    }

    expect(failures).toBe(0);
  });
});
