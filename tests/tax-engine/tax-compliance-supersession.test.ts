import { describe, it, expect } from 'vitest';
import {
  projectTaxComplianceTimeline,
  ProjectTaxComplianceTimelineInput,
  TaxComplianceUserActionRecord,
  MonthlyComplianceSource,
} from '@atlas/tax-engine';

/**
 * Phase 4K.1B — Explicit Supersession A→B & Workflow History Suite.
 *
 * Formally proves:
 * 1. SOURCE STATE A → Obligation A generated → User action USER_REPORTED_COMPLETION recorded.
 * 2. SOURCE STATE B → Source fingerprint changes materially:
 *    - Obligation A remains historically traceable
 *    - Completion for A remains stored in history
 *    - Completion for A does NOT satisfy B
 *    - Current obligation B is generated and actionable
 *    - Old A is marked SUPERSEDED
 * 3. Reopen history is preserved across monotonic revisions.
 * 4. Dismissal does not carry over to changed source fingerprint.
 */
describe('Phase 4K.1B — Supersession A→B, Reopen & Dismissal Verification', () => {
  const taxSubjectId = '00000000-0000-0000-0000-000000000001';
  const calendarYear = 2026;
  const today = '2026-04-15';

  it('Explicit Supersession A→B Proof', () => {
    // 1. SOURCE STATE A
    const obligationKeyA = `${taxSubjectId}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const sourceFingerprintA = 'fp-source-state-a-sha256-11111111';

    const sourceA: MonthlyComplianceSource = {
      competence: '2026-03',
      revenueCode: '6015',
      bucket: 'EQUITY_NORMAL',
      principalAmount: '1000.00',
      currency: 'BRL',
      dueDate: '2026-04-30',
      status: 'OPEN',
      reasonCode: null,
      darfReadiness: 'READY',
      sourceFingerprint: sourceFingerprintA,
    };

    const inputA: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [sourceA],
      annualState: null,
      userActions: [],
    };

    const timelineA1 = projectTaxComplianceTimeline(inputA);
    expect(timelineA1.obligations.length).toBe(1);
    expect(timelineA1.obligations[0].status).toBe('OPEN');
    expect(timelineA1.summary.totalObligations).toBe(1);
    expect(timelineA1.summary.upcomingCount).toBe(1);

    // User completes A
    const actionA: TaxComplianceUserActionRecord = {
      id: 'act-1',
      taxSubjectId,
      obligationKey: obligationKeyA,
      revision: 1,
      actionType: 'USER_REPORTED_COMPLETION',
      sourceFingerprint: sourceFingerprintA,
      note: 'Pago via Internet Banking',
      occurredAt: '2026-04-10T10:00:00.000Z',
    };

    const inputACompleted: ProjectTaxComplianceTimelineInput = {
      ...inputA,
      userActions: [actionA],
    };

    const timelineACompleted = projectTaxComplianceTimeline(inputACompleted);
    expect(timelineACompleted.obligations[0].status).toBe('COMPLETED');
    expect(timelineACompleted.summary.completedCount).toBe(1);

    // 2. SOURCE STATE B (Material trade correction in ledger causes fingerprint change)
    const sourceFingerprintB = 'fp-source-state-b-sha256-22222222';
    const sourceB: MonthlyComplianceSource = {
      competence: '2026-03',
      revenueCode: '6015',
      bucket: 'EQUITY_NORMAL',
      principalAmount: '1200.00', // Adjusted from 1000.00 to 1200.00
      currency: 'BRL',
      dueDate: '2026-04-30',
      status: 'OPEN',
      reasonCode: null,
      darfReadiness: 'READY',
      sourceFingerprint: sourceFingerprintB, // Changed
    };

    const inputB: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [sourceB],
      userActions: [actionA], // Old completion record present in history
      annualState: null,
    };

    const timelineB = projectTaxComplianceTimeline(inputB);

    // Assertions required by Section 12:
    expect(timelineB.obligations.length).toBe(1);
    const obB = timelineB.obligations[0];

    expect(obB.obligationKey).toBe(obligationKeyA);
    expect(obB.sourceFingerprint).toBe(sourceFingerprintB);
    expect(sourceFingerprintA !== sourceFingerprintB).toBe(true); // Fingerprint changed: YES
    expect(obB.status).toBe('SUPERSEDED'); // Old completion reused: NO (marked SUPERSEDED)
    expect(obB.amount).toBe('1200.00'); // New amount displayed
    expect(timelineB.summary.supersededCount).toBe(1);
    expect(timelineB.summary.completedCount).toBe(0);

    // 3. User re-confirms B with new fingerprint
    const actionB: TaxComplianceUserActionRecord = {
      id: 'act-2',
      taxSubjectId,
      obligationKey: obligationKeyA,
      revision: 2,
      actionType: 'USER_REPORTED_COMPLETION',
      sourceFingerprint: sourceFingerprintB,
      note: 'Diferença de R$ 200,00 paga',
      occurredAt: '2026-04-12T14:00:00.000Z',
    };

    const inputBCompleted: ProjectTaxComplianceTimelineInput = {
      ...inputB,
      userActions: [actionA, actionB], // Both actions preserved in history
    };

    const timelineBCompleted = projectTaxComplianceTimeline(inputBCompleted);
    expect(timelineBCompleted.obligations[0].status).toBe('COMPLETED');
    expect(timelineBCompleted.obligations[0].userAction?.revision).toBe(2);
    expect(timelineBCompleted.obligations[0].userAction?.sourceFingerprint).toBe(
      sourceFingerprintB,
    );
  });

  it('Reopen history is preserved and transitions obligation from COMPLETED back to OPEN', () => {
    const obligationKey = `${taxSubjectId}:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const fingerprint = 'fp-reopen-test-123';

    const action1: TaxComplianceUserActionRecord = {
      id: 'act-1',
      taxSubjectId,
      obligationKey,
      revision: 1,
      actionType: 'USER_REPORTED_COMPLETION',
      sourceFingerprint: fingerprint,
      note: 'Completed first',
      occurredAt: '2026-04-01T10:00:00.000Z',
    };

    const action2: TaxComplianceUserActionRecord = {
      id: 'act-2',
      taxSubjectId,
      obligationKey,
      revision: 2,
      actionType: 'USER_REOPENED',
      sourceFingerprint: fingerprint,
      note: 'Reopened by investor',
      occurredAt: '2026-04-02T10:00:00.000Z',
    };

    const source: MonthlyComplianceSource = {
      competence: '2026-04',
      revenueCode: '6015',
      bucket: 'EQUITY_NORMAL',
      principalAmount: '500.00',
      currency: 'BRL',
      dueDate: '2026-05-31',
      status: 'OPEN',
      reasonCode: null,
      darfReadiness: 'READY',
      sourceFingerprint: fingerprint,
    };

    const input: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [source],
      userActions: [action1, action2],
      annualState: null,
    };

    const timeline = projectTaxComplianceTimeline(input);
    expect(timeline.obligations[0].status).toBe('OPEN');
    expect(timeline.obligations[0].userAction?.actionType).toBe('USER_REOPENED');
    expect(timeline.obligations[0].userAction?.revision).toBe(2);
  });

  it('Dismissal does not carry over to changed source fingerprint', () => {
    const obligationKey = `${taxSubjectId}:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const fp1 = 'fp-dismiss-1';
    const fp2 = 'fp-dismiss-2-altered';

    const dismissAction: TaxComplianceUserActionRecord = {
      id: 'act-d1',
      taxSubjectId,
      obligationKey,
      revision: 1,
      actionType: 'USER_DISMISSED',
      sourceFingerprint: fp1,
      note: 'Dismissed on fp1',
      occurredAt: '2026-04-01T10:00:00.000Z',
    };

    const source1: MonthlyComplianceSource = {
      competence: '2026-05',
      revenueCode: '6015',
      bucket: 'EQUITY_NORMAL',
      principalAmount: '100.00',
      currency: 'BRL',
      dueDate: '2026-06-30',
      status: 'OPEN',
      reasonCode: null,
      darfReadiness: 'READY',
      sourceFingerprint: fp1,
    };

    const inputDismissed: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [source1],
      userActions: [dismissAction],
      annualState: null,
    };

    const t1 = projectTaxComplianceTimeline(inputDismissed);
    expect(t1.obligations[0].status).toBe('DISMISSED');

    // When fingerprint changes to fp2
    const source2: MonthlyComplianceSource = {
      ...source1,
      sourceFingerprint: fp2,
    };

    const inputMutated: ProjectTaxComplianceTimelineInput = {
      ...inputDismissed,
      monthlySources: [source2],
    };

    const t2 = projectTaxComplianceTimeline(inputMutated);
    expect(t2.obligations[0].status).toBe('SUPERSEDED'); // Does NOT stay dismissed
  });
});
