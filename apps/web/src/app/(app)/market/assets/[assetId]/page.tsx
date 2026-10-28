'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  SectionHeader,
  Card,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  useToast,
} from '@/components/ui';
import {
  colors,
  spacing,
  formatCurrency,
  watchlistQueryKey,
  marketAssetDetailQueryKey,
  MarketAssetDetailVM,
} from '@atlas/ui';
import { apiClient, ApiError } from '@/api/client';

export default function MarketAssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const assetId = (params?.assetId as string) || '';

  const {
    data: response,
    isLoading,
    isError,
  } = useQuery<{ data: MarketAssetDetailVM }>({
    queryKey: marketAssetDetailQueryKey(assetId),
    queryFn: async () => {
      return apiClient.get(`/api/v1/market/assets/${assetId}`);
    },
    enabled: Boolean(assetId),
    staleTime: 30 * 1000,
  });

  const detail = response?.data;

  const toggleWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!detail) return;
      if (detail.isWatched) {
        await apiClient.delete(`/api/v1/watchlist/${assetId}`);
      } else {
        await apiClient.post('/api/v1/watchlist', { assetId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketAssetDetailQueryKey(assetId) });
      queryClient.invalidateQueries({ queryKey: watchlistQueryKey() });
      showToast(
        detail?.isWatched
          ? 'Ativo removido da lista de acompanhamento.'
          : 'Ativo adicionado à lista de acompanhamento.',
        'positive',
      );
    },
    onError: (err: ApiError) => {
      showToast(err.message || 'Falha ao atualizar lista de acompanhamento.', 'negative');
    },
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Detalhes do Ativo" subtitle="Carregando dados de mercado..." />
        <Card style={{ padding: `${spacing.xl}px` }}>
          <Skeleton width="100%" height="240px" />
        </Card>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div>
        <PageHeader title="Ativo não encontrado" subtitle="Mercado" />
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Ativo não localizado"
            description="O ativo solicitado não existe no catálogo de mercado ou foi deslistado."
            actionLabel="Voltar para Mercado"
            onAction={() => router.push('/market')}
          />
        </Card>
      </div>
    );
  }

  const quote = detail.quote;
  const hasQuote = Boolean(quote);
  const isStale = detail.quoteFreshness === 'STALE';
  const statusVariant = !hasQuote ? 'warning' : isStale ? 'neutral' : 'positive';
  const statusLabel = !hasQuote ? 'Sem cotação' : isStale ? 'Desatualizada' : 'Atualizada';

  return (
    <div>
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <Link
          href="/market"
          style={{
            color: colors.accent,
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ← Voltar para Mercado
        </Link>
      </div>

      <PageHeader
        title={`${detail.ticker} — ${detail.name}`}
        subtitle={`${detail.type} • ${detail.exchange} • Moeda nativa: ${detail.currency}`}
        action={
          <Button
            variant={detail.isWatched ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => toggleWatchlistMutation.mutate()}
            disabled={toggleWatchlistMutation.isPending}
            aria-label={detail.isWatched ? 'Remover da Watchlist' : 'Adicionar à Watchlist'}
          >
            {toggleWatchlistMutation.isPending
              ? 'Salvando...'
              : detail.isWatched
                ? '★ Acompanhando'
                : '☆ Acompanhar ativo'}
          </Button>
        }
      />

      {/* Custody Holding Banner if Investor Holds this Asset */}
      {detail.isHeld && (
        <Card
          style={{
            marginBottom: `${spacing.base}px`,
            borderLeft: `4px solid ${colors.positive}`,
            backgroundColor: colors.surface,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: `${spacing.base}px`,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: '2px' }}>
                Ativo em Custódia
              </div>
              <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                Você possui posição deste ativo nas seguintes carteiras:{' '}
                <strong>{detail.heldInPortfolios.map((p) => p.name).join(', ')}</strong>.
              </div>
            </div>
            <Link
              href="/portfolio"
              style={{
                fontSize: '0.875rem',
                color: colors.accent,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Ver posição na Carteira →
            </Link>
          </div>
        </Card>
      )}

      {/* Primary Market Quote Card */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Cotação e Mercado"
          description={`Preço de referência na moeda oficial do ativo (${detail.currency})`}
        />
        <Card style={{ padding: `${spacing.base}px` }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: `${spacing.base}px`,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                Último Preço ({detail.currency})
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  marginTop: '4px',
                }}
              >
                {quote ? formatCurrency(quote.price, quote.currency) : '—'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                Data de Referência
              </div>
              <div
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: colors.textPrimary,
                  marginTop: '4px',
                }}
              >
                {quote ? quote.tradingDate : '—'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                Fonte / Provedor
              </div>
              <div
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: colors.textPrimary,
                  marginTop: '4px',
                }}
              >
                {quote ? quote.provider : '—'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                }}
              >
                Frescor da Cotação
              </div>
              <div style={{ marginTop: '6px' }}>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Honest Limitations Notice: Fundamentals & News Providers (Zero Fake Figures) */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Indicadores Fundamentalistas e Notícias"
          description="Integrações externas adicionais e conformidade com honestidade de dados"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: `${spacing.base}px`,
          }}
        >
          <Card style={{ padding: `${spacing.base}px` }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                Fundamentos da Empresa
              </div>
              <Badge variant="neutral">Indisponível</Badge>
            </div>
            <p
              style={{
                fontSize: '0.875rem',
                color: colors.textSecondary,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Múltiplos e indicadores contábeis (P/L, DY, P/VP, Margens) requerem conector
              homologado de dados fundamentalistas. O Atlas não simula nem inventa dados
              financeiros.
            </p>
          </Card>

          <Card style={{ padding: `${spacing.base}px` }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                Notícias e Fatos Relevantes
              </div>
              <Badge variant="neutral">Indisponível</Badge>
            </div>
            <p
              style={{
                fontSize: '0.875rem',
                color: colors.textSecondary,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Feed de notícias corporativas em tempo real exige integração externa homologada de
              jornalismo financeiro. O Atlas não exibe notícias fictícias.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
