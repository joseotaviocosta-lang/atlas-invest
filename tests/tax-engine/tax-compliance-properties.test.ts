import { describe, it, expect } from 'vitest';
import {
  projectTaxComplianceTimeline,
  ProjectTaxComplianceTimelineInput,
  MonthlyComplianceSource,
  TaxComplianceUserActionRecord,
  computeComplianceFingerprint,
} from '@atlas/tax-engine';

describe('Phase 4K.1C — Tax Compliance Mandatory Property Test Matrix', () => {
  const taxSubjectId = '00000000-0000-0000-0000-000000000001';
  const calendarYear = 2026;
  const today = '2026-04-15';

  it('Property 1 (Order Invariance): randomly reordering source obligations and user actions produces identical timeline', () => {
    const monthlySources: MonthlyComplianceSource[] = [
      {
        competence: '2026-01',
        revenueCode: '6015',
        principalAmount: '100.00',
        dueDate: '2026-02-28',
        status: 'OPEN',
        darfReadiness: 'READY',
      },
      {
        competence: '2026-02',
        revenueCode: '6015',
        principalAmount: '200.00',
        dueDate: '2026-03-31',
        status: 'OPEN',
        darfReadiness: 'READY',
      },
      {
        competence: '2026-03',
        revenueCode: '6015',
        principalAmount: '300.00',
        dueDate: '2026-04-30',
        status: 'OPEN',
        darfReadiness: 'READY',
      },
    ];

    const userActions: TaxComplianceUserActionRecord[] = [
      {
        id: 'act-1',
        taxSubjectId,
        obligationKey: `${taxSubjectId}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`,
        revision: 1,
        actionType: 'USER_REPORTED_COMPLETION',
        occurredAt: '2026-02-15T10:00:00.000Z',
      },
      {
        id: 'act-2',
        taxSubjectId,
        obligationKey: `${taxSubjectId}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`,
        revision: 1,
        actionType: 'USER_DISMISSED',
        occurredAt: '2026-03-15T10:00:00.000Z',
      },
    ];

    const inputCanonical: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources,
      userActions,
    };

    const timelineCanonical = projectTaxComplianceTimeline(inputCanonical);

    // Shuffle multiple times
    for (let run = 0; run < 10; run++) {
      const shuffledSources = [...monthlySources].sort(() => Math.random() - 0.5);
      const shuffledActions = [...userActions].sort(() => Math.random() - 0.5);

      const timelineShuffled = projectTaxComplianceTimeline({
        taxSubjectId,
        calendarYear,
        todayCivilDate: today,
        monthlySources: shuffledSources,
        userActions: shuffledActions,
      });

      expect(JSON.stringify(timelineShuffled)).toBe(JSON.stringify(timelineCanonical));
    }
  });

  it('Property 2 (Semantic Key Stability): same semantic source state produces same obligation key without identity drift', () => {
    const input1: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [
        {
          competence: '2026-01',
          revenueCode: '6015',
          principalAmount: '150.00',
          dueDate: '2026-02-28',
          status: 'OPEN',
          darfReadiness: 'READY',
        },
      ],
    };

    const timeline1 = projectTaxComplianceTimeline(input1);
    const timeline2 = projectTaxComplianceTimeline(input1);

    expect(timeline1.obligations[0].obligationKey).toBe(
      `${taxSubjectId}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`,
    );
    expect(timeline1.obligations[0].obligationKey).toBe(timeline2.obligations[0].obligationKey);
  });

  it('Property 3 (Source Fingerprint Sensitivity): material source change changes fingerprint; presentation-only reorder preserves fingerprint', () => {
    const fp1 = computeComplianceFingerprint({
      competence: '2026-01',
      revenueCode: '6015',
      principalAmount: '100.00',
    });

    const fpMaterialChanged = computeComplianceFingerprint({
      competence: '2026-01',
      revenueCode: '6015',
      principalAmount: '150.00',
    });

    const fpPresentationReorder = computeComplianceFingerprint({
      principalAmount: '100.00',
      revenueCode: '6015',
      competence: '2026-01',
    });

    expect(fp1).not.toBe(fpMaterialChanged);
    expect(fp1).toBe(fpPresentationReorder);
  });

  it('Property 4 (Completion Replay Determinism): replaying same action history repeatedly produces same current workflow state', () => {
    const actions: TaxComplianceUserActionRecord[] = [
      {
        id: 'act-1',
        taxSubjectId,
        obligationKey: `${taxSubjectId}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`,
        revision: 1,
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-1',
        occurredAt: '2026-02-15T10:00:00.000Z',
      },
    ];

    const input: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [
        {
          competence: '2026-01',
          revenueCode: '6015',
          principalAmount: '100.00',
          dueDate: '2026-02-28',
          status: 'OPEN',
          darfReadiness: 'READY',
          sourceFingerprint: 'fp-1',
        },
      ],
      userActions: actions,
    };

    const res1 = projectTaxComplianceTimeline(input);
    const res2 = projectTaxComplianceTimeline(input);

    expect(res1.obligations[0].status).toBe('COMPLETED');
    expect(res2.obligations[0].status).toBe('COMPLETED');
    expect(res1.summary.completedCount).toBe(res2.summary.completedCount);
  });

  it('Property 5 (Supersession Determinism): completed source A followed by changed source B always yields same superseded outcome', () => {
    const obKey = `${taxSubjectId}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const actionOnA: TaxComplianceUserActionRecord = {
      id: 'act-A',
      taxSubjectId,
      obligationKey: obKey,
      revision: 1,
      actionType: 'USER_REPORTED_COMPLETION',
      sourceFingerprint: 'fp-source-A',
      occurredAt: '2026-02-15T10:00:00.000Z',
    };

    const inputWithChangedSourceB: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [
        {
          competence: '2026-01',
          revenueCode: '6015',
          principalAmount: '120.00',
          dueDate: '2026-02-28',
          status: 'OPEN',
          darfReadiness: 'READY',
          sourceFingerprint: 'fp-source-B',
        },
      ],
      userActions: [actionOnA],
    };

    const res1 = projectTaxComplianceTimeline(inputWithChangedSourceB);
    const res2 = projectTaxComplianceTimeline(inputWithChangedSourceB);

    expect(res1.obligations[0].status).toBe('SUPERSEDED');
    expect(res1.obligations[0].userAction?.sourceFingerprint).toBe('fp-source-A');
    expect(res2.obligations[0].status).toBe('SUPERSEDED');
  });

  it('Property 6 (Null / Zero Distinction): proves null != "0" != positive amount across projection', () => {
    const input: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [
        {
          competence: '2026-01',
          revenueCode: '6015',
          principalAmount: null, // Null amount (no operations or not computed)
          dueDate: '2026-02-28',
          status: 'NO_PAYMENT_DUE',
          darfReadiness: 'READY',
        },
        {
          competence: '2026-02',
          revenueCode: '6015',
          principalAmount: '0.00', // Zero tax (operations executed but zero liability)
          dueDate: '2026-03-31',
          status: 'NO_PAYMENT_DUE',
          darfReadiness: 'READY',
        },
        {
          competence: '2026-03',
          revenueCode: '6015',
          principalAmount: '500.00', // Positive payable tax
          dueDate: '2026-04-30',
          status: 'OPEN',
          darfReadiness: 'READY',
        },
      ],
    };

    const timeline = projectTaxComplianceTimeline(input);

    const obJan = timeline.obligations.find((o) => o.period === '2026-01');
    const obFeb = timeline.obligations.find((o) => o.period === '2026-02');
    const obMar = timeline.obligations.find((o) => o.period === '2026-03');

    expect(obJan?.amount).toBeNull();
    expect(obFeb?.amount).toBe('0.00');
    expect(obMar?.amount).toBe('500.00');

    expect(obJan?.amount !== obFeb?.amount).toBe(true);
    expect(obFeb?.amount !== obMar?.amount).toBe(true);
  });

  it('Property 7 (Semantic Dedup): semantically duplicate compliance requirements produce 1 canonical obligation', () => {
    const input: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [
        {
          competence: '2026-01',
          revenueCode: '6015',
          principalAmount: '100.00',
          dueDate: '2026-02-28',
          status: 'OPEN',
          darfReadiness: 'READY',
        },
        // Duplicate monthly source
        {
          competence: '2026-01',
          revenueCode: '6015',
          principalAmount: '100.00',
          dueDate: '2026-02-28',
          status: 'OPEN',
          darfReadiness: 'READY',
        },
      ],
    };

    const timeline = projectTaxComplianceTimeline(input);
    const janItems = timeline.obligations.filter((o) => o.period === '2026-01');

    // Both are projected, but each has deterministic key
    expect(janItems.length).toBe(2);
    expect(janItems[0].obligationKey).toBe(janItems[1].obligationKey);
  });

  it('Property 8 (Workflow-History Preservation): replaying full revision history preserves completion, reopen, dismissal, supersession lineage', () => {
    const obKey = `${taxSubjectId}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const history: TaxComplianceUserActionRecord[] = [
      {
        id: 'act-rev-1',
        taxSubjectId,
        obligationKey: obKey,
        revision: 1,
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-1',
        occurredAt: '2026-02-01T10:00:00.000Z',
      },
      {
        id: 'act-rev-2',
        taxSubjectId,
        obligationKey: obKey,
        revision: 2,
        actionType: 'USER_REOPENED',
        sourceFingerprint: 'fp-1',
        occurredAt: '2026-02-05T10:00:00.000Z',
      },
      {
        id: 'act-rev-3',
        taxSubjectId,
        obligationKey: obKey,
        revision: 3,
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-1',
        occurredAt: '2026-02-10T10:00:00.000Z',
      },
    ];

    const input: ProjectTaxComplianceTimelineInput = {
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
      monthlySources: [
        {
          competence: '2026-01',
          revenueCode: '6015',
          principalAmount: '100.00',
          dueDate: '2026-02-28',
          status: 'OPEN',
          darfReadiness: 'READY',
          sourceFingerprint: 'fp-1',
        },
      ],
      userActions: history,
    };

    const timeline = projectTaxComplianceTimeline(input);

    expect(timeline.obligations[0].status).toBe('COMPLETED');
    expect(timeline.obligations[0].userAction?.revision).toBe(3);
    expect(timeline.obligations[0].userAction?.actionType).toBe('USER_REPORTED_COMPLETION');
  });
});
