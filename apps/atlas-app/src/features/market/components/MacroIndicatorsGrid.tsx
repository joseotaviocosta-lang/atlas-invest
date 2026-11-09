import React, { useEffect, useRef, useState } from 'react';
import { useMacroContext } from '../hooks';
import { StatCard } from '../../../components/ui';
import { spacing, colors } from '@atlas/ui';
import { marketApi } from '../api';
import type { MacroPtaxSeries } from '../types';

function formatRate(rate?: string, formatted?: string): string {
  if (formatted) return formatted;
  if (!rate) return 'Ainda não atualizado';
  if (rate.includes('%')) return rate;
  return `${rate}%`;
}

function formatIpca(val?: string, formatted?: string): string {
  if (formatted) return formatted;
  if (!val) return 'Ainda não atualizado';
  if (val.includes('%')) return val;
  return `${val}%`;
}

function formatPtax(ptax?: MacroPtaxSeries): string {
  if (!ptax) return 'Ainda não atualizado';
  if (ptax.rate) return ptax.rate;
  if (ptax.value) return `R$ ${ptax.value.replace('.', ',')}`;
  return 'Ainda não atualizado';
}

export const MacroIndicatorsGrid: React.FC = () => {
  const { data: macroData, isLoading, refetch } = useMacroContext();
  const hasAttemptedAutoSync = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const selicTarget = macroData?.data?.selicTarget;
  const selicEffective = macroData?.data?.selicEffective;
  const ipca = macroData?.data?.ipcaMonthly;
  const ptax = macroData?.data?.ptax;
  const ibovespa = macroData?.data?.ibovespa;

  // Auto-sync on first load if macro data is completely empty
  useEffect(() => {
    if (
      !isLoading &&
      macroData &&
      !selicTarget &&
      !selicEffective &&
      !ipca &&
      !ptax &&
      !hasAttemptedAutoSync.current
    ) {
      hasAttemptedAutoSync.current = true;
      marketApi
        .refreshMacro()
        .then(() => refetch())
        .catch(() => {
          // Non-blocking background catch
        });
    }
  }, [isLoading, macroData, selicTarget, selicEffective, ipca, ptax, refetch]);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await marketApi.refreshMacro();
      await refetch();
      setSyncFeedback('Indicadores sincronizados com sucesso');
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch {
      setSyncFeedback('Falha ao sincronizar indicadores oficiais');
      setTimeout(() => setSyncFeedback(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  const cards = [
    {
      id: 'IBOVESPA',
      label: 'IBOVESPA',
      value:
        ibovespa?.status === 'AVAILABLE'
          ? ibovespa.formattedValue || ibovespa.value
          : ibovespa?.value || '—',
      subValue:
        ibovespa?.status === 'AVAILABLE'
          ? `Fechamento ${ibovespa.referenceDateFormatted || ibovespa.referenceDate} • ${ibovespa.source || 'BRAPI'}`
          : ibovespa?.message || 'Integração ainda não disponível',
      isPlaceholder: isLoading,
    },
    {
      id: 'SELIC_META',
      label: 'SELIC META',
      value: selicTarget ? formatRate(selicTarget.rate, selicTarget.formattedValue) : 'Ainda não atualizado',
      subValue: selicTarget
        ? `Meta Copom (${selicTarget.effectiveDateFormatted || selicTarget.effectiveDate}) • ${selicTarget.source}`
        : 'Aguardando sincronização do Bacen',
      isPlaceholder: isLoading,
    },
    {
      id: 'SELIC_EFETIVA',
      label: 'SELIC EFETIVA',
      value: selicEffective ? formatRate(selicEffective.rate, selicEffective.formattedValue) : 'Ainda não atualizado',
      subValue: selicEffective
        ? `Taxa anualizada (${selicEffective.effectiveDateFormatted || selicEffective.effectiveDate}) • ${selicEffective.source}`
        : 'Aguardando sincronização do Bacen',
      isPlaceholder: isLoading,
    },
    {
      id: 'IPCA',
      label: 'IPCA (MENSAL)',
      value: ipca ? formatIpca(ipca.value, ipca.formattedValue) : 'Ainda não atualizado',
      subValue: ipca
        ? `Variação mensal (${ipca.referenceMonthFormatted || ipca.referenceMonth}) • ${ipca.source}`
        : 'Aguardando sincronização do IBGE',
      isPlaceholder: isLoading,
    },
    {
      id: 'PTAX',
      label: 'DÓLAR (PTAX)',
      value: formatPtax(ptax),
      subValue: ptax
        ? `${ptax.convention || 'Fechamento Venda'} (${ptax.effectiveDateFormatted || ptax.effectiveDate}) • ${ptax.source}`
        : 'Aguardando sincronização do Bacen',
      isPlaceholder: isLoading,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
      <div
        data-testid="macro-indicators-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: `${spacing.base}px`,
        }}
      >
        {cards.map((card) => (
          <div key={card.id} data-testid={`macro-card-${card.id}`} style={{ display: 'flex' }}>
            <StatCard
              label={card.label}
              value={card.value}
              subValue={card.subValue}
              isPlaceholder={card.isPlaceholder}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', minHeight: '20px' }}>
        {syncFeedback && (
          <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
            {syncFeedback}
          </span>
        )}
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          data-testid="macro-sync-button"
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textSecondary,
            fontSize: '0.75rem',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title="Sincronizar indicadores macroeconômicos oficiais (Bacen e IBGE)"
        >
          <span aria-hidden="true">{isSyncing ? '⏳' : '🔄'}</span>
          {isSyncing ? 'Sincronizando...' : 'Sincronizar Indicadores'}
        </button>
      </div>
    </div>
  );
};
