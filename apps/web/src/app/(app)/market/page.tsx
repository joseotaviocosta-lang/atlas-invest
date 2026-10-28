'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  SectionHeader,
  EmptyState,
  Card,
  Button,
  Badge,
  Input,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  colors,
  spacing,
  borderRadius,
  formatCurrency,
  formatPercentage,
  watchlistQueryKey,
  WatchlistItemVM,
} from '@atlas/ui';
import { apiClient, ApiError } from '@/api/client';
import {
  PortfolioValuationResponse,
  valuationQueryKey,
  formatUpdateReceiptFeedback,
  IngestionReceiptDto,
} from '@/components/portfolio/PortfolioValuation';
import { MacroIndicatorCards } from '@/components/market/MacroIndicatorCards';

interface AssetCatalogItem {
  id: string;
  ticker: string;
  name: string;
  type: string;
  currency: string;
  exchange: string;
}

export default function MarketPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCurrencyFilter, setSelectedCurrencyFilter] = useState<'ALL' | 'BRL' | 'USD'>(
    'ALL',
  );

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

  // Watchlist query
  const { data: watchlistResponse, isLoading: isLoadingWatchlist } = useQuery<{
    data: WatchlistItemVM[];
  }>({
    queryKey: watchlistQueryKey(),
    queryFn: async () => {
      return apiClient.get('/api/v1/watchlist');
    },
    staleTime: 30 * 1000,
  });

  const watchlistItems = watchlistResponse?.data ?? [];

  // Asset search query
  const trimmedSearch = searchTerm.trim();
  const { data: searchResultsResponse, isLoading: isSearching } = useQuery<{
    data: AssetCatalogItem[];
  }>({
    queryKey: ['asset-search', trimmedSearch],
    queryFn: async () => {
      if (!trimmedSearch) return { data: [] };
      return apiClient.get(`/api/v1/assets?q=${encodeURIComponent(trimmedSearch)}`);
    },
    enabled: trimmedSearch.length >= 2,
    staleTime: 60 * 1000,
  });

  const searchResults = searchResultsResponse?.data ?? [];

  // Watchlist add mutation
  const addToWatchlistMutation = useMutation({
    mutationFn: async (assetId: string) => {
      return apiClient.post('/api/v1/watchlist', { assetId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistQueryKey() });
      showToast('Ativo adicionado à lista de acompanhamento.', 'positive');
    },
    onError: (err: ApiError) => {
      showToast(err.message || 'Falha ao adicionar ativo à lista.', 'negative');
    },
  });

  // Watchlist remove mutation
  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (assetId: string) => {
      return apiClient.delete(`/api/v1/watchlist/${assetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistQueryKey() });
      showToast('Ativo removido da lista de acompanhamento.', 'positive');
    },
    onError: (err: ApiError) => {
      showToast(err.message || 'Falha ao remover ativo da lista.', 'negative');
    },
  });

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

  const watchedAssetIds = new Set(watchlistItems.map((item) => item.assetId));

  // Multi-currency filtered watchlist items
  const filteredWatchlistItems =
    selectedCurrencyFilter === 'ALL'
      ? watchlistItems
      : watchlistItems.filter((i) => i.currency === selectedCurrencyFilter);

  const brlCount = watchlistItems.filter((i) => i.currency === 'BRL').length;
  const usdCount = watchlistItems.filter((i) => i.currency === 'USD').length;

  return (
    <div>
      <PageHeader
        title="Mercado"
        subtitle="Descubra ativos, acompanhe sua watchlist e consulte cotações de mercado da custódia"
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

      {/* Asset Search & Discovery Section */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Busca e Descoberta de Ativos"
          description="Pesquise ativos cotados em bolsa por ticker ou razão social"
        />
        <Card style={{ padding: `${spacing.base}px` }}>
          <div style={{ marginBottom: `${spacing.base}px` }}>
            <Input
              label="Buscar no Catálogo"
              placeholder="Digite o ticker ou nome do ativo (ex: PETR4, AAPL, HGLG11)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar ativo por ticker ou nome"
            />
          </div>

          {trimmedSearch.length >= 2 && (
            <div>
              {isSearching ? (
                <Skeleton width="100%" height="80px" />
              ) : searchResults.length === 0 ? (
                <div
                  style={{
                    padding: `${spacing.base}px`,
                    color: colors.textSecondary,
                    textAlign: 'center',
                  }}
                >
                  Nenhum ativo encontrado para &ldquo;{trimmedSearch}&rdquo;.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
                  >
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.border}`, textAlign: 'left' }}>
                        <th style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                          Ticker
                        </th>
                        <th style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                          Nome
                        </th>
                        <th style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                          Tipo
                        </th>
                        <th style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                          Bolsa
                        </th>
                        <th style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                          Moeda
                        </th>
                        <th
                          style={{
                            padding: `${spacing.sm}px`,
                            textAlign: 'right',
                            color: colors.textSecondary,
                          }}
                        >
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((asset) => {
                        const isWatched = watchedAssetIds.has(asset.id);
                        return (
                          <tr key={asset.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <td
                              style={{
                                padding: `${spacing.sm}px`,
                                fontWeight: 600,
                                color: colors.textPrimary,
                              }}
                            >
                              {asset.ticker}
                            </td>
                            <td style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                              {asset.name}
                            </td>
                            <td style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                              {asset.type}
                            </td>
                            <td style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                              {asset.exchange}
                            </td>
                            <td style={{ padding: `${spacing.sm}px` }}>
                              <Badge variant="neutral">{asset.currency}</Badge>
                            </td>
                            <td style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '8px' }}>
                                <Link
                                  href={`/market/assets/${asset.id}`}
                                  style={{
                                    fontSize: '0.8125rem',
                                    color: colors.accent,
                                    textDecoration: 'none',
                                    fontWeight: 500,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '4px 8px',
                                    borderRadius: `${borderRadius.sm}px`,
                                    border: `1px solid ${colors.border}`,
                                  }}
                                >
                                  Ver Detalhes
                                </Link>
                                <Button
                                  variant={isWatched ? 'secondary' : 'primary'}
                                  size="sm"
                                  disabled={isWatched || addToWatchlistMutation.isPending}
                                  onClick={() => addToWatchlistMutation.mutate(asset.id)}
                                  aria-label={
                                    isWatched
                                      ? `Ativo ${asset.ticker} já acompanhado`
                                      : `Acompanhar ${asset.ticker}`
                                  }
                                >
                                  {isWatched ? 'Acompanhando' : '+ Watchlist'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Investor Watchlist Section */}
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
            title="Lista de Acompanhamento (Watchlist)"
            description="Cotações expressas na moeda nativa de cada ativo. Sem conversão cambial implícita."
          />
          {watchlistItems.length > 0 && (
            <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
              <Button
                variant={selectedCurrencyFilter === 'ALL' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedCurrencyFilter('ALL')}
              >
                Todas ({watchlistItems.length})
              </Button>
              <Button
                variant={selectedCurrencyFilter === 'BRL' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedCurrencyFilter('BRL')}
              >
                BRL ({brlCount})
              </Button>
              <Button
                variant={selectedCurrencyFilter === 'USD' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedCurrencyFilter('USD')}
              >
                USD ({usdCount})
              </Button>
            </div>
          )}
        </div>

        {isLoadingWatchlist ? (
          <Card style={{ padding: `${spacing.base}px` }}>
            <Skeleton width="100%" height="160px" />
          </Card>
        ) : watchlistItems.length === 0 ? (
          <Card style={{ padding: `${spacing.xl}px` }}>
            <EmptyState
              title="Sua lista de acompanhamento está vazia"
              description="Utilize o campo de busca acima para encontrar ações, FIIs ou ETFs e adicioná-los à sua watchlist."
            />
          </Card>
        ) : filteredWatchlistItems.length === 0 ? (
          <Card style={{ padding: `${spacing.xl}px` }}>
            <EmptyState
              title={`Nenhum ativo em ${selectedCurrencyFilter}`}
              description="Não há ativos cadastrados na sua lista de acompanhamento para o filtro de moeda selecionado."
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
                      Nome
                    </th>
                    <th
                      style={{
                        padding: `${spacing.base}px`,
                        color: colors.textSecondary,
                        fontWeight: 600,
                      }}
                    >
                      Moeda
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
                    <th
                      style={{
                        padding: `${spacing.base}px`,
                        color: colors.textSecondary,
                        fontWeight: 600,
                        textAlign: 'right',
                      }}
                    >
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWatchlistItems.map((item) => {
                    const hasQuote = Boolean(item.quote);
                    const isStale = item.quoteFreshness === 'STALE';
                    const statusVariant = !hasQuote ? 'warning' : isStale ? 'neutral' : 'positive';
                    const statusLabel = !hasQuote
                      ? 'Sem cotação'
                      : isStale
                        ? 'Desatualizada'
                        : 'Atualizada';

                    return (
                      <tr key={item.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td
                          style={{
                            padding: `${spacing.base}px`,
                            fontWeight: 600,
                            color: colors.textPrimary,
                          }}
                        >
                          <Link
                            href={`/market/assets/${item.assetId}`}
                            style={{ color: colors.textPrimary, textDecoration: 'none' }}
                          >
                            {item.ticker}
                          </Link>
                        </td>
                        <td style={{ padding: `${spacing.base}px`, color: colors.textSecondary }}>
                          {item.name}
                        </td>
                        <td style={{ padding: `${spacing.base}px` }}>
                          <Badge variant="neutral">{item.currency}</Badge>
                        </td>
                        <td
                          style={{
                            padding: `${spacing.base}px`,
                            fontWeight: 600,
                            color: colors.textPrimary,
                          }}
                        >
                          {item.quote ? formatCurrency(item.quote.price, item.quote.currency) : '—'}
                        </td>
                        <td style={{ padding: `${spacing.base}px`, color: colors.textSecondary }}>
                          {item.quote ? item.quote.tradingDate : '—'}
                        </td>
                        <td style={{ padding: `${spacing.base}px`, color: colors.textSecondary }}>
                          {item.quote ? item.quote.provider : '—'}
                        </td>
                        <td style={{ padding: `${spacing.base}px` }}>
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </td>
                        <td style={{ padding: `${spacing.base}px`, textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <Link
                              href={`/market/assets/${item.assetId}`}
                              style={{
                                fontSize: '0.8125rem',
                                color: colors.accent,
                                textDecoration: 'none',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '4px 8px',
                                borderRadius: `${borderRadius.sm}px`,
                                border: `1px solid ${colors.border}`,
                              }}
                            >
                              Detalhes
                            </Link>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => removeFromWatchlistMutation.mutate(item.assetId)}
                              disabled={removeFromWatchlistMutation.isPending}
                              aria-label={`Remover ${item.ticker} da watchlist`}
                            >
                              Remover
                            </Button>
                          </div>
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
              {formatPercentage(summary.valuationCoveragePercent)})
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
                          <Link
                            href={`/market/assets/${pos.assetId}`}
                            style={{ color: colors.textPrimary, textDecoration: 'none' }}
                          >
                            {pos.ticker || pos.assetId}
                          </Link>
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

      {/* Market Indicators (Strict Honest Disclosure: Future Integration, No Fake Numbers) */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Índices e Indicadores Macroeconômicos"
          description="Integração planejada com índices oficiais Bacen e B3 (sem números simulados)"
        />
        <MacroIndicatorCards />
      </div>
    </div>
  );
}
