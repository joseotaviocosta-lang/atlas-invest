import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../apps/atlas-app/src/providers/AuthProvider';
import { PortfolioProvider } from '../../apps/atlas-app/src/providers/PortfolioProvider';
import { TaxRoute } from '../../apps/atlas-app/src/routes/TaxRoute';
import { FiscalSummaryCards } from '../../apps/atlas-app/src/features/fiscal/components/FiscalSummaryCards';
import { CostEvidenceBanner } from '../../apps/atlas-app/src/features/fiscal/components/CostEvidenceBanner';
import { DarfGuidanceCard } from '../../apps/atlas-app/src/features/fiscal/components/DarfGuidanceCard';
import { MonthlyAssessmentSection } from '../../apps/atlas-app/src/features/fiscal/components/MonthlyAssessmentSection';
import { LossCarryforwardSection } from '../../apps/atlas-app/src/features/fiscal/components/LossCarryforwardSection';
import { AnnualPositionsSection } from '../../apps/atlas-app/src/features/fiscal/components/AnnualPositionsSection';
import { AnnualIncomeSection } from '../../apps/atlas-app/src/features/fiscal/components/AnnualIncomeSection';
import { AnnualReportingExportCard } from '../../apps/atlas-app/src/features/fiscal/components/AnnualReportingExportCard';
import { fiscalKeys, portfolioKeys } from '../../apps/atlas-app/src/lib/query-keys';
import { fiscalApi } from '../../apps/atlas-app/src/features/fiscal/api';
import { queryClient, clearQueryCache } from '../../apps/atlas-app/src/lib/react-query';
import type {
  MonthlyTaxLiabilityViewModel,
  FiscalMonthlyViewModel,
  TaxInputReadinessViewModel,
  AnnualPositionReportViewModel,
  AnnualInvestmentIncomeViewModel,
  AnnualTaxReportingViewModel,
} from '../../apps/atlas-app/src/features/fiscal/types';

