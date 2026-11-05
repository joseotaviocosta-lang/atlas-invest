import React, { useState } from 'react';
import { usePortfolio } from '../../../providers/PortfolioProvider';
import { usePortfolioAllocation } from '../hooks';
import { Card, Badge, Skeleton, EmptyState } from '../../../components/ui';
import { colors, borderRadius, formatCurrency, formatPercentage } from '@atlas/ui';

const ASSET_CLASS_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'Fundos Imobiliários (FIIs)',
  ETF: 'ETFs',
  BDR: 'BDRs',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro Direto',
  CRYPTO: 'Criptoativos',
  CASH: 'Caixa / Moeda',
  OTHER: 'Outros',
};

export const AllocationSection: React.FC = () => {
  const { selectedPortfolioId } = usePortfolio();
  const { data: allocationRes, isLoading, isError } = usePortfolioAllocation(selectedPortfolioId);
  const [tab, setTab] = useState<'class' | 'asset'>('class');

  if (isLoading) {
    return (
      <Card>
        <Skeleton height={240} />
      </Card>
    );
  }

  if (isError || !allocationRes?.data) {
    return (
      <Card>
        <EmptyState
          title="Alocação Indisponível"
          description="Não foi possível calcular a distribuição patrimonial da carteira."
        />
      </Card>
    );
  }

  const { currencies, valuationCoveragePercent } = allocationRes.data;
  const currencyKeys = Object.keys(currencies);
  const primaryCurrency = currencyKeys[0] ?? 'BRL';
  const bucket = currencies[primaryCurrency];

  if (!bucket || (bucket.byAssetClass.length === 0 && bucket.byAsset.length === 0)) {
    return (
      <Card>
        <EmptyState
          title="Sem dados de alocação"
          description="Adicione operações e certifique-se de que há ativos precificados para visualizar a distribuição."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
            Distribuição Patrimonial
          </h3>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: colors.textSecondary }}>
            Cobertura de cotações: {valuationCoveragePercent}% • Moeda: {primaryCurrency}
          </p>
        </div>

        {/* Toggle between By Class and By Asset */}
        <div
          style={{
            display: 'flex',
            backgroundColor: colors.surfaceElevated,
            borderRadius: `${borderRadius.md}px`,
            padding: '2px',
            border: `1px solid ${colors.border}`,
          }}
        >
          <button
            type="button"
            onClick={() => setTab('class')}
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: `${borderRadius.sm}px`,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: tab === 'class' ? colors.accent : 'transparent',
              color: tab === 'class' ? '#FFFFFF' : colors.textSecondary,
              transition: 'background-color 0.15s ease',
            }}
          >
            Por Classe
          </button>
          <button
            type="button"
            onClick={() => setTab('asset')}
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: `${borderRadius.sm}px`,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: tab === 'asset' ? colors.accent : 'transparent',
              color: tab === 'asset' ? '#FFFFFF' : colors.textSecondary,
              transition: 'background-color 0.15s ease',
            }}
          >
            Por Ativo
          </button>
        </div>
      </div>

      {tab === 'class' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bucket.byAssetClass.map((item) => {
            const percent = Number(item.allocationPercent);
            const label = ASSET_CLASS_LABELS[item.assetClass] || item.assetClass;
            const formattedValue = formatCurrency(item.marketValue.amount, item.marketValue.currency);

            return (
              <div key={item.assetClass} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                    {label} <span style={{ fontSize: '0.75rem', color: colors.textSecondary, fontWeight: 400 }}>({item.assetCount} {item.assetCount === 1 ? 'ativo' : 'ativos'})</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>{formattedValue}</span>
                    <Badge variant="primary">{formatPercentage(item.allocationPercent)}</Badge>
                  </div>
                </div>
                <div
                  style={{
                    height: '8px',
                    width: '100%',
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: `${borderRadius.full}px`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, percent))}%`,
                      backgroundColor: colors.accent,
                      borderRadius: `${borderRadius.full}px`,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bucket.byAsset.map((item) => {
            const percent = Number(item.allocationPercent);
            const ticker = item.ticker || item.assetId.slice(0, 8);
            const formattedValue = formatCurrency(item.marketValue.amount, item.marketValue.currency);

            return (
              <div key={item.assetId} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                  <span style={{ fontWeight: 600, color: colors.textPrimary }}>{ticker}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>{formattedValue}</span>
                    <Badge variant="neutral">{formatPercentage(item.allocationPercent)}</Badge>
                  </div>
                </div>
                <div
                  style={{
                    height: '8px',
                    width: '100%',
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: `${borderRadius.full}px`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, percent))}%`,
                      backgroundColor: colors.positive,
                      borderRadius: `${borderRadius.full}px`,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
