'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  SectionHeader,
  EmptyState,
  Card,
  Button,
  Badge,
  Skeleton,
  useToast,
} from '@/components/ui';
import { colors, spacing, formatCurrency } from '@atlas/ui';
import { apiClient, ApiError } from '@/api/client';
import {
  PortfolioValuationResponse,
  valuationQueryKey,
  formatUpdateReceiptFeedback,
  IngestionReceiptDto,
} from '@/components/portfolio/PortfolioValuation';
import { MacroIndicatorCards } from '@/components/market/MacroIndicatorCards';

export default function MarketPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Array<{ id: string; name: string }> }>(
        '/api/v1/portfolios',
      );
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const activePortfolio =
    portfolios.find((p) => p.id === selectedPortfolioId) || portfolios[0] || null;
  const activePortfolioId = activePortfolio?.id;

  // Valuation query for portfolio assets (Zero live provider calls on GET)
  const {
    data: valuationData,
    isLoading: isLoadingValuation,
    isError: isValuationError,
  } = useQuery<PortfolioValuationResponse>({
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

  const updateMarketDataMutation = useMutation({
    mutationFn: async () => {
      if (!activePortfolioId) throw new Error('Nenhuma carteira selecionada.');
      const res = await apiClient.post<{ data: IngestionReceiptDto }>(
        `/api/v1/portfolios/${activePortfolioId}/market-data/update`,
        {},
      );
      return res.data;
    },
    onSuccess: (receipt) => {
      if (activePortfolioId) {
        queryClient.invalidateQueries({ queryKey: valuationQueryKey(activePortfolioId) });
      }
      const feedback = formatUpdateReceiptFeedback(receipt);
      showToast(feedback.message, feedback.variant);
    },
    onError: (err: ApiError) => {
      showToast(
        err.message || 'Falha ao atualizar cotações de mercado. Tente novamente mais tarde.',
        'negative',
      );
    },
  });

  const positions = valuationData?.data?.positions ?? [];
  const summary = valuationData?.data?.summary;

  return (
    <div>
      <PageHeader
        title="Mercado"
        subtitle="Status e cobertura de cotações de mercado dos ativos da sua custódia"
        action={
          activePortfolioId ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateMarketDataMutation.mutate()}
              disabled={updateMarketDataMutation.isPending}
              aria-label="Atualizar cotações de mercado"
            >
              {updateMarketDataMutation.isPending ? 'Atualizando...' : 'Atualizar cotações'}
            </Button>
          ) : undefined
        }
      />

      {/* Market Indicators (Strict Honest Disclosure: Future Integration, No Fake Numbers) */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Índices e Indicadores Macroeconômicos"
          description="Integração planejada com índices oficiais Bacen e B3 (sem números simulados)"
        />
        <MacroIndicatorCards />
      </div>

      {/* Portfolio Assets Quote Coverage Section */}
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
            title="Cotações da sua Carteira"
            description={
              activePortfolio
                ? `Ativos em custódia na carteira ${activePortfolio.name}`
                : 'Ativos em custódia'
            }
          />
          {summary && (
            <Badge
              variant={
                summary.unvaluedPositions > 0
                  ? 'warning'
                  : summary.stalePositions > 0
                    ? 'neutral'
                    : 'positive'
              }
            >
              {summary.valuedPositions} de {summary.totalPositions} com cotação (
              {summary.valuationCoveragePercent}%)
            </Badge>
          )}
        </div>

        {portfolios.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: `${spacing.sm}px`,
              marginBottom: `${spacing.base}px`,
              flexWrap: 'wrap',
            }}
          >
            {portfolios.map((p) => (
              <Button
                key={p.id}
                variant={p.id === activePortfolioId ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedPortfolioId(p.id)}
              >
                {p.name}
              </Button>
            ))}
          </div>
        )}

        {isLoadingValuation ? (
          <Card style={{ padding: `${spacing.base}px` }}>
            <Skeleton width="100%" height="160px" />
          </Card>
        ) : isValuationError ? (
          <Card style={{ padding: `${spacing.xl}px` }}>
            <EmptyState
              title="Não foi possível carregar os dados de mercado"
              description="Ocorreu um erro ao consultar as cotações persistidas. Verifique sua conexão ou tente novamente."
            />
          </Card>
        ) : positions.length === 0 ? (
          <Card style={{ padding: `${spacing.xl}px` }}>
            <EmptyState
              title="Nenhum ativo em custódia nesta carteira"
              description="Registre operações de compra na carteira para acompanhar preços e cotações de mercado aqui."
              actionLabel="Ir para Carteira"
              onAction={() => {
                window.location.href = '/portfolio';
              }}
            />
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <th
                      style={{
                        padding: `${spacing.base}px`,
                        color: colors.textSecondary,
                        fontWeight: 600,
                      }}
                    >
                      Ativo
                    </th>
                    <th
                      style={{
                        padding: `${spacing.base}px`,
                        color: colors.textSecondary,
                        fontWeight: 600,
                      }}
                    >
                      Último Preço
                    </th>
                    <th
                      style={{
                        padding: `${spacing.base}px`,
                        color: colors.textSecondary,
                        fontWeight: 600,
                      }}
                    >
                      Data da Cotação
                    </th>
                    <th
                      style={{
                        padding: `${spacing.base}px`,
                        color: colors.textSecondary,
                        fontWeight: 600,
                      }}
                    >
                      Provedor
                    </th>
                    <th
                      style={{
                        padding: `${spacing.base}px`,
                        color: colors.textSecondary,
                        fontWeight: 600,
                      }}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const hasQuote = Boolean(pos.quote);
                    const isStale = pos.quoteFreshness === 'STALE' || pos.quoteStatus === 'STALE';
                    const statusVariant = !hasQuote ? 'warning' : isStale ? 'neutral' : 'positive';
                    const statusLabel = !hasQuote
                      ? 'Sem cotação'
                      : isStale
                        ? 'Desatualizada'
                        : 'Atualizada';

                    return (
                      <tr key={pos.assetId} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td
                          style={{
                            padding: `${spacing.base}px`,
                            fontWeight: 600,
                            color: colors.textPrimary,
                          }}
                        >
                          {pos.ticker || pos.assetId}
                        </td>
                        <td style={{ padding: `${spacing.base}px`, color: colors.textPrimary }}>
                          {pos.quote ? formatCurrency(pos.quote.price, pos.quote.currency) : '—'}
                        </td>
                        <td style={{ padding: `${spacing.base}px`, color: colors.textSecondary }}>
                          {pos.quote ? pos.quote.asOf : '—'}
                        </td>
                        <td style={{ padding: `${spacing.base}px`, color: colors.textSecondary }}>
                          {pos.quote ? pos.quote.source : '—'}
                        </td>
                        <td style={{ padding: `${spacing.base}px` }}>
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Modules Roadmap Notice */}
      <Card style={{ padding: `${spacing.base}px` }}>
        <SectionHeader
          title="Recursos Avançados de Mercado"
          description="Radar de oportunidades, listas de acompanhamento e calendário econômico"
        />
        <EmptyState
          title="Módulos adicionais em preparação"
          description="Acompanhamento de múltiplos, fatos relevantes e calendário econômico corporativo estarão disponíveis nas próximas fases do módulo de Market Data."
        />
      </Card>
    </div>
  );
}
