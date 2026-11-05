import React from 'react';
import { StatCard } from '../../../components/ui';
import type { PortfolioValuationData } from '../types';
import { formatCurrency, formatPercentage } from '@atlas/ui';

interface PortfolioSummaryCardsProps {
  valuation: PortfolioValuationData | null;
  isLoading?: boolean;
}

export const PortfolioSummaryCards: React.FC<PortfolioSummaryCardsProps> = ({
  valuation,
  isLoading = false,
}) => {
  const currencies = valuation?.summary?.currencies ?? Object.keys(valuation?.totalsByCurrency ?? {});
  const primaryCurrency = currencies[0] ?? 'BRL';
  const totals = valuation?.totalsByCurrency?.[primaryCurrency];

  const marketValue = totals?.marketValue
    ? formatCurrency(totals.marketValue.amount, totals.marketValue.currency)
    : null;

  const costBasis = totals?.costBasis
    ? formatCurrency(totals.costBasis.amount, totals.costBasis.currency)
    : null;

  const unrealizedAmount = totals?.unrealizedGainLoss
    ? formatCurrency(totals.unrealizedGainLoss.amount, totals.unrealizedGainLoss.currency)
    : null;

  const unrealizedPercent = totals?.unrealizedGainLossPercent
    ? formatPercentage(totals.unrealizedGainLossPercent, { showSign: true })
    : null;

  const isPositive = totals?.unrealizedGainLoss
    ? !totals.unrealizedGainLoss.amount.startsWith('-') && totals.unrealizedGainLoss.amount !== '0'
    : false;
  const isNegative = totals?.unrealizedGainLoss
    ? totals.unrealizedGainLoss.amount.startsWith('-')
    : false;

  const changeType = isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';

  const totalPositions = valuation?.summary?.totalPositions ?? 0;
  const valuedPositions = valuation?.summary?.valuedPositions ?? 0;
  const coveragePercent = valuation?.summary?.valuationCoveragePercent
    ? `${valuation.summary.valuationCoveragePercent}%`
    : totalPositions > 0
    ? `${Math.round((valuedPositions / totalPositions) * 100)}%`
    : '100%';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
      }}
    >
      <StatCard
        label="Patrimônio Total"
        value={marketValue}
        subValue={primaryCurrency ? `Moeda base: ${primaryCurrency}` : undefined}
        isPlaceholder={isLoading || !marketValue}
      />
      <StatCard
        label="Custo de Aquisição"
        value={costBasis}
        subValue="Custo médio apurado via ledger"
        isPlaceholder={isLoading || !costBasis}
      />
      <StatCard
        label="Resultado Não Realizado"
        value={unrealizedAmount}
        subValue={unrealizedPercent ? `Rentabilidade: ${unrealizedPercent}` : undefined}
        changeType={changeType}
        isPlaceholder={isLoading || !unrealizedAmount}
      />
      <StatCard
        label="Cobertura de Cotações"
        value={coveragePercent}
        subValue={`${valuedPositions} de ${totalPositions} posições precificadas`}
        changeType={valuedPositions === totalPositions && totalPositions > 0 ? 'positive' : 'neutral'}
        isPlaceholder={isLoading || totalPositions === 0}
      />
    </div>
  );
};
