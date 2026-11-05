import React, { useEffect } from 'react';
import type { PositionValuationDto } from '../types';
import { Modal, Badge, Button } from '../../../components/ui';
import { colors, spacing, borderRadius, formatCurrency, formatQuantity, formatPercentage, formatDate } from '@atlas/ui';
import { registerAndroidBackHandler } from '../../../hooks/useAndroidBackButton';

export interface PositionDetailModalProps {
  position: PositionValuationDto | null;
  isOpen: boolean;
  onClose: () => void;
  totalMarketValue?: string | null;
}

export const PositionDetailModal: React.FC<PositionDetailModalProps> = ({
  position,
  isOpen,
  onClose,
  totalMarketValue,
}) => {
  // Register Android hardware back handler to dismiss modal first
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerAndroidBackHandler(() => {
      onClose();
      return true; // handled
    });
    return unregister;
  }, [isOpen, onClose]);

  if (!position) return null;

  const ticker = position.ticker || position.assetId.slice(0, 8);
  const avgPriceFormatted = position.averageCost
    ? formatCurrency(position.averageCost.amount, position.averageCost.currency)
    : '—';
  const totalCostFormatted = position.totalCost
    ? formatCurrency(position.totalCost.amount, position.totalCost.currency)
    : '—';
  const currentPriceFormatted = position.quote
    ? formatCurrency(position.quote.price, position.quote.currency)
    : '—';
  const marketValueFormatted = position.marketValue
    ? formatCurrency(position.marketValue.amount, position.marketValue.currency)
    : '—';

  const unrealizedAmount = position.unrealizedGainLoss
    ? formatCurrency(position.unrealizedGainLoss.amount, position.unrealizedGainLoss.currency)
    : null;
  const unrealizedPercent = position.unrealizedGainLossPercent
    ? formatPercentage(position.unrealizedGainLossPercent, { showSign: true })
    : null;

  const isPositive = position.unrealizedGainLoss
    ? !position.unrealizedGainLoss.amount.startsWith('-') && position.unrealizedGainLoss.amount !== '0'
    : false;
  const isNegative = position.unrealizedGainLoss
    ? position.unrealizedGainLoss.amount.startsWith('-')
    : false;
  const resultColor = isPositive ? colors.positive : isNegative ? colors.negative : colors.textSecondary;

  const quoteDateFormatted = position.quote?.asOf ? formatDate(position.quote.asOf) : '—';
  const quoteSource = position.quote?.source || 'BRAPI EOD';
  const freshnessLabel = position.quote?.freshness === 'FRESH' ? 'Em dia' : 'D-1';

  // Calculate weight % if available or from total
  const calculatedWeight =
    (position as unknown as { weightPercent?: string }).weightPercent ||
    (position.marketValue && totalMarketValue && Number(totalMarketValue) > 0
      ? ((Number(position.marketValue.amount) / Number(totalMarketValue)) * 100).toFixed(2)
      : null);

  const getAssetTypeLabel = (type?: string | null) => {
    switch (type) {
      case 'STOCK':
        return 'Ação';
      case 'FII':
        return 'FII';
      case 'ETF':
        return 'ETF';
      case 'BDR':
        return 'BDR';
      case 'FIXED_INCOME':
        return 'Renda Fixa';
      case 'TREASURY':
        return 'Tesouro';
      case 'CRYPTO':
        return 'Cripto';
      default:
        return type || 'Ativo';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Detalhes de ${ticker}`} maxWidth="520px">
      <div
        data-testid="position-detail-modal"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.lg}px`,
        }}
      >
        {/* Header Hero */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingBottom: `${spacing.base}px`,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.textPrimary }}>
                {ticker}
              </span>
              <Badge variant="neutral">{getAssetTypeLabel(position.assetType)}</Badge>
              {position.quote && (
                <Badge variant={position.quote.freshness === 'FRESH' ? 'positive' : 'warning'}>
                  {freshnessLabel}
                </Badge>
              )}
            </div>
            <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Custódia atual: <strong>{formatQuantity(position.quantity)} cotas/ações</strong>
            </span>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block' }}>
              Valor Total de Mercado
            </span>
            <span style={{ fontSize: '1.375rem', fontWeight: 700, color: colors.textPrimary }}>
              {marketValueFormatted}
            </span>
            {unrealizedAmount && (
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: resultColor, display: 'block' }}>
                {unrealizedAmount} ({unrealizedPercent})
              </span>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: `${spacing.base}px`,
          }}
        >
          {/* Average Cost */}
          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
            }}
          >
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: '2px' }}>
              Preço Médio de Aquisição
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary }}>
              {avgPriceFormatted}
            </span>
          </div>

          {/* Total Cost */}
          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
            }}
          >
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: '2px' }}>
              Custo Total no Ledger
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary }}>
              {totalCostFormatted}
            </span>
          </div>

          {/* Current Quote */}
          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
            }}
          >
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: '2px' }}>
              Cotação Atual (Fechamento)
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary }}>
              {currentPriceFormatted}
            </span>
            <span style={{ fontSize: '0.6875rem', color: colors.textSecondary, display: 'block', marginTop: '2px' }}>
              Data: {quoteDateFormatted}
            </span>
          </div>

          {/* Weight in Portfolio */}
          <div
            style={{
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
            }}
          >
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: '2px' }}>
              Participação na Carteira
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary }}>
              {calculatedWeight ? `${calculatedWeight}%` : '—'}
            </span>
            <span style={{ fontSize: '0.6875rem', color: colors.textSecondary, display: 'block', marginTop: '2px' }}>
              Fonte: {quoteSource}
            </span>
          </div>
        </div>

        {/* Cost Basis Status & Audit Note */}
        <div
          style={{
            padding: `${spacing.md}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: `${colors.accent}10`,
            border: `1px solid ${colors.accent}30`,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textPrimary }}>
              Status da Base de Custo
            </span>
            <Badge variant={position.costBasisStatus === 'KNOWN' ? 'positive' : 'warning'}>
              {position.costBasisStatus === 'KNOWN' ? 'AUDITADO VIA LEDGER' : 'INCOMPLETO'}
            </Badge>
          </div>
          <span style={{ fontSize: '0.75rem', color: colors.textSecondary, lineHeight: 1.5 }}>
            Posição calculada matematicamente sob demanda a partir do histórico imutável de transações.
            Modo estritamente de consulta (read-only).
          </span>
        </div>

        {/* Bottom Close Button (Touch target >= 48px) */}
        <div style={{ marginTop: `${spacing.sm}px` }}>
          <Button
            variant="outline"
            onClick={onClose}
            style={{
              width: '100%',
              minHeight: '48px',
              fontSize: '0.9375rem',
              fontWeight: 600,
            }}
            data-testid="close-position-detail-button"
          >
            Fechar Detalhes
          </Button>
        </div>
      </div>
    </Modal>
  );
};
