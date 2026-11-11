import React, { useState, useMemo } from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Card, Badge, EmptyState } from '../../../components/ui';
import { usePortfolioNews } from '../usePortfolioNews';
import type { PortfolioNewsEventDto } from '../types';

interface PortfolioNewsInboxProps {
  portfolioId: string | null | undefined;
}

type FilterOption = 'ALL' | 'STOCKS' | 'FIIS' | 'OFFICIAL' | 'HIGH_IMPORTANCE' | '24H' | '7D';

function formatRelativeTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60);

    if (diffHours < 1) return 'Agora há pouco';
    if (diffHours < 24) return `Há ${Math.floor(diffHours)}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `Há ${diffDays} dias`;
    if (diffDays < 30) return `Há ${Math.floor(diffDays / 7)} sem.`;
    return `Há ${Math.floor(diffDays / 30)} meses`;
  } catch {
    return '—';
  }
}

function handleOpenLink(url?: string) {
  if (!url) return;
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // fallback
  }
}

export const PortfolioNewsInbox: React.FC<PortfolioNewsInboxProps> = ({ portfolioId }) => {
  const { data: newsRes, isLoading, isError, refetch } = usePortfolioNews(portfolioId);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('ALL');

  const inbox = newsRes?.data;
  const events = useMemo(() => inbox?.events || [], [inbox?.events]);
  const metrics = inbox?.metrics;

  const filteredEvents = useMemo(() => {
    return events.filter((ev: PortfolioNewsEventDto) => {
      if (activeFilter === 'OFFICIAL') return ev.official;
      if (activeFilter === 'HIGH_IMPORTANCE') return ev.importance >= 4;
      if (activeFilter === '24H') return ev.freshness === 'BREAKING';
      if (activeFilter === '7D') {
        return ev.freshness === 'BREAKING' || ev.freshness === 'VERY_RECENT' || ev.freshness === 'RECENT';
      }
      if (activeFilter === 'STOCKS') {
        return ev.assets.some((a) => !a.endsWith('11') && !a.endsWith('11B'));
      }
      if (activeFilter === 'FIIS') {
        return ev.assets.some((a) => a.endsWith('11') || a.endsWith('11B'));
      }
      return true;
    });
  }, [events, activeFilter]);

  const providerLabel = useMemo(() => {
    if (!metrics) return 'Carregando provedor...';
    const providers = metrics.providerStatus.providersUsed || [];
    if (providers.includes('CVM / B3 Regulatório Oficial')) {
      return '🏛 CVM / B3 Oficial + Imprensa';
    }
    if (metrics.providerStatus.brapiNewsAvailable) {
      return 'BRAPI News (v2)';
    }
    return 'Google News (Agregador) • Fallback Ativo';
  }, [metrics]);

  return (
    <div style={{ marginBottom: '28px' }} data-testid="portfolio-news-inbox">
      <Card>
        {/* Header Section */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  letterSpacing: '-0.01em',
                }}
              >
                📰 Notícias da Carteira
              </h3>
              <Badge variant="neutral">
                {metrics ? `${metrics.totalAuditedAssets} ativos auditados` : 'Auditoria ativa'}
              </Badge>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: colors.textSecondary }}>
              Inteligência de fatos relevantes e imprensa financeira consolidada por ativo
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge variant={metrics?.providerStatus.brapiNewsAvailable ? 'success' : 'neutral'}>
              {providerLabel}
            </Badge>
            <button
              onClick={() => refetch()}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.sm}px`,
                color: colors.textSecondary,
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '0.75rem',
              }}
              title="Atualizar Notícias"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Quick KPI Bar */}
        {metrics && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
              padding: '12px',
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.6875rem', color: colors.textSecondary, textTransform: 'uppercase' }}>
                Últimas 24h
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.positive }}>
                {metrics.breakingCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.6875rem', color: colors.textSecondary, textTransform: 'uppercase' }}>
                Recentes (7d)
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.accent }}>
                {metrics.recentCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.6875rem', color: colors.textSecondary, textTransform: 'uppercase' }}>
                Fatos Oficiais
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.accent }}>
                {metrics.officialCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.6875rem', color: colors.textSecondary, textTransform: 'uppercase' }}>
                Alta Importância
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: colors.warning }}>
                {metrics.highImportanceCount}
              </div>
            </div>
          </div>
        )}

        {/* Filter Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '8px',
            marginBottom: '16px',
          }}
          role="tablist"
        >
          {(
            [
              { id: 'ALL', label: `Todos (${events.length})` },
              { id: 'OFFICIAL', label: `🏛 Oficiais (${metrics?.officialCount ?? 0})` },
              { id: 'HIGH_IMPORTANCE', label: `⭐ Alta Importância (${metrics?.highImportanceCount ?? 0})` },
              { id: '24H', label: `⚡ Últimas 24h (${metrics?.breakingCount ?? 0})` },
              { id: '7D', label: `📅 Últimos 7 dias (${metrics?.recentCount ?? 0})` },
              { id: 'STOCKS', label: 'Ações' },
              { id: 'FIIS', label: 'FIIs' },
            ] as const
          ).map((tab) => {
            const isSelected = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveFilter(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: `${borderRadius.full}px`,
                  border: isSelected ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
                  backgroundColor: isSelected ? `${colors.accent}15` : colors.surfaceElevated,
                  color: isSelected ? colors.accent : colors.textSecondary,
                  fontSize: '0.8125rem',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content State */}
        {isLoading && events.length === 0 ? (
          <div style={{ padding: `${spacing.lg}px`, textAlign: 'center', color: colors.textSecondary }}>
            Buscando notícias e eventos oficiais da carteira...
          </div>
        ) : isError && events.length === 0 ? (
          <EmptyState
            title="Não foi possível carregar as notícias"
            description="Tente novamente mais tarde. As cotações e análises patrimoniais permanecem funcionando normalmente."
          />
        ) : filteredEvents.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              color: colors.textSecondary,
              fontSize: '0.875rem',
            }}
          >
            Nenhum evento recente encontrado para o filtro selecionado. Todos os ativos continuam sendo monitorados.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredEvents.map((ev: PortfolioNewsEventDto) => {
              const borderLeftColor =
                ev.sentiment === 'POSITIVE'
                  ? colors.positive
                  : ev.sentiment === 'NEGATIVE'
                  ? colors.negative
                  : colors.accent;

              return (
                <div
                  key={ev.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: `${borderRadius.md}px`,
                    backgroundColor: colors.surfaceElevated,
                    border: `1px solid ${colors.border}`,
                    borderLeft: `4px solid ${borderLeftColor}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'transform 0.1s ease',
                  }}
                >
                  {/* Top line: Badges, Recency, Importance */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {ev.assets.map((asset) => (
                        <span
                          key={asset}
                          style={{
                            padding: '2px 8px',
                            borderRadius: `${borderRadius.sm}px`,
                            backgroundColor: `${colors.accent}20`,
                            color: colors.accent,
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {asset}
                        </span>
                      ))}

                      {ev.eventType === 'FACT_RELEVANT' && (
                        <Badge variant="warning">Fato Relevante</Badge>
                      )}
                      {ev.eventType === 'MARKET_NOTICE' && (
                        <Badge variant="neutral">Comunicado ao Mercado</Badge>
                      )}
                      {ev.eventType === 'EARNINGS' && (
                        <Badge variant="neutral">Resultados</Badge>
                      )}
                      {ev.eventType === 'DIVIDEND' && (
                        <Badge variant="neutral">Proventos</Badge>
                      )}

                      {ev.official ? (
                        <Badge variant="primary">🏛 Oficial</Badge>
                      ) : (
                        <Badge variant="neutral">📰 {ev.sources[0]?.name || 'Imprensa'}</Badge>
                      )}

                      {ev.importance >= 4 && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: colors.warning,
                            fontWeight: 600,
                          }}
                          title={`Importância nível ${ev.importance}/5`}
                        >
                          {'⭐'.repeat(ev.importance)}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: colors.textSecondary }}>
                      <span>{formatRelativeTime(ev.publishedAt)}</span>
                      <span>•</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            ev.sentiment === 'POSITIVE'
                              ? colors.positive
                              : ev.sentiment === 'NEGATIVE'
                              ? colors.negative
                              : colors.textSecondary,
                          textTransform: 'uppercase',
                          fontSize: '0.6875rem',
                        }}
                      >
                        {ev.sentiment === 'POSITIVE' ? 'Positivo' : ev.sentiment === 'NEGATIVE' ? 'Negativo' : 'Neutro'}
                      </span>
                    </div>
                  </div>

                  {/* Headline & Link */}
                  <div>
                    <h4
                      onClick={() => handleOpenLink(ev.sources[0]?.url)}
                      style={{
                        margin: 0,
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        color: colors.textPrimary,
                        lineHeight: 1.4,
                        cursor: ev.sources[0]?.url ? 'pointer' : 'default',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (ev.sources[0]?.url) (e.currentTarget as HTMLElement).style.color = colors.accent;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = colors.textPrimary;
                      }}
                    >
                      {ev.headline}
                      {ev.sources[0]?.url && (
                        <span style={{ marginLeft: '6px', fontSize: '0.75rem', opacity: 0.7 }}>↗</span>
                      )}
                    </h4>
                    {ev.summary && ev.summary !== ev.headline && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.4 }}>
                        {ev.summary}
                      </p>
                    )}
                  </div>

                  {/* Sources Bar */}
                  {ev.sources && ev.sources.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>Fontes:</span>
                      {ev.sources.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleOpenLink(s.url)}
                          disabled={!s.url}
                          style={{
                            padding: '2px 8px',
                            borderRadius: `${borderRadius.sm}px`,
                            backgroundColor: colors.surface,
                            border: `1px solid ${colors.border}`,
                            color: s.url ? colors.accent : colors.textSecondary,
                            fontSize: '0.6875rem',
                            cursor: s.url ? 'pointer' : 'default',
                          }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
