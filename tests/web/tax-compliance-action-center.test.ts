import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { apiClient } from '@/api/client';
import {
  mapToTaxComplianceActionItemViewModel,
  mapToTaxComplianceActionItemListViewModel,
  mapToTaxComplianceCalendarListViewModel,
  groupTaxComplianceCalendarByDate,
  taxComplianceActionCenterQueryKey,
  taxComplianceCalendarQueryKey,
  TAX_ACTION_CENTER_SUPPORT_DISCLAIMER,
  TAX_ACTION_CENTER_STALE_MESSAGE,
  TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING,
  TAX_ACTION_CENTER_REMINDER_NOT_RESOLVED_WARNING,
  type RawTaxComplianceActionItem,
  type RawTaxComplianceCalendarEvent,
} from '@atlas/ui';

const COMPONENT = 'apps/web/src/components/fiscal/TaxComplianceActionCenterSection.tsx';
const PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

function sampleItem(
  overrides: Partial<RawTaxComplianceActionItem> = {},
): RawTaxComplianceActionItem {
  return {
    actionKey: 'subj:2026-03:MONTHLY:fp:PAY_TAX:fp',
    taxSubjectId: 'subj-1',
    obligationKey: 'subj-1:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015',
    sourceFingerprint: 'f'.repeat(64),
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

describe('Web: tax compliance action center UX (Phase 4K.4)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps attention/upcoming/review/completed/informational sections from mocked items', () => {
    const raws = [
      sampleItem({ actionKey: 'a1', operationalStatus: 'OVERDUE', priority: 'CRITICAL' }),
      sampleItem({
        actionKey: 'a2',
        kind: 'REVIEW_PAYMENT_EVIDENCE',
        operationalStatus: 'REQUIRES_REVIEW',
        priority: 'HIGH',
        nextAction: 'ADD_PAYMENT_EVIDENCE',
      }),
      sampleItem({
        actionKey: 'a3',
        kind: 'COMPLETE_COMPLIANCE_ACTION',
        operationalStatus: 'COMPLETED',
        priority: 'LOW',
        nextAction: 'VIEW_DETAILS',
      }),
      sampleItem({
        actionKey: 'a4',
        kind: 'INFORMATIONAL',
        operationalStatus: 'INFORMATIONAL',
        priority: 'LOW',
        nextAction: 'VIEW_DETAILS',
        amount: null,
        currency: null,
      }),
    ];
    const vms = mapToTaxComplianceActionItemListViewModel(raws);
    const byKey = new Map(vms.map((v) => [v.actionKey, v]));
    expect(byKey.get('a1')?.section).toBe('attention');
    expect(byKey.get('a1')?.sectionLabel).toBe('Precisa de atenção');
    expect(byKey.get('a2')?.section).toBe('review');
    expect(byKey.get('a3')?.section).toBe('completed');
    expect(byKey.get('a4')?.section).toBe('informational');

    expect(byKey.get('a1')?.statusLabel).toBe('Em atraso');
    expect(byKey.get('a1')?.priorityLabel).toBe('Crítica');
    expect(byKey.get('a2')?.nextActionLabel).toBe('Adicionar comprovante');
    expect(byKey.get('a1')?.dueDateFormatted).toBe('30/04/2026');
  });

  it('formats amounts and exercise distinctly without computing figures', () => {
    const vm = mapToTaxComplianceActionItemViewModel(
      sampleItem({ amount: '500.00', currency: 'BRL' }),
    );
    expect(vm.amountFormatted).toContain('500');
    const annual = mapToTaxComplianceActionItemViewModel(
      sampleItem({
        kind: 'REVIEW_ANNUAL_FILING',
        period: '2026',
        calendarYear: 2026,
        exercise: 2027,
        amount: null,
        currency: null,
        nextAction: 'OPEN_ANNUAL_REVIEW',
      }),
    );
    expect(annual.exerciseLabel).toContain('2027');
    expect(annual.exerciseLabel).toContain('2026');
    expect(annual.amountFormatted).toBe('—');
    expect(annual).not.toHaveProperty('totalCost');
    expect(JSON.stringify(annual)).not.toMatch(/parseFloat/);
  });

  it('labels user-reported evidence without implying government verification', () => {
    const vm = mapToTaxComplianceActionItemViewModel(
      sampleItem({
        kind: 'INFORMATIONAL',
        operationalStatus: 'INFORMATIONAL',
        paymentEvidenceStatus: 'USER_REPORTED_MATCH',
      }),
    );
    expect(vm.paymentEvidenceLabel).toContain('confere');
    expect(TAX_ACTION_CENTER_EVIDENCE_NOT_VERIFIED_WARNING).toMatch(
      /sem verificação governamental/,
    );
    expect(TAX_ACTION_CENTER_REMINDER_NOT_RESOLVED_WARNING).toMatch(/não resolvem/);
    expect(TAX_ACTION_CENTER_STALE_MESSAGE).toContain('foram alterados');
  });

  it('groups calendar events by civil date for the agenda view', () => {
    const events: RawTaxComplianceCalendarEvent[] = [
      {
        eventKey: 'k1:OBLIGATION_DUE:2026-04-30',
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
      {
        eventKey: 'k2:REMINDER:2026-04-30',
        taxSubjectId: 'subj-1',
        obligationKey: 'o1',
        actionKey: null,
        sourceFingerprint: 'f',
        eventType: 'REMINDER',
        eventDate: '2026-04-30',
        title: 'DARF próximo do vencimento',
        status: 'SCHEDULED',
        severity: 'INFO',
        actionTarget: '/tax',
      },
    ];
    const vms = mapToTaxComplianceCalendarListViewModel(events);
    expect(vms[0]?.eventTypeLabel).toBe('Vencimento');
    expect(vms[1]?.eventTypeLabel).toBe('Lembrete');
    const groups = groupTaxComplianceCalendarByDate(vms);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.date).toBe('2026-04-30');
    expect(groups[0]?.events).toHaveLength(2);
  });

  it('fetches the action center and calendar through the canonical endpoints', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [sampleItem()],
        meta: {
          summary: {
            needsAttention: 1,
            overdue: 0,
            dueToday: 0,
            upcoming: 1,
            requiresReview: 0,
            completed: 0,
            annualReview: 0,
            informational: 0,
            total: 1,
          },
          totalCount: 1,
        },
      }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
    const res = await apiClient.get<{ data: RawTaxComplianceActionItem[] }>(
      '/api/v1/fiscal/compliance/action-center?calendarYear=2026&limit=100',
    );
    const vms = mapToTaxComplianceActionItemListViewModel(res.data);
    expect(vms).toHaveLength(1);
    expect(vms[0]?.actionKey).toBe('subj:2026-03:MONTHLY:fp:PAY_TAX:fp');

    expect(taxComplianceActionCenterQueryKey(2026)).toContain('action-center');
    expect(taxComplianceCalendarQueryKey('2026-04-01', '2026-04-30')).toContain('calendar');
  });

  it('handles response with missing or null meta without throwing (runtime robustness proof)', () => {
    const rawWithoutMeta: { data: RawTaxComplianceActionItem[]; meta?: unknown } = {
      data: [sampleItem()],
      meta: null,
    };
    const summary =
      (rawWithoutMeta.meta as { summary?: unknown } | null | undefined)?.summary ?? null;
    expect(summary).toBeNull();
    const vms = mapToTaxComplianceActionItemListViewModel(rawWithoutMeta.data);
    expect(vms).toHaveLength(1);
  });

  it('renders sections, filters, calendar grid and disclaimers', () => {
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('Precisa de atenção');
    expect(component).toContain('Próximos vencimentos');
    expect(component).toContain('Em revisão');
    expect(component).toContain('Concluídos recentemente');
    expect(component).toContain('Informativos');
    expect(component).toContain('Filtrar por status');
    expect(component).toContain('Filtrar por prioridade');
    expect(component).toContain('Calendário fiscal');
    expect(component).toContain('action-center?');
    expect(component).toContain('/compliance/calendar?from=');
    expect(component).toContain('TAX_ACTION_CENTER_SUPPORT_DISCLAIMER');
    expect(component).toContain('TAX_ACTION_CENTER_STALE_MESSAGE');
    expect(component).not.toMatch(/parseFloat/);
    expect(component).not.toMatch(/@atlas\/tax-engine/);

    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('TaxComplianceActionCenterSection');
  });

  it('exposes the support disclaimer with no government-verification language', () => {
    expect(TAX_ACTION_CENTER_SUPPORT_DISCLAIMER).toMatch(/não processa pagamentos/);
    expect(TAX_ACTION_CENTER_SUPPORT_DISCLAIMER).toMatch(/não confirma quitação/);
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).not.toMatch(/RECEITA.*confir|quitado oficialmente/i);
  });
});
