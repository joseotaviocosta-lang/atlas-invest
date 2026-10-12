import { describe, it, expect } from 'vitest';
import {
  mapToTaxCompliancePeriodCloseReadinessViewModel,
  mapToTaxCompliancePeriodCloseRecordListViewModel,
  type RawTaxCompliancePeriodCloseReadiness,
} from '@atlas/ui';

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
    readiness: 'STALE',
    checklist: [
      {
        category: 'OBLIGATIONS_REVIEWED',
        state: 'COMPLETE',
        detail: 'Sem pendência.',
        itemCount: 1,
      },
    ],
    unresolvedItems: [],
    sourceFingerprint: 'h'.repeat(64),
    previousClose: null,
    isStaleVsPreviousClose: false,
    cleanCloseAllowed: false,
    sourceVersion: '4K.5',
    ...overrides,
  };
}

describe('UI: tax compliance period close view-model (Phase 4K.5)', () => {
  it('maps all six readiness statuses to PT-BR labels and variants', () => {
    const expectations: Array<[string, string, string]> = [
      ['READY_TO_CLOSE', 'Pronto para fechar', 'success'],
      ['REQUIRES_REVIEW', 'Requer revisão', 'warning'],
      ['PARTIAL', 'Parcial — incompleto', 'warning'],
      ['BLOCKED', 'Bloqueado', 'danger'],
      ['NO_ACTIVITY', 'Sem movimento', 'neutral'],
      ['STALE', 'Desatualizado — revisar', 'warning'],
    ];
    for (const [readiness, label, variant] of expectations) {
      const vm = mapToTaxCompliancePeriodCloseReadinessViewModel(
        sampleReadiness({ readiness: readiness as never }),
      );
      expect(vm.readinessLabel).toBe(label);
      expect(vm.statusVariant).toBe(variant);
    }
  });

  it('maps checklist categories and states without computing figures', () => {
    const vm = mapToTaxCompliancePeriodCloseReadinessViewModel(
      sampleReadiness({
        checklist: [
          {
            category: 'PAYMENT_EVIDENCE_RECONCILED',
            state: 'REQUIRES_REVIEW',
            detail: 'X',
            itemCount: 2,
          },
          { category: 'UNKNOWN_CATEGORY', state: 'COMPLETE', detail: 'Y', itemCount: 0 },
        ],
      }),
    );
    expect(vm.checklist[0]?.categoryLabel).toBe('Evidências conciliadas');
    expect(vm.checklist[0]?.stateLabel).toBe('Requer revisão');
    expect(vm.checklist[1]?.categoryLabel).toBe('UNKNOWN_CATEGORY');
    expect(JSON.stringify(vm)).not.toMatch(/parseFloat/);
  });

  it('renders missing previous close and empty lists safely', () => {
    const vm = mapToTaxCompliancePeriodCloseReadinessViewModel(sampleReadiness());
    expect(vm.previousClose).toBeNull();
    expect(vm.unresolvedItems).toEqual([]);
    expect(mapToTaxCompliancePeriodCloseRecordListViewModel(undefined)).toEqual([]);
  });

  it('keeps calendar year and exercise distinct on annual view-models', () => {
    const vm = mapToTaxCompliancePeriodCloseReadinessViewModel(
      sampleReadiness({
        scope: 'ANNUAL',
        period: '2026',
        month: null,
        exercise: 2027,
        readiness: 'READY_TO_CLOSE',
      }),
    );
    expect(vm.period).toBe('2026');
    expect(vm.exerciseLabel).toContain('2027');
    expect(vm.exerciseLabel).not.toBe(vm.periodLabel);
  });
});
