import { describe, expect, it } from 'vitest';
import {
  projectTaxComplianceTimeline,
  type MonthlyComplianceSource,
  type TaxComplianceUserActionRecord,
  type TaxComplianceUserActionType,
} from '../../packages/tax-engine/src/compliance';
import type { UnifiedAnnualIrpfState } from '../../packages/tax-engine/src/annual-irpf';

class DeterministicRandom {
  private seed: number;
  constructor(seed = 20261010) {
    this.seed = seed >>> 0;
  }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  choice<T>(arr: readonly T[]): T {
    return arr[this.nextInt(0, arr.length - 1)]!;
  }
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
}

const ACTION_TYPES: readonly TaxComplianceUserActionType[] = [
  'USER_REPORTED_COMPLETION',
  'USER_DISMISSED',
  'USER_ACKNOWLEDGED',
  'USER_REOPENED',
];

const MONTHLY_STATUSES = ['OPEN', 'PROVISIONAL', 'NO_PAYMENT_DUE', 'BLOCKED', 'PARTIAL'] as const;

describe('Phase 4K.1 — Tax Compliance Timeline 20,000-Case Fuzz Suite', () => {
  it('runs 20,000 randomized compliance timeline projections and validates invariants', () => {
    const rng = new DeterministicRandom(20261010);
    const taxSubjectId = '00000000-0000-0000-0000-000000000001';
    const iterations = 20000;

    for (let i = 0; i < iterations; i++) {
      const calendarYear = rng.choice([2024, 2025, 2026, 2027]);
      const month = rng.nextInt(1, 12).toString().padStart(2, '0');
      const day = rng.nextInt(1, 28).toString().padStart(2, '0');
      const todayCivilDate = `${calendarYear}-${month}-${day}`;

      // Generate random monthly sources
      const numMonths = rng.nextInt(0, 12);
      const monthlySources: MonthlyComplianceSource[] = [];
      for (let m = 1; m <= numMonths; m++) {
        const compMonth = m.toString().padStart(2, '0');
        const competence = `${calendarYear}-${compMonth}`;
        const status = rng.choice(MONTHLY_STATUSES);
        const hasAmount =
          status === 'OPEN' || status === 'PROVISIONAL' || (status === 'BLOCKED' && rng.bool(0.3));
        const principalAmount = hasAmount
          ? `${rng.nextInt(10, 50000)}.${rng.nextInt(10, 99)}`
          : null;
        const dueMonth = (m % 12) + 1;
        const dueYear = dueMonth === 1 ? calendarYear + 1 : calendarYear;
        const dueDate = `${dueYear}-${dueMonth.toString().padStart(2, '0')}-28`;

        monthlySources.push({
          competence,
          revenueCode: rng.choice(['6015', '0190', null]),
          bucket: rng.choice(['EQUITY_NORMAL', 'EQUITY_DAY_TRADE', 'FII', null]),
          principalAmount,
          currency: 'BRL',
          dueDate,
          status,
          reasonCode: status === 'BLOCKED' ? 'MISSING_REVENUE_CODE' : null,
          darfReadiness: status === 'OPEN' ? 'READY' : 'BLOCKED',
          sourceFingerprint: `fp-${competence}-${status}-${principalAmount}`,
        });
      }

      // Generate random annual state
      const hasAnnualState = rng.bool(0.7);
      let annualState: UnifiedAnnualIrpfState | null = null;
      if (hasAnnualState) {
        const overallStatus = rng.choice([
          'READY_FOR_REVIEW',
          'REQUIRES_ACTION',
          'BLOCKED',
          'NO_ACTIVITY',
        ] as const);
        const numReqs = rng.nextInt(0, 4);
        const requirements = [];
        for (let r = 0; r < numReqs; r++) {
          const mod = rng.choice([
            'HIGH_INCOME_MINIMUM_TAX',
            'READINESS_EVIDENCE',
            'ANNUAL_POSITIONS',
          ] as const);
          requirements.push({
            key: `${mod}::REQ::req-${r}`,
            module: mod,
            category: 'TEST_CAT',
            nativeType: 'TEST_NATIVE_TYPE',
            subjectReference: `subject-${r}`,
            status: rng.choice(['PENDING', 'SATISFIED', 'STALE'] as const),
            blockingReason: rng.bool(0.4) ? `Blocking reason ${r}` : null,
          });
        }

        annualState = {
          identity: {
            taxSubjectId,
            calendarYear,
            declarationExercise: calendarYear + 1,
            status: overallStatus,
            annualFingerprint: `annual-fp-${calendarYear}-${overallStatus}`,
            sourceFingerprint: `src-fp-${calendarYear}-${overallStatus}`,
            generatedAt: `${todayCivilDate}T00:00:00.000Z`,
            ruleVersions: {} as unknown as UnifiedAnnualIrpfState['identity']['ruleVersions'],
          },
          summary: {
            moduleCount: 5,
            readyCount: 3,
            actionRequiredCount: 1,
            blockedCount: 0,
            noActivityCount: 1,
            notApplicableCount: 0,
            unsupportedCount: 0,
            consistencyIssueCount: 0,
            blockingIssueCount: 0,
          },
          requirements,
          modules: [],
          consistencyIssues: [],
        } as unknown as UnifiedAnnualIrpfState;
      }

      // Generate random user actions
      const userActions: TaxComplianceUserActionRecord[] = [];
      const numActions = rng.nextInt(0, 5);
      for (let a = 0; a < numActions; a++) {
        const compMonth = rng.nextInt(1, 12).toString().padStart(2, '0');
        const obligationKey = `${taxSubjectId}:${calendarYear}-${compMonth}:MONTHLY_TAX_PAYMENT:monthly-6015`;
        const actionType = rng.choice(ACTION_TYPES);
        const matchFingerprint = rng.bool(0.6);
        const sourceFingerprint = matchFingerprint
          ? `fp-${calendarYear}-${compMonth}-OPEN-1000.00`
          : `stale-fp-${rng.nextInt(100, 999)}`;

        userActions.push({
          id: `act-${i}-${a}`,
          taxSubjectId,
          obligationKey,
          actionType,
          sourceFingerprint,
          note: rng.bool(0.5) ? 'Fuzz action note' : null,
          revision: rng.nextInt(1, 3),
          occurredAt: `${todayCivilDate}T12:00:00.000Z`,
        });
      }

      const timeline = projectTaxComplianceTimeline({
        taxSubjectId,
        calendarYear,
        todayCivilDate,
        monthlySources,
        annualState,
        userActions,
      });

      // Assert Invariants
      expect(timeline.taxSubjectId).toBe(taxSubjectId);
      expect(timeline.calendarYear).toBe(calendarYear);
      expect(Object.isFrozen(timeline)).toBe(true);
      expect(Object.isFrozen(timeline.obligations)).toBe(true);
      expect(Object.isFrozen(timeline.summary)).toBe(true);

      expect(timeline.summary.totalObligations).toBe(timeline.obligations.length);

      // Verify strict decimal strings or null (never undefined, NaN, float)
      for (const ob of timeline.obligations) {
        expect(ob.obligationKey).toBeDefined();
        expect(typeof ob.obligationKey).toBe('string');
        expect(ob.sourceFingerprint).toBeDefined();
        expect(typeof ob.sourceFingerprint).toBe('string');

        if (ob.amount !== null) {
          expect(typeof ob.amount).toBe('string');
          expect(/^\d+(\.\d{1,2})?$/.test(ob.amount)).toBe(true);
        }

        if (ob.dueDate !== null) {
          expect(typeof ob.dueDate).toBe('string');
          expect(/^\d{4}-\d{2}-\d{2}$/.test(ob.dueDate)).toBe(true);
        }

        // Verify overdue invariant
        if (ob.isOverdue) {
          expect(ob.dueDate).not.toBeNull();
          expect(todayCivilDate > ob.dueDate!).toBe(true);
          expect(ob.status).not.toBe('COMPLETED');
          expect(ob.status).not.toBe('DISMISSED');
        }
      }

      // Verify sorting invariant
      for (let s = 1; s < timeline.obligations.length; s++) {
        const prev = timeline.obligations[s - 1]!;
        const curr = timeline.obligations[s]!;
        const prevDate = prev.dueDate ?? `${calendarYear}-12-31`;
        const currDate = curr.dueDate ?? `${calendarYear}-12-31`;

        if (prevDate === currDate) {
          // If due dates match, prev weight must be >= curr weight (or equal with obKey order)
          // valid
        } else {
          expect(prevDate.localeCompare(currDate)).toBeLessThanOrEqual(0);
        }
      }
    }
  }, 60_000);
});
