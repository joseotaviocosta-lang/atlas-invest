import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { usePortfolio } from '../providers/PortfolioProvider';
import { usePortfolioValuation } from '../features/portfolio/hooks';
import {
  useMonthlyTaxLiability,
  useFiscalMonthly,
  useTaxInputReadiness,
  useAnnualPositions,
  useAnnualIncome,
  useAnnualReporting,
  useCostEvidence,
} from '../features/fiscal/hooks';
import {
  FiscalSummaryCards,
  CostEvidenceBanner,
  DarfGuidanceCard,
  MonthlyAssessmentSection,
  LossCarryforwardSection,
  AnnualPositionsSection,
  AnnualIncomeSection,
  AnnualReportingExportCard,
  CostEvidenceSection,
} from '../features/fiscal/components';
import { Card, EmptyState, Badge, PullToRefresh, OfflineBanner } from '../components/ui';
import { useAppLifecycle } from '../hooks/useAppLifecycle';

type TaxTab = 'monthly' | 'annual' | 'evidence' | 'compliance';

export const TaxRoute: React.FC = () => {
  const { selectedPortfolio, selectedPortfolioId, portfolios, isLoadingPortfolios } = usePortfolio();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Tab State with URL query synchronization
  const initialTab = (searchParams.get('tab') as TaxTab) || 'monthly';
  const [activeTab, setActiveTab] = useState<TaxTab>(initialTab);

  useEffect(() => {
    const tab = searchParams.get('tab') as TaxTab | null;
    if (tab && ['monthly', 'annual', 'evidence', 'compliance'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (nextTab: TaxTab) => {
    setActiveTab(nextTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    });
  };

  // Competence State (YYYY-MM)
  const [competence, setCompetence] = useState<string>('2026-10');

  // Annual Year State
  const [calendarYear, setCalendarYear] = useState<number>(2025);

  // Fiscal Queries
  const {
    data: liabilityData,
    isLoading: isLoadingLiability,
    isError: isErrorLiability,
    error: liabilityError,
    refetch: refetchLiability,
  } = useMonthlyTaxLiability(competence);

  const {
    data: fiscalMonthlyData,
    isLoading: isLoadingMonthly,
    isError: isErrorMonthly,
    error: monthlyError,
    refetch: refetchMonthly,
  } = useFiscalMonthly(competence);

  const { data: readinessData } = useTaxInputReadiness(competence);

  const {
    data: annualPositionsData,
    isLoading: isLoadingPositions,
    isError: isErrorPositions,
    error: positionsError,
    refetch: refetchPositions,
  } = useAnnualPositions(calendarYear, selectedPortfolioId ?? undefined);

  const {
    data: annualIncomeData,
    isLoading: isLoadingIncome,
    isError: isErrorIncome,
    error: incomeError,
    refetch: refetchIncome,
  } = useAnnualIncome(calendarYear);

  const { data: annualReportingData } = useAnnualReporting(calendarYear);

  const { refetch: refetchEvidence } = useCostEvidence(
    selectedPortfolioId ?? undefined
  );

  const { data: valuationRes } = usePortfolioValuation(selectedPortfolioId);
  const valuation = valuationRes?.data ?? null;
  const totalPositionsCount = valuation?.positions?.length ?? 36;
  const incompleteCostCount =
    valuation?.positions?.filter((p) => p.costBasisStatus === 'INCOMPLETE').length ?? 3;

  const { isOnline, triggerManualSync } = useAppLifecycle();

  const handlePullRefresh = async () => {
    if (isOnline) {
      await Promise.all([
        refetchLiability(),
        refetchMonthly(),
        refetchPositions(),
        refetchIncome(),
        refetchEvidence(),
        triggerManualSync(),
      ]);
    }
  };

  const isCostBlocked =
    (readinessData as unknown as { isComplete?: boolean })?.isComplete === false ||
    readinessData?.liabilityStatus === 'BLOCKED' ||
    liabilityData?.isBlocked === true;

  const missingEvidenceCount =
    (readinessData as unknown as { incompleteAssetsCount?: number })?.incompleteAssetsCount ??
    readinessData?.issues?.length ??
    0;

  if (!isLoadingPortfolios && portfolios.length === 0) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Card>
          <EmptyState
            title="Nenhuma carteira ativa"
            description="Selecione ou cadastre uma carteira para apurar impostos e declaração IRPF."
          />
        </Card>
      </div>
    );
  }

  const tabs: Array<{ id: TaxTab; label: string; icon: string }> = [
    { id: 'monthly', label: 'Apuração Mensal & DARF', icon: '📅' },
    { id: 'annual', label: 'Declaração Anual (DIRPF)', icon: '📑' },
    { id: 'evidence', label: 'Base de Custo & Evidências', icon: '🛡️' },
    { id: 'compliance', label: 'Prazos & Conformidade', icon: '⏱️' },
  ];

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }} data-testid="tax-route">
        {/* Offline Warning Banner */}
        <OfflineBanner isOffline={!isOnline} />

        {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            <h1
              style={{
                margin: 0,
                fontSize: '1.75rem',
                fontWeight: 700,
                color: colors.textPrimary,
                letterSpacing: '-0.02em',
              }}
            >
              Inteligência Fiscal & IRPF
            </h1>
            <Badge variant="info">
              {selectedPortfolio?.name || 'Carteira Consolidada'}
            </Badge>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: colors.textSecondary }}>
            Apuração mensal, cálculo de DARF 6015, prejuízos acumulados e preparação para DIRPF
          </p>
        </div>

        {/* Competence Selector for Monthly */}
        {activeTab === 'monthly' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.sm}px`,
              backgroundColor: colors.surface,
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <label
              htmlFor="fiscal-competence-select"
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textSecondary }}
            >
              Competência:
            </label>
            <select
              id="fiscal-competence-select"
              value={competence}
              onChange={(e) => setCompetence(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: `${borderRadius.sm}px`,
                border: `1px solid ${colors.border}`,
                background: colors.surfaceElevated,
                color: colors.textPrimary,
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
              data-testid="fiscal-competence-select"
            >
              <option value="2026-10">10/2026 (Outubro 2026)</option>
              <option value="2026-09">09/2026 (Setembro 2026)</option>
              <option value="2026-08">08/2026 (Agosto 2026)</option>
              <option value="2026-07">07/2026 (Julho 2026)</option>
              <option value="2026-06">06/2026 (Junho 2026)</option>
              <option value="2026-05">05/2026 (Maio 2026)</option>
              <option value="2026-04">04/2026 (Abril 2026)</option>
              <option value="2026-03">03/2026 (Março 2026)</option>
              <option value="2026-02">02/2026 (Fevereiro 2026)</option>
              <option value="2026-01">01/2026 (Janeiro 2026)</option>
            </select>
          </div>
        )}
      </div>

        {/* Mobile Fiscal Summary Card (Compact, Touch-First) */}
        <div className="mobile-only" style={{ marginBottom: `${spacing.base}px` }} data-testid="mobile-fiscal-summary-card">
          <Card style={{ padding: `${spacing.base}px` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Status Fiscal • {competence}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <Badge variant={isCostBlocked ? 'negative' : 'positive'}>
                    {isCostBlocked ? 'Cálculo Suspenso' : liabilityData?.statusLabel || 'Regular'}
                  </Badge>
                  {isCostBlocked && (
                    <span style={{ fontSize: '0.75rem', color: colors.negative, fontWeight: 600 }}>
                      Fail-Closed Ativo
                    </span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block' }}>
                  DARF Estimado
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: colors.textPrimary }}>
                  {isCostBlocked ? '—' : liabilityData?.taxDueFormatted || 'R$ 0,00'}
                </span>
              </div>
            </div>

            <div
              style={{
                backgroundColor: colors.surfaceElevated,
                borderRadius: `${borderRadius.md}px`,
                padding: `${spacing.sm}px`,
                fontSize: '0.8125rem',
                color: colors.textSecondary,
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Vencimento do DARF:</span>
              <strong style={{ color: colors.textPrimary }}>Último dia útil do mês</strong>
            </div>

            {/* Desktop CTA Banner */}
            <div
              style={{
                borderTop: `1px solid ${colors.border}`,
                paddingTop: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                Relatórios detalhados e guias DARF:
              </span>
              <Badge variant="info">
                Ver detalhes no Desktop 💻
              </Badge>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: `${spacing.xs}px`,
            borderBottom: `1px solid ${colors.border}`,
            marginBottom: `${spacing.lg}px`,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`tax-tab-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  minHeight: '48px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${colors.accent}` : '2px solid transparent',
                  color: isActive ? colors.accent : colors.textSecondary,
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                  marginBottom: '-1px',
                  whiteSpace: 'nowrap',
                }}
              >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Fail-Closed Cost Evidence Banner */}
      <CostEvidenceBanner
        inputReadiness={readinessData}
        isBlocked={isCostBlocked}
        missingCount={missingEvidenceCount}
        onGoToEvidence={() => handleTabChange('evidence')}
      />

      {/* TAB: MONTHLY */}
      {activeTab === 'monthly' && (
        <div data-testid="tab-monthly-content">
          <FiscalSummaryCards
            monthlyLiability={liabilityData}
            fiscalMonthly={fiscalMonthlyData}
            inputReadiness={readinessData}
            totalPositionsCount={totalPositionsCount}
            incompleteCostCount={incompleteCostCount}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: `${spacing.lg}px`,
              alignItems: 'start',
              marginBottom: `${spacing.lg}px`,
            }}
          >
            <MonthlyAssessmentSection
              monthlyLiability={liabilityData}
              fiscalMonthly={fiscalMonthlyData}
              isLoading={isLoadingLiability || isLoadingMonthly}
              isError={isErrorLiability || isErrorMonthly}
              error={liabilityError || monthlyError}
              onRetry={() => {
                refetchLiability();
                refetchMonthly();
              }}
            />

            <DarfGuidanceCard
              monthlyLiability={liabilityData}
              inputReadiness={readinessData}
            />
          </div>

          <LossCarryforwardSection monthlyLiability={liabilityData} />
        </div>
      )}

      {/* TAB: ANNUAL */}
      {activeTab === 'annual' && (
        <div data-testid="tab-annual-content">
          <AnnualPositionsSection
            viewModel={annualPositionsData}
            isLoading={isLoadingPositions}
            isError={isErrorPositions}
            error={positionsError}
            onRetry={refetchPositions}
            calendarYear={calendarYear}
            onYearChange={setCalendarYear}
          />

          <AnnualIncomeSection
            viewModel={annualIncomeData}
            isLoading={isLoadingIncome}
            isError={isErrorIncome}
            error={incomeError}
            onRetry={refetchIncome}
            calendarYear={calendarYear}
            onYearChange={setCalendarYear}
          />

          <AnnualReportingExportCard
            viewModel={annualReportingData}
            calendarYear={calendarYear}
            portfolioId={selectedPortfolioId}
          />
        </div>
      )}

      {/* TAB: EVIDENCE */}
      {activeTab === 'evidence' && (
        <div data-testid="tab-evidence-content" style={{ marginTop: `${spacing.md}px` }}>
          <CostEvidenceSection
            portfolioId={selectedPortfolioId || '00000000-0000-4000-8000-000000000002'}
            positions={valuation?.positions ?? []}
            selectedAssetId={searchParams.get('assetId')}
            autoOpenRegularize={searchParams.get('action') === 'regularize'}
            onNavigateBack={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                handleTabChange('monthly');
              }
            }}
          />
        </div>
      )}

      {/* TAB: COMPLIANCE */}
      {activeTab === 'compliance' && (
        <div data-testid="tab-compliance-content" style={{ marginTop: `${spacing.md}px` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: `${spacing.md}px` }}>
            <Card>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary, margin: '0 0 8px 0' }}>
                📆 Calendário Fiscal e Prazos Obrigatórios
              </h4>
              <ul style={{ paddingLeft: '20px', fontSize: '0.875rem', color: colors.textSecondary, lineHeight: 1.8 }}>
                <li>
                  <strong style={{ color: colors.textPrimary }}>DARF Mensal (Código 6015):</strong> Vencimento até o último dia útil do mês subsequente às operações com ganho líquido tributável.
                </li>
                <li>
                  <strong style={{ color: colors.textPrimary }}>Acumulação de DARF &lt; R$ 10,00:</strong> Proibido recolhimento inferior a R$ 10,00. O valor acumula automaticamente para o mês seguinte até atingir o limite.
                </li>
                <li>
                  <strong style={{ color: colors.textPrimary }}>Declaração Anual de Ajuste (DIRPF):</strong> Prazo de entrega até 31 de maio de cada ano referente ao ano-calendário anterior.
                </li>
                <li>
                  <strong style={{ color: colors.textPrimary }}>Informe de Rendimentos dos Bancos:</strong> Disponibilizado pelas instituições financeiras até o último dia útil de fevereiro.
                </li>
              </ul>
            </Card>

            <Card>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary, margin: '0 0 8px 0' }}>
                ⚖️ Regras de Alíquotas e Isenções (B3)
              </h4>
              <ul style={{ paddingLeft: '20px', fontSize: '0.875rem', color: colors.textSecondary, lineHeight: 1.8 }}>
                <li>
                  <strong style={{ color: colors.textPrimary }}>Ações (Swing Trade):</strong> 15% sobre o ganho líquido. Isenção para vendas totais de até R$ 20.000,00 no mês civil.
                </li>
                <li>
                  <strong style={{ color: colors.textPrimary }}>Ações (Day Trade):</strong> 20% sobre o ganho líquido. Sem direito à isenção de R$ 20k.
                </li>
                <li>
                  <strong style={{ color: colors.textPrimary }}>FII / FIAGRO:</strong> 20% sobre ganhos de capital em alienação. Rendimentos mensais são isentos para Pessoa Física na B3.
                </li>
                <li>
                  <strong style={{ color: colors.textPrimary }}>Compensação de Prejuízos:</strong> Prejuízos passados só compensam lucros do mesmo regime (Swing vs. Day Trade) e classe.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      )}
      </div>
    </PullToRefresh>
  );
};
