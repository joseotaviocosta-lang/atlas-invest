'use client';

import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { Button } from '@/components/ui/Button';

export interface HistoryFilterState {
  period: 'all' | '30d' | '90d' | 'year' | 'custom';
  type: '' | 'realized' | 'income' | 'cash-flow' | 'corporate-action' | 'transfer';
  accountId: string;
  assetId: string;
  from: string;
  to: string;
}

export interface PortfolioHistoryFiltersProps {
  filters: HistoryFilterState;
  onChange: (newFilters: HistoryFilterState) => void;
  accounts: readonly { id: string; name: string }[];
  assets?: readonly { id: string; ticker: string; name?: string | null }[];
}

export function PortfolioHistoryFilters({
  filters,
  onChange,
  accounts,
  assets = [],
}: PortfolioHistoryFiltersProps) {
  const hasActiveFilters =
    filters.period !== 'all' ||
    Boolean(filters.type) ||
    Boolean(filters.accountId) ||
    Boolean(filters.assetId) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  const handlePeriodChange = (period: HistoryFilterState['period']) => {
    const today = new Date();
    const toStr = today.toISOString().split('T')[0] || '';
    let fromStr = '';

    if (period === '30d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      fromStr = d.toISOString().split('T')[0] || '';
    } else if (period === '90d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      fromStr = d.toISOString().split('T')[0] || '';
    } else if (period === 'year') {
      fromStr = `${today.getFullYear()}-01-01`;
    }

    onChange({
      ...filters,
      period,
      from: period === 'all' || period === 'custom' ? '' : fromStr,
      to: period === 'all' || period === 'custom' ? '' : toStr,
    });
  };

  const handleReset = () => {
    onChange({
      period: 'all',
      type: '',
      accountId: '',
      assetId: '',
      from: '',
      to: '',
    });
  };

  return (
    <div
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: `${borderRadius.lg}px`,
        padding: `${spacing.base}px`,
        marginBottom: `${spacing.lg}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
            Filtros
          </span>
          {hasActiveFilters && (
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: colors.surfaceElevated,
                color: colors.textSecondary,
                padding: '2px 8px',
                borderRadius: `${borderRadius.full}px`,
                border: `1px solid ${colors.border}`,
              }}
            >
              Filtros ativos
            </span>
          )}
        </div>

        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: `${spacing.base}px`,
        }}
      >
        {/* Period Filter */}
        <div>
          <label
            htmlFor="history-period-select"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Período
          </label>
          <select
            id="history-period-select"
            value={filters.period}
            onChange={(e) => handlePeriodChange(e.target.value as HistoryFilterState['period'])}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          >
            <option value="all">Todo o período</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="year">Ano atual</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>

        {/* Type Filter */}
        <div>
          <label
            htmlFor="history-type-select"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Tipo de Evento
          </label>
          <select
            id="history-type-select"
            value={filters.type}
            onChange={(e) =>
              onChange({
                ...filters,
                type: e.target.value as HistoryFilterState['type'],
              })
            }
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          >
            <option value="">Todos os tipos</option>
            <option value="realized">Vendas (Realizadas)</option>
            <option value="income">Rendimentos / Dividendos</option>
            <option value="cash-flow">Movimentações de Caixa</option>
            <option value="corporate-action">Eventos Corporativos</option>
            <option value="transfer">Transferências</option>
          </select>
        </div>

        {/* Account Filter */}
        <div>
          <label
            htmlFor="history-account-select"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: colors.textSecondary,
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Conta de Custódia
          </label>
          <select
            id="history-account-select"
            value={filters.accountId}
            onChange={(e) => onChange({ ...filters, accountId: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: `${borderRadius.md}px`,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          >
            <option value="">Todas as contas</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Asset Filter (if assets provided) */}
        {assets.length > 0 && (
          <div>
            <label
              htmlFor="history-asset-select"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Ativo
            </label>
            <select
              id="history-asset-select"
              value={filters.assetId}
              onChange={(e) => onChange({ ...filters, assetId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surfaceElevated,
                color: colors.textPrimary,
                fontSize: '0.875rem',
                outline: 'none',
              }}
            >
              <option value="">Todos os ativos</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.ticker} {asset.name ? `- ${asset.name}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Custom Date Range Picker */}
      {filters.period === 'custom' && (
        <div
          style={{
            marginTop: `${spacing.base}px`,
            paddingTop: `${spacing.base}px`,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <label
              htmlFor="history-from-date"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: '4px',
              }}
            >
              Data inicial (De)
            </label>
            <input
              id="history-from-date"
              type="date"
              value={filters.from}
              onChange={(e) => onChange({ ...filters, from: e.target.value })}
              style={{
                padding: '6px 10px',
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surfaceElevated,
                color: colors.textPrimary,
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label
              htmlFor="history-to-date"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: colors.textSecondary,
                marginBottom: '4px',
              }}
            >
              Data final (Até)
            </label>
            <input
              id="history-to-date"
              type="date"
              value={filters.to}
              onChange={(e) => onChange({ ...filters, to: e.target.value })}
              style={{
                padding: '6px 10px',
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surfaceElevated,
                color: colors.textPrimary,
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
