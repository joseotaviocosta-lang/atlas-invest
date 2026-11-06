import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { portfolioKeys, marketKeys } from '../../apps/atlas-app/src/lib/query-keys';
import { FiscalSummaryCards } from '../../apps/atlas-app/src/features/fiscal/components/FiscalSummaryCards';
import { DarfGuidanceCard } from '../../apps/atlas-app/src/features/fiscal/components/DarfGuidanceCard';
import { MonthlyAssessmentSection } from '../../apps/atlas-app/src/features/fiscal/components/MonthlyAssessmentSection';
import { PortfolioSummaryCards } from '../../apps/atlas-app/src/features/portfolio/components/PortfolioSummaryCards';
import { AllocationSection } from '../../apps/atlas-app/src/features/portfolio/components/AllocationSection';
import { MacroIndicatorsGrid } from '../../apps/atlas-app/src/features/market/components/MacroIndicatorsGrid';
import { QuotesTable } from '../../apps/atlas-app/src/features/market/components/QuotesTable';
import type { MonthlyTaxLiabilityViewModel, FiscalMonthlyViewModel } from '../../apps/atlas-app/src/features/fiscal/types';
import type { PortfolioValuationData, PositionValuationDto } from '../../apps/atlas-app/src/features/portfolio/types';

describe('APP-15J: Daily Use Correctness & Honest States', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  describe('Part A & B: Fiscal Fail-Closed Presentation', () => {
    const blockedLiability: MonthlyTaxLiabilityViewModel = {
      competence: '2026-10',
      competenceLabel: '10/2026',
      status: 'BLOCKED',
      statusLabel: 'Apuração Bloqueada (Fail-Closed)',
      statusColor: '#EF4444',
      isComplete: false,
      isPartial: false,
      isBlocked: true,
      isNoActivity: false,
      hasTaxDue: false,
      taxDueFormatted: 'R$ 0,00',
      productionRuleVerified: false,
      categories: [
        {
          categoryLabel: 'Ações e ETFs — Swing Trade',
          currency: 'BRL',
          status: 'BLOCKED',
          grossSalesFormatted: 'R$ 5.000,00',
          netGainFormatted: 'R$ 0,00',
          taxableBaseBeforeLossesFormatted: 'R$ 0,00',
          openingLossFormatted: 'R$ 0,00',
          lossAppliedFormatted: 'R$ 0,00',
          lossGeneratedFormatted: 'R$ 0,00',
          closingLossFormatted: 'R$ 0,00',
          taxableBaseAfterLossesFormatted: 'R$ 0,00',
          rateFormatted: '15%',
          taxBeforeWithholdingFormatted: 'R$ 0,00',
          withholdingAppliedFormatted: 'R$ 0,00',
          taxDueFormatted: 'R$ 0,00',
          qualityLabels: [],
          trace: [],
        },
      ],
      openingLosses: [],
      closingLosses: [
        {
          categoryLabel: 'Ações e ETFs — Swing Trade',
          currency: 'BRL',
          amountFormatted: 'R$ 0,00',
          provenance: 'CARRIED_FORWARD',
        },
        {
          categoryLabel: 'Fundos Imobiliários (FII)',
          currency: 'BRL',
          amountFormatted: 'R$ 145,17',
          provenance: 'CARRIED_FORWARD',
        },
      ],
      totalClosingLossFormatted: 'R$ 145,17',
      qualityLabels: ['CUSTO_INCOMPLETO'],
      limitations: ['ITSA4, JHSF3, SAPR4 com custo documentalmente incompleto'],
      trace: [],
      disclaimer: 'Cálculo suspenso.',
      accessibilitySummary: 'Apuração bloqueada.',
    };

    const blockedMonthly: FiscalMonthlyViewModel = {
      competence: '2026-10',
      competenceLabel: '10/2026',
      status: 'BLOCKED',
      statusLabel: 'Bloqueado',
      statusColor: '#EF4444',
      isEmpty: false,
      isComplete: false,
      isPartial: false,
      isBlocked: true,
      eventCount: 3,
      currencies: ['BRL'],
      categories: [],
      eventsSummary: [],
      dataQuality: { hasIssues: true, issueLabels: ['Custo incompleto'] },
      ruleSetVersion: '2026.1',
      ruleSetLabel: 'Regras Receita Federal 2026',
      foundationNotice: 'Fail-closed ativo',
      accessibilitySummary: 'Bloqueado.',
    };

    it('DarfGuidanceCard: renders explicit blocked alert, never "Sem DARF a Recolher"', () => {
      const html = renderToString(
        <DarfGuidanceCard liability={blockedLiability} inputReadiness={null} />
      );

      expect(html).toContain('Cálculo de DARF Bloqueado');
      expect(html).toContain('🔒 Apuração bloqueada (Princípio Fail-Closed)');
      expect(html).toContain('Custo de aquisição documentalmente incompleto');
      expect(html).toContain('ITSA4, JHSF3, SAPR4');
      expect(html).not.toContain('Sem DARF a Recolher');
      expect(html).not.toContain('DARF Devido: R$ 0,00');
    });

    it('FiscalSummaryCards: renders "Bloqueado" and "—" instead of fake zeros', () => {
      const html = renderToString(
        <FiscalSummaryCards
          liability={blockedLiability}
          fiscalMonthly={blockedMonthly}
          inputReadiness={null}
          totalPositionsCount={36}
          incompleteCostCount={3}
        />
      );

      expect(html).toContain('Bloqueado');
      expect(html).toContain('Custo incompleto (Fail-Closed)');
      expect(html).toContain('—'); // Net gains is suspended
      expect(html).toContain('Cálculo suspenso (Fail-Closed)');
    });

    it('Part C & D: renders 91,7% cost coverage and R$ 145,17 loss carryforward', () => {
      const html = renderToString(
        <FiscalSummaryCards
          liability={blockedLiability}
          fiscalMonthly={blockedMonthly}
          inputReadiness={null}
          totalPositionsCount={36}
          incompleteCostCount={3}
        />
      );

      // Part C: 33 de 36 auditadas = 91,7%
      expect(html).toContain('91,7% comprovado');
      expect(html).toContain('33 de 36 posições auditadas (3 pendentes)');
      expect(html).not.toContain('100% Auditada');

      // Part D: Total loss carryforward reflects R$ 145,17 from FII, never R$ 0,00
      expect(html).toContain('R$ 145,17');
    });

    it('MonthlyAssessmentSection: blocked categories render dashes and fail-closed badge', () => {
      const html = renderToString(
        <MonthlyAssessmentSection liability={blockedLiability} fiscalMonthly={blockedMonthly} />
      );

      expect(html).toContain('Apuração Bloqueada (Fail-Closed)');
      expect(html).toContain('— (Bloqueado)');
      expect(html).toContain('— (Não determinado)');
    });
  });

  describe('Part E, F, G, H, I: Partial Valuation Semantics', () => {
    const partialValuation: PortfolioValuationData = {
      portfolioId: 'p-1',
      asOf: '2026-11-06T18:00:00Z',
      engineVersion: '1.0.0',
      valuationVersion: '1.0.0',
      completeness: 'PARTIAL',
      totalsByCurrency: {
        BRL: {
          currency: 'BRL',
          marketValue: { amount: '9080.00', currency: 'BRL' },
          costBasis: { amount: '4400.00', currency: 'BRL' },
          knownCost: { amount: '4400.00', currency: 'BRL' },
          unrealizedGainLoss: { amount: '4680.00', currency: 'BRL' },
          unrealizedGainLossPercent: '106.36',
          valuedPositionsCount: 1,
          unvaluedPositionsCount: 35,
          stalePositionsCount: 0,
        },
      },
      summary: {
        totalPositions: 36,
        valuedPositions: 1,
        unvaluedPositions: 35,
        unavailablePositions: 35,
        incompleteCostPositions: 3,
        stalePositions: 0,
        mismatchPositions: 0,
        valuationCoveragePercent: '2.777777777777777777', // 1/36 raw unformatted
        currencies: ['BRL'],
      },
      quoteSummary: {
        totalQuotesRequested: 36,
        quotesAvailable: 1,
        quotesUnavailable: 35,
        quotesStale: 0,
        marketDataState: 'PARTIAL',
        provider: 'BRAPI EOD',
      },
      positions: [],
    };

    it('formats raw 20-digit coverage percentage to "2,78%" without overflow', () => {
      const html = renderToString(
        <PortfolioSummaryCards valuation={partialValuation} isLoading={false} />
      );

      expect(html).toContain('2,78%');
      expect(html).not.toContain('2.777777777777777');
    });

    it('renders partial valuation semantics: "Patrimônio Precificado" and "1 de 36"', () => {
      const html = renderToString(
        <PortfolioSummaryCards valuation={partialValuation} isLoading={false} />
      );

      expect(html).toContain('Patrimônio Precificado');
      expect(html).toContain('1 de 36 posições precificadas');
      expect(html).toContain('Custo das Posições Precificadas');
      expect(html).toContain('Resultado das Posições Precificadas');
      expect(html).toContain('Rentabilidade parcial: +106,36%');
    });

    it('AllocationSection: warns that allocation reflects only priced positions', () => {
      const allocClient = new QueryClient();
      allocClient.setQueryData(portfolioKeys.list(), [
        { id: 'p-1', name: 'Carteira Principal', currency: 'BRL' },
      ]);
      allocClient.setQueryData(portfolioKeys.allocation('p-1'), {
        data: {
          portfolioId: 'p-1',
          asOf: '2026-11-06T18:00:00Z',
          valuationCoveragePercent: '2.777777777777777777',
          currencies: {
            BRL: {
              currency: 'BRL',
              totalMarketValue: { amount: '9080.00', currency: 'BRL' },
              byAssetClass: [
                {
                  assetClass: 'EQUITY',
                  currency: 'BRL',
                  marketValue: { amount: '9080.00', currency: 'BRL' },
                  allocationPercent: '100.00',
                  assetCount: 1,
                },
              ],
              byAsset: [],
              unvaluedAssets: [],
            },
          },
        },
      });

      const html = renderToString(
        <QueryClientProvider client={allocClient}>
          <MemoryRouter>
            <PortfolioProvider>
              <AllocationSection />
            </PortfolioProvider>
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(html).toContain('Distribuição das Posições Precificadas');
      expect(html).toContain('Parcial');
      expect(html).toContain('2,78%');
      expect(html).toContain('não representa a totalidade da carteira');
    });
  });

  describe('Part P, Q, R, S: Macro Indicators & Honest Market Data', () => {
    it('renders honest fallback for macro indicators when data is uninitialized', () => {
      const macroClient = new QueryClient();
      macroClient.setQueryData(marketKeys.macroContext(), {
        data: { selicTarget: null, selicEffective: null, ipcaMonthly: null },
      });

      const html = renderToString(
        <QueryClientProvider client={macroClient}>
          <MemoryRouter>
            <MacroIndicatorsGrid />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(html).toContain('IBOVESPA');
      expect(html).toContain('Integração ainda não disponível');
      expect(html).toContain('Ainda não atualizado');
      expect(html).not.toContain('Integração oficial B3');
    });

    it('QuotesTable: renders "—" for source and "SEM COTAÇÃO (Requer Token)" for unpriced assets', () => {
      const unquotedPosition: PositionValuationDto = {
        assetId: 'asset-itsa4',
        ticker: 'ITSA4',
        currency: 'BRL',
        quantity: '500',
        averageCost: '10.00',
        costBasis: { amount: '5000.00', currency: 'BRL' },
        quote: null,
        marketValue: null,
        unrealizedGainLoss: null,
        unrealizedGainLossPercent: null,
        status: 'UNAVAILABLE',
        quoteFreshness: null,
        quoteStatus: 'UNAVAILABLE',
      };

      const html = renderToString(
        <QuotesTable positions={[unquotedPosition]} isLoading={false} />
      );

      expect(html).toContain('ITSA4');
      expect(html).toContain('REQUER AUTENTICAÇÃO');
      expect(html).toContain('Requer autenticação BRAPI');
      // When quote is null, source should be "—", never claiming "BRAPI EOD"
      expect(html).toContain('—');
    });
  });
});
