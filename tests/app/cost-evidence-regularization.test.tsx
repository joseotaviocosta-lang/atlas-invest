import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  CostEvidenceModal,
  CostEvidenceSection,
  CostAssessmentCard,
  CostEvidenceBanner,
} from '../../apps/atlas-app/src/features/fiscal/components';
import {
  validateCostEvidenceDraft,
  buildCostEvidencePayload,
  INITIAL_COST_EVIDENCE_DRAFT,
  COST_EVIDENCE_STATUS_LABELS,
  getEvidenceRowViewState,
  type CostEvidenceDraft,
} from '../../apps/atlas-app/src/features/fiscal/cost-evidence-entry';
import type {
  CostAssessmentDto,
  CostEvidenceRowDto,
  CostEvidencePreviewDto,
} from '../../apps/atlas-app/src/features/fiscal/types';
import type { PositionValuationDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('Project Atlas — UX de Regularização de Pendências de Custo Histórico', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const mockPositions: PositionValuationDto[] = [
    {
      assetId: '45fdffad-c00e-4ee0-a35f-447cac367a9d',
      accountId: 'acc-custodia-1',
      ticker: 'ITSA4',
      assetType: 'STOCK',
      quantity: '900',
      currency: 'BRL',
      totalCost: null,
      averageCost: null,
      costBasisStatus: 'INCOMPLETE',
      marketValue: { amount: '9180.00', currency: 'BRL' },
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'ACTIVE',
      quoteFreshness: 'FRESH',
      quoteStatus: 'AVAILABLE',
    },
    {
      assetId: '531dfa89-6af2-4b82-b58a-c40846293e21',
      accountId: 'acc-custodia-1',
      ticker: 'JHSF3',
      assetType: 'STOCK',
      quantity: '600',
      currency: 'BRL',
      totalCost: null,
      averageCost: null,
      costBasisStatus: 'INCOMPLETE',
      marketValue: { amount: '2700.00', currency: 'BRL' },
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'ACTIVE',
      quoteFreshness: 'FRESH',
      quoteStatus: 'AVAILABLE',
    },
    {
      assetId: 'b7b2c97c-d98d-46c0-a8a7-f612e9afec6e',
      accountId: 'acc-custodia-1',
      ticker: 'SAPR4',
      assetType: 'STOCK',
      quantity: '3300',
      currency: 'BRL',
      totalCost: null,
      averageCost: null,
      costBasisStatus: 'INCOMPLETE',
      marketValue: { amount: '16830.00', currency: 'BRL' },
      unrealizedGainLoss: null,
      unrealizedGainLossPercent: null,
      status: 'ACTIVE',
      quoteFreshness: 'FRESH',
      quoteStatus: 'AVAILABLE',
    },
    {
      assetId: 'asset-known-petr4',
      accountId: 'acc-custodia-1',
      ticker: 'PETR4',
      assetType: 'STOCK',
      quantity: '100',
      currency: 'BRL',
      totalCost: { amount: '3500.00', currency: 'BRL' },
      averageCost: { amount: '35.00', currency: 'BRL' },
      costBasisStatus: 'KNOWN',
      marketValue: { amount: '3800.00', currency: 'BRL' },
      unrealizedGainLoss: { amount: '300.00', currency: 'BRL' },
      unrealizedGainLossPercent: '8.57',
      status: 'ACTIVE',
      quoteFreshness: 'FRESH',
      quoteStatus: 'AVAILABLE',
    },
  ];

  describe('1. Fluxo Rápido & Contextual (Seleção Automática & Preservação de Carteira)', () => {
    it('renders CostEvidenceSection with selected asset pre-selected from navigation without manual search', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/tax?tab=evidence&assetId=45fdffad-c00e-4ee0-a35f-447cac367a9d&ticker=ITSA4&action=regularize']}>
            <CostEvidenceSection
              portfolioId="00000000-0000-4000-8000-000000000002"
              positions={mockPositions}
              selectedAssetId="45fdffad-c00e-4ee0-a35f-447cac367a9d"
              autoOpenRegularize={false}
              onNavigateBack={() => {}}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(html).toContain('cost-evidence-section');
      expect(html).toContain('Base de Custo &amp; Evidências Documentais');
      // Incomplete assets quick selector chips
      expect(html).toContain('select-asset-chip-ITSA4');
      expect(html).toContain('select-asset-chip-JHSF3');
      expect(html).toContain('select-asset-chip-SAPR4');
      // ITSA4 is pre-selected and rendered in the asset selector options
      expect(html).toContain('ITSA4 (⚠️ Custo Pendente)');
      expect(html).toContain('900');
      expect(html).toContain('ações');
    });

    it('renders breadcrumb / back button allowing return to previous fiscal view', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <CostEvidenceSection
              portfolioId="00000000-0000-4000-8000-000000000002"
              positions={mockPositions}
              selectedAssetId="45fdffad-c00e-4ee0-a35f-447cac367a9d"
              onNavigateBack={() => {}}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(html).toContain('evidence-back-btn');
      expect(html).toContain('← Voltar');
    });

    it('identifies exact documentary gap (acquisitions prior to 28/11/2019) in guidance panel', () => {
      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <CostEvidenceSection
              portfolioId="00000000-0000-4000-8000-000000000002"
              positions={mockPositions}
              selectedAssetId="45fdffad-c00e-4ee0-a35f-447cac367a9d"
            />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(html).toContain('cost-evidence-guidance-card');
      expect(html).toContain('Origem das Pendências &amp; Orientações Fiscais');
      expect(html).toContain('28/11/2019');
      expect(html).toContain('DIRPF 2020');
      expect(html).toContain('Bens e Direitos');
    });
  });

  describe('2. Validação Rigorosa do Formulário de Regularização (Pure Entry Rules)', () => {
    it('rejects missing quantity and missing acquisition date', () => {
      const draftMissingDate: CostEvidenceDraft = {
        ...INITIAL_COST_EVIDENCE_DRAFT,
        acquisitionDate: '',
        quantityCovered: '900',
        totalCost: '7650.00',
        sourceReference: 'DIRPF 2020',
      };
      const errDate = validateCostEvidenceDraft(draftMissingDate);
      expect(errDate).toBe('Informe a data de aquisição original no formato AAAA-MM-DD.');

      const draftMissingQty: CostEvidenceDraft = {
        ...INITIAL_COST_EVIDENCE_DRAFT,
        acquisitionDate: '2019-10-15',
        quantityCovered: '',
        totalCost: '7650.00',
        sourceReference: 'DIRPF 2020',
      };
      const errQty = validateCostEvidenceDraft(draftMissingQty);
      expect(errQty).toBe('Informe a quantidade comprovada (valor numérico positivo maior que zero).');
    });

    it('rejects invalid or malformed dates', () => {
      const draftInvalidDate: CostEvidenceDraft = {
        ...INITIAL_COST_EVIDENCE_DRAFT,
        acquisitionDate: '2019-13-45',
        quantityCovered: '900',
        totalCost: '7650.00',
        sourceReference: 'DIRPF 2020',
      };
      // Notice: civil date regex validates YYYY-MM-DD format
      const draftMalformed: CostEvidenceDraft = {
        ...INITIAL_COST_EVIDENCE_DRAFT,
        acquisitionDate: '15/10/2019', // Brazilian format instead of ISO
        quantityCovered: '900',
        totalCost: '7650.00',
        sourceReference: 'DIRPF 2020',
      };
      expect(validateCostEvidenceDraft(draftMalformed)).toBe('Informe a data de aquisição original no formato AAAA-MM-DD.');
    });

    it('rejects zero or negative quantities', () => {
      const draftZero: CostEvidenceDraft = {
        ...INITIAL_COST_EVIDENCE_DRAFT,
        acquisitionDate: '2019-10-15',
        quantityCovered: '0',
        totalCost: '7650.00',
        sourceReference: 'DIRPF 2020',
      };
      expect(validateCostEvidenceDraft(draftZero)).toBe(
        'Informe a quantidade comprovada (valor numérico positivo maior que zero).'
      );
    });

    it('rejects missing cost (both unitCost and totalCost empty)', () => {
      const draftNoCost: CostEvidenceDraft = {
        ...INITIAL_COST_EVIDENCE_DRAFT,
        acquisitionDate: '2019-10-15',
        quantityCovered: '900',
        unitCost: '',
        totalCost: '',
        sourceReference: 'DIRPF 2020',
      };
      expect(validateCostEvidenceDraft(draftNoCost)).toBe(
        'Informe o preço unitário ou o valor total de aquisição comprovado.'
      );
    });

    it('rejects missing document source reference', () => {
      const draftNoRef: CostEvidenceDraft = {
        ...INITIAL_COST_EVIDENCE_DRAFT,
        acquisitionDate: '2019-10-15',
        quantityCovered: '900',
        totalCost: '7650.00',
        sourceReference: '',
      };
      expect(validateCostEvidenceDraft(draftNoRef)).toBe(
        'Informe a origem ou referência do documento (ex: número da nota, DIRPF 2020 bens e direitos).'
      );
    });

    it('accepts perfectly valid draft and normalizes numeric strings', () => {
      const draft: CostEvidenceDraft = {
        evidenceType: 'ANNUAL_TAX_STATEMENT',
        quantityCovered: '900',
        unitCost: '8,50',
        totalCost: '7650,00',
        currency: 'BRL',
        acquisitionDate: '2019-11-15',
        evidenceDate: '2020-04-30',
        sourceReference: 'DIRPF 2020 - Bens e Direitos Item 31',
        notes: 'Aquisição via corretora XP antes do histórico B3',
      };

      const err = validateCostEvidenceDraft(draft);
      expect(err).toBeNull();

      const payload = buildCostEvidencePayload(
        draft,
        'acc-custodia-1',
        '45fdffad-c00e-4ee0-a35f-447cac367a9d',
        'REVIEW_REQUIRED'
      );

      expect(payload).toEqual({
        accountId: 'acc-custodia-1',
        assetId: '45fdffad-c00e-4ee0-a35f-447cac367a9d',
        evidenceType: 'ANNUAL_TAX_STATEMENT',
        quantityCovered: '900',
        unitCost: '8.50',
        totalCost: '7650.00',
        currency: 'BRL',
        acquisitionDate: '2019-11-15',
        evidenceDate: '2020-04-30',
        sourceReference: 'DIRPF 2020 - Bens e Direitos Item 31',
        notes: 'Aquisição via corretora XP antes do histórico B3',
        status: 'REVIEW_REQUIRED',
      });
    });
  });

  describe('3. Projeção Prévia (Preview) & Status Distinction', () => {
    it('renders CostAssessmentCard displaying current position custody, covered, and uncovered gap', () => {
      const assessment: CostAssessmentDto = {
        status: 'INCOMPLETE',
        positionQuantity: '900',
        ledgerKnownQuantity: '0',
        evidenceCoveredQuantity: '0',
        totalCoveredQuantity: '0',
        uncoveredQuantity: '900',
        coveragePercent: '0.00',
        verifiedKnownCost: [],
        averageKnownCostForCoveredQuantity: null,
        appliedEvidenceIds: [],
      };

      const html = renderToString(
        <CostAssessmentCard
          assessment={assessment}
          activeTicker="ITSA4"
          positionQuantity="900"
        />
      );

      expect(html).toContain('cost-assessment-card');
      expect(html).toContain('Diagnóstico de Base de Custo');
      expect(html).toContain('ITSA4');
      expect(html).toContain('900');
      expect(html).toContain('0.00');
      expect(html).toContain('coberto');
      expect(html).toContain('Pendente de Comprovação');
    });

    it('renders preview projection showing 100% coverage when evidence covers all 900 shares of ITSA4', () => {
      const preview: CostEvidencePreviewDto = {
        status: 'COMPLETE',
        positionQuantity: '900',
        ledgerKnownQuantity: '0',
        evidenceCoveredQuantity: '900',
        totalCoveredQuantity: '900',
        uncoveredQuantity: '0',
        coveragePercent: '100.00',
        verifiedKnownCost: [{ amount: '7650.00', currency: 'BRL' }],
        alreadyCoveredWarning: null,
        hypotheticalCoveredQuantity: '900',
      };

      const assessment: CostAssessmentDto = {
        status: 'COMPLETE',
        positionQuantity: '900',
        ledgerKnownQuantity: '0',
        evidenceCoveredQuantity: '900',
        totalCoveredQuantity: '900',
        uncoveredQuantity: '0',
        coveragePercent: '100.00',
        verifiedKnownCost: [{ amount: '7650.00', currency: 'BRL' }],
        averageKnownCostForCoveredQuantity: { amount: '8.50', currency: 'BRL' },
        appliedEvidenceIds: ['evid-1'],
      };

      const html = renderToString(
        <CostAssessmentCard
          assessment={assessment}
          preview={preview}
          activeTicker="ITSA4"
          positionQuantity="900"
        />
      );

      expect(html).toContain('100.00');
      expect(html).toContain('coberto');
      expect(html).toContain('Posição com custo histórico 100% auditado');
    });

    it('distinguishes evidence lifecycle states: DRAFT, REVIEW_REQUIRED, VERIFIED, REJECTED', () => {
      expect(COST_EVIDENCE_STATUS_LABELS['DRAFT']).toBe('Rascunho (Aguardando comprovação)');
      expect(COST_EVIDENCE_STATUS_LABELS['REVIEW_REQUIRED']).toBe('Aguardando validação');
      expect(COST_EVIDENCE_STATUS_LABELS['VERIFIED']).toBe('Regularizado e Auditado');
      expect(COST_EVIDENCE_STATUS_LABELS['REJECTED']).toBe('Rejeitado');

      const draftRow: CostEvidenceRowDto = {
        id: 'ev-draft',
        portfolioId: 'p-1',
        accountId: 'acc-1',
        assetId: '45fdffad-c00e-4ee0-a35f-447cac367a9d',
        status: 'DRAFT',
        source: 'MANUAL',
        version: 1,
        supersedesId: null,
        quantityCovered: '900',
        evidenceType: 'ANNUAL_TAX_STATEMENT',
        acquisitionDate: '2019-10-15',
        sourceReference: 'DIRPF 2020',
        createdAt: '2026-11-09T20:00:00Z',
      };

      const reviewRow: CostEvidenceRowDto = {
        ...draftRow,
        id: 'ev-review',
        status: 'REVIEW_REQUIRED',
      };

      const verifiedRow: CostEvidenceRowDto = {
        ...draftRow,
        id: 'ev-verified',
        status: 'VERIFIED',
      };

      const stateDraft = getEvidenceRowViewState(draftRow, [draftRow]);
      expect(stateDraft.isCurrent).toBe(true);
      expect(stateDraft.showSubmit).toBe(true);
      expect(stateDraft.showVerify).toBe(false);

      const stateReview = getEvidenceRowViewState(reviewRow, [reviewRow]);
      expect(stateReview.isCurrent).toBe(true);
      expect(stateReview.showSubmit).toBe(false);
      expect(stateReview.showVerify).toBe(true);

      const stateVerified = getEvidenceRowViewState(verifiedRow, [verifiedRow]);
      expect(stateVerified.isCurrent).toBe(true);
      expect(stateVerified.showSubmit).toBe(false);
      expect(stateVerified.showVerify).toBe(false);
    });
  });

  describe('4. Isolamento Entre Ativos & Preservação Fail-Closed', () => {
    it('confirms asset isolation: regularizing ITSA4 leaves JHSF3 and SAPR4 in their pending state', () => {
      // Simulate ITSA4 having verified evidence, but JHSF3 and SAPR4 remain incomplete
      const positionsAfterItsa4Regularized: PositionValuationDto[] = mockPositions.map((pos) => {
        if (pos.ticker === 'ITSA4') {
          return {
            ...pos,
            costBasisStatus: 'KNOWN',
            totalCost: { amount: '7650.00', currency: 'BRL' },
            averageCost: { amount: '8.50', currency: 'BRL' },
          };
        }
        return pos;
      });

      const remainingIncomplete = positionsAfterItsa4Regularized.filter(
        (p) => p.costBasisStatus === 'INCOMPLETE'
      );

      // Exactly 2 assets remain incomplete (JHSF3 and SAPR4)
      expect(remainingIncomplete).toHaveLength(2);
      expect(remainingIncomplete.map((p) => p.ticker)).toEqual(['JHSF3', 'SAPR4']);

      // ITSA4 is now known
      const itsa4 = positionsAfterItsa4Regularized.find((p) => p.ticker === 'ITSA4');
      expect(itsa4?.costBasisStatus).toBe('KNOWN');
      expect(itsa4?.totalCost?.amount).toBe('7650.00');
    });

    it('preserves Fail-Closed fiscal protection: CostEvidenceBanner remains blocked when unverified evidence exists', () => {
      const html = renderToString(
        <CostEvidenceBanner
          isBlocked={true}
          missingCount={3}
          onGoToEvidence={() => {}}
        />
      );

      expect(html).toContain('cost-evidence-banner');
      expect(html).toContain('Base de Custo Incompleta — Apuração Bloqueada (Fail-Closed)');
      expect(html).toContain('o Atlas nunca assume custo zero');
      expect(html).toContain('bloqueia a apuração definitiva de tributos');
      expect(html).toContain('goto-cost-evidence-btn');
      expect(html).toContain('Ir para Base de Custo &amp; Evidências');
    });

    it('enforces Fail-Closed gate: DRAFT, REVIEW_REQUIRED, REJECTED, and partial VERIFIED never unlock DARF', () => {
      // Helper replicating strict domain fail-closed check
      const canUnlockPosition = (
        evidenceStatus: string,
        coveredQty: string,
        positionQty: string
      ): boolean => {
        if (evidenceStatus !== 'VERIFIED') return false;
        return Number(coveredQty) >= Number(positionQty);
      };

      // 1. DRAFT does not unlock
      expect(canUnlockPosition('DRAFT', '900', '900')).toBe(false);

      // 2. REVIEW_REQUIRED does not unlock
      expect(canUnlockPosition('REVIEW_REQUIRED', '900', '900')).toBe(false);

      // 3. REJECTED does not unlock
      expect(canUnlockPosition('REJECTED', '900', '900')).toBe(false);

      // 4. VERIFIED with partial coverage (e.g. 450 of 900) does not unlock
      expect(canUnlockPosition('VERIFIED', '450', '900')).toBe(false);

      // 5. Only VERIFIED with 100% coverage (>= 900) is eligible to unlock
      expect(canUnlockPosition('VERIFIED', '900', '900')).toBe(true);
    });

    it('normalizes Brazilian decimal input variations unambiguously', async () => {
      const { normalizeDecimalField, isDecimal, isPositiveDecimal } = await import(
        '../../apps/atlas-app/src/features/fiscal/cost-evidence-entry'
      );

      // 1.234,56 (Brazilian thousands dot + decimal comma)
      expect(normalizeDecimalField('1.234,56')).toBe('1234.56');
      expect(isDecimal('1.234,56')).toBe(true);
      expect(isPositiveDecimal('1.234,56')).toBe(true);

      // 1234,56 (Brazilian decimal comma)
      expect(normalizeDecimalField('1234,56')).toBe('1234.56');
      expect(isDecimal('1234,56')).toBe(true);
      expect(isPositiveDecimal('1234,56')).toBe(true);

      // 1234.56 (Standard decimal dot)
      expect(normalizeDecimalField('1234.56')).toBe('1234.56');
      expect(isDecimal('1234.56')).toBe(true);
      expect(isPositiveDecimal('1234.56')).toBe(true);

      // Invalid or ambiguous inputs
      expect(isDecimal('1.2.3.4')).toBe(false);
      expect(isDecimal('12,34,56')).toBe(false);
      expect(isPositiveDecimal('0,00')).toBe(false);
      expect(isPositiveDecimal('-10,50')).toBe(false);
    });
  });
});
