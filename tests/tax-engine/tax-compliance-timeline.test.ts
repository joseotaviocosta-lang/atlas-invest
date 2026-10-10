import { describe, expect, it } from 'vitest';
import {
  projectTaxComplianceTimeline,
  sortTaxComplianceObligations,
  COMPLIANCE_DISCLAIMER,
  type MonthlyComplianceSource,
  type TaxComplianceUserActionRecord,
  type TaxComplianceObligation,
} from '../../packages/tax-engine/src/compliance';
import type { UnifiedAnnualIrpfState } from '../../packages/tax-engine/src/annual-irpf';

describe('Phase 4K.1 — Tax Compliance Timeline Engine', () => {
  const taxSubjectId = '00000000-0000-0000-0000-000000000001';
  const calendarYear = 2026;
  const today = '2026-04-15';

  it('projects empty timeline when no monthly sources or annual state are provided', () => {
    const timeline = projectTaxComplianceTimeline({
      taxSubjectId,
      calendarYear,
      todayCivilDate: today,
    });

    expect(timeline.taxSubjectId).toBe(taxSubjectId);
    expect(timeline.calendarYear).toBe(2026);
    expect(timeline.summary.totalObligations).toBe(0);
    expect(timeline.summary.actionRequiredCount).toBe(0);
    expect(timeline.summary.overdueCount).toBe(0);
    expect(timeline.summary.completedCount).toBe(0);
    expect(timeline.obligations).toEqual([]);
    expect(timeline.disclaimer).toBe(COMPLIANCE_DISCLAIMER);
    expect(Object.isFrozen(timeline)).toBe(true);
  });

  it('projects monthly 6015 DARF obligation with payable amount and due date', () => {
    const monthlySources: MonthlyComplianceSource[] = [
      {
        competence: '2026-03',
        revenueCode: '6015',
        bucket: 'EQUITY_NORMAL',
        principalAmount: '1250.50',
        currency: 'BRL',
        dueDate: '2026-04-30',
        status: 'OPEN',
        reasonCode: null,
        darfReadiness: 'READY',
      },
    ];

    const timeline = projectTaxComplianceTimeline({
      taxSubjectId,
      calendarYear,
      todayCivilDate: '2026-04-15',
      monthlySources,
    });

    expect(timeline.summary.totalObligations).toBe(1);
    expect(timeline.summary.upcomingCount).toBe(1);
    expect(timeline.summary.overdueCount).toBe(0);
    expect(timeline.summary.actionRequiredCount).toBe(0);

    const ob = timeline.obligations[0]!;
    expect(ob.obligationKey).toBe(`${taxSubjectId}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`);
    expect(ob.kind).toBe('MONTHLY_TAX_PAYMENT');
    expect(ob.actionType).toBe('PAY');
    expect(ob.status).toBe('OPEN');
    expect(ob.amount).toBe('1250.50');
    expect(ob.currency).toBe('BRL');
    expect(ob.dueDate).toBe('2026-04-30');
    expect(ob.isOverdue).toBe(false);
  });

  it('marks obligation overdue when todayCivilDate is past due date and item is not completed', () => {
    const monthlySources: MonthlyComplianceSource[] = [
      {
        competence: '2026-02',
        revenueCode: '6015',
        bucket: 'EQUITY_NORMAL',
        principalAmount: '500.00',
        currency: 'BRL',
        dueDate: '2026-03-31',
        status: 'OPEN',
        reasonCode: null,
        darfReadiness: 'READY',
      },
    ];

    const timeline = projectTaxComplianceTimeline({
      taxSubjectId,
      calendarYear,
      todayCivilDate: '2026-04-15',
      monthlySources,
    });

    expect(timeline.summary.overdueCount).toBe(1);
    expect(timeline.summary.upcomingCount).toBe(0);

    const ob = timeline.obligations[0]!;
    expect(ob.isOverdue).toBe(true);
    expect(ob.status).toBe('OPEN');
  });

  it('handles user completion with matching sourceFingerprint as COMPLETED', () => {
    const monthlySources: MonthlyComplianceSource[] = [
      {
        competence: '2026-02',
        revenueCode: '6015',
        bucket: 'EQUITY_NORMAL',
        principalAmount: '500.00',
        currency: 'BRL',
        dueDate: '2026-03-31',
        status: 'OPEN',
        reasonCode: null,
        darfReadiness: 'READY',
        sourceFingerprint: 'fp-march-darf-123',
      },
    ];

    const userActions: TaxComplianceUserActionRecord[] = [
      {
        id: 'action-1',
        taxSubjectId,
        obligationKey: `${taxSubjectId}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`,
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-march-darf-123',
        note: 'Pago via Pix pelo banco',
        revision: 1,
        occurredAt: '2026-03-30T10:00:00.000Z',
      },
    ];

    const timeline = projectTaxComplianceTimeline({
      taxSubjectId,
      calendarYear,
      todayCivilDate: '2026-04-15',
      monthlySources,
      userActions,
    });

    expect(timeline.summary.completedCount).toBe(1);
    expect(timeline.summary.overdueCount).toBe(0);

    const ob = timeline.obligations[0]!;
    expect(ob.status).toBe('COMPLETED');
    expect(ob.isOverdue).toBe(false);
    expect(ob.userAction).not.toBeNull();
    expect(ob.userAction?.actionType).toBe('USER_REPORTED_COMPLETION');
    expect(ob.userAction?.note).toBe('Pago via Pix pelo banco');
  });

  it('marks obligation SUPERSEDED when user action fingerprint differs from recalculated state', () => {
    const monthlySources: MonthlyComplianceSource[] = [
      {
        competence: '2026-02',
        revenueCode: '6015',
        bucket: 'EQUITY_NORMAL',
        principalAmount: '750.00', // recalculated to 750 from 500
        currency: 'BRL',
        dueDate: '2026-03-31',
        status: 'OPEN',
        reasonCode: null,
        darfReadiness: 'READY',
        sourceFingerprint: 'fp-march-darf-456', // new fingerprint
      },
    ];

    const userActions: TaxComplianceUserActionRecord[] = [
      {
        id: 'action-1',
        taxSubjectId,
        obligationKey: `${taxSubjectId}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`,
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-march-darf-123', // old stale fingerprint
        note: 'Pago via Pix',
        revision: 1,
        occurredAt: '2026-03-30T10:00:00.000Z',
      },
    ];

    const timeline = projectTaxComplianceTimeline({
      taxSubjectId,
      calendarYear,
      todayCivilDate: '2026-04-15',
      monthlySources,
      userActions,
    });

    expect(timeline.summary.supersededCount).toBe(1);
    expect(timeline.summary.completedCount).toBe(0);

    const ob = timeline.obligations[0]!;
    expect(ob.status).toBe('SUPERSEDED');
    expect(ob.amount).toBe('750.00');
  });

  it('correctly maps blocked monthly state to ACTION_REQUIRED with BLOCKING severity', () => {
    const monthlySources: MonthlyComplianceSource[] = [
      {
        competence: '2026-01',
        revenueCode: '6015',
        bucket: null,
        principalAmount: null,
        currency: null,
        dueDate: null,
        status: 'BLOCKED',
        reasonCode: 'MISSING_REVENUE_CODE',
        darfReadiness: 'BLOCKED',
      },
    ];

    const timeline = projectTaxComplianceTimeline({
      taxSubjectId,
      calendarYear,
      todayCivilDate: '2026-04-15',
      monthlySources,
    });

    expect(timeline.summary.actionRequiredCount).toBe(1);
    const ob = timeline.obligations[0]!;
    expect(ob.status).toBe('ACTION_REQUIRED');
    expect(ob.severity).toBe('BLOCKING');
    expect(ob.actionType).toBe('REVIEW');
    expect(ob.amount).toBeNull();
  });

  it('projects unified annual state with action requirements and master filing obligation', () => {
    const mockAnnualState = {
      identity: {
        taxSubjectId,

        calendarYear: 2026,
        declarationExercise: 2027,
        status: 'REQUIRES_ACTION',
        annualFingerprint: 'annual-fp-789',
        sourceFingerprint: 'src-fp-789',
        generatedAt: '2026-04-15T00:00:00.000Z',
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
      requirements: [
        {
          key: 'HIGH_INCOME_MINIMUM_TAX::CORPORATE_TAX::company-x::CORPORATE_TAX',
          module: 'HIGH_INCOME_MINIMUM_TAX',
          category: 'CORPORATE_TAX',
          nativeType: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
          subjectReference: 'company-x',
          status: 'PENDING',
          blockingReason: 'Falta informe de tributação corporativa da empresa X.',
        },
      ],
      modules: [],
      consistencyIssues: [],
    } as unknown as UnifiedAnnualIrpfState;

    const timeline = projectTaxComplianceTimeline({
      taxSubjectId,
      calendarYear,
      todayCivilDate: '2026-04-15',
      annualState: mockAnnualState,
    });

    expect(timeline.summary.totalObligations).toBe(2);
    expect(timeline.summary.actionRequiredCount).toBe(2);

    const reqOb = timeline.obligations.find(
      (o) => o.kind === 'EVIDENCE_REQUIRED' || o.sourceModule === '4I',
    );
    expect(reqOb).toBeDefined();
    expect(reqOb?.severity).toBe('BLOCKING');
    expect(reqOb?.actionType).toBe('PROVIDE_EVIDENCE');

    const masterOb = timeline.obligations.find((o) => o.kind === 'ANNUAL_FILING_SUPPORT');
    expect(masterOb).toBeDefined();
    expect(masterOb?.dueDate).toBe('2027-04-30');
    expect(masterOb?.sourceModule).toBe('4J');
    expect(masterOb?.severity).toBe('WARNING');
  });

  it('preserves deterministic sort order: due date ASC, severity DESC, obligationKey ASC', () => {
    const ob1: TaxComplianceObligation = {
      obligationKey: 'user:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015',
      taxSubjectId,
      calendarYear,
      period: '2026-05',
      kind: 'MONTHLY_TAX_PAYMENT',
      sourceModule: '4G',
      sourceRef: 'monthly-6015',
      sourceFingerprint: 'fp1',
      status: 'OPEN',
      severity: 'ACTION',
      actionType: 'PAY',
      amount: '100.00',
      currency: 'BRL',
      dueDate: '2026-06-30',
      title: 'T1',
      description: 'D1',
      links: [],
      metadata: {},
      userAction: null,
      isOverdue: false,
    };

    const ob2: TaxComplianceObligation = {
      obligationKey: 'user:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
      taxSubjectId,
      calendarYear,
      period: '2026-03',
      kind: 'MONTHLY_TAX_PAYMENT',
      sourceModule: '4G',
      sourceRef: 'monthly-6015',
      sourceFingerprint: 'fp2',
      status: 'ACTION_REQUIRED',
      severity: 'BLOCKING',
      actionType: 'REVIEW',
      amount: null,
      currency: null,
      dueDate: '2026-04-30',
      title: 'T2',
      description: 'D2',
      links: [],
      metadata: {},
      userAction: null,
      isOverdue: false,
    };

    const ob3: TaxComplianceObligation = {
      obligationKey: 'user:2026-03:MONTHLY_TAX_PAYMENT:monthly-fii',
      taxSubjectId,
      calendarYear,
      period: '2026-03',
      kind: 'MONTHLY_TAX_PAYMENT',
      sourceModule: '4G',
      sourceRef: 'monthly-fii',
      sourceFingerprint: 'fp3',
      status: 'OPEN',
      severity: 'ACTION',
      actionType: 'PAY',
      amount: '50.00',
      currency: 'BRL',
      dueDate: '2026-04-30',
      title: 'T3',
      description: 'D3',
      links: [],
      metadata: {},
      userAction: null,
      isOverdue: false,
    };

    // Sorted should place 2026-04-30 items first.
    // Among 2026-04-30, ob2 has BLOCKING (higher than ACTION) so ob2 comes before ob3.
    // ob1 with 2026-06-30 comes last.
    const sorted = sortTaxComplianceObligations([ob1, ob3, ob2], calendarYear);
    expect(sorted[0]!.obligationKey).toBe(ob2.obligationKey);
    expect(sorted[1]!.obligationKey).toBe(ob3.obligationKey);
    expect(sorted[2]!.obligationKey).toBe(ob1.obligationKey);
  });
});
