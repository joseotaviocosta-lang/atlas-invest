import { describe, it, expect } from 'vitest';
import {
  assessPeriodCloseReadiness,
  assembleEvidenceBinder,
  computePeriodSourceFingerprint,
  serializeBinderCsv,
  serializeBinderJson,
  binderFileStem,
  type AssessPeriodCloseReadinessInput,
  type TaxComplianceObligation,
  type TaxComplianceActionItem,
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
    sourceFingerprint: 'fp-ob-v1',
    status: 'OPEN',
    severity: 'ACTION',
    actionType: 'PAY',
    amount: '500.00',
    currency: 'BRL',
    dueDate: '2026-04-30',
    title: 'Pagamento de DARF 6015 — Competência 2026-03',
    description: 'DARF código 6015 referente às operações de 2026-03.',
    links: [],
    metadata: { revenueCode: '6015', competence: '2026-03', darfReadiness: 'READY' },
    userAction: null,
    isOverdue: false,
    ...overrides,
  };
}

function mockItem(overrides: Partial<TaxComplianceActionItem> = {}): TaxComplianceActionItem {
  return {
    actionKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:PAY_TAX:fp-ob-v1',
    taxSubjectId: 'user-1',
    obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
    sourceFingerprint: 'fp-ob-v1',
    kind: 'PAY_TAX',
    period: '2026-03',
    calendarYear: 2026,
    exercise: null,
    dueDate: '2026-04-30',
    priority: 'MEDIUM',
    operationalStatus: 'UPCOMING',
    title: 'DARF próximo do vencimento — competência 2026-03',
    summary: 'Revise os dados no Atlas antes de pagar pelos canais oficiais.',
    nextAction: 'REVIEW_OBLIGATION',
    actionTarget: '/tax',
    amount: '500.00',
    currency: 'BRL',
    revenueCode: '6015',
    paymentSupportStatus: 'READY',
    paymentEvidenceStatus: 'NO_EVIDENCE',
    reminderStatus: 'SCHEDULED',
    annualReviewStatus: null,
    isStale: false,
    isSuperseded: false,
    blockingReasons: [],
    sourceVersion: '4K.4',
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<AssessPeriodCloseReadinessInput> = {},
): AssessPeriodCloseReadinessInput {
  return {
    taxSubjectId: 'user-1',
    scope: 'MONTHLY',
    period: '2026-03',
    calendarYear: 2026,
    month: '2026-03',
    exercise: null,
    todayCivilDate: '2026-04-20',
    obligations: [mockObligation()],
    actionItems: [mockItem()],
    paymentHints: [],
    reminders: [],
    evidence: [],
    centerFingerprint: 'center-fp-v1',
    latestClose: null,
    ...overrides,
  };
}

describe('Phase 4K.5 — Period Close Property Tests (All 12 Required)', () => {
  it('1. readiness determinism: identical inputs yield byte-identical frozen assessments', () => {
    const input = baseInput();
    const reference = JSON.stringify(assessPeriodCloseReadiness(input));
    for (let i = 0; i < 200; i++) {
      const res = assessPeriodCloseReadiness(baseInput());
      expect(JSON.stringify(res)).toBe(reference);
      expect(Object.isFrozen(res)).toBe(true);
      expect(Object.isFrozen(res.checklist)).toBe(true);
      expect(Object.isFrozen(res.unresolvedItems)).toBe(true);
    }
  });

  it('2. readiness precedence: BLOCKED > STALE > REQUIRES_REVIEW > PARTIAL > READY > NO_ACTIVITY', () => {
    // BLOCKED beats STALE.
    const blockedStale = assessPeriodCloseReadiness(
      baseInput({
        obligations: [
          mockObligation({
            status: 'ACTION_REQUIRED',
            severity: 'BLOCKING',
            metadata: { darfReadiness: 'BLOCKED' },
          }),
        ],
        actionItems: [],
        latestClose: {
          revision: 1,
          recordStatus: 'CLOSED',
          sourceFingerprint: 'fp-other',
          binderFingerprint: 'binder-old',
          closedAt: '2026-04-19T00:00:00.000Z',
        },
      }),
    );
    expect(blockedStale.readiness).toBe('BLOCKED');
    expect(blockedStale.isStaleVsPreviousClose).toBe(true);

    // STALE beats REQUIRES_REVIEW (upcoming payable present).
    const staleReview = assessPeriodCloseReadiness(
      baseInput({
        latestClose: {
          revision: 1,
          recordStatus: 'CLOSED',
          sourceFingerprint: 'fp-other',
          binderFingerprint: 'binder-old',
          closedAt: '2026-04-19T00:00:00.000Z',
        },
      }),
    );
    expect(staleReview.readiness).toBe('STALE');

    // REQUIRES_REVIEW beats PARTIAL.
    const reviewPartial = assessPeriodCloseReadiness(
      baseInput({
        obligations: [mockObligation({ metadata: { darfReadiness: 'PARTIAL' } })],
      }),
    );
    // Upcoming PAY_TAX item forces REQUIRES_REVIEW over PARTIAL.
    expect(reviewPartial.readiness).toBe('REQUIRES_REVIEW');

    // PARTIAL alone surfaces.
    const partialOnly = assessPeriodCloseReadiness(
      baseInput({
        obligations: [mockObligation({ metadata: { darfReadiness: 'PARTIAL' }, amount: null })],
        actionItems: [],
      }),
    );
    expect(partialOnly.readiness).toBe('PARTIAL');

    // READY when nothing unresolved.
    const ready = assessPeriodCloseReadiness(
      baseInput({
        obligations: [mockObligation({ status: 'COMPLETED', amount: null })],
        actionItems: [
          mockItem({
            kind: 'COMPLETE_COMPLIANCE_ACTION',
            operationalStatus: 'COMPLETED',
            priority: 'LOW',
            nextAction: 'VIEW_DETAILS',
            amount: null,
            currency: null,
          }),
        ],
      }),
    );
    expect(ready.readiness).toBe('READY_TO_CLOSE');
    expect(ready.cleanCloseAllowed).toBe(true);

    // NO_ACTIVITY when empty.
    const empty = assessPeriodCloseReadiness(baseInput({ obligations: [], actionItems: [] }));
    expect(empty.readiness).toBe('NO_ACTIVITY');
    expect(empty.cleanCloseAllowed).toBe(true);
    expect(empty.checklist.every((item) => item.state === 'NOT_APPLICABLE')).toBe(true);
  });

  it('3. checklist determinism: same snapshot yields identical categories and states', () => {
    const first = assessPeriodCloseReadiness(baseInput());
    const second = assessPeriodCloseReadiness(baseInput());
    expect(JSON.stringify(first.checklist)).toBe(JSON.stringify(second.checklist));
    expect(first.checklist.map((item) => item.category)).toEqual([
      'OBLIGATIONS_REVIEWED',
      'ACTION_ITEMS_RESOLVED',
      'PAYMENT_SUPPORT_REVIEWED',
      'PAYMENT_EVIDENCE_RECONCILED',
      'STALE_ITEMS_REVIEWED',
      'ANNUAL_CONFIRMATIONS_RESOLVED',
      'BLOCKERS_CLEARED',
    ]);
    // Monthly scope never carries annual confirmations.
    expect(
      first.checklist.find((item) => item.category === 'ANNUAL_CONFIRMATIONS_RESOLVED')?.state,
    ).toBe('NOT_APPLICABLE');
  });

  it('4. close fingerprint determinism: same semantics, same source fingerprint', () => {
    const first = assessPeriodCloseReadiness(baseInput());
    const second = assessPeriodCloseReadiness(baseInput());
    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(first.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('5. source-order invariance: shuffled inputs yield identical fingerprint and readiness', () => {
    const obligations = [
      mockObligation(),
      mockObligation({
        obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-0600',
        sourceRef: 'monthly-0600',
        sourceFingerprint: 'fp-ob-v2',
        metadata: { revenueCode: '0600', darfReadiness: 'READY' },
      }),
    ];
    const forward = assessPeriodCloseReadiness(baseInput({ obligations }));
    const backward = assessPeriodCloseReadiness(
      baseInput({ obligations: [...obligations].reverse() }),
    );
    expect(backward.sourceFingerprint).toBe(forward.sourceFingerprint);
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });

  it('6. source-fingerprint sensitivity: material change mints a new lineage', () => {
    const before = assessPeriodCloseReadiness(baseInput());
    const after = assessPeriodCloseReadiness(
      baseInput({
        obligations: [mockObligation({ amount: '600.00', sourceFingerprint: 'fp-ob-v2' })],
      }),
    );
    expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint);
    // Reminder-only change does NOT alter the lineage (ACK never resolves).
    const ackOnly = assessPeriodCloseReadiness(
      baseInput({
        actionItems: [mockItem({ reminderStatus: 'ACKNOWLEDGED' })],
      }),
    );
    expect(ackOnly.sourceFingerprint).toBe(before.sourceFingerprint);
  });

  it('7. binder fingerprint determinism: same snapshot, same binder hash; generation time excluded', () => {
    const readiness = assessPeriodCloseReadiness(baseInput());
    const binderInput = {
      readiness,
      obligations: [mockObligation()],
      actionItems: [mockItem()],
      paymentHints: [],
      reminders: [],
      evidence: [],
      actionCenterSummary: { upcoming: 1, total: 1 },
      centerFingerprint: 'center-fp-v1',
      todayCivilDate: '2026-04-20',
    };
    const first = assembleEvidenceBinder(binderInput);
    const second = assembleEvidenceBinder({
      ...binderInput,
      obligations: [...binderInput.obligations].reverse(),
      actionItems: [...binderInput.actionItems].reverse(),
    });
    expect(second.binderFingerprint).toBe(first.binderFingerprint);
    expect(first.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);
    // Sections cover the mandatory content surface.
    const codes = first.sections.map((section) => section.code);
    for (const required of [
      'PERIOD_IDENTITY',
      'CLOSE_READINESS',
      'OBLIGATIONS',
      'ACTION_CENTER',
      'PAYMENT_SUPPORT',
      'PAYMENT_EVIDENCE',
      'REMINDERS_WORKFLOW',
      'UNRESOLVED_ITEMS',
      'SOURCES_METADATA',
      'DISCLAIMERS',
    ]) {
      expect(codes).toContain(required);
    }
    // Serializations are deterministic and carry the disclaimer.
    expect(serializeBinderJson(first)).toBe(serializeBinderJson(second));
    expect(serializeBinderCsv(first)).toBe(serializeBinderCsv(second));
    expect(serializeBinderJson(first)).toContain('Receita Federal');
    expect(serializeBinderCsv(first)).toContain('Receita Federal');
    expect(binderFileStem('MONTHLY', '2026-03')).toBe('atlas-fechamento-mensal-2026-03-apoio');
    expect(binderFileStem('ANNUAL', '2026')).toBe('atlas-fechamento-anual-2026-apoio');
  });

  it('8. semantic close idempotency: identical snapshot maps to one close identity', () => {
    const readiness = assessPeriodCloseReadiness(baseInput());
    const identity = `${readiness.taxSubjectId}|${readiness.scope}|${readiness.period}|${readiness.sourceFingerprint}`;
    const rerun = assessPeriodCloseReadiness(baseInput());
    const rerunIdentity = `${rerun.taxSubjectId}|${rerun.scope}|${rerun.period}|${rerun.sourceFingerprint}`;
    expect(rerunIdentity).toBe(identity);
  });

  it('9. history preservation: previous close is referenced, never rewritten', () => {
    const previous = {
      revision: 2,
      recordStatus: 'CLOSED' as const,
      sourceFingerprint: 'fp-old-lineage',
      binderFingerprint: 'binder-old-lineage',
      closedAt: '2026-04-18T00:00:00.000Z',
    };
    const res = assessPeriodCloseReadiness(baseInput({ latestClose: previous }));
    expect(res.previousClose).toEqual(previous);
    expect(res.isStaleVsPreviousClose).toBe(true);
    expect(res.readiness).toBe('STALE');
    // Reopened history does not stale the current assessment.
    const reopened = assessPeriodCloseReadiness(
      baseInput({
        latestClose: { ...previous, recordStatus: 'REOPENED' as const },
        obligations: [mockObligation({ status: 'COMPLETED', amount: null })],
        actionItems: [],
      }),
    );
    expect(reopened.isStaleVsPreviousClose).toBe(false);
    expect(reopened.previousClose?.recordStatus).toBe('REOPENED');
  });

  it('10. stale-close determinism: A→B always settles to STALE with B lineage', () => {
    const closeA = {
      revision: 1,
      recordStatus: 'CLOSED' as const,
      sourceFingerprint: computePeriodSourceFingerprint({
        scope: 'MONTHLY',
        period: '2026-03',
        obligations: [mockObligation({ sourceFingerprint: 'fp-a' })],
        actionItems: [],
        paymentHints: [],
      }),
      binderFingerprint: 'binder-a',
      closedAt: '2026-04-18T00:00:00.000Z',
    };
    const current = assessPeriodCloseReadiness(
      baseInput({
        obligations: [mockObligation({ sourceFingerprint: 'fp-b', amount: '600.00' })],
        actionItems: [],
        latestClose: closeA,
      }),
    );
    expect(current.isStaleVsPreviousClose).toBe(true);
    expect(current.sourceFingerprint).not.toBe(closeA.sourceFingerprint);
    // Same-source re-read is never stale.
    const sameSource = assessPeriodCloseReadiness(
      baseInput({
        obligations: [mockObligation({ sourceFingerprint: 'fp-a' })],
        actionItems: [],
        latestClose: closeA,
      }),
    );
    expect(sameSource.isStaleVsPreviousClose).toBe(false);
  });

  it('11. calendar-year/exercise distinction: annual items never leak across scopes', () => {
    const annualItem = mockItem({
      actionKey: 'user-1:2026:ANNUAL_FILING_SUPPORT:annual:fp-annual',
      obligationKey: 'user-1:2026:ANNUAL_FILING_SUPPORT:annual-unified-filing',
      kind: 'REVIEW_ANNUAL_FILING',
      period: '2026',
      exercise: 2027,
      dueDate: '2027-04-30',
      operationalStatus: 'ACTION_REQUIRED',
      priority: 'HIGH',
      nextAction: 'OPEN_ANNUAL_REVIEW',
      amount: null,
      currency: null,
    });
    const monthly = assessPeriodCloseReadiness(
      baseInput({
        obligations: [mockObligation()],
        actionItems: [mockItem(), annualItem],
      }),
    );
    // Monthly scope ignores the annual-review item entirely.
    expect(monthly.unresolvedItems.some((item) => item.ref === annualItem.actionKey)).toBe(false);

    const annualObligation = mockObligation({
      obligationKey: 'user-1:2026:ANNUAL_FILING_SUPPORT:annual-unified-filing',
      kind: 'ANNUAL_FILING_SUPPORT',
      period: '2026',
      amount: null,
      currency: null,
      dueDate: '2027-04-30',
      status: 'ACTION_REQUIRED',
      severity: 'WARNING',
      sourceFingerprint: 'fp-annual',
    });
    const annual = assessPeriodCloseReadiness({
      taxSubjectId: 'user-1',
      scope: 'ANNUAL',
      period: '2026',
      calendarYear: 2026,
      month: null,
      exercise: 2027,
      todayCivilDate: '2026-04-20',
      obligations: [annualObligation],
      actionItems: [annualItem],
      paymentHints: [],
      reminders: [],
      evidence: [],
      centerFingerprint: null,
      latestClose: null,
    });
    expect(annual.unresolvedItems.some((item) => item.ref === annualItem.actionKey)).toBe(true);
    expect(annual.readiness).toBe('REQUIRES_REVIEW');
    // Annual checklist carries confirmations; monthly does not.
    expect(
      annual.checklist.find((item) => item.category === 'ANNUAL_CONFIRMATIONS_RESOLVED')?.state,
    ).toBe('INCOMPLETE');
  });

  it('12. unresolved-item preservation: every blocker/review/partial is enumerated', () => {
    const res = assessPeriodCloseReadiness(
      baseInput({
        obligations: [
          mockObligation({
            status: 'ACTION_REQUIRED',
            severity: 'BLOCKING',
            metadata: { darfReadiness: 'BLOCKED' },
          }),
          mockObligation({
            obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-0600',
            sourceRef: 'monthly-0600',
            sourceFingerprint: 'fp-partial',
            metadata: { revenueCode: '0600', darfReadiness: 'PARTIAL' },
            amount: null,
          }),
        ],
        actionItems: [
          mockItem(),
          mockItem({
            actionKey:
              'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015:REVIEW_PAYMENT_EVIDENCE:fp-ob-v1',
            kind: 'REVIEW_PAYMENT_EVIDENCE',
            operationalStatus: 'REQUIRES_REVIEW',
            priority: 'HIGH',
            nextAction: 'ADD_PAYMENT_EVIDENCE',
          }),
        ],
        paymentHints: [
          {
            obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
            reconciliationStatus: 'USER_REPORTED_MISMATCH',
            supportStatus: 'REQUIRES_REVIEW',
          },
        ],
      }),
    );
    expect(res.readiness).toBe('BLOCKED');
    const kinds = res.unresolvedItems.map((item) => item.kind);
    expect(kinds).toContain('BLOCKER');
    expect(kinds).toContain('PARTIAL_DATA');
    expect(kinds).toContain('REVIEW_PAYMENT_EVIDENCE');
    expect(kinds).toContain('EVIDENCE_MISMATCH');
    // Binder carries every unresolved item verbatim.
    const binder = assembleEvidenceBinder({
      readiness: res,
      obligations: res.previousClose ? [] : [mockObligation()],
      actionItems: [mockItem()],
      paymentHints: [],
      reminders: [],
      evidence: [],
      actionCenterSummary: null,
      centerFingerprint: null,
      todayCivilDate: '2026-04-20',
    });
    const unresolvedSection = binder.sections.find(
      (section) => section.code === 'UNRESOLVED_ITEMS',
    );
    expect(unresolvedSection?.lines.length).toBe(res.unresolvedItems.length);
  });
});
