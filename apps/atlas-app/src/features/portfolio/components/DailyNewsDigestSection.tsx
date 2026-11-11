import React, { useState } from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Card, Badge } from '../../../components/ui';
import {
  useMarkPortfolioNewsSeen,
  usePortfolioNews,
  useRefreshPortfolioNews,
} from '../usePortfolioNews';
import { formatUpdateReasonsSummary } from '../newsStateUtils';
import type { DailyNewsDigestItemDto } from '../types';
import { PortfolioNewsInbox } from './PortfolioNewsInbox';
import { useNotifications } from '../../notifications/NotificationProvider';

interface DailyNewsDigestSectionProps {
  portfolioId: string | null | undefined;
}

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

export const DailyNewsDigestSection: React.FC<DailyNewsDigestSectionProps> = ({ portfolioId }) => {
  const { data: newsRes, isLoading, isError } = usePortfolioNews(portfolioId);
  const refreshNews = useRefreshPortfolioNews(portfolioId);
  const markSeen = useMarkPortfolioNewsSeen(portfolioId);
  const { preferences: notificationPrefs, permissionState: notificationPermission } = useNotifications();
  const [showFullInbox, setShowFullInbox] = useState(false);

  const inbox = newsRes?.data;
  const digest = inbox?.digest;
  const metrics = inbox?.metrics;
  const newsState = inbox?.newsState;

  const items = digest?.items ?? [];
  const attentionCount = digest?.attentionEventsCount ?? ((digest?.criticalCount ?? 0) + (digest?.highCount ?? 0));
  const totalAudited = metrics?.totalAuditedAssets ?? 36;

  const hasNoveltyTracking =
    newsState?.initialized === true ||
    digest?.newEventsCount !== undefined ||
    metrics?.newEventsCount !== undefined;
  const newEventsCount = newsState?.newEventsCount ?? digest?.newEventsCount ?? metrics?.newEventsCount ?? 0;
  const newMaterialCount =
    newsState?.newMaterialEventsCount ??
    digest?.newMaterialEventsCount ??
    metrics?.newMaterialEventsCount ??
    0;
  const updatedEventsCount =
    newsState?.updatedEventsCount ?? digest?.updatedEventsCount ?? metrics?.updatedEventsCount ?? 0;
  const unseenTotal = newEventsCount + updatedEventsCount;
  const unseenMaterialUpdatesCount = React.useMemo(
    () =>
      (inbox?.events ?? []).filter(
        (ev) =>
          (ev.state === 'NEW' || ev.state === 'UPDATED') &&
          (ev.materiality === 'CRITICAL' || ev.materiality === 'HIGH'),
      ).length,
    [inbox?.events],
  );
  const effectiveUnseenMaterialCount = Math.max(unseenMaterialUpdatesCount, newMaterialCount);
  const localNewsAlertsActive =
    notificationPrefs.enabled &&
    notificationPrefs.materialNewsAlerts &&
    notificationPermission === 'granted';

  // Derive dynamic header summary: novelty-first when APP-16M state is active, backward-compatible otherwise
  const summaryHeader = React.useMemo(() => {
    if (hasNoveltyTracking) {
      if (newEventsCount > 0 && updatedEventsCount > 0) {
        return `${newEventsCount} ${newEventsCount === 1 ? 'novidade' : 'novidades'} (${newMaterialCount} de alta relevância) • ${updatedEventsCount} ${updatedEventsCount === 1 ? 'atualizado' : 'atualizados'}`;
      }
      if (newEventsCount > 0) {
        return `${newEventsCount} ${newEventsCount === 1 ? 'novidade' : 'novidades'} • ${newMaterialCount} de alta relevância`;
      }
      if (updatedEventsCount > 0) {
        return `${updatedEventsCount} ${updatedEventsCount === 1 ? 'evento atualizado' : 'eventos atualizados'} desde sua última consulta`;
      }
      return 'Nenhuma novidade relevante desde sua última consulta';
    }

    return attentionCount > 0
      ? `${attentionCount} ${attentionCount === 1 ? 'evento relevante merece' : 'eventos relevantes merecem'} atenção hoje`
      : 'Nenhum evento crítico ou de alta relevância identificado hoje';
  }, [hasNoveltyTracking, newEventsCount, newMaterialCount, updatedEventsCount, attentionCount]);

  const handleMarkItemSeen = (item: DailyNewsDigestItemDto) => {
    const targetId = item.canonicalEventId || item.id;
    if (item.state === 'NEW' || item.state === 'UPDATED') {
      markSeen.mutate({ canonicalEventIds: [targetId] });
    }
  };

  const providerLabel = React.useMemo(() => {
    if (!metrics) return 'Carregando...';
    const status = metrics.providerStatus.officialStatus;
    const providers = metrics.providerStatus.providersUsed || [];

    if (providers.includes('CVM / B3 Regulatório Oficial')) {
      if (status === 'OFFICIAL_PROVIDER_PARTIAL') {
        return '🏛 Regulatório Parcial + Imprensa';
      }
      return '🏛 CVM / B3 Oficial + Imprensa';
    }
    if (metrics.providerStatus.brapiNewsAvailable) {
      return 'BRAPI News (v2)';
    }
    return 'Google News (Agregador)';
  }, [metrics]);

  return (
    <div style={{ marginBottom: '28px' }} data-testid="daily-news-digest-section">
      <Card>
        {/* Section Header */}
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
                📰 O que aconteceu com sua carteira
              </h3>
              <Badge variant="neutral">
                {`${totalAudited} ativos monitorados`}
              </Badge>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8125rem', color: colors.textSecondary }}>
              {summaryHeader}
            </p>
            {(effectiveUnseenMaterialCount > 0 || localNewsAlertsActive) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                {effectiveUnseenMaterialCount > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.accent }}>
                    {effectiveUnseenMaterialCount === 1
                      ? '1 nova atualização relevante'
                      : `${effectiveUnseenMaterialCount} novas atualizações relevantes`}
                  </span>
                )}
                {localNewsAlertsActive && (
                  <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                    🔔 Alertas relevantes ativos
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {unseenTotal > 0 && (
              <button
                type="button"
                onClick={() => markSeen.mutate({ markAllNew: true })}
                disabled={markSeen.isPending}
                style={{
                  backgroundColor: `${colors.accent}15`,
                  border: `1px solid ${colors.accent}`,
                  borderRadius: `${borderRadius.sm}px`,
                  color: colors.accent,
                  cursor: markSeen.isPending ? 'default' : 'pointer',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                ✓ Marcar novidades como vistas
              </button>
            )}
            <Badge variant={metrics?.providerStatus.brapiNewsAvailable ? 'success' : 'neutral'}>
              {providerLabel}
            </Badge>
            <button
              type="button"
              onClick={() => refreshNews.mutate()}
              disabled={refreshNews.isPending}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.sm}px`,
                color: colors.textSecondary,
                cursor: refreshNews.isPending ? 'wait' : 'pointer',
                padding: '4px 8px',
                fontSize: '0.75rem',
              }}
              title="Atualizar Notícias"
              aria-label="Atualizar Notícias"
            >
              {refreshNews.isPending ? '⏳' : '🔄'}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && items.length === 0 ? (
          <div style={{ padding: `${spacing.lg}px`, textAlign: 'center', color: colors.textSecondary }}>
            Analisando comunicados oficiais e notícias da carteira...
          </div>
        ) : isError && items.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              color: colors.textSecondary,
              fontSize: '0.875rem',
            }}
          >
            Não foi possível atualizar notícias no momento. As cotações e análises patrimoniais permanecem funcionando.
          </div>
        ) : items.length === 0 ? (
          /* Empty State when no material items exist */
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              backgroundColor: colors.surfaceElevated,
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: '1.25rem', marginBottom: '8px' }}>✅</div>
            <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: '4px' }}>
              Nenhum evento material identificado hoje.
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, maxWidth: '500px', margin: '0 auto' }}>
              {`Monitorando ${totalAudited} ativos da sua carteira. Não foram detectados fatos relevantes críticos, resultados fora do radar ou alterações materiais recentes.`}
            </div>
          </div>
        ) : (
          /* Digest Items List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item: DailyNewsDigestItemDto) => {
              const borderLeftColor =
                item.materiality === 'CRITICAL'
                  ? colors.negative
                  : item.materiality === 'HIGH'
                  ? colors.warning
                  : item.sentiment === 'POSITIVE'
                  ? colors.positive
                  : item.sentiment === 'NEGATIVE'
                  ? colors.negative
                  : colors.accent;

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: `${borderRadius.md}px`,
                    backgroundColor: colors.surfaceElevated,
                    border: `1px solid ${colors.border}`,
                    borderLeft: `4px solid ${borderLeftColor}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {/* Top Bar: Ticker, Badges, Recency */}
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
                      <span
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
                        {item.ticker}
                      </span>

                      {/* Novelty Lifecycle Badge (APP-16M) */}
                      {item.state === 'NEW' && (
                        <Badge variant="warning" aria-label="Novo evento">
                          NOVO
                        </Badge>
                      )}
                      {item.state === 'UPDATED' && (
                        <Badge variant="primary" aria-label="Evento atualizado">
                          ATUALIZADO
                        </Badge>
                      )}
                      {item.state === 'SEEN' && (
                        <Badge variant="neutral" aria-label="Evento visto">
                          VISTO
                        </Badge>
                      )}

                      {/* Materiality Badge */}
                      {item.materiality === 'CRITICAL' && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: `${borderRadius.full}px`,
                            backgroundColor: `${colors.negative}20`,
                            color: colors.negative,
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                          }}
                        >
                          🔴 Crítico
                        </span>
                      )}
                      {item.materiality === 'HIGH' && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: `${borderRadius.full}px`,
                            backgroundColor: `${colors.warning}20`,
                            color: colors.warning,
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                          }}
                        >
                          🟠 Alta Relevância
                        </span>
                      )}
                      {item.materiality === 'MEDIUM' && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: `${borderRadius.full}px`,
                            backgroundColor: `${colors.accent}15`,
                            color: colors.accent,
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                          }}
                        >
                          🟡 Média
                        </span>
                      )}
                      {item.materiality === 'ROUTINE' && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: `${borderRadius.full}px`,
                            backgroundColor: `${colors.border}40`,
                            color: colors.textSecondary,
                            fontSize: '0.6875rem',
                            fontWeight: 500,
                          }}
                        >
                          ⚪ Rotina
                        </span>
                      )}

                      {/* Event Type Badge */}
                      {item.eventType === 'FACT_RELEVANT' && (
                        <Badge variant="warning">Fato Relevante</Badge>
                      )}
                      {item.eventType === 'EARNINGS' && (
                        <Badge variant="neutral">Balanço / Resultados</Badge>
                      )}
                      {item.eventType === 'DIVIDEND' && (
                        <Badge variant="neutral">Proventos</Badge>
                      )}

                      {/* Official Provenance */}
                      {item.official ? (
                        <Badge variant="primary">🏛 {item.sourceName || 'Oficial'}</Badge>
                      ) : (
                        <Badge variant="neutral">📰 {item.sourceName || 'Imprensa'}</Badge>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: colors.textSecondary }}>
                      <span>{formatRelativeTime(item.publishedAt)}</span>
                      <span>•</span>
                      <span>
                        Sentimento:{' '}
                        <strong
                          style={{
                            color:
                              item.sentiment === 'POSITIVE'
                                ? colors.positive
                                : item.sentiment === 'NEGATIVE'
                                ? colors.negative
                                : colors.textSecondary,
                          }}
                        >
                          {item.sentiment === 'POSITIVE'
                            ? 'Positivo'
                            : item.sentiment === 'NEGATIVE'
                            ? 'Negativo'
                            : 'Neutro'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Headline */}
                  <div
                    style={{
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: colors.textPrimary,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.headline}
                  </div>

                  {/* Why it Matters (Explainability) */}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: `${borderRadius.sm}px`,
                      backgroundColor: `${colors.background}`,
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      lineHeight: 1.4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div>
                      <strong style={{ color: colors.textPrimary }}>Por que importa: </strong>
                      {item.materialityReason}
                    </div>

                    {item.radarImpact && (
                      <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                        Impacto no Radar:{' '}
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              item.radarImpact === 'POSITIVE'
                                ? colors.positive
                                : item.radarImpact === 'NEGATIVE'
                                ? colors.negative
                                : colors.textSecondary,
                          }}
                        >
                          {item.radarImpact === 'POSITIVE'
                            ? 'Positivo'
                            : item.radarImpact === 'NEGATIVE'
                            ? 'Negativo'
                            : 'Neutro'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Update Reason Context (when UPDATED) */}
                  {item.state === 'UPDATED' && formatUpdateReasonsSummary(item.updateReasons) && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: colors.accent,
                        fontWeight: 500,
                      }}
                    >
                      {formatUpdateReasonsSummary(item.updateReasons)}
                    </div>
                  )}

                  {/* Footer: Mark Seen & Official Link */}
                  {(item.canonicalUrl || item.state === 'NEW' || item.state === 'UPDATED') && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: '12px',
                        marginTop: '2px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {(item.state === 'NEW' || item.state === 'UPDATED') && (
                        <button
                          type="button"
                          onClick={() => handleMarkItemSeen(item)}
                          style={{
                            background: 'none',
                            border: `1px solid ${colors.border}`,
                            borderRadius: `${borderRadius.sm}px`,
                            color: colors.textSecondary,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            padding: '2px 8px',
                          }}
                        >
                          ✓ Marcar como visto
                        </button>
                      )}
                      {item.canonicalUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            handleMarkItemSeen(item);
                            handleOpenLink(item.canonicalUrl);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: colors.accent,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                          }}
                        >
                          {item.official ? 'Acessar documento oficial ↗' : 'Acessar matéria original ↗'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* View All / Toggle Inbox Action */}
        <div
          style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
            {inbox?.totalEvents ? `${inbox.totalEvents} documentos e matérias arquivados na caixa de entrada` : ''}
          </span>

          <button
            onClick={() => setShowFullInbox((prev) => !prev)}
            style={{
              padding: '6px 14px',
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.accent,
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {showFullInbox ? 'Ocultar caixa completa ▲' : `Ver todas as notícias (${inbox?.totalEvents ?? 0}) ▼`}
          </button>
        </div>
      </Card>

      {/* Expanded Full Inbox when toggled */}
      {showFullInbox && (
        <div style={{ marginTop: '16px' }}>
          <PortfolioNewsInbox portfolioId={portfolioId} />
        </div>
      )}
    </div>
  );
};
