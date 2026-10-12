import { describe, it, expect } from 'vitest';
import {
  assessPeriodCloseReadiness,
  assembleEvidenceBinder,
  serializeBinderCsv,
  serializeBinderJson,
  TAX_COMPLIANCE_CLOSE_READINESS_PRECEDENCE,
  type TaxComplianceObligation,
  type TaxComplianceActionItem,
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

const ITEM_KINDS = [
  'PAY_TAX',
  'REVIEW_PAYMENT_EVIDENCE',
  'REVIEW_CHANGED_OBLIGATION',
  'PROVIDE_CONFIRMATION',
  'REVIEW_ANNUAL_FILING',
  'RESOLVE_BLOCKER',
  'COMPLETE_COMPLIANCE_ACTION',
  'INFORMATIONAL',
] as const;

const ITEM_STATUSES = [
  'ACTION_REQUIRED',
  'UPCOMING',
  'DUE_TODAY',
  'OVERDUE',
  'WAITING_USER',
  'REQUIRES_REVIEW',
  'COMPLETED',
  'SUPERSEDED',
  'INFORMATIONAL',
] as const;

describe('Phase 4K.5 — Period Close Fuzz Test (20,000 iterations)', () => {
  it('fuzzes assessPeriodCloseReadiness + assembleEvidenceBinder without invariant violations', () => {
    const rand = mulberry32(20260512);
    let failures = 0;
    let firstFailure = '';

    for (let i = 0; i < 20000; i++) {
      const scope = pick(rand, ['MONTHLY', 'ANNUAL'] as const);
      const subject = `fuzz-close-${Math.floor(rand() * 5)}`;
      const today = civilDate(rand);
      const period =
        scope === 'MONTHLY'
          ? `2026-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}`
          : '2026';

      const obligationCount = Math.floor(rand() * 4);
      const obligations: TaxComplianceObligation[] = [];
      for (let o = 0; o < obligationCount; o++) {
        const kind = pick(rand, OBLIGATION_KINDS);
        const monthly = kind === 'MONTHLY_TAX_PAYMENT';
        const obPeriod = scope === 'MONTHLY' ? (rand() < 0.8 ? period : '2026-01') : '2026';
        void monthly;
        obligations.push({
          obligationKey: `${subject}:${obPeriod}:${kind}:fuzz-${o}`,
          taxSubjectId: subject,
          calendarYear: 2026,
          period: obPeriod,
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
          metadata: {
            revenueCode: '6015',
            darfReadiness: pick(rand, ['READY', 'PARTIAL', 'BLOCKED', 'NOT_REQUIRED']),
          },
          userAction: null,
          isOverdue: false,
        });
      }

      const itemCount = Math.floor(rand() * 4);
      const actionItems: TaxComplianceActionItem[] = [];
      for (let k = 0; k < itemCount; k++) {
        const kind = pick(rand, ITEM_KINDS);
        const annual = kind === 'REVIEW_ANNUAL_FILING';
        actionItems.push({
          actionKey: `${subject}:fuzz-${k}:${kind}:fp-fuzz-${Math.floor(rand() * 3)}`,
          taxSubjectId: subject,
          obligationKey: `${subject}:${period}:${pick(rand, OBLIGATION_KINDS)}:fuzz-${k}`,
          sourceFingerprint: `fp-fuzz-${Math.floor(rand() * 3)}`,
          kind,
          period: annual ? '2026' : period,
          calendarYear: 2026,
          exercise: annual ? 2027 : null,
          dueDate: rand() < 0.8 ? civilDate(rand) : null,
          priority: pick(rand, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const),
          operationalStatus: pick(rand, ITEM_STATUSES),
          title: 'Fuzz action item',
          summary: 'Randomized fuzz item.',
          nextAction: 'VIEW_DETAILS',
          actionTarget: '/tax',
          amount: pick(rand, ['100.00', null]),
          currency: pick(rand, ['BRL', null]),
          revenueCode: '6015',
          paymentSupportStatus: null,
          paymentEvidenceStatus: null,
          reminderStatus: null,
          annualReviewStatus: null,
          isStale: rand() < 0.2,
          isSuperseded: false,
          blockingReasons: [],
          sourceVersion: '4K.4',
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
          supportStatus: pick(rand, [
            'READY',
            'STALE',
            'REQUIRES_REVIEW',
            'BLOCKED',
            'NOT_APPLICABLE',
          ]),
        }));

      const latestClose =
        rand() < 0.3
          ? {
              revision: 1 + Math.floor(rand() * 3),
              recordStatus: pick(rand, ['CLOSED', 'REOPENED'] as const),
              sourceFingerprint: `fp-fuzz-${Math.floor(rand() * 4)}`,
              binderFingerprint: `binder-fuzz-${Math.floor(rand() * 4)}`,
              closedAt: rand() < 0.8 ? `${civilDate(rand)}T00:00:00.000Z` : null,
            }
          : null;

      const input = {
        taxSubjectId: subject,
        scope,
        period,
        calendarYear: 2026,
        month: scope === 'MONTHLY' ? period : null,
        exercise: scope === 'ANNUAL' ? 2027 : null,
        todayCivilDate: today,
        obligations,
        actionItems,
        paymentHints: hints,
        reminders: [],
        evidence: [],
        centerFingerprint: null,
        latestClose,
      };

      try {
        const first = assessPeriodCloseReadiness(input);
        const shuffled = assessPeriodCloseReadiness({
          ...input,
          obligations: [...obligations].reverse(),
          actionItems: [...actionItems].reverse(),
        });
        expect(JSON.stringify(shuffled)).toBe(JSON.stringify(first));
        expect(Object.isFrozen(first)).toBe(true);

        // Readiness is always a known status; checklist frozen with 7 entries.
        expect(
          (TAX_COMPLIANCE_CLOSE_READINESS_PRECEDENCE as readonly string[]).includes(
            first.readiness,
          ),
        ).toBe(true);
        expect(first.checklist.length).toBe(7);
        expect(first.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);

        // cleanCloseAllowed is true exactly for READY/NO_ACTIVITY.
        expect(first.cleanCloseAllowed).toBe(
          first.readiness === 'READY_TO_CLOSE' || first.readiness === 'NO_ACTIVITY',
        );

        // BLOCKED readiness requires a blocker signal; never fabricated.
        if (first.readiness === 'BLOCKED') {
          const hasBlocker =
            first.unresolvedItems.some((item) => item.severity === 'BLOCKING') ||
            first.checklist.some((entry) => entry.state === 'BLOCKED');
          expect(hasBlocker).toBe(true);
        }

        // STALE requires a CLOSED previous close with a divergent fingerprint.
        if (first.readiness === 'STALE') {
          expect(first.isStaleVsPreviousClose).toBe(true);
          expect(first.previousClose?.recordStatus).toBe('CLOSED');
        }
        if (first.isStaleVsPreviousClose) {
          expect(first.previousClose).not.toBeNull();
        }

        // NO_ACTIVITY has no activity and all-N/A checklist.
        if (first.readiness === 'NO_ACTIVITY') {
          expect(first.checklist.every((entry) => entry.state === 'NOT_APPLICABLE')).toBe(true);
          expect(first.unresolvedItems).toEqual([]);
        }

        // Annual scope keeps year/exercise distinct; monthly never carries exercise.
        if (scope === 'ANNUAL') {
          expect(first.exercise).toBe(2027);
          expect(first.calendarYear).toBe(2026);
        } else {
          expect(first.exercise).toBeNull();
        }

        // Unresolved (ref, kind) pairs are unique and deterministically ordered.
        const keys = first.unresolvedItems.map((item) => `${item.ref}::${item.kind}`);
        expect(new Set(keys).size).toBe(keys.length);

        // Binder round-trips deterministically with stable fingerprint.
        const binderInput = {
          readiness: first,
          obligations,
          actionItems,
          paymentHints: hints,
          reminders: [],
          evidence: [],
          actionCenterSummary: null,
          centerFingerprint: null,
          todayCivilDate: today,
        };
        const binder = assembleEvidenceBinder(binderInput);
        const binderAgain = assembleEvidenceBinder({
          ...binderInput,
          obligations: [...obligations].reverse(),
        });
        expect(binderAgain.binderFingerprint).toBe(binder.binderFingerprint);
        expect(serializeBinderJson(binderAgain)).toBe(serializeBinderJson(binder));
        expect(serializeBinderCsv(binderAgain)).toBe(serializeBinderCsv(binder));
        // CSV uses CRLF and carries the support disclaimer.
        expect(serializeBinderCsv(binder)).toContain('\r\n');
        expect(serializeBinderCsv(binder)).toContain('Receita Federal');
        expect(serializeBinderJson(binder)).toContain('Receita Federal');
        // No government-verification language anywhere.
        for (const text of [serializeBinderJson(binder), serializeBinderCsv(binder)]) {
          expect(text).not.toMatch(/RECEITA.*CONFIRM|GOVERNMENT_VERIFIED|quitado oficialmente/i);
        }
      } catch (err) {
        failures += 1;
        if (!firstFailure) {
          firstFailure = `${err instanceof Error ? err.message : String(err)} :: ${JSON.stringify({ scope, period, obligations: obligations.length, actionItems: actionItems.length }).slice(0, 500)}`;
        }
      }
    }

    if (firstFailure) {
      console.info(`[PeriodClose fuzz] first failure: ${firstFailure}`);
    }
    expect(failures).toBe(0);
  });
});
