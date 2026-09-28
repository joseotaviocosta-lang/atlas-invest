import { describe, it, expect } from 'vitest';
import { mapToTaxInputReadinessViewModel, type RawTaxInputReadiness } from '@atlas/ui';

const SAMPLE: RawTaxInputReadiness = {
  competence: '2026-09',
  tradeClassificationStatus: 'UNKNOWN',
  withholdingStatus: 'MISSING',
  fiiMetadataStatus: 'MISSING',
  issues: [
    'UNKNOWN_TRADE_CLASSIFICATION',
    'MISSING_WITHHOLDING_INPUT',
    'MISSING_FII_ELIGIBILITY_METADATA',
  ],
  capabilities: {
    tradeClassificationComplete: false,
    withholdingComplete: false,
    fiiMetadataComplete: false,
  },
  classificationCoverage: { required: 1, classified: 0, unknown: 1 },
  provenanceReferences: [],
  rows: [
    {
      key: 'tradeClassification',
      label: 'Classificação de operações',
      status: 'UNKNOWN',
      available: false,
    },
    { key: 'withholding', label: 'Retenções/IRRF', status: 'MISSING', available: false },
    { key: 'fiiMetadata', label: 'Dados fiscais de FII', status: 'MISSING', available: false },
  ],
  productionTaxLiabilityEnabled: false,
};

describe('UI: Tax input readiness view-model (Phase 4B.2)', () => {
  it('returns null for null input', () => {
    expect(mapToTaxInputReadinessViewModel(null)).toBeNull();
  });

  it('maps readiness rows with human labels', () => {
    const vm = mapToTaxInputReadinessViewModel(SAMPLE)!;
    expect(vm.competenceLabel).toBe('09/2026');
    expect(vm.rows).toHaveLength(3);
    expect(vm.rows[0]!.statusLabel).toBe('Desconhecido');
    expect(vm.rows[1]!.statusLabel).toBe('Ausente');
    expect(vm.productionTaxLiabilityEnabled).toBe(false);
  });

  it('translates issues to human labels', () => {
    const vm = mapToTaxInputReadinessViewModel(SAMPLE)!;
    expect(vm.issueLabels).toContain('Classificação de operações desconhecida');
    expect(vm.issueLabels).toContain('Retenção/IRRF ausente');
    expect(vm.issueLabels).toContain('Dados fiscais de FII incompletos');
  });

  it('maps NOT_REQUIRED to a neutral non-alarming state', () => {
    const vm = mapToTaxInputReadinessViewModel({
      ...SAMPLE,
      tradeClassificationStatus: 'NOT_REQUIRED',
      withholdingStatus: 'NOT_REQUIRED',
      fiiMetadataStatus: 'NOT_REQUIRED',
      issues: [],
      rows: [
        {
          key: 'tradeClassification',
          label: 'Classificação de operações',
          status: 'NOT_REQUIRED',
          available: true,
        },
        { key: 'withholding', label: 'Retenções/IRRF', status: 'NOT_REQUIRED', available: true },
        {
          key: 'fiiMetadata',
          label: 'Dados fiscais de FII',
          status: 'NOT_REQUIRED',
          available: true,
        },
      ],
    })!;
    expect(vm.rows.every((r) => r.statusLabel === 'Não aplicável')).toBe(true);
  });

  it('contains no tax arithmetic', () => {
    const vm = mapToTaxInputReadinessViewModel(SAMPLE)!;
    expect(JSON.stringify(vm)).not.toMatch(/parseFloat|Math\.|taxDue/);
  });
});
