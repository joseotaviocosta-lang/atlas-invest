import { describe, it, expect } from 'vitest';
import {
  assembleTaxComplianceActionCenter,
  projectTaxComplianceCalendar,
  TAX_COMPLIANCE_ACTION_ITEM_KINDS,
  TAX_COMPLIANCE_OPERATIONAL_STATUSES,
  TAX_COMPLIANCE_PRIORITIES,
  type TaxComplianceObligation,
  type TaxComplianceReminder,
  type TaxComplianceReminderPaymentHint,
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

const REMINDER_KINDS = [
  'UPCOMING_DUE',
  'DUE_TODAY',
  'OVERDUE',
  'ACTION_REQUIRED',
  'ANNUAL_REVIEW_REQUIRED',
] as const;

const REMINDER_STATUSES = [
  'SCHEDULED',
  'DELIVERED',
  'ACKNOWLEDGED',
  'SNOOZED',
  'DISMISSED',
  'SUPERSEDED',
  'CANCELLED',
] as const;

describe('Phase 4K.4 — Tax Compliance Action Center Fuzz Test (20,000 iterations)', () => {
  it('fuzzes assembleTaxComplianceActionCenter over 20,000 randomized assemblies without invariant violations', () => {
    const rand = mulberry32(20260412);
    let failures = 0;
    let firstFailure = '';

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
          sourceModule: pick(rand, ['4G', '4H', '4I', '4J'] as const),
          sourceRef: `fuzz-${o}`,
          sourceFingerprint: `fp-fuzz-${Math.floor(rand() * 3)}`,
          status: pick(rand, OBLIGATION_STATUSES),
          severity: pick(rand, ['INFO', 'ACTION', 'WARNING', 'BLOCKING'] as const),
          actionType: 'PAY',
          amount: pick(rand, ['100.00', '2500.75', '0', '0.00', null, '-10.00']),
          currency: pick(rand, ['BRL', null]),
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

      const reminders: TaxComplianceReminder[] = [];
      const reminderCount = Math.floor(rand() * 3);
      for (let r = 0; r < reminderCount; r++) {
        const target =
          obligations.length > 0 && rand() < 0.7
            ? obligations[Math.floor(rand() * obligations.length)]
            : null;
        const triggerAt = civilDate(rand);
        reminders.push({
          reminderKey: `${target?.obligationKey ?? `${subject}:2026-01:MONTHLY_TAX_PAYMENT:orphan`}:${pick(rand, REMINDER_KINDS)}:${triggerAt}`,
          taxSubjectId: subject,
          obligationKey: target?.obligationKey ?? `${subject}:2026-01:MONTHLY_TAX_PAYMENT:orphan`,
          sourceFingerprint: `fp-fuzz-${Math.floor(rand() * 4)}`,
          kind: pick(rand, REMINDER_KINDS),
          triggerAt,
          effectiveAt: triggerAt,
          status: pick(rand, REMINDER_STATUSES),
          severity: 'ACTION',
          title: 'Fuzz reminder',
          message: 'Randomized fuzz reminder.',
          actionTarget: '/tax',
          deliveryChannels: ['IN_APP'],
          dedupKey: `fuzz-${i}-${r}`,
          sourceVersion: '4K.3',
          snoozedUntil: null,
          actedAt: null,
          isStale: false,
        });
      }

      // Randomize input ordering to prove order invariance separately.
      const shuffled = [...obligations];
      for (let s = shuffled.length - 1; s > 0; s--) {
        const j = Math.floor(rand() * (s + 1));
        [shuffled[s], shuffled[j]] = [shuffled[j]!, shuffled[s]!];
      }

      const input = {
        taxSubjectId: subject,
        calendarYear: 2026,
        todayCivilDate: today,
        obligations,
        paymentHints: hints,
        reminders,
      };
      const first = assembleTaxComplianceActionCenter(input);
      const reordered = assembleTaxComplianceActionCenter({ ...input, obligations: shuffled });

      try {
        expect(JSON.stringify(reordered)).toBe(JSON.stringify(first));
        expect(reordered.centerFingerprint).toBe(first.centerFingerprint);
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.items)).toBe(true);
        expect(Object.isFrozen(first.summary)).toBe(true);

        const keys = new Set<string>();
        for (const item of first.items) {
          expect(Object.isFrozen(item)).toBe(true);
          expect((TAX_COMPLIANCE_ACTION_ITEM_KINDS as readonly string[]).includes(item.kind)).toBe(
            true,
          );
          expect(
            (TAX_COMPLIANCE_OPERATIONAL_STATUSES as readonly string[]).includes(
              item.operationalStatus,
            ),
          ).toBe(true);
          expect((TAX_COMPLIANCE_PRIORITIES as readonly string[]).includes(item.priority)).toBe(
            true,
          );
          expect(item.taxSubjectId).toBe(subject);
          expect(item.sourceVersion).toBe('4K.4');
          expect(item.actionTarget).toBe('/tax');
          expect(keys.has(item.actionKey)).toBe(false);
          keys.add(item.actionKey);
          // Annual items preserve calendar year and exercise distinctly.
          if (item.exercise !== null) {
            expect(item.calendarYear).toBe(2026);
            expect(item.exercise).toBe(2027);
          }
          // Completed items are never born from reminder acknowledgement here:
          // completion requires upstream COMPLETED status only.
          if (item.operationalStatus === 'COMPLETED') {
            expect(item.kind).toBe('COMPLETE_COMPLIANCE_ACTION');
          }
          // Evidence match is user-reported, never government verification.
          if (
            item.kind === 'INFORMATIONAL' &&
            item.paymentEvidenceStatus === 'USER_REPORTED_MATCH'
          ) {
            expect(item.summary).toContain('sem verificação governamental');
          }
        }

        // Counter consistency: summary exactly equals classification.
        const current = first.items.filter((item) => item.operationalStatus !== 'SUPERSEDED');
        expect(first.summary.total).toBe(current.length);
        expect(first.summary.overdue).toBe(
          current.filter((item) => item.operationalStatus === 'OVERDUE').length,
        );
        expect(first.summary.completed).toBe(
          current.filter((item) => item.operationalStatus === 'COMPLETED').length,
        );
        expect(first.summary.annualReview).toBe(
          current.filter((item) => item.exercise !== null).length,
        );

        // Calendar projection over a bounded window never throws on valid input
        // and never duplicates semantic events.
        const calendar = projectTaxComplianceCalendar({
          taxSubjectId: subject,
          items: first.items,
          reminders,
          todayCivilDate: today,
          from: today,
          to: today,
        });
        const eventKeys = calendar.events.map((event) => event.eventKey);
        expect(new Set(eventKeys).size).toBe(eventKeys.length);
        for (const event of calendar.events) {
          expect(event.taxSubjectId).toBe(subject);
        }
      } catch (err) {
        failures += 1;
        if (!firstFailure) {
          firstFailure = `${err instanceof Error ? err.message : String(err)} :: ${JSON.stringify(input).slice(0, 2000)}`;
        }
      }
    }

    if (firstFailure) {
      console.info(`[ActionCenter fuzz] first failure: ${firstFailure}`);
    }
    expect(failures).toBe(0);
  });
});
