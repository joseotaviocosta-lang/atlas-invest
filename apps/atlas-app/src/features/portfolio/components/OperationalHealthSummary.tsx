import React, { useState } from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { usePendingReviewsCount } from '../../imports/hooks';
import { useBackupStatus } from '../../backup/hooks';
import { useMacroContext } from '../../market/hooks';
import type { PortfolioValuationData } from '../types';

export interface OperationalHealthSummaryProps {
  valuation: PortfolioValuationData | null;
}

export const OperationalHealthSummary: React.FC<OperationalHealthSummaryProps> = ({ valuation }) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { data: pendingReviews = 0 } = usePendingReviewsCount();
  const { data: backupStatus } = useBackupStatus();
  const { data: macroContext } = useMacroContext();

  const quotesTotal =
    valuation?.quoteSummary?.totalQuotesRequested ??
    (valuation?.quoteSummary as unknown as { totalPositions?: number })?.totalPositions ??
    valuation?.positions?.length ??
    0;
  const quotesPriced = valuation?.quoteSummary?.quotesAvailable ?? 0;

  const lastBackup = backupStatus?.lastBackup;
  const daysSinceBackup = lastBackup
    ? Math.floor((Date.now() - new Date(lastBackup.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const isBackupHealthy = lastBackup !== null && daysSinceBackup <= 7;

  const isMacroHealthy = Boolean(
    macroContext?.data?.selicTarget?.rate ||
    macroContext?.data?.ipcaMonthly?.value ||
    macroContext?.data?.ptax?.rate ||
    macroContext?.data?.ibovespa?.value
  );

  const attentionItems: string[] = [];
  if (pendingReviews > 0) {
    attentionItems.push(`${pendingReviews} importação${pendingReviews > 1 ? 'ões' : ''} aguardando conciliação`);
  }
  if (!isBackupHealthy) {
    attentionItems.push(lastBackup ? `Backup local há mais de ${daysSinceBackup} dias` : 'Nenhum backup local realizado');
  }
  if (quotesTotal > 0 && quotesPriced < quotesTotal) {
    attentionItems.push(`${quotesTotal - quotesPriced} de ${quotesTotal} posições sem cotação`);
  }

  const isAllHealthy = attentionItems.length === 0;

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        marginBottom: `${spacing.md}px`,
      }}
    >
      <div
        onClick={() => setIsDetailsOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: `${spacing.sm}px`,
          padding: '0.375rem 0.75rem',
          borderRadius: `${borderRadius.md}px`,
          backgroundColor: isAllHealthy ? `${colors.positive}12` : `${colors.warning}15`,
          border: `1px solid ${isAllHealthy ? colors.positive : colors.warning}40`,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ fontSize: '0.875rem' }}>{isAllHealthy ? '🟢' : '🟡'}</span>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: isAllHealthy ? colors.positive : colors.textPrimary,
          }}
        >
          {isAllHealthy ? 'Atlas em dia' : `${attentionItems.length} item(ns) requer(em) atenção`}
        </span>
        <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
          {isAllHealthy
            ? `• ${quotesPriced}/${quotesTotal} cotações • Macro ok • Backup verificado`
            : `• ${attentionItems[0]}`}
        </span>
        <span style={{ fontSize: '0.6875rem', color: colors.textSecondary, marginLeft: '4px' }}>
          {isDetailsOpen ? '▲' : '▼'}
        </span>
      </div>

      {isDetailsOpen && (
        <div
          style={{
            marginTop: '6px',
            padding: `${spacing.sm}px ${spacing.md}px`,
            borderRadius: `${borderRadius.md}px`,
            backgroundColor: colors.surfaceHover,
            border: `1px solid ${colors.border}`,
            fontSize: '0.75rem',
            color: colors.textSecondary,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            maxWidth: '500px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Precificação de Ativos:</span>
            <strong style={{ color: colors.textPrimary }}>
              {quotesPriced} de {quotesTotal} precificados ({quotesTotal > 0 ? ((quotesPriced / quotesTotal) * 100).toFixed(1) : 0}%)
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Backup Local:</span>
            <strong style={{ color: colors.textPrimary }}>
              {lastBackup ? `${daysSinceBackup} dia(s) atrás (SHA-256 verificado)` : 'Pendente'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Indicadores Macro:</span>
            <strong style={{ color: colors.textPrimary }}>
              {isMacroHealthy ? 'Selic, IPCA, PTAX e Ibovespa integrados' : 'Sincronização em andamento'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Pendências de Importação:</span>
            <strong style={{ color: colors.textPrimary }}>
              {pendingReviews === 0 ? 'Nenhuma ação pendente' : `${pendingReviews} aguardando revisão`}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
};
