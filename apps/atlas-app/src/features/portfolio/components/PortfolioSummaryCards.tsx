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
  const isPartial = totalPositions > 0 && valuedPositions < totalPositions;

  const rawCoverage = valuation?.summary?.valuationCoveragePercent
    ? valuation.summary.valuationCoveragePercent
    : totalPositions > 0
    ? ((valuedPositions / totalPositions) * 100).toString()
    : '100';

  const coveragePercent =
    rawCoverage === '100' || rawCoverage === '0'
      ? `${rawCoverage}%`
      : formatPercentage(rawCoverage, { decimalPlaces: 2 });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
        minWidth: 0,
      }}
    >
      <StatCard
        label={isPartial ? 'Patrimônio Precificado' : 'Patrimônio Total'}
        value={marketValue}
        subValue={
          isPartial
            ? `${valuedPositions} de ${totalPositions} posições precificadas`
            : primaryCurrency
            ? `Moeda base: ${primaryCurrency}`
            : undefined
        }
        isPlaceholder={isLoading || !marketValue}
      />
      <StatCard
        label={isPartial ? 'Custo das Posições Precificadas' : 'Custo de Aquisição'}
        value={costBasis}
        subValue={isPartial ? 'Custo das posições com cotação' : 'Custo médio apurado via ledger'}
        isPlaceholder={isLoading || !costBasis}
      />
      <StatCard
        label={isPartial ? 'Resultado das Posições Precificadas' : 'Resultado Não Realizado'}
        value={unrealizedAmount}
        subValue={
          unrealizedPercent
            ? isPartial
              ? `Rentabilidade parcial: ${unrealizedPercent}`
              : `Rentabilidade: ${unrealizedPercent}`
            : undefined
        }
        changeType={changeType}
        isPlaceholder={isLoading || !unrealizedAmount}
      />
      <StatCard
        label="Cobertura de Cotações"
        value={coveragePercent}
        subValue={`${valuedPositions} de ${totalPositions} posições precificadas`}
        changeType={!isPartial && totalPositions > 0 ? 'positive' : 'warning'}
        isPlaceholder={isLoading || totalPositions === 0}
      />
    </div>
  );
};