describe('Atlas Desktop Fiscal Workflows (APP-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearQueryCache();
  });

  // Mock view models aligned with @atlas/ui contracts
  const mockLiability: MonthlyTaxLiabilityViewModel = {
    competence: '2026-10',
    competenceLabel: '10/2026',
    status: 'COMPLETE',
    statusLabel: 'Apuração concluída',
    statusColor: '#22c55e',
    isComplete: true,
    isPartial: false,
    isBlocked: false,
    isNoActivity: false,
    hasTaxDue: true,
    taxDueFormatted: 'R$ 1.450,00',
    productionRuleVerified: true,
    categories: [
      {
        categoryLabel: 'Ações e ETFs — Swing Trade',
        currency: 'BRL',
        status: 'COMPLETE',
        grossSalesFormatted: 'R$ 45.000,00',
        netGainFormatted: 'R$ 10.000,00',
        taxableBaseBeforeLossesFormatted: 'R$ 10.000,00',
        openingLossFormatted: 'R$ 0,00',
        lossAppliedFormatted: 'R$ 0,00',
        lossGeneratedFormatted: 'R$ 0,00',
        closingLossFormatted: 'R$ 0,00',
        taxableBaseAfterLossesFormatted: 'R$ 10.000,00',
        rateFormatted: '15%',
        taxBeforeWithholdingFormatted: 'R$ 1.500,00',
        withholdingAppliedFormatted: 'R$ 50,00',
        taxDueFormatted: 'R$ 1.450,00',
        qualityLabels: [],
        trace: [],
      },
    ],
    openingLosses: [],
    closingLosses: [
      {
        categoryLabel: 'Day Trade',
        currency: 'BRL',
        amountFormatted: 'R$ 500,00',
        provenance: 'CARRIED_FORWARD',
      },
      {
        categoryLabel: 'Swing Trade',
        currency: 'BRL',
        amountFormatted: 'R$ 0,00',
        provenance: 'CARRIED_FORWARD',
      },
    ],
    qualityLabels: [],
    limitations: [],
    trace: [],
    disclaimer: 'Demonstrativo fiscal para conferência.',
    accessibilitySummary: 'Imposto devido de R$ 1.450,00.',
  };

  const mockFiscalMonthly: FiscalMonthlyViewModel = {
    competence: '2026-10',
    competenceLabel: '10/2026',
    status: 'COMPLETE',
    statusLabel: 'Concluído',
    statusColor: '#22c55e',
    isEmpty: false,
    isComplete: true,
    isPartial: false,
    isBlocked: false,
    eventCount: 5,
    currencies: ['BRL'],
    categories: [],
    eventsSummary: [],
    dataQuality: { hasIssues: false, issueLabels: [] },
    ruleSetVersion: '2026.1',
    ruleSetLabel: 'Regras Receita Federal 2026',
    foundationNotice: 'Ledger determinístico',
    accessibilitySummary: 'Mês fiscal apurado.',
  };

  const mockReadinessComplete: TaxInputReadinessViewModel = {
    isComplete: true,
    incompleteAssetsCount: 0,
    hasPendingCorporateActions: false,
    statusLabel: 'Pronto para Apuração',
    missingEvidenceMessage: undefined,
  };

  const mockReadinessIncomplete: TaxInputReadinessViewModel = {
    isComplete: false,
    incompleteAssetsCount: 2,
    hasPendingCorporateActions: false,
    statusLabel: 'Base de Custo Incompleta',
    missingEvidenceMessage: '2 ativos sem custo de aquisição comprovado.',
  };

  const mockAnnualPositions: AnnualPositionReportViewModel = {
    calendarYear: 2025,
    formattedYear: '2025',
    positions: [
      {
        assetId: 'asset-petr4',
        ticker: 'PETR4',
        categoryLabel: 'Ação',
        quantity: '100',
        totalHistoricalCost: 'R$ 3.500,00',
        formattedTotalHistoricalCost: 'R$ 3.500,00',
        averageUnitCost: 'R$ 35,00',
        formattedAverageUnitCost: 'R$ 35,00',
        openingPositionApplied: false,
        statusBadge: {
          label: 'Completo',
          color: '#22c55e',
          bg: 'rgba(34, 197, 94, 0.1)',
        },
      },
    ],
    summary: {
      totalHistoricalCostKnown: true,
      formattedTotalHistoricalCost: 'R$ 3.500,00',
      totalAssetsCount: 1,
      completePositionsCount: 1,
      blockedPositionsCount: 0,
      completenessBadge: {
        label: '100% Auditado',
        color: '#22c55e',
        bg: 'rgba(34, 197, 94, 0.1)',
      },
    },
  };

  const mockAnnualIncome: AnnualInvestmentIncomeViewModel = {
    calendarYear: 2025,
    isComplete: true,
    statusLabel: 'Auditado',
    dividends: {
      grossAmount: 'R$ 1.200,00',
      formattedGrossAmount: 'R$ 1.200,00',
      taxTreatmentLabel: 'Isento e Não Tributável',
      eventCount: 4,
    },
    jcp: {
      grossAmount: 'R$ 500,00',
      formattedGrossAmount: 'R$ 500,00',
      withheldTax: 'R$ 75,00',
      formattedWithheldTax: 'R$ 75,00',
      netAmount: 'R$ 425,00',
      formattedNetAmount: 'R$ 425,00',
      taxTreatmentLabel: 'Tributação Exclusiva (15%)',
      eventCount: 2,
    },
    fiiIncome: {
      grossAmount: 'R$ 800,00',
      formattedGrossAmount: 'R$ 800,00',
      taxTreatmentLabel: 'Rendimento Isento PF',
      eventCount: 12,
    },
    payers: [
      {
        payerId: 'payer-petr',
        payerDisplayName: 'PETROBRAS ON/PN (CNPJ 33.000.167/0001-01)',
        formattedDividendGross: 'R$ 1.200,00',
        formattedJcpGross: 'R$ 500,00',
        formattedJcpWithheld: 'R$ 75,00',
        formattedFiiIncomeGross: 'R$ 0,00',
        formattedTotalGross: 'R$ 1.700,00',
      },
    ],
  };

  const mockAnnualReporting: AnnualTaxReportingViewModel = {
    calendarYear: 2025,
    totalItemCount: 3,
    sections: [
      {
        section: 'BENS_E_DIREITOS',
        title: 'Bens e Direitos (Grupo 03 - Participações Societárias)',
        itemCount: 1,
      },
      {
        section: 'RENDIMENTOS_ISENTOS',
        title: 'Rendimentos Isentos e Não Tributáveis',
        itemCount: 1,
      },
      {
        section: 'RENDIMENTOS_EXCLUSIVOS',
        title: 'Rendimentos Sujeitos à Tributação Exclusiva/Definitiva',
        itemCount: 1,
      },
    ],
  };

  describe('1. Centralized Query Keys Hierarchy', () => {
    it('generates isolated keys for monthly, liability, positions, and evidence', () => {
      const mKey = fiscalKeys.monthly('2026-10');
      expect(mKey).toEqual(['fiscal', 'monthly', '2026-10']);

      const lKey = fiscalKeys.liability('2026-10');
      expect(lKey).toEqual(['fiscal', 'liability', '2026-10']);

      const posKey = fiscalKeys.annualPositions(2025, 'port-1');
      expect(posKey).toEqual(['fiscal', 'annual-positions', 2025, 'port-1']);

      const evKey = fiscalKeys.costEvidence('port-1');
      expect(evKey).toEqual(['fiscal', 'cost-evidence', 'port-1']);
    });
  });

  describe('2. FiscalSummaryCards Component', () => {
    it('renders KPI values accurately with liability and monthly data', () => {
      const html = renderToString(
        <FiscalSummaryCards
          liability={mockLiability}
          fiscalMonthly={mockFiscalMonthly}
          inputReadiness={mockReadinessComplete}
        />,
      );

      expect(html).toContain('R$ 1.450,00');
      expect(html).toContain('Imposto Devido / DARF');
      expect(html).toContain('R$ 10.000,00');
      expect(html).toContain('Ganhos Líquidos do Mês');
      expect(html).toContain('R$ 500,00'); // Prejuízos acumulados a compensar
      expect(html).toContain('100% Auditada');
    });

    it('renders placeholder state when data is not yet loaded', () => {
      const html = renderToString(
        <FiscalSummaryCards
          liability={null}
          fiscalMonthly={null}
          inputReadiness={null}
          isLoading={true}
        />,
      );

      expect(html).toContain('Imposto Devido / DARF');
    });
  });

  describe('3. CostEvidenceBanner & Fail-Closed Principle', () => {
    it('renders blocking alert when cost basis is incomplete', () => {
      const html = renderToString(
        <CostEvidenceBanner
          inputReadiness={mockReadinessIncomplete}
          isBlocked={true}
          missingCount={2}
        />,
      );

      expect(html).toContain('cost-evidence-banner');
      expect(html).toContain('Base de Custo Incompleta — Apuração Bloqueada (Fail-Closed)');
      expect(html).toContain('2 ativos sem comprovação documental');
    });

    it('does not render banner when cost evidence is fully verified', () => {
      const html = renderToString(
        <CostEvidenceBanner
          inputReadiness={mockReadinessComplete}
          isBlocked={false}
          missingCount={0}
        />,
      );

      expect(html).toBe('');
    });
  });

  describe('4. DarfGuidanceCard Component', () => {
    it('renders payable DARF guidance when tax is due (> R$ 10)', () => {
      const html = renderToString(
        <DarfGuidanceCard
          liability={mockLiability}
          inputReadiness={mockReadinessComplete}
        />,
      );

      expect(html).toContain('darf-guidance-card');
      expect(html).toContain('DARF 6015 Gerado');
      expect(html).toContain('Código 6015');
      expect(html).toContain('R$ 1.450,00');
    });

    it('renders accumulation notice when tax is less than R$ 10', () => {
      const accumulatedLiability: MonthlyTaxLiabilityViewModel = {
        ...mockLiability,
        taxDueFormatted: 'R$ 8,50',
        hasTaxDue: true,
      };

      const html = renderToString(
        <DarfGuidanceCard
          liability={{
            ...accumulatedLiability,
            isAccumulated: true,
          } as unknown as MonthlyTaxLiabilityViewModel}
          inputReadiness={mockReadinessComplete}
        />,
      );

      expect(html).toContain('DARF Acumulado (&lt; R$ 10,00)');
      expect(html).toContain('acumulado para a próxima competência');
    });

    it('renders blocked state when cost basis prevents definitive tax calculation', () => {
      const blockedLiability: MonthlyTaxLiabilityViewModel = {
        ...mockLiability,
        isBlocked: true,
      };

      const html = renderToString(
        <DarfGuidanceCard
          liability={blockedLiability}
          inputReadiness={mockReadinessIncomplete}
        />,
      );

      expect(html).toContain('Cálculo de DARF Bloqueado');
      expect(html).toContain('Custo de aquisição não comprovado.');
    });

    it('renders zero tax state when no liability exists', () => {
      const zeroLiability: MonthlyTaxLiabilityViewModel = {
        ...mockLiability,
        hasTaxDue: false,
        taxDueFormatted: 'R$ 0,00',
      };

      const html = renderToString(
        <DarfGuidanceCard
          liability={zeroLiability}
          inputReadiness={mockReadinessComplete}
        />,
      );

      expect(html).toContain('Sem DARF a Recolher');
    });
  });

  describe('5. MonthlyAssessmentSection Component', () => {
    it('renders category rows with sales, gains, withholdings, and tax due', () => {
      const html = renderToString(
        <MonthlyAssessmentSection
          liability={mockLiability}
          fiscalMonthly={mockFiscalMonthly}
          isLoading={false}
          isError={false}
        />,
      );

      expect(html).toContain('monthly-assessment-section');
      expect(html).toContain('Ações e ETFs — Swing Trade');
      expect(html).toContain('15%');
      expect(html).toContain('R$ 10.000,00');
      expect(html).toContain('R$ 1.450,00');
      expect(html).toContain('R$ 50,00'); // IRRF retido
    });

    it('displays exemption notice when sales are below R$ 20.000', () => {
      const exemptMonthly = {
        ...mockFiscalMonthly,
        isExempt: true,
        salesTotal: 'R$ 14.500,00',
      };

      const html = renderToString(
        <MonthlyAssessmentSection
          liability={mockLiability}
          fiscalMonthly={exemptMonthly}
          isLoading={false}
          isError={false}
        />,
      );

      expect(html).toContain('Isenção de R$ 20.000 Aplicada');
      expect(html).toContain('R$ 14.500,00');
    });
  });

  describe('6. LossCarryforwardSection Component', () => {
    it('renders table of accumulated losses carried forward by regime', () => {
      const html = renderToString(
        <LossCarryforwardSection liability={mockLiability} />,
      );

      expect(html).toContain('loss-carryforward-section');
      expect(html).toContain('Day Trade');
      expect(html).toContain('R$ 500,00');
      expect(html).toContain('Swing Trade');
    });
  });

  describe('7. AnnualPositionsSection (Bens e Direitos em 31/12)', () => {
    it('renders assets in custody with historical acquisition cost', () => {
      const html = renderToString(
        <AnnualPositionsSection
          viewModel={mockAnnualPositions}
          isLoading={false}
          isError={false}
          calendarYear={2025}
          onYearChange={vi.fn()}
        />,
      );

      expect(html).toContain('annual-positions-section');
      expect(html).toContain('PETR4');
      expect(html).toContain('100');
      expect(html).toContain('R$ 3.500,00');
      expect(html).toContain('R$ 35,00');
      expect(html).toContain('custo histórico de aquisição');
      expect(html).toContain('valor de mercado atual');
    });

    it('renders empty state when no positions exist in 31/12', () => {
      const emptyPositions: AnnualPositionReportViewModel = {
        ...mockAnnualPositions,
        positions: [],
      };

      const html = renderToString(
        <AnnualPositionsSection
          viewModel={emptyPositions}
          isLoading={false}
          isError={false}
          calendarYear={2025}
          onYearChange={vi.fn()}
        />,
      );

      expect(html).toContain('Nenhum ativo em custódia em 31/12/2025');
    });
  });

  describe('8. AnnualIncomeSection Component', () => {
    it('renders dividends, JCP, and FII income cards and payers table', () => {
      const html = renderToString(
        <AnnualIncomeSection
          viewModel={mockAnnualIncome}
          isLoading={false}
          isError={false}
          calendarYear={2025}
          onYearChange={vi.fn()}
        />,
      );

      expect(html).toContain('annual-income-section');
      expect(html).toContain('R$ 1.200,00'); // Dividends
      expect(html).toContain('R$ 500,00'); // JCP
      expect(html).toContain('R$ 800,00'); // FII
      expect(html).toContain('PETROBRAS ON/PN');
    });
  });

  describe('9. AnnualReportingExportCard Component', () => {
    it('renders DIRPF CSV export button and mapped items summary', () => {
      const html = renderToString(
        <AnnualReportingExportCard
          viewModel={mockAnnualReporting}
          calendarYear={2025}
          portfolioId="port-1"
        />,
      );

      expect(html).toContain('export-reporting-csv-btn');
      expect(html).toContain('Exportar Pacote DIRPF (CSV)');
      expect(html).toContain('Total de Itens Mapeados:');
      expect(html).toContain('3');
    });
  });

  describe('10. TaxRoute Complete Page Integration', () => {
    it('renders tax route with all sub-tabs and header', () => {
      queryClient.setQueryData(portfolioKeys.list(), [
        { id: 'port-1', name: 'Carteira Principal', currency: 'BRL', createdAt: '2026-01-01' },
      ]);
      queryClient.setQueryData(fiscalKeys.liability('2026-10'), mockLiability);
      queryClient.setQueryData(fiscalKeys.monthly('2026-10'), mockFiscalMonthly);
      queryClient.setQueryData(fiscalKeys.inputs('2026-10'), mockReadinessComplete);

      const html = renderToString(
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/tax']}>
              <PortfolioProvider>
                <TaxRoute />
              </PortfolioProvider>
            </MemoryRouter>
          </QueryClientProvider>
        </AuthProvider>,
      );

      expect(html).toContain('tax-route');
      expect(html).toContain('Inteligência Fiscal &amp; IRPF');
      expect(html).toContain('Apuração Mensal &amp; DARF');
      expect(html).toContain('Declaração Anual (DIRPF)');
      expect(html).toContain('Base de Custo &amp; Evidências');
      expect(html).toContain('Prazos &amp; Conformidade');
      expect(html).toContain('fiscal-competence-select');
    });
  });

  describe('11. Security & Cache Isolation', () => {
    it('clearQueryCache completely purges fiscal keys on logout', () => {
      queryClient.setQueryData(fiscalKeys.monthly('2026-10'), mockFiscalMonthly);
      expect(queryClient.getQueryData(fiscalKeys.monthly('2026-10'))).toBeDefined();

      clearQueryCache();

      expect(queryClient.getQueryData(fiscalKeys.monthly('2026-10'))).toBeUndefined();
    });

    it('enforces read-only fiscal consumer: no client-side tax mutation', () => {
      expect(typeof fiscalApi.getMonthlyTaxLiability).toBe('function');
      expect(typeof fiscalApi.getFiscalMonthly).toBe('function');
      expect(typeof fiscalApi.getAnnualPositions).toBe('function');
      expect(typeof fiscalApi.getAnnualInvestmentIncome).toBe('function');
      expect(typeof fiscalApi.getAnnualReportingPackage).toBe('function');
    });
  });
});
