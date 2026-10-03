import { describe, expect, it } from 'vitest';
import {
  annualTaxReadinessQueryKey,
  buildAnnualTaxReadinessViewModel,
} from '../../packages/ui/src/view-models/annual-tax-readiness.view-model';

describe('UI View Model: Annual Tax Readiness (Phase 4H.5)', () => {
  it('A. produces canonical query key', () => {
    const key = annualTaxReadinessQueryKey(2025);
    expect(key).toEqual(['annual-tax-readiness', 2025]);
  });

  it('B. formats READY status view model', () => {
    const vm = buildAnnualTaxReadinessViewModel({
      calendarYear: 2025,
      declarationExercise: 2026,
      overallStatus: 'READY',
      isReadyForDirpf: true,
      sections: [
        {
          section: 'OPENING_POSITIONS',
          title: 'Posições de Abertura',
          status: 'READY',
          isComplete: true,
          blockingReasons: [],
          requirementIds: [],
        },
      ],
      requirements: [],
      confirmations: [],
      blockingReasons: [],
      fingerprint: 'fp_ready_123',
    });

    expect(vm.calendarYear).toBe(2025);
    expect(vm.declarationExercise).toBe(2026);
    expect(vm.overallStatus).toBe('READY');
    expect(vm.overallStatusLabel).toBe('Pronto para IRPF');
    expect(vm.overallStatusVariant).toBe('success');
    expect(vm.isReadyForDirpf).toBe(true);
    expect(vm.sections).toHaveLength(1);
    expect(vm.sections[0]?.statusVariant).toBe('success');
  });

  it('C. formats REQUIRES_CONFIRMATION status view model with pending requirements and history', () => {
    const vm = buildAnnualTaxReadinessViewModel({
      calendarYear: 2026,
      declarationExercise: 2027,
      overallStatus: 'REQUIRES_CONFIRMATION',
      isReadyForDirpf: false,
      sections: [
        {
          section: 'TRANSITION_EVIDENCE',
          title: 'Transição de Dividendos Pré-2026',
          status: 'REQUIRES_CONFIRMATION',
          isComplete: false,
          blockingReasons: ['TRANSITION_EVIDENCE_REQUIRED'],
          requirementIds: ['req_trans_petr4'],
        },
      ],
      requirements: [
        {
          requirementId: 'req_trans_petr4',
          section: 'TRANSITION_EVIDENCE',
          subjectId: 'asset-petr4',
          title: 'Comprovação societária PETR4',
          description: 'Apresente ata de deliberação pré-2026',
          status: 'PENDING',
          blockingReason: 'TRANSITION_EVIDENCE_REQUIRED',
          sourceFingerprint: 'fp_petr4_123',
        },
      ],
      confirmations: [
        {
          id: 'conf-1',
          confirmationType: 'DIVIDEND_TRANSITION_EVIDENCE',
          subjectReference: 'asset-petr4',
          decision: 'CONFIRMED',
          statementVersion: '2026.1',
          sourceFingerprint: 'fp_petr4_old',
          revision: 1,
          confirmedAt: '2026-03-01T00:00:00Z',
          notes: 'Ata',
        },
      ],
      blockingReasons: ['TRANSITION_EVIDENCE_REQUIRED'],
      fingerprint: 'fp_requires_conf_123',
    });

    expect(vm.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(vm.overallStatusLabel).toBe('Confirmação Necessária');
    expect(vm.overallStatusVariant).toBe('warning');
    expect(vm.isReadyForDirpf).toBe(false);
    expect(vm.requirements).toHaveLength(1);
    expect(vm.requirements[0]?.statusLabel).toBe('Pendente');
    expect(vm.requirements[0]?.isSatisfied).toBe(false);
    expect(vm.confirmations).toHaveLength(1);
    expect(vm.confirmations[0]?.revision).toBe(1);
  });
});
