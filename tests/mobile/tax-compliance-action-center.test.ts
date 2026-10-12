import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapToTaxComplianceActionItemListViewModel,
  mapToTaxComplianceCalendarListViewModel,
  groupTaxComplianceCalendarByDate,
  TAX_ACTION_CENTER_STALE_MESSAGE,
  TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING,
  TAX_ACTION_CENTER_SUPPORT_DISCLAIMER,
  type RawTaxComplianceActionItem,
} from '@atlas/ui';

const COMPONENT = 'apps/mobile/src/components/fiscal/TaxComplianceActionCenterCard.tsx';
const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';

function sampleItem(
  overrides: Partial<RawTaxComplianceActionItem> = {},
): RawTaxComplianceActionItem {
  return {
    actionKey: 'subj:2026-03:MONTHLY:fp:PAY_TAX:fp',
    taxSubjectId: 'subj-1',
    obligationKey: 'subj-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
    sourceFingerprint: 'a'.repeat(64),
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

describe('Mobile Fiscal Compliance Action Center (Phase 4K.4)', () => {
  it('integrates TaxComplianceActionCenterCard in the mobile Tax tab', () => {
    const screenContent = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screenContent).toContain('TaxComplianceActionCenterCard');
  });

  it('maps attention/upcoming/review/completed sections from mocked items', () => {
    const vms = mapToTaxComplianceActionItemListViewModel([
      sampleItem(),
      sampleItem({
        actionKey: 'm2',
        operationalStatus: 'OVERDUE',
        priority: 'CRITICAL',
        title: 'DARF em atraso',
      }),
      sampleItem({
        actionKey: 'm3',
        kind: 'REVIEW_ANNUAL_FILING',
        operationalStatus: 'ACTION_REQUIRED',
        priority: 'HIGH',
        period: '2026',
        exercise: 2027,
        amount: null,
        currency: null,
        nextAction: 'OPEN_ANNUAL_REVIEW',
      }),
      sampleItem({
        actionKey: 'm4',
        kind: 'COMPLETE_COMPLIANCE_ACTION',
        operationalStatus: 'COMPLETED',
        priority: 'LOW',
        nextAction: 'VIEW_DETAILS',
      }),
    ]);
    const byKey = new Map(vms.map((v) => [v.actionKey, v]));
    expect(byKey.get('subj:2026-03:MONTHLY:fp:PAY_TAX:fp')?.section).toBe('upcoming');
    expect(byKey.get('m2')?.section).toBe('attention');
    expect(byKey.get('m3')?.section).toBe('attention');
    expect(byKey.get('m3')?.exerciseLabel).toContain('2027');
    expect(byKey.get('m4')?.section).toBe('completed');
  });

  it('keeps evidence wording user-reported and surfaces stale messaging', () => {
    expect(TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING).toMatch(
      /sem verificação governamental/,
    );
    expect(TAX_ACTION_CENTER_STALE_MESSAGE).toContain('foram alterados');
    expect(TAX_ACTION_CENTER_SUPPORT_DISCLAIMER).toMatch(/não processa pagamentos/);
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('TAX_ACTION_CENTER_STALE_MESSAGE');
    expect(component).toContain('TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING');
    expect(component).toContain('TAX_ACTION_CENTER_SUPPORT_DISCLAIMER');
  });

  it('renders summary, filters, agenda and bounded pagination hooks', () => {
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('Central de ações fiscais');
    expect(component).toContain('Atenção');
    expect(component).toContain('Próximos');
    expect(component).toContain('Revisão');
    expect(component).toContain('Concluídos');
    expect(component).toContain('Agenda do mês');
    expect(component).toContain('Carregar mais');
    expect(component).toContain('action-center?calendarYear=');
    expect(component).toContain('/compliance/calendar?from=');
    // Accessibility: touch targets, labels, non-color-only status.
    expect(component).toContain('minHeight: 44');
    expect(component).toContain('accessibilityLabel');
    expect(component).toContain('accessibilityRole');
    // Zero client fiscal math.
    expect(component).not.toMatch(/parseFloat/);
    expect(component).not.toMatch(/@atlas\/tax-engine/);
  });

  it('groups agenda events by date without fiscal math', () => {
    const vms = mapToTaxComplianceCalendarListViewModel([
      {
        eventKey: 'e1',
        taxSubjectId: 'subj-1',
        obligationKey: 'o1',
        actionKey: 'a1',
        sourceFingerprint: 'f',
        eventType: 'OBLIGATION_DUE',
        eventDate: '2026-04-30',
        title: 'DARF a vencer — 2026-03',
        status: 'UPCOMING',
        severity: 'ACTION',
        actionTarget: '/tax',
      },
    ]);
    const groups = groupTaxComplianceCalendarByDate(vms);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.dateFormatted).toBe('30/04/2026');
  });
});
