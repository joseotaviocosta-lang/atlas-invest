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
} from '@/components/ui';
import { colors, spacing, borderRadius, formatCurrency, formatPercentage } from '@atlas/ui';
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

  const { data: portfolios = [], isLoading: isLoadingPortfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
        '/api/v1/portfolios',
      );
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  const firstName = user?.name ? user.name.split(' ')[0] : 'Investidor';
  const firstPortfolio = portfolios[0];
  const firstPortfolioId = firstPortfolio?.id;

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
    queryKey: ['portfolio-review', firstPortfolioId],
    queryFn: async () => {
      if (!firstPortfolioId) return { data: null } as never;
      return apiClient.get(`/api/v1/portfolios/${firstPortfolioId}/review`);
    },
    enabled: Boolean(firstPortfolioId),
    staleTime: 60 * 1000,
  });
  const reviewAttentionCount = reviewData?.data?.summary.attentionCount ?? 0;

  // 1. Ledger state query (Source of truth for cost basis & proventos)
  const { data: stateData } = useQuery<{
    data: {
      totalCost?: { amount: string; currency: string } | null;
      positions: Array<unknown>;
      incomeSummaries?: IncomeSummaryItem[];
    };
  }>({
    queryKey: ['portfolio-state', firstPortfolioId],
    queryFn: async () => {
      if (!firstPortfolioId) return { data: { positions: [] } } as never;
      return apiClient.get(`/api/v1/portfolios/${firstPortfolioId}/state`);
    },
    enabled: Boolean(firstPortfolioId),
    staleTime: 30 * 1000,
  });

  // 2. Persisted market valuation query (Zero live provider calls on GET)
  const { data: valuationData, isLoading: isLoadingValuation } =
    useQuery<PortfolioValuationResponse>({
      queryKey: firstPortfolioId
        ? valuationQueryKey(firstPortfolioId)
        : ['portfolio-valuation', 'none'],
      queryFn: async () => {
        if (!firstPortfolioId) throw new Error('No portfolio');
        return apiClient.get(`/api/v1/portfolios/${firstPortfolioId}/valuation`);
      },
      enabled: Boolean(firstPortfolioId),
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
          <Link href="/portfolio">
            <Button variant="secondary" size="sm">
              Ver Carteiras →
            </Button>
          </Link>
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
      {reviewAttentionCount > 0 && firstPortfolioId ? (
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
            href={`/portfolio?portfolioId=${firstPortfolioId}`}
            aria-label="Ver revisão da carteira"
          >
            <Button size="sm">Ver revisão</Button>
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
              firstPortfolio
                ? `Carteira: ${firstPortfolio.name}`
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
