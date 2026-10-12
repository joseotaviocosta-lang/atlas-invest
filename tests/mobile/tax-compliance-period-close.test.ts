import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapToTaxCompliancePeriodCloseReadinessViewModel,
  mapToTaxCompliancePeriodCloseRecordListViewModel,
  TAX_PERIOD_CLOSE_STALE_MESSAGE,
  TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE,
  TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER,
  type RawTaxCompliancePeriodCloseReadiness,
} from '@atlas/ui';

const COMPONENT = 'apps/mobile/src/components/fiscal/TaxCompliancePeriodCloseCard.tsx';
const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';

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
    readiness: 'BLOCKED',
    checklist: [
      { category: 'BLOCKERS_CLEARED', state: 'BLOCKED', detail: 'Bloqueadores.', itemCount: 1 },
    ],
    unresolvedItems: [
      {
        ref: 'b1',
        kind: 'BLOCKER',
        title: 'Ação necessária',
        reason: 'Upstream blocker.',
        severity: 'BLOCKING',
      },
    ],
    sourceFingerprint: 'c'.repeat(64),
    previousClose: {
      revision: 1,
      recordStatus: 'CLOSED',
      sourceFingerprint: 'd'.repeat(64),
      binderFingerprint: 'e'.repeat(64),
      closedAt: '2026-04-18T00:00:00.000Z',
    },
    isStaleVsPreviousClose: true,
    cleanCloseAllowed: false,
    sourceVersion: '4K.5',
    ...overrides,
  };
}

describe('Mobile Fiscal Compliance Period Close (Phase 4K.5)', () => {
  it('integrates TaxCompliancePeriodCloseCard in the mobile Tax tab', () => {
    const screenContent = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screenContent).toContain('TaxCompliancePeriodCloseCard');
  });

  it('maps blocked/stale readiness with history labels', () => {
    const vm = mapToTaxCompliancePeriodCloseReadinessViewModel(sampleReadiness());
    expect(vm.readinessLabel).toBe('Bloqueado');
    expect(vm.statusVariant).toBe('danger');
    expect(vm.isStaleVsPreviousClose).toBe(true);
    expect(vm.previousClose?.recordStatusLabel).toBe('Fechado');
    expect(vm.previousClose?.closedAtFormatted).toBe('18/04/2026');
    expect(vm.unresolvedItems[0]?.kindLabel).toBe('Bloqueador');

    const records = mapToTaxCompliancePeriodCloseRecordListViewModel([
      {
        id: 'id-9',
        scope: 'ANNUAL',
        period: '2026',
        calendarYear: 2026,
        month: null,
        exercise: 2027,
        revision: 1,
        recordStatus: 'CLOSED',
        statusAtClose: 'READY_TO_CLOSE',
        closeMode: 'CLEAN',
        sourceFingerprint: 'f'.repeat(64),
        binderFingerprint: 'g'.repeat(64),
        reason: null,
        closedAt: '2026-04-20T00:00:00.000Z',
        createdAt: '2026-04-20T00:00:00.000Z',
      },
    ]);
    expect(records[0]?.scopeLabel).toBe('Anual');
    expect(records[0]?.closedAtFormatted).toBe('20/04/2026');
  });

  it('keeps support wording operational-only and surfaces stale messaging', () => {
    expect(TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE).toMatch(/Não equivale a quitação/);
    expect(TAX_PERIOD_CLOSE_STALE_MESSAGE).toContain('dados de origem mudaram');
    expect(TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER).toContain('Não constitui declaração transmitida');
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('TAX_PERIOD_CLOSE_STALE_MESSAGE');
    expect(component).toContain('TAX_PERIOD_CLOSE_OPERATIONAL_NOTICE');
    expect(component).toContain('TAX_PERIOD_CLOSE_SUPPORT_DISCLAIMER');
  });

  it('renders status, checklist, close flow, binder summary, history and defers export', () => {
    const component = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(component).toContain('Fechamento de período fiscal');
    expect(component).toContain('Itens pendentes');
    expect(component).toContain('Fechar período');
    expect(component).toContain('Dossiê de evidências');
    expect(component).toContain('Histórico');
    expect(component).toContain('Reabrir');
    // Prettier may wrap JSX text across lines; match whitespace-insensitively.
    expect(component.replace(/\s+/g, ' ')).toContain('versão web');
    expect(component).toContain('period-close/readiness?');
    expect(component).toContain('/period-close/binder?');
    // Accessibility: touch targets, labels, non-color-only status.
    expect(component).toContain('minHeight: 44');
    expect(component).toContain('accessibilityLabel');
    expect(component).toContain('accessibilityRole');
    // Zero client fiscal math.
    expect(component).not.toMatch(/parseFloat/);
    expect(component).not.toMatch(/@atlas\/tax-engine/);
  });
});
