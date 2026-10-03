import { describe, expect, it } from 'vitest';
import {
  annualTaxReportingQueryKey,
  mapReportingPackageToViewModel,
  mapReportingItemToVM,
  type AnnualTaxReportingPackage,
  type AnnualTaxReportingItem,
} from '../../packages/ui/src/view-models/annual-tax-reporting.view-model';

describe('UI View Model: Annual Tax Reporting & Declaration Preparation (Phase 4H.6)', () => {
  it('A. produces canonical query key', () => {
    const key = annualTaxReportingQueryKey(2025);
    expect(key).toEqual(['annual-tax-reporting', 2025]);
  });

  it('B. formats READY status view model', () => {
    const rawItem: AnnualTaxReportingItem = {
      reportingItemId: 'rep_bens_asset_petr4',
      section: 'BENS_E_DIREITOS',
      category: 'ACOES_BENS_E_DIREITOS',
      officialMappingCode: '03-01',
      officialMappingLabel: 'Ações (inclusive as listadas em bolsa)',
      mappingStatus: 'OFFICIAL',
      description: 'PETR4 - Quantidade: 100 | Custo de Aquisição: R$ 3500.00',
      assetId: 'asset_petr4',
      ticker: 'PETR4',
      costBasis: '3500.00',
      openingCostBasis: '3000.00',
      closingCostBasis: '3500.00',
      openingQuantity: '100',
      closingQuantity: '100',
      currency: 'BRL',
      reportingStatus: 'READY',
      isBlocked: false,
      blockingReasons: [],
      sourceReferences: ['asset:asset_petr4'],
      sourceFingerprint: 'fp_item_1',
      ruleVersion: '2026.1',
    };

    const raw: AnnualTaxReportingPackage = {
      taxSubjectId: 'user-1',
      calendarYear: 2025,
      declarationExercise: 2026,
      overallStatus: 'READY',
      isReadyForReporting: true,
      reportingRuleVersion: '2026.1',
      generatedAt: '2026-10-03T17:00:00.000Z',
      sections: [
        {
          section: 'BENS_E_DIREITOS',
          title: 'Bens e Direitos',
          status: 'READY',
          isComplete: true,
          itemCount: 1,
          items: [rawItem],
          blockingReasons: [],
        },
      ],
      blockedItems: [],
      pendingConfirmations: [],
      packageFingerprint: 'fp_pkg_1',
      disclaimer: 'DISCLAIMER TEST',
    };

    const vm = mapReportingPackageToViewModel(raw);
    expect(vm.calendarYear).toBe(2025);
    expect(vm.declarationExercise).toBe(2026);
    expect(vm.overallStatusLabel).toBe('Pronto p/ Declaração');
    expect(vm.overallStatusVariant).toBe('success');
    expect(vm.isReadyForReporting).toBe(true);
    expect(vm.sections).toHaveLength(1);
    expect(vm.sections[0]?.items).toHaveLength(1);
    expect(vm.totalItemCount).toBe(1);
    expect(vm.totalBlockedCount).toBe(0);
  });

  it('C. formats PROVISIONAL 2026+ rule items', () => {
    const rawItem: AnnualTaxReportingItem = {
      reportingItemId: 'rep_div_2026',
      section: 'RENDIMENTOS_EXCLUSIVOS',
      category: 'DIVIDENDOS_TRIBUTADOS_2026',
      officialMappingCode: 'PROV_DIV_EXCLUSIVO',
      officialMappingLabel: 'Dividendos com Retenção Exclusiva na Fonte (Lei 15.270/2025)',
      mappingStatus: 'PROVISIONAL',
      description: 'PETROBRAS - Proventos 2026',
      grossAmount: '60000.00',
      withheldAmount: '6000.00',
      netAmount: '54000.00',
      currency: 'BRL',
      reportingStatus: 'READY',
      isBlocked: false,
      blockingReasons: [],
      sourceReferences: ['payer:PETR4'],
      sourceFingerprint: 'fp_prov',
      ruleVersion: '2026.1',
    };

    const vmItem = mapReportingItemToVM(rawItem);
    expect(vmItem.mappingStatus).toBe('PROVISIONAL');
    expect(vmItem.mappingStatusLabel).toBe('Regra Provisória (2026+)');
    expect(vmItem.mappingStatusVariant).toBe('warning');
  });

  it('D. formats BLOCKED status view model with blocked items count', () => {
    const blockedItem: AnnualTaxReportingItem = {
      reportingItemId: 'rep_bens_unv',
      section: 'BENS_E_DIREITOS',
      category: 'ACOES_BENS_E_DIREITOS',
      officialMappingCode: '03-01',
      officialMappingLabel: 'Ações',
      mappingStatus: 'OFFICIAL',
      description: 'UNV3 - Posição com Custo Incompleto',
      currency: 'BRL',
      reportingStatus: 'BLOCKED',
      isBlocked: true,
      blockingReasons: ['INCOMPLETE_COST_BASIS'],
      sourceReferences: [],
      sourceFingerprint: 'fp_blocked',
      ruleVersion: '2026.1',
    };

    const raw: AnnualTaxReportingPackage = {
      taxSubjectId: 'user-1',
      calendarYear: 2025,
      declarationExercise: 2026,
      overallStatus: 'BLOCKED',
      isReadyForReporting: false,
      reportingRuleVersion: '2026.1',
      generatedAt: '2026-10-03T17:00:00.000Z',
      sections: [
        {
          section: 'BENS_E_DIREITOS',
          title: 'Bens e Direitos',
          status: 'BLOCKED',
          isComplete: false,
          itemCount: 1,
          items: [blockedItem],
          blockingReasons: ['INCOMPLETE_COST_BASIS'],
        },
      ],
      blockedItems: [blockedItem],
      pendingConfirmations: [],
      packageFingerprint: 'fp_pkg_blocked',
      disclaimer: 'DISCLAIMER TEST',
    };

    const vm = mapReportingPackageToViewModel(raw);
    expect(vm.overallStatusLabel).toBe('Bloqueado');
    expect(vm.overallStatusVariant).toBe('danger');
    expect(vm.isReadyForReporting).toBe(false);
    expect(vm.totalBlockedCount).toBe(1);
    expect(vm.blockedItems).toHaveLength(1);
  });
});
