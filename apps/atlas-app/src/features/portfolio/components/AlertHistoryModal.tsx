import React, { useEffect, useState } from 'react';
import { borderRadius, colors, spacing } from '@atlas/ui';
import { Badge, Button, EmptyState, Modal, Skeleton } from '../../../components/ui';
import type {
  PortfolioNewsAlertHistoryItemDto,
  PortfolioNewsAlertHistoryStatusDto,
} from '../types';
import { usePortfolioNewsAlertHistory } from '../usePortfolioNews';

interface AlertHistoryModalProps {
  portfolioId: string;
  isOpen: boolean;
  onClose: () => void;
}

type StatusFilter = 'ALL' | PortfolioNewsAlertHistoryStatusDto;

function formatLocalDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveEventActionLabel(item: PortfolioNewsAlertHistoryItemDto): string {
  if (item.alertType === 'MATERIAL_BATCH_SUMMARY') {
    return item.eventState === 'UPDATED'
      ? `Atualização em lote (${item.batchEventCount} eventos)`
      : `Resumo em lote (${item.batchEventCount} eventos)`;
  }
  if (item.eventState === 'UPDATED') {
    return item.materiality === 'CRITICAL' ? 'Atualização crítica' : 'Atualização';
  }
  return item.materiality === 'CRITICAL'
    ? 'Novo evento crítico'
    : 'Nova notícia de alta relevância';
}

function resolveStatusDisplay(status: PortfolioNewsAlertHistoryStatusDto): {
  label: string;
  variant: 'success' | 'neutral';
} {
  switch (status) {
    case 'DELIVERED':
      return { label: 'DELIVERED', variant: 'success' };
    case 'PERMISSION_DENIED':
      return { label: 'Permissão negada', variant: 'neutral' };
    case 'UNSUPPORTED':
      return { label: 'Não suportado no dispositivo', variant: 'neutral' };
    case 'UNAVAILABLE':
      return { label: 'Serviço indisponível', variant: 'neutral' };
    case 'DELIVERY_FAILED':
    default:
      return { label: 'Falha ao entregar', variant: 'neutral' };
  }
}

export const AlertHistoryModal: React.FC<AlertHistoryModalProps> = ({
  portfolioId,
  isOpen,
  onClose,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [tickerFilter, setTickerFilter] = useState<string>('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedItems, setAccumulatedItems] = useState<PortfolioNewsAlertHistoryItemDto[]>([]);

  const trimmedTicker = tickerFilter.trim().toUpperCase() || undefined;
  const activeStatus = statusFilter === 'ALL' ? undefined : statusFilter;

  const { data, isLoading, isError, refetch } = usePortfolioNewsAlertHistory(portfolioId, {
    limit: 20,
    cursor,
    status: activeStatus,
    ticker: trimmedTicker,
    enabled: isOpen,
  });

  const response = data?.data;

  // Reset pagination when filters change or modal reopens
  useEffect(() => {
    setCursor(undefined);
    setAccumulatedItems([]);
  }, [portfolioId, statusFilter, trimmedTicker, isOpen]);

  useEffect(() => {
    if (!response) return;
    if (!cursor) {
      setAccumulatedItems(response.items);
      return;
    }
    setAccumulatedItems((prev) => {
      const seen = new Set(prev.map((item) => item.id));
      const merged = [...prev];
      for (const item of response.items) {
        if (!seen.has(item.id)) {
          merged.push(item);
        }
      }
      return merged;
    });
  }, [response, cursor]);

  const items = accumulatedItems.length > 0 ? accumulatedItems : (response?.items ?? []);
  const metrics = response?.metrics;
  const sinceLabel = response?.historyAvailableSince
    ? `Histórico disponível a partir de ${formatLocalDateTime(response.historyAvailableSince)}`
    : 'Histórico ativo a partir da ativação no Atlas Desktop (somente tentativas com o app aberto).';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Histórico de alertas" maxWidth="680px">
      <div style={{ padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {/* Rollout / Scope Context Note */}
        <div
          style={{
            fontSize: '0.75rem',
            color: colors.textSecondary,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: `${borderRadius.sm}px`,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span>{sinceLabel}</span>
          {metrics && metrics.totalCount > 0 && (
            <span>
              {`${metrics.deliveredCount} entregues · ${metrics.failedCount} falhas · ${metrics.criticalCount} críticos · ${metrics.highCount} alta`}
            </span>
          )}
        </div>

        {/* Filters */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                { key: 'ALL', label: 'Todos' },
                { key: 'DELIVERED', label: 'Entregues' },
                { key: 'DELIVERY_FAILED', label: 'Falhas' },
                { key: 'PERMISSION_DENIED', label: 'Permissão' },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: `${borderRadius.sm}px`,
                    border: `1px solid ${active ? colors.accent : colors.border}`,
                    backgroundColor: active ? `${colors.accent}15` : 'transparent',
                    color: active ? colors.accent : colors.textSecondary,
                    fontSize: '0.75rem',
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            placeholder="Filtrar ticker (ex: PETR4)"
            aria-label="Filtrar histórico por ticker"
            style={{
              padding: '4px 10px',
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.75rem',
              width: '170px',
            }}
          />
        </div>

        {/* Content */}
        {isLoading && items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <Skeleton height="84px" />
            <Skeleton height="84px" />
          </div>
        ) : isError && items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: spacing.md, color: colors.textSecondary }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.875rem' }}>
              Não foi possível carregar o histórico de alertas no momento.
            </p>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhum alerta registrado até agora"
            description="Quando alertas de notícias relevantes (HIGH ou CRITICAL) forem processados com o Atlas em execução, as tentativas e confirmações aparecerão aqui."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxHeight: '420px', overflowY: 'auto' }}>
            {items.map((item) => {
              const statusInfo = resolveStatusDisplay(item.deliveryStatus);
              const displayTime = item.deliveredAt || item.attemptedAt;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.surfaceElevated,
                    border: `1px solid ${colors.border}`,
                    borderRadius: `${borderRadius.md}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ color: colors.textPrimary, fontSize: '0.875rem' }}>
                        {item.ticker}
                      </strong>
                      <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                        {resolveEventActionLabel(item)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      <Badge variant={item.materiality === 'CRITICAL' ? 'danger' : 'warning'}>
                        {item.materiality}
                      </Badge>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem',
                      color: colors.textSecondary,
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <span>{formatLocalDateTime(displayTime)}</span>
                    {item.sourceLabel && <span>{`Fonte: ${item.sourceLabel}`}</span>}
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: colors.textPrimary, lineHeight: 1.4 }}>
                    {item.headline}
                  </div>

                  {item.materialityReason && (
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      {item.materialityReason}
                    </div>
                  )}

                  {item.batchEventCount > 1 && item.batchTickers.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      {`Vínculo em lote (${item.batchEventCount} eventos): ${item.batchTickers.join(', ')}`}
                    </div>
                  )}

                  {item.deliveryStatus !== 'DELIVERED' && item.failureReason && (
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      {`Detalhe técnico: ${item.failureReason}`}
                    </div>
                  )}
                </div>
              );
            })}

            {response?.hasMore && response.nextCursor && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4px' }}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCursor(response.nextCursor ?? undefined)}
                >
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
