import React from 'react';
import { usePortfolio } from '../../../providers/PortfolioProvider';
import { usePortfolioHistory } from '../hooks';
import { Card, Badge, Skeleton, EmptyState } from '../../../components/ui';
import { colors, formatDate, formatCurrency, formatQuantity } from '@atlas/ui';
import type { ValuationMoneyJSON } from '../types';

export const HistorySection: React.FC = () => {
  const { selectedPortfolioId } = usePortfolio();
  const { data: historyRes, isLoading, isError } = usePortfolioHistory(selectedPortfolioId);

  if (isLoading) {
    return (
      <Card>
        <Skeleton height={260} />
      </Card>
    );
  }

  if (isError || !historyRes?.data) {
    return (
      <Card>
        <EmptyState
          title="Histórico Indisponível"
          description="Não foi possível consultar os eventos do livro-razão desta carteira."
        />
      </Card>
    );
  }

  const items = historyRes.data;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nenhuma operação registrada"
          description="O histórico financeiro desta carteira ainda não possui transações registradas no ledger."
        />
      </Card>
    );
  }

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'BUY':
        return 'primary';
      case 'SELL':
        return 'warning';
      case 'DIVIDEND':
      case 'JCP':
      case 'INCOME':
        return 'positive';
      case 'SPLIT':
      case 'REVERSE_SPLIT':
      case 'BONUS':
        return 'info';
      default:
        return 'neutral';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'BUY':
        return 'Compra';
      case 'SELL':
        return 'Venda';
      case 'DIVIDEND':
        return 'Dividendo';
      case 'JCP':
        return 'JCP';
      case 'INCOME':
        return 'Rendimento';
      case 'SPLIT':
        return 'Desdobro';
      case 'REVERSE_SPLIT':
        return 'Grupamento';
      case 'BONUS':
        return 'Bonificação';
      case 'TRANSFER_IN':
        return 'Transf. Entrada';
      case 'TRANSFER_OUT':
        return 'Transf. Saída';
      default:
        return type;
    }
  };

  const formatMoney = (val?: string | ValuationMoneyJSON | null, currency = 'BRL'): string => {
    if (!val) return '—';
    if (typeof val === 'string') return formatCurrency(val, currency);
    return formatCurrency(val.amount, val.currency);
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
              <th style={{ padding: '14px 20px', fontWeight: 600 }}>Data</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Tipo</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>Ativo</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Qtd.</th>
              <th style={{ padding: '14px 16px', fontWeight: 600, textAlign: 'right' }}>Preço Unitário</th>
              <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                style={{
                  borderBottom: `1px solid ${colors.border}`,
                  transition: 'background-color 0.15s ease',
                }}
              >
                <td style={{ padding: '14px 20px', color: colors.textSecondary }}>
                  {formatDate(item.tradeDate)}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <Badge variant={getTypeBadgeVariant(item.type)}>
                    {getTypeLabel(item.type)}
                  </Badge>
                </td>
                <td style={{ padding: '14px 16px', fontWeight: 600, color: colors.textPrimary }}>
                  {item.ticker || '—'}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', color: colors.textPrimary }}>
                  {item.quantity ? formatQuantity(item.quantity) : '—'}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', color: colors.textSecondary }}>
                  {formatMoney(item.unitPrice, item.currency)}
                </td>
                <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, color: colors.textPrimary }}>
                  {formatMoney(item.totalAmount, item.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
