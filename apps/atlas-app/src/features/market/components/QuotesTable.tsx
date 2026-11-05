import React from 'react';
import type { PositionValuationDto } from '../../portfolio/types';
import { Card, Badge, EmptyState } from '../../../components/ui';
import { colors, formatCurrency, formatDate } from '@atlas/ui';

interface QuotesTableProps {
  positions: PositionValuationDto[];
  isLoading?: boolean;
}

export const QuotesTable: React.FC<QuotesTableProps> = ({ positions, isLoading = false }) => {
  if (!isLoading && positions.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Sem cotações para exibir"
          description="A carteira atual não possui ativos em custódia para acompanhamento de mercado."
        />
      </Card>
    );
  }

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
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Moeda</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Último Preço</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Data da Cotação</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Fonte</th>
              <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const ticker = pos.ticker || pos.assetId.slice(0, 8);
              const quote = pos.quote;
              const priceFormatted = quote
                ? formatCurrency(quote.price, quote.currency)
                : '—';
              const dateFormatted = quote?.asOf ? formatDate(quote.asOf) : '—';
              const source = quote?.source || 'BRAPI EOD';

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
                  <td style={{ padding: '16px 16px', color: colors.textSecondary }}>
                    {pos.currency}
                  </td>
                  <td style={{ padding: '16px 16px', textAlign: 'right', fontWeight: 700, color: colors.textPrimary }}>
                    {priceFormatted}
                  </td>
                  <td style={{ padding: '16px 16px', color: colors.textSecondary }}>
                    {dateFormatted}
                  </td>
                  <td style={{ padding: '16px 16px', color: colors.textSecondary }}>
                    {source}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    {quote ? (
                      <Badge variant={quote.freshness === 'FRESH' ? 'positive' : 'warning'}>
                        {quote.freshness === 'FRESH' ? 'FRESCA' : 'STALE (D-1)'}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">SEM COTAÇÃO</Badge>
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
