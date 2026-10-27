'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import {
  PageHeader,
  SectionHeader,
  StatCard,
  EmptyState,
  Card,
  Button,
  Badge,
  PortfolioSwitcher,
} from '@/components/ui';
import {
  colors,
  spacing,
  borderRadius,
  formatCurrency,
  formatPercentage,
  formatPlanDate,
  getTodayCivilDateString,
} from '@atlas/ui';
import { apiClient } from '@/api/client';
import {
  PortfolioValuationResponse,
  valuationQueryKey,
} from '@/components/portfolio/PortfolioValuation';

interface IncomeSummaryItem {
  currency: string;
  totalIncome: { amount: string; currency: string };
  dividends: { amount: string; currency: string };
  jcp: { amount: string; currency: string };
  fiiIncome: { amount: string; currency: string };
}

export default function TodayPage() {
  const user = useAuthStore((state) => state.user);

  const { data: rawPortfolios = [], isLoading: isLoadingPortfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Array<{ id: string; name: string; type?: string }> }>(
        '/api/v1/portfolios',
      );
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  const portfolios: Array<{ id: string; name: string; type: string }> = React.useMemo(() => {
    const list = Array.isArray(rawPortfolios) ? rawPortfolios : [];
    return list.map((p) => ({ id: p.id, name: p.name, type: p.type || 'PERSONAL' }));
  }, [rawPortfolios]);

  const [selectedPortfolioId, setSelectedPortfolioId] = React.useState<string | null>(null);

  const firstName = user?.name ? user.name.split(' ')[0] : 'Investidor';
  const activePortfolio =
    portfolios.find((p) => p.id === selectedPortfolioId) || portfolios[0];
  const activePortfolioId = activePortfolio?.id;
  const today = getTodayCivilDateString();

  // Pending review inbox count (derived, badge feed — no list load).
  const { data: pendingData } = useQuery({
    queryKey: ['integration-reviews', 'count'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { pendingCount: number; truncated: boolean } }>(
        '/api/v1/integration-reviews/count',
      );
      return res.data;
    },
    staleTime: 60 * 1000,
  });
  const pendingCount = pendingData?.pendingCount ?? 0;

  // Portfolio review summary (derived decision support — compact on Today).
  const { data: reviewData } = useQuery<{
    data: {
      portfolioId: string;
      summary: { attentionCount: number; dataNote: string | null };
      isEmpty: boolean;
    };
  }>({
    queryKey: ['portfolio-review', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return { data: null } as never;
      return apiClient.get(`/api/v1/portfolios/${activePortfolioId}/review`);
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 60 * 1000,
  });
  const reviewAttentionCount = reviewData?.data?.summary.attentionCount ?? 0;

  // Allocation strategy compact summary (declared targets vs current).
  const { data: strategyData } = useQuery<{
    data: {
      strategy: { targets: Array<{ category: string; targetBp: number }> } | null;
      comparison: { outsideTolerance: string[] } | null;
    };
  }>({
    queryKey: ['portfolio-allocation-strategy', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return { data: { strategy: null, comparison: null } };
      return apiClient.get(`/api/v1/portfolios/${activePortfolioId}/allocation-strategy`);
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 60 * 1000,
  });
  const strategyOutsideCount = strategyData?.data?.comparison?.outsideTolerance.length ?? 0;

  // Next planned contribution (intent only — never executed by the Atlas).
  const { data: nextPlanData } = useQuery<{
    data: {
      plan: {
        id: string;
        name: string;
        plannedDate: string;
        status: string;
        total: string;
      } | null;
    };
  }>({
    queryKey: ['portfolio-contribution-plans-next', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return { data: { plan: null } };
      return apiClient.get(`/api/v1/portfolios/${activePortfolioId}/contribution-plans/next`);
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 60 * 1000,
  });
  const nextPlan = nextPlanData?.data?.plan ?? null;

  // Monthly contribution goal + current-month confirmed total (facts only).
  const { data: goalInsightsData } = useQuery<{
    data: {
      currency: string | null;
      goal: { amount: string; currency: string; effectiveFromMonth: string } | null;
      timeline: Array<{ month: string; confirmed: string }>;
    };
  }>({
    queryKey: ['portfolio-contribution-insights', activePortfolioId, '1A'],
    queryFn: async () => {
      if (!activePortfolioId) return { data: { currency: null, goal: null, timeline: [] } };
      return apiClient.get(
        `/api/v1/portfolios/${activePortfolioId}/contribution-insights?period=1A`,
      );
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 60 * 1000,
  });
  const currentMonthKey = today.slice(0, 7);
  const currentMonthRow =
    goalInsightsData?.data?.timeline.find((row) => row.month === currentMonthKey) ?? null;
  const currentGoal = goalInsightsData?.data?.goal ?? null;

  // 1. Ledger state query (Source of truth for cost basis & proventos)
  const { data: stateData } = useQuery<{
    data: {
      totalCost?: { amount: string; currency: string } | null;
      positions: Array<unknown>;
      incomeSummaries?: IncomeSummaryItem[];
    };
  }>({
    queryKey: ['portfolio-state', activePortfolioId],
    queryFn: async () => {
      if (!activePortfolioId) return { data: { positions: [] } } as never;
      return apiClient.get(`/api/v1/portfolios/${activePortfolioId}/state`);
    },
    enabled: Boolean(activePortfolioId),
    staleTime: 30 * 1000,
  });

  // 2. Persisted market valuation query (Zero live provider calls on GET)
  const { data: valuationData, isLoading: isLoadingValuation } =
    useQuery<PortfolioValuationResponse>({
      queryKey: activePortfolioId
        ? valuationQueryKey(activePortfolioId)
        : ['portfolio-valuation', 'none'],
      queryFn: async () => {
        if (!activePortfolioId) throw new Error('No portfolio');
        return apiClient.get(`/api/v1/portfolios/${activePortfolioId}/valuation`);
      },
      enabled: Boolean(activePortfolioId),
      staleTime: 30 * 1000,
    });

  const hasNoPortfolios = !isLoadingPortfolios && portfolios.length === 0;
  const valuation = valuationData?.data;
  const currencies =
    valuation?.summary?.currencies ??
    (valuation?.totalsByCurrency ? Object.keys(valuation.totalsByCurrency) : []);
  const primaryCurrency = currencies[0] ?? 'BRL';
  const totals = valuation?.totalsByCurrency?.[primaryCurrency];

  // Derive Cost Basis (Ledger source of truth via valuation totals or state)
  const costBasisFormatted = totals?.costBasis
    ? formatCurrency(totals.costBasis.amount, totals.costBasis.currency)
    : stateData?.data?.totalCost
      ? formatCurrency(stateData.data.totalCost.amount, stateData.data.totalCost.currency)
      : null;

  // Derive Market Value
  const marketValueFormatted = totals?.marketValue
    ? formatCurrency(totals.marketValue.amount, totals.marketValue.currency)
    : null;

  // Derive Unrealized Result & Percent
  const unrealizedAmount = totals?.unrealizedGainLoss
    ? formatCurrency(totals.unrealizedGainLoss.amount, totals.unrealizedGainLoss.currency)
    : null;
  const unrealizedPercent = totals?.unrealizedGainLossPercent
    ? formatPercentage(totals.unrealizedGainLossPercent, { showSign: true })
    : null;

  // Derive Proventos (strictly ledger-derived from stateData.incomeSummaries)
  const incomeSummary = stateData?.data?.incomeSummaries?.find(
    (s) => s.currency === primaryCurrency,
  );
  const proventosFormatted = incomeSummary?.totalIncome
    ? formatCurrency(incomeSummary.totalIncome.amount, incomeSummary.totalIncome.currency)
    : null;

  // Quote coverage diagnostics
  const totalPositions =
    valuation?.summary?.totalPositions ?? stateData?.data?.positions?.length ?? 0;
  const valuedPositions = valuation?.summary?.valuedPositions ?? 0;
  const stalePositions = valuation?.summary?.stalePositions ?? 0;
  const unvaluedPositions = valuation?.summary?.unvaluedPositions ?? 0;
  const coveragePercent =
    valuation?.summary?.valuationCoveragePercent ??
    (totalPositions > 0 && valuedPositions === totalPositions ? '100' : '0');

  let coverageStatusText = 'Nenhuma posição ativa';
  if (totalPositions > 0) {
    if (unvaluedPositions === 0 && stalePositions === 0) {
      coverageStatusText = `${valuedPositions} de ${totalPositions} com cotação atualizada (${formatPercentage(coveragePercent)})`;
    } else if (unvaluedPositions > 0 && valuedPositions > 0) {
      coverageStatusText = `${valuedPositions} de ${totalPositions} com cotação (${unvaluedPositions} sem cotação)`;
    } else if (stalePositions > 0) {
      coverageStatusText = `${stalePositions} cotação desatualizada (${valuedPositions}/${totalPositions})`;
    } else {
      coverageStatusText = `Sem cotação disponível (${totalPositions} ${totalPositions === 1 ? 'ativo' : 'ativos'})`;
    }
  }

  return (
    <div>
      <PageHeader
        title="Hoje"
        subtitle={`Olá, ${firstName}. Aqui está o panorama do seu patrimônio e do mercado.`}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            {portfolios.length > 1 && (
              <PortfolioSwitcher
                portfolios={portfolios}
                selectedPortfolioId={activePortfolioId ?? null}
                onSelectPortfolio={(id) => setSelectedPortfolioId(id)}
              />
            )}
            <Link
              href={`/portfolio${activePortfolioId ? `?portfolioId=${activePortfolioId}` : ''}`}
            >
              <Button variant="secondary" size="sm">
                Ver Carteira →
              </Button>
            </Link>
          </div>
        }
      />

      {/* Onboarding callout banner if user has no portfolios yet */}
      {hasNoPortfolios && (
        <div
          style={{
            padding: `${spacing.base}px ${spacing.xl}px`,
            borderRadius: `${borderRadius.lg}px`,
            backgroundColor: colors.accentSubtle,
            border: `1px solid ${colors.accent}`,
            marginBottom: `${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: colors.textPrimary,
                fontSize: '0.9375rem',
                marginBottom: '2px',
              }}
            >
              Configure sua primeira carteira
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Crie uma carteira para começar a registrar contas, aportes e operações financeiras.
            </div>
          </div>
          <Link href="/onboarding">
            <Button size="sm">Iniciar Onboarding</Button>
          </Link>
        </div>
      )}

      {/* Pending review inbox callout (discreet, only when actionable items exist) */}
      {pendingCount > 0 && (
        <div
          style={{
            padding: `${spacing.base}px ${spacing.xl}px`,
            borderRadius: `${borderRadius.lg}px`,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            marginBottom: `${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: colors.textPrimary,
                fontSize: '0.9375rem',
                marginBottom: '2px',
              }}
            >
              {pendingCount === 1
                ? '1 item precisa da sua atenção'
                : `${pendingCount} itens precisam da sua atenção`}
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Revise importações e sincronizações pendentes. Nada é importado sem a sua confirmação.
            </div>
          </div>
          <Link
            href="/reviews"
            aria-label={`Ver ${pendingCount === 1 ? 'a pendência' : 'as pendências'}`}
          >
            <Button size="sm">Ver pendências</Button>
          </Link>
        </div>
      )}

      {/* Portfolio review compact summary (only when attention items exist) */}
      {reviewAttentionCount > 0 && activePortfolioId ? (
        <div
          style={{
            padding: `${spacing.base}px ${spacing.xl}px`,
            borderRadius: `${borderRadius.lg}px`,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            marginBottom: `${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: colors.textPrimary,
                fontSize: '0.9375rem',
                marginBottom: '2px',
              }}
            >
              Revisão da carteira
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {reviewAttentionCount === 1
                ? '1 ponto precisa da sua atenção.'
                : `${reviewAttentionCount} pontos precisam da sua atenção.`}
            </div>
          </div>
          <Link
            href={`/portfolio?portfolioId=${activePortfolioId}`}
            aria-label="Ver revisão da carteira"
          >
            <Button size="sm">Ver revisão</Button>
          </Link>
        </div>
      ) : null}

      {/* Allocation strategy compact summary (only with declared strategy off-target) */}
      {strategyOutsideCount > 0 && activePortfolioId ? (
        <div
          style={{
            padding: `${spacing.base}px ${spacing.xl}px`,
            borderRadius: `${borderRadius.lg}px`,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            marginBottom: `${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: colors.textPrimary,
                fontSize: '0.9375rem',
                marginBottom: '2px',
              }}
            >
              Metas de alocação
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {strategyOutsideCount === 1
                ? 'Sua carteira está fora das metas definidas em 1 categoria.'
                : `Sua carteira está fora das metas definidas em ${strategyOutsideCount} categorias.`}
            </div>
          </div>
          <Link
            href={`/portfolio?tab=allocation&portfolioId=${activePortfolioId}`}
            aria-label="Ver estratégia de alocação"
          >
            <Button size="sm">Ver estratégia</Button>
          </Link>
        </div>
      ) : null}

      {/* Next planned contribution (intent only — the Atlas never executes it) */}
      {nextPlan && activePortfolioId ? (
        <div
          style={{
            padding: `${spacing.base}px ${spacing.xl}px`,
            borderRadius: `${borderRadius.lg}px`,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            marginBottom: `${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
          data-testid="today-next-plan"
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: colors.textPrimary,
                fontSize: '0.9375rem',
                marginBottom: '2px',
              }}
            >
              {nextPlan.plannedDate < today
                ? `Plano de aporte pendente desde ${formatPlanDate(nextPlan.plannedDate)}`
                : 'Próximo aporte planejado'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {nextPlan.name} • {formatPlanDate(nextPlan.plannedDate)} •{' '}
              {formatCurrency(nextPlan.total, primaryCurrency)}
            </div>
          </div>
          <Link
            href={`/portfolio?tab=planning&portfolioId=${activePortfolioId}`}
            aria-label="Ver plano de aporte"
          >
            <Button size="sm">Ver plano</Button>
          </Link>
        </div>
      ) : null}

      {/* Monthly contribution goal + current-month confirmed facts (user-defined only) */}
      {currentGoal && activePortfolioId ? (
        <div
          style={{
            padding: `${spacing.base}px ${spacing.xl}px`,
            borderRadius: `${borderRadius.lg}px`,
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            marginBottom: `${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
          data-testid="today-contribution-goal"
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: colors.textPrimary,
                fontSize: '0.9375rem',
                marginBottom: '2px',
              }}
            >
              Meta de aporte deste mês
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {formatCurrency(currentGoal.amount, currentGoal.currency)} definidos por você
              {currentMonthRow
                ? ` • ${formatCurrency(currentMonthRow.confirmed, currentGoal.currency)} identificados até agora`
                : ''}
              .
            </div>
          </div>
          <Link
            href={`/portfolio?tab=planning&portfolioId=${activePortfolioId}`}
            aria-label="Ver planejamento de aportes"
          >
            <Button size="sm">Ver planejamento</Button>
          </Link>
          <Link
            href={`/portfolio?tab=planning&portfolioId=${activePortfolioId}#contribution-calendar`}
            aria-label="Ver calendário de aportes"
          >
            <Button size="sm">Ver calendário</Button>
          </Link>
        </div>
      ) : null}

      {/* Financial Overview StatCards (Real Persisted Market Valuation Overlay) */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: `${spacing.sm}px`,
          }}
        >
          <SectionHeader
            title="Resumo Patrimonial"
            description={
              activePortfolio
                ? `Carteira: ${activePortfolio.name}`
                : 'Indicadores derivados do livro-razão e mercado'
            }
          />
          {totalPositions > 0 && (
            <Badge
              variant={
                unvaluedPositions > 0 ? 'warning' : stalePositions > 0 ? 'neutral' : 'positive'
              }
            >
              {coverageStatusText}
            </Badge>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: `${spacing.base}px`,
          }}
        >
          <StatCard
            label="Custo Total em Custódia"
            value={costBasisFormatted ?? '—'}
            subValue={
              totalPositions > 0
                ? `${totalPositions} ${totalPositions === 1 ? 'ativo' : 'ativos'} em custódia`
                : 'Nenhuma posição ativa'
            }
            isPlaceholder={!costBasisFormatted}
          />
          <StatCard
            label="Valor de Mercado"
            value={marketValueFormatted ?? '—'}
            subValue={
              isLoadingValuation
                ? 'Carregando cotações...'
                : totals?.marketValue
                  ? `Baseado em cotações EOD persistidas`
                  : 'Atualize as cotações para calcular'
            }
            isPlaceholder={!marketValueFormatted}
          />
          <StatCard
            label="Resultado Não Realizado"
            value={unrealizedAmount ?? '—'}
            subValue={
              unrealizedPercent
                ? `Variação patrimonial: ${unrealizedPercent}`
                : totals?.unrealizedGainLoss
                  ? 'Calculado sobre custo conhecido'
                  : 'Disponível com cotações'
            }
            isPlaceholder={!unrealizedAmount}
          />
          <StatCard
            label="Variação Hoje"
            value="—"
            subValue="Dados insuficientes para variação diária"
            isPlaceholder
          />
          <StatCard
            label="Proventos Acumulados"
            value={proventosFormatted ?? '—'}
            subValue={
              incomeSummary?.totalIncome
                ? `Total creditado no livro-razão (${primaryCurrency})`
                : 'Disponível na aba Proventos'
            }
            isPlaceholder={!proventosFormatted}
          />
        </div>

        {/* Multi-currency segregation disclosure if multiple currencies exist */}
        {currencies.length > 1 && (
          <div
            style={{
              marginTop: `${spacing.md}px`,
              fontSize: '0.8125rem',
              color: colors.textSecondary,
            }}
          >
            Observação: Sua carteira possui ativos em múltiplas moedas ({currencies.join(', ')}).
            Exibindo balanço em {primaryCurrency}. Consulte a aba Carteira para detalhes segregados
            por moeda.
          </div>
        )}
      </div>

      {/* Personalized Content Sections */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: `${spacing.xl}px`,
          marginBottom: `${spacing.xl}px`,
        }}
      >
        {/* Section 1: Portfolio Daily Changes */}
        <Card style={{ padding: `${spacing.base}px` }}>
          <SectionHeader
            title="O que mudou na sua carteira"
            description="Movimentações e rebalanceamentos do dia"
          />
          <EmptyState
            title="Sem movimentações hoje"
            description="Suas operações e lançamentos de livro-razão aparecerão aqui."
            actionLabel="Acessar Carteira"
            onAction={() => {
              window.location.href = '/portfolio';
            }}
          />
        </Card>

        {/* Section 2: Upcoming Corporate Events / Dividends */}
        <Card style={{ padding: `${spacing.base}px` }}>
          <SectionHeader
            title="Próximos eventos e proventos"
            description="Datas-com e pagamentos anunciados"
          />
          <EmptyState
            title="Nenhum provento agendado"
            description="Dividendos, JCP e eventos de custódia serão exibidos automaticamente."
          />
        </Card>
      </div>

      {/* Section 3: News & Macro Radar Placeholder */}
      <Card style={{ padding: `${spacing.base}px` }}>
        <SectionHeader
          title="Radar de Notícias e Mercado"
          description="Fatos relevantes e comunicados de companhias abertas"
        />
        <EmptyState
          title="Radar de notícias em estruturação"
          description="A integração com feeds B3 e notícias financeiras estará disponível no módulo de Market Data."
        />
      </Card>
    </div>
  );
}
