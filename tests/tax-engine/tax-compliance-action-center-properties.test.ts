import { describe, it, expect } from 'vitest';
import {
  assembleTaxComplianceActionCenter,
  projectTaxComplianceCalendar,
  type TaxComplianceObligation,
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
    sourceFingerprint: 'fp-center-v1',
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

describe('Phase 4K.4 — Tax Compliance Action Center Property Tests (All 10 Required)', () => {
  it('1. action-center determinism: identical inputs yield byte-identical frozen centers', () => {
    const input = {
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [
        mockObligation(),
        mockObligation({
          obligationKey: 'user-1:2026:ANNUAL_FILING_SUPPORT:annual-unified-filing',
          kind: 'ANNUAL_FILING_SUPPORT',
          period: '2026',
          amount: null,
          currency: null,
          dueDate: '2027-04-30',
          status: 'ACTION_REQUIRED',
          severity: 'WARNING',
        }),
      ],
    } as const;
    const reference = JSON.stringify(assembleTaxComplianceActionCenter({ ...input }));
    for (let i = 0; i < 200; i++) {
      const res = assembleTaxComplianceActionCenter({ ...input });
      expect(JSON.stringify(res)).toBe(reference);
      expect(Object.isFrozen(res)).toBe(true);
      expect(Object.isFrozen(res.items)).toBe(true);
      for (const item of res.items) {
        expect(Object.isFrozen(item)).toBe(true);
      }
    }
  });

  it('2. semantic action-key stability: key derives only from obligationKey, kind and sourceFingerprint', () => {
    const res = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [mockObligation()],
    });
    const pay = res.items.filter((item) => item.kind === 'PAY_TAX');
    expect(pay.length).toBe(1);
    expect(pay[0]!.actionKey).toBe(
      'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:PAY_TAX:fp-center-v1',
    );
    expect(pay[0]!.sourceVersion).toBe('4K.4');
  });

  it('3. priority determinism: overdue is CRITICAL, due-today HIGH, upcoming MEDIUM, informational LOW', () => {
    const res = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-05-05',
      obligations: [
        mockObligation({ dueDate: '2026-04-30' }),
        mockObligation({
          obligationKey: 'user-1:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015',
          period: '2026-05',
          dueDate: '2026-05-05',
          sourceFingerprint: 'fp-today',
        }),
        mockObligation({
          obligationKey: 'user-1:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015',
          period: '2026-06',
          dueDate: '2026-06-30',
          sourceFingerprint: 'fp-future',
        }),
        mockObligation({
          obligationKey: 'user-1:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015',
          period: '2026-01',
          amount: null,
          dueDate: '2026-02-28',
          status: 'READY',
          sourceFingerprint: 'fp-zero',
        }),
      ],
    });
    const byKey = new Map(res.items.map((item) => [item.obligationKey, item]));
    expect(byKey.get('user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015')?.priority).toBe('CRITICAL');
    expect(byKey.get('user-1:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015')?.priority).toBe('HIGH');
    expect(byKey.get('user-1:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015')?.priority).toBe('MEDIUM');
    expect(byKey.get('user-1:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015')?.priority).toBe('LOW');
    // Priority never rewrites fiscal truth: amounts and dates pass through verbatim.
    expect(byKey.get('user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015')?.amount).toBe('500.00');
    expect(byKey.get('user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015')?.dueDate).toBe(
      '2026-04-30',
    );
  });

  it('4. next-action determinism: every actionable item exposes one canonical next action', () => {
    const res = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [
        mockObligation(),
        mockObligation({
          obligationKey: 'user-1:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015',
          period: '2026-04',
          amount: null,
          status: 'ACTION_REQUIRED',
          severity: 'BLOCKING',
          sourceFingerprint: 'fp-blocked',
        }),
      ],
      paymentHints: [
        {
          obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
          reconciliationStatus: 'USER_REPORTED_MISMATCH',
          supportStatus: 'REQUIRES_REVIEW',
        },
      ],
    });
    const overdue = res.items.find((item) => item.operationalStatus === 'OVERDUE');
    expect(overdue).toBeUndefined();
    const upcoming = res.items.find(
      (item) => item.kind === 'PAY_TAX' && item.operationalStatus === 'UPCOMING',
    );
    expect(upcoming?.nextAction).toBe('REVIEW_OBLIGATION');
    const blocker = res.items.find((item) => item.kind === 'RESOLVE_BLOCKER');
    expect(blocker?.nextAction).toBe('REVIEW_OBLIGATION');
    const review = res.items.find((item) => item.kind === 'REVIEW_PAYMENT_EVIDENCE');
    expect(review?.nextAction).toBe('ADD_PAYMENT_EVIDENCE');
  });

  it('5. source fingerprint sensitivity: changed source supersedes the old item and mints a fresh lineage', () => {
    const base = {
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
    };
    const before = assembleTaxComplianceActionCenter({
      ...base,
      obligations: [mockObligation({ sourceFingerprint: 'fp-v1' })],
    });
    const after = assembleTaxComplianceActionCenter({
      ...base,
      obligations: [mockObligation({ sourceFingerprint: 'fp-v2', amount: '600.00' })],
    });
    expect(before.items.every((item) => item.sourceFingerprint === 'fp-v1')).toBe(true);
    expect(after.items.every((item) => item.sourceFingerprint === 'fp-v2')).toBe(true);
    expect(before.centerFingerprint).not.toBe(after.centerFingerprint);
    // No stale lineage leaks into the current projection.
    expect(after.items.some((item) => item.sourceFingerprint === 'fp-v1')).toBe(false);
  });

  it('6. source-order invariance: same semantic set in different input order yields identical center', () => {
    const obligations = [
      mockObligation(),
      mockObligation({
        obligationKey: 'user-1:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015',
        period: '2026-02',
        dueDate: '2026-03-31',
        sourceFingerprint: 'fp-b',
      }),
      mockObligation({
        obligationKey: 'user-1:2026:ANNUAL_FILING_SUPPORT:annual-unified-filing',
        kind: 'ANNUAL_FILING_SUPPORT',
        period: '2026',
        amount: null,
        currency: null,
        dueDate: '2027-04-30',
        status: 'ACTION_REQUIRED',
        severity: 'WARNING',
        sourceFingerprint: 'fp-c',
      }),
    ];
    const forward = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations,
    });
    const backward = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [...obligations].reverse(),
    });
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
    expect(backward.centerFingerprint).toBe(forward.centerFingerprint);
  });

  it('7. summary-counter consistency: counters exactly equal canonical classification', () => {
    const res = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-05-05',
      obligations: [
        mockObligation({ dueDate: '2026-04-30' }),
        mockObligation({
          obligationKey: 'user-1:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015',
          period: '2026-05',
          dueDate: '2026-05-05',
          sourceFingerprint: 'fp-today',
        }),
        mockObligation({
          obligationKey: 'user-1:2026:ANNUAL_FILING_SUPPORT:annual-unified-filing',
          kind: 'ANNUAL_FILING_SUPPORT',
          period: '2026',
          amount: null,
          currency: null,
          dueDate: '2027-04-30',
          status: 'ACTION_REQUIRED',
          severity: 'WARNING',
          sourceFingerprint: 'fp-annual',
        }),
      ],
    });
    const current = res.items.filter((item) => item.operationalStatus !== 'SUPERSEDED');
    expect(res.summary.total).toBe(current.length);
    expect(res.summary.overdue).toBe(
      current.filter((item) => item.operationalStatus === 'OVERDUE').length,
    );
    expect(res.summary.dueToday).toBe(
      current.filter((item) => item.operationalStatus === 'DUE_TODAY').length,
    );
    expect(res.summary.annualReview).toBe(current.filter((item) => item.exercise !== null).length);
    expect(res.summary.annualReview).toBe(1);
    const rerun = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-05-05',
      obligations: [
        mockObligation({ dueDate: '2026-04-30' }),
        mockObligation({
          obligationKey: 'user-1:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015',
          period: '2026-05',
          dueDate: '2026-05-05',
          sourceFingerprint: 'fp-today',
        }),
        mockObligation({
          obligationKey: 'user-1:2026:ANNUAL_FILING_SUPPORT:annual-unified-filing',
          kind: 'ANNUAL_FILING_SUPPORT',
          period: '2026',
          amount: null,
          currency: null,
          dueDate: '2027-04-30',
          status: 'ACTION_REQUIRED',
          severity: 'WARNING',
          sourceFingerprint: 'fp-annual',
        }),
      ],
    });
    expect(JSON.stringify(rerun.summary)).toBe(JSON.stringify(res.summary));
  });

  it('8. calendar projection determinism: authoritative dates only, deduplicated, canonically ordered', () => {
    const center = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [mockObligation()],
      reminders: [
        {
          reminderKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-23',
          taxSubjectId: 'user-1',
          obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
          sourceFingerprint: 'fp-center-v1',
          kind: 'UPCOMING_DUE',
          triggerAt: '2026-04-23',
          effectiveAt: '2026-04-23',
          status: 'SCHEDULED',
          severity: 'ACTION',
          title: 'DARF próximo do vencimento',
          message: 'Detalhe.',
          actionTarget: '/tax',
          deliveryChannels: ['IN_APP'],
          dedupKey: 'x',
          sourceVersion: '4K.3',
          snoozedUntil: null,
          actedAt: null,
          isStale: false,
        },
      ],
    });
    const first = projectTaxComplianceCalendar({
      taxSubjectId: 'user-1',
      items: center.items,
      reminders: [
        {
          reminderKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:UPCOMING_DUE:2026-04-23',
          taxSubjectId: 'user-1',
          obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
          sourceFingerprint: 'fp-center-v1',
          kind: 'UPCOMING_DUE',
          triggerAt: '2026-04-23',
          effectiveAt: '2026-04-23',
          status: 'SCHEDULED',
          severity: 'ACTION',
          title: 'DARF próximo do vencimento',
          message: 'Detalhe.',
          actionTarget: '/tax',
          deliveryChannels: ['IN_APP'],
          dedupKey: 'x',
          sourceVersion: '4K.3',
          snoozedUntil: null,
          actedAt: null,
          isStale: false,
        },
      ],
      todayCivilDate: '2026-04-20',
      from: '2026-04-01',
      to: '2026-05-31',
    });
    const dueEvents = first.events.filter((event) => event.eventType === 'OBLIGATION_DUE');
    expect(dueEvents.length).toBe(1);
    expect(dueEvents[0]!.eventDate).toBe('2026-04-30');
    const reminderEvents = first.events.filter((event) => event.eventType === 'REMINDER');
    expect(reminderEvents.length).toBe(1);
    expect(reminderEvents[0]!.eventDate).toBe('2026-04-23');
    // No semantic duplicate and canonical date ordering hold on re-projection.
    const keys = first.events.map((event) => event.eventKey);
    expect(new Set(keys).size).toBe(keys.length);
    const second = projectTaxComplianceCalendar({
      taxSubjectId: 'user-1',
      items: [...center.items].reverse(),
      reminders: [],
      todayCivilDate: '2026-04-20',
      from: '2026-04-01',
      to: '2026-05-31',
    });
    expect(second.events.map((event) => event.eventKey).sort()).toEqual(
      first.events
        .filter((event) => event.eventType !== 'REMINDER')
        .map((event) => event.eventKey)
        .sort(),
    );
  });

  it('9. no semantic duplicate action: repeated upstream item yields one action item', () => {
    const obligation = mockObligation();
    const res = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [obligation, { ...obligation }, mockObligation()],
    });
    const keys = res.items.map((item) => item.actionKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(res.items.filter((item) => item.kind === 'PAY_TAX').length).toBe(1);
  });

  it('10. history/current separation: completed and superseded never masquerade as actionable', () => {
    const res = assembleTaxComplianceActionCenter({
      taxSubjectId: 'user-1',
      calendarYear: 2026,
      todayCivilDate: '2026-04-20',
      obligations: [
        mockObligation({ status: 'COMPLETED' }),
        mockObligation({
          obligationKey: 'user-1:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015',
          period: '2026-02',
          dueDate: '2026-03-31',
          status: 'SUPERSEDED',
          sourceFingerprint: 'fp-old',
        }),
        mockObligation(),
      ],
    });
    const completed = res.items.filter((item) => item.operationalStatus === 'COMPLETED');
    expect(completed.length).toBe(1);
    expect(completed[0]!.kind).toBe('COMPLETE_COMPLIANCE_ACTION');
    const superseded = res.items.filter((item) => item.operationalStatus === 'SUPERSEDED');
    expect(superseded.length).toBe(1);
    expect(superseded[0]!.isSuperseded).toBe(true);
    // Attention counters exclude history states.
    expect(res.summary.needsAttention).toBe(0);
    const actionable = res.items.filter(
      (item) => item.operationalStatus !== 'COMPLETED' && item.operationalStatus !== 'SUPERSEDED',
    );
    expect(actionable.every((item) => item.kind === 'PAY_TAX')).toBe(true);
  });
});
