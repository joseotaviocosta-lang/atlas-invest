import React from 'react';
import type { PositionValuationDto } from '../types';
import { Card, Badge, EmptyState } from '../../../components/ui';
import { colors, formatCurrency, formatQuantity, formatPercentage } from '@atlas/ui';

interface PositionsTableProps {
  positions: PositionValuationDto[];
  isLoading?: boolean;
}

export const PositionsTable: React.FC<PositionsTableProps> = ({
  positions,
  isLoading = false,
}) => {
  if (!isLoading && positions.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nenhuma posição em custódia"
          description="Sua carteira ainda não possui ativos com saldo positivo no ledger."
        />
      </Card>
    );
  }

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
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '0.875rem',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: colors.surfaceElevated,
                borderBottom: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Ativo</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Tipo</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Qtd.</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Preço Médio</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Cotação Atual</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Valor Total</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Resultado</th>
              <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const ticker = pos.ticker || pos.assetId.slice(0, 8);
              const avgPriceFormatted = pos.averageCost
                ? formatCurrency(pos.averageCost.amount, pos.averageCost.currency)
                : '—';
              const currentPriceFormatted = pos.quote
                ? formatCurrency(pos.quote.price, pos.quote.currency)
                : '—';
              const marketValueFormatted = pos.marketValue
                ? formatCurrency(pos.marketValue.amount, pos.marketValue.currency)
                : '—';

              const unrealizedAmount = pos.unrealizedGainLoss
                ? formatCurrency(pos.unrealizedGainLoss.amount, pos.unrealizedGainLoss.currency)
                : null;
              const unrealizedPercent = pos.unrealizedGainLossPercent
                ? formatPercentage(pos.unrealizedGainLossPercent, { showSign: true })
                : null;

              const isPositive = pos.unrealizedGainLoss
                ? !pos.unrealizedGainLoss.amount.startsWith('-') && pos.unrealizedGainLoss.amount !== '0'
                : false;
              const isNegative = pos.unrealizedGainLoss
                ? pos.unrealizedGainLoss.amount.startsWith('-')
                : false;

              const resultColor = isPositive ? colors.positive : isNegative ? colors.negative : colors.textSecondary;

              return (
                <tr
                  key={pos.assetId}
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.9375rem' }}>
                      {ticker}
                    </div>
                  </td>
                  <td style={{ padding: '16px 16px' }}>
                    <Badge variant="neutral">{getAssetTypeLabel(pos.assetType)}</Badge>
                  </td>
                  <td style={{ padding: '16px 16px', textAlign: 'right', fontWeight: 500, color: colors.textPrimary }}>
                    {formatQuantity(pos.quantity)}
                  </td>
                  <td style={{ padding: '16px 16px', textAlign: 'right', color: colors.textSecondary }}>
                    {avgPriceFormatted}
                  </td>
                  <td style={{ padding: '16px 16px', textAlign: 'right', fontWeight: 600, color: colors.textPrimary }}>
                    {currentPriceFormatted}
                  </td>
                  <td style={{ padding: '16px 16px', textAlign: 'right', fontWeight: 700, color: colors.textPrimary }}>
                    {marketValueFormatted}
                  </td>
                  <td style={{ padding: '16px 16px', textAlign: 'right' }}>
                    {unrealizedAmount ? (
                      <div>
                        <div style={{ fontWeight: 600, color: resultColor }}>{unrealizedAmount}</div>
                        {unrealizedPercent && (
                          <div style={{ fontSize: '0.75rem', color: resultColor }}>{unrealizedPercent}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: colors.textSecondary }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    {pos.quote ? (
                      <Badge variant={pos.quote.freshness === 'FRESH' ? 'positive' : 'warning'}>
                        {pos.quote.freshness === 'FRESH' ? 'Em dia' : 'D-1'}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">Sem cotação</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
