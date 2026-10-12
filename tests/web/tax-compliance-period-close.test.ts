import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { apiClient } from '@/api/client';
import {
  mapToTaxCompliancePeriodCloseReadinessViewModel,
  mapToTaxCompliancePeriodCloseRecordListViewModel,
  TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER,
  TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE,
  TAX_PERIOD_CLOSE_STALE_MESSAGE,
  type RawTaxCompliancePeriodCloseReadiness,
} from '@atlas/ui';

const COMPONENT = 'apps/web/src/components/fiscal/TaxCompliancePeriodCloseSection.tsx';
const PAGE = 'apps/web/src/app/(app)/tax/page.tsx';

function sampleReadiness(
  overrides: Partial<RawTaxCompliancePeriodCloseReadiness> = {},
): RawTaxCompliancePeriodCloseReadiness {
  return {
    taxSubjectId: 'subj-1',
    scope: 'MONTHLY',
    period: '2026-03',
    calendarYear: 2026,
    month: '2026-03',
    exercise: null,
    readiness: 'REQUIRES_REVIEW',
    checklist: [
      {
        category: 'ACTION_ITEMS_RESOLVED',
        state: 'INCOMPLETE',
        detail: '1 item(ns) acionável(is) na central de ações.',
        itemCount: 1,
      },
      {
        category: 'BLOCKERS_CLEARED',
        state: 'COMPLETE',
        detail: 'Sem bloqueadores.',
        itemCount: 0,
      },
    ],
    unresolvedItems: [
      {
        ref: 'a1',
        kind: 'PAY_TAX',
        title: 'DARF próximo do vencimento',
        reason: 'Item pagável segue acionável.',
        severity: 'WARNING',
      },
    ],
    sourceFingerprint: 'f'.repeat(64),
    previousClose: null,
    isStaleVsPreviousClose: false,
    cleanCloseAllowed: false,
    sourceVersion: '4K.5',
    ...overrides,
  };
}

describe('Web: tax compliance period close UX (Phase 4K.5)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps readiness, checklist and unresolved items from the mocked assessment', () => {
    const vm = mapToTaxCompliancePeriodCloseReadinessViewModel(sampleReadiness());
    expect(vm.scopeLabel).toBe('Mensal');
    expect(vm.periodLabel).toBe('Competência 2026-03');
    expect(vm.exerciseLabel).toBeNull();
    expect(vm.readinessLabel).toBe('Requer revisão');
    expect(vm.statusVariant).toBe('warning');
    expect(vm.cleanCloseAllowed).toBe(false);
    expect(vm.checklist[0]?.categoryLabel).toBe('Itens de ação resolvidos');
    expect(vm.checklist[0]?.stateLabel).toBe('Pendente');
    expect(vm.unresolvedItems[0]?.kindLabel).toBe('Tributo a pagar');
    expect(vm.sourceFingerprintShort).toBe('f'.repeat(16));

    const annual = mapToTaxCompliancePeriodCloseReadinessViewModel(
      sampleReadiness({
        scope: 'ANNUAL',
        period: '2026',
        month: null,
        exercise: 2027,
        readiness: 'READY_TO_CLOSE',
        unresolvedItems: [],
        cleanCloseAllowed: true,
      }),
    );
    expect(annual.scopeLabel).toBe('Anual');
    expect(annual.exerciseLabel).toContain('2027');
    expect(annual.exerciseLabel).toContain('2026');
    expect(annual.readinessLabel).toBe('Pronto para fechar');
  });

  it('maps close history with revision labels and short fingerprints', () => {
    const vms = mapToTaxCompliancePeriodCloseRecordListViewModel([
      {
        id: 'id-1',
        scope: 'MONTHLY',
        period: '2026-03',
        calendarYear: 2026,
        month: '2026-03',
        exercise: null,
        revision: 2,
        recordStatus: 'REOPENED',
        statusAtClose: null,
        closeMode: null,
        sourceFingerprint: 'a'.repeat(64),
        binderFingerprint: 'b'.repeat(64),
        reason: 'Revisão solicitada.',
        closedAt: null,
        createdAt: '2026-04-20T00:00:00.000Z',
      },
    ]);
    expect(vms[0]?.revisionLabel).toBe('Revisão 2');
    expect(vms[0]?.recordStatusLabel).toBe('Reaberto');
    expect(vms[0]?.reason).toBe('Revisão solicitada.');
    expect(vms).toHaveLength(1);
    expect(mapToTaxCompliancePeriodCloseRecordListViewModel(null)).toEqual([]);
  });

  it('fetches readiness through the canonical endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: sampleReadiness() }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
    const res = await apiClient.get<{ data: RawTaxCompliancePeriodCloseReadiness }>(
      '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-03',
    );
    const vm = mapToTaxCompliancePeriodCloseReadinessViewModel(res.data);
    expect(vm.period).toBe('2026-03');
    expect(vm.unresolvedItems).toHaveLength(1);
  });

  it('renders scope selector, checklist, close flow, binder preview, history and disclaimers', () => {
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('Fechamento de período fiscal');
    expect(component).toContain('Escopo do fechamento');
    expect(component).toContain('Lista de verificação');
    expect(component).toContain('Itens pendentes');
    expect(component).toContain('Fechar período');
    expect(component).toContain('Dossiê de evidências');
    expect(component).toContain('Exportar CSV');
    expect(component).toContain('Exportar JSON');
    expect(component).toContain('Histórico de fechamentos');
    expect(component).toContain('Reabrir');
    expect(component).toContain('Motivo da reabertura');
    expect(component).toContain('/period-close/readiness?');
    expect(component).toContain('/period-close/binder?');
    expect(component).toContain('/period-close/binder/export?');
    expect(component).toContain('TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER');
    expect(component).toContain('TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE');
    expect(component).toContain('TAX_PERIOD_CLOSE_STALE_MESSAGE');
    expect(component).not.toMatch(/parseFloat/);
    expect(component).not.toMatch(/@atlas\/tax-engine/);

    const page = fs.readFileSync(path.join(process.cwd(), PAGE), 'utf8');
    expect(page).toContain('TaxCompliancePeriodCloseSection');
  });

  it('exposes support wording with no government-settlement language', () => {
    expect(TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER).toContain('Não constitui declaração transmitida');
    expect(TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE).toMatch(/Não equivale a quitação/);
    expect(TAX_PERIOD_CLOSE_STALE_MESSAGE).toContain('dados de origem mudaram');
  });
});
