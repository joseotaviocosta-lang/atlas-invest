'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, SectionHeader, Button, Badge } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describePositionLimitation,
  describePositionTransactionType,
  formatCurrency,
  formatDatePtBr,
  formatPercentage,
  formatQuantity,
} from '@atlas/ui';

interface IntelligenceMoney {
  amount: string;
  currency: string;
}

interface IntelligenceData {
  portfolioId: string;
  assetId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  asset: {
    id: string;
    ticker: string | null;
    name: string | null;
    type: string | null;
    currency: string | null;
  } | null;
  position: {
    quantity: string;
    currency: string;
    costBasisStatus: 'KNOWN' | 'INCOMPLETE';
    totalCost: IntelligenceMoney | null;
    averageCost: IntelligenceMoney | null;
    isOpen: boolean;
  };
  valuation: {
    status: string;
    price: { amount: string; currency: string; asOf: string } | null;
    marketValue: IntelligenceMoney | null;
    unrealizedGainLoss: IntelligenceMoney | null;
    unrealizedGainLossPercent: string | null;
    quoteFreshness: string | null;
    quoteStatus: string | null;
  };
  allocation: {
    weightPercent: string | null;
    weightDenominator: IntelligenceMoney | null;
    translatedWeightPercent: string | null;
    reportingMarketValue: IntelligenceMoney | null;
    reportingCurrency: string | null;
    coveragePercent: string;
    partialCoverage: boolean;
  };
  performance: null;
  income: {
    totalsByCurrency: Array<{
      currency: string;
      dividends: string;
      jcp: string;
      fiiIncome: string;
      total: string;
    }>;
    recent: Array<{
      transactionId: string;
      tradeDate: string;
      type: string;
      amount: string;
      currency: string;
    }>;
  };
  realizedDisposals: Array<{
    transactionId: string;
    tradeDate: string;
    quantity: string;
    grossProceeds: IntelligenceMoney;
    sellingCosts: IntelligenceMoney;
    netProceeds: IntelligenceMoney;
    costBasisRemoved: IntelligenceMoney | null;
    realizedGainLoss: IntelligenceMoney | null;
    realizedReturnPercentage: string | null;
    status: string;
  }>;
  recentActivity: Array<{
    transactionId: string;
    tradeDate: string;
    type: string;
    quantity: string | null;
    unitPrice: string | null;
    amount: string | null;
    currency: string;
  }>;
  dataQuality: {
    valuationStatus: string;
    priceAsOf: string | null;
    quoteFreshness: string | null;
    quoteStatus: string | null;
    valuationCoveragePercent: string;
    partialCoverage: boolean;
  };
  limitations: string[];
}

const VALUATION_STATUS_LABELS: Record<string, string> = {
  VALUED: 'Avaliada',
  QUOTE_UNAVAILABLE: 'Preço indisponível',
  QUOTE_STALE: 'Preço desatualizado',
  COST_INCOMPLETE: 'Custo incompleto',
  CURRENCY_MISMATCH: 'Moeda incompatível',
  UNSUPPORTED_ASSET: 'Ativo não suportado',
};

function valuationStatusLabel(status: string): string {
  return VALUATION_STATUS_LABELS[status] ?? status;
}

function signedMoney(value: IntelligenceMoney | null): string {
  if (!value) return '—';
  const negative = value.amount.trim().startsWith('-');
  const abs = negative ? value.amount.trim().slice(1) : value.amount;
  return `${negative ? '-' : '+'}${formatCurrency(abs, value.currency)}`;
}

/**
 * Phase 5R-A — position intelligence section (read-only composition).
 *
 * One integrated answer per open position: canonical quantity/costs,
 * valuation, allocation weight, income, realized disposals and recent
 * activity. Facts only, composed from existing engines without inventing
 * new metrics. Gains/losses always carry an explicit sign, never
 * color alone.
 */
export function PositionIntelligenceSection({
  portfolioId,
  assetId,
}: {
  portfolioId: string;
  assetId: string;
}) {
  const authReady = useAuthReady();
  const intelligenceQuery = useQuery({
    queryKey: ['position-intelligence', portfolioId, assetId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: IntelligenceData }>(
        `/api/v1/portfolios/${portfolioId}/positions/${assetId}/intelligence`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  if (intelligenceQuery.isLoading) {
    return <Skeleton width="100%" height="160px" />;
  }
  if (intelligenceQuery.isError || !intelligenceQuery.data) {
    return null;
  }
  const data = intelligenceQuery.data;

  return (
    <div
      style={{ marginTop: `${spacing.base}px` }}
      data-testid="position-intelligence"
      aria-live="polite"
    >
      <SectionHeader
        title="Inteligência da posição"
        description="Quantidade, valor, participação, renda e atividade — compostos das fontes canônicas."
      />

      {/* Valuation + allocation */}
      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: 12,
          backgroundColor: colors.surface,
          margin: '8px 0',
        }}
        data-testid="position-intelligence-valuation"
      >
        <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Valor e participação
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700 }} data-testid="position-market-value">
          {data.valuation.marketValue
            ? formatCurrency(data.valuation.marketValue.amount, data.valuation.marketValue.currency)
            : 'Indisponível'}
        </div>
        <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          {data.valuation.price ? (
            <>
              Último preço disponível:{' '}
              {formatCurrency(data.valuation.price.amount, data.valuation.price.currency)} em{' '}
              {formatDatePtBr(data.valuation.price.asOf)}
              {data.valuation.status === 'QUOTE_STALE' ? ' (desatualizado)' : ''}.
            </>
          ) : (
            'Preço indisponível para esta posição.'
          )}
        </div>
        <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: 4 }}>
          {data.allocation.weightPercent !== null ? (
            <>
              {formatPercentage(data.allocation.weightPercent)}{' '}
              {data.allocation.partialCoverage ? 'do valor conhecido da carteira' : 'da carteira'}
              {data.allocation.translatedWeightPercent !== null &&
              data.allocation.reportingCurrency ? (
                <>
                  {' '}
                  · {formatPercentage(data.allocation.translatedWeightPercent)} em{' '}
                  {data.allocation.reportingCurrency}
                  {data.allocation.reportingMarketValue ? (
                    <>
                      {' '}
                      (
                      {formatCurrency(
                        data.allocation.reportingMarketValue.amount,
                        data.allocation.reportingMarketValue.currency,
                      )}
                      )
                    </>
                  ) : null}
                </>
              ) : null}
              .
            </>
          ) : (
            'Participação indisponível sem valor avaliado.'
          )}
        </div>
        <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: 4 }}>
          Resultado não realizado:{' '}
          <span data-testid="position-unrealized">
            {data.valuation.unrealizedGainLoss
              ? `${signedMoney(data.valuation.unrealizedGainLoss)} (${formatPercentage(
                  data.valuation.unrealizedGainLossPercent,
                  { showSign: true },
                )})`
              : '—'}
          </span>
        </div>
        {data.marketDataAsOf ? (
          <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginTop: 4 }}>
            Dados de mercado até {formatDatePtBr(data.marketDataAsOf)}.
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}>
          <Link
            href={`/portfolio?tab=allocation&portfolioId=${portfolioId}`}
            aria-label="Ver alocação da carteira"
          >
            <Button variant="outline" size="sm" style={{ minHeight: 44 }}>
              Ver alocação da carteira
            </Button>
          </Link>
        </div>
      </div>

      {/* Realized disposals */}
      <div style={{ marginTop: 8 }} data-testid="position-intelligence-realized">
        <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
          Vendas realizadas
        </h4>
        {data.realizedDisposals.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {data.realizedDisposals.map((disposal) => (
              <li
                key={disposal.transactionId}
                style={{ fontSize: '0.8125rem' }}
                data-testid={`position-disposal-${disposal.transactionId}`}
              >
                {formatDatePtBr(disposal.tradeDate)} · {formatQuantity(disposal.quantity)} cotas ·{' '}
                {formatCurrency(disposal.netProceeds.amount, disposal.netProceeds.currency)} ·
                Resultado:{' '}
                {disposal.realizedGainLoss ? signedMoney(disposal.realizedGainLoss) : '—'}
                {disposal.realizedReturnPercentage !== null ? (
                  <> ({formatPercentage(disposal.realizedReturnPercentage, { showSign: true })})</>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
            Nenhuma venda registrada para esta posição.
          </p>
        )}
      </div>

      {/* Income */}
      <div style={{ marginTop: 8 }} data-testid="position-intelligence-income">
        <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
          Renda recebida
        </h4>
        {data.income.totalsByCurrency.length > 0 ? (
          <>
            {data.income.totalsByCurrency.map((row) => (
              <p
                key={row.currency}
                style={{ fontSize: '0.8125rem', margin: '0 0 4px' }}
                data-testid={`position-income-total-${row.currency}`}
              >
                Total {formatCurrency(row.total, row.currency)} · Dividendos{' '}
                {formatCurrency(row.dividends, row.currency)} · JCP{' '}
                {formatCurrency(row.jcp, row.currency)} · FII{' '}
                {formatCurrency(row.fiiIncome, row.currency)}.
              </p>
            ))}
            {data.income.recent.length > 0 ? (
              <ul
                style={{
                  listStyle: 'none',
                  margin: '4px 0 0',
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {data.income.recent.map((event) => (
                  <li
                    key={event.transactionId}
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                  >
                    {formatDatePtBr(event.tradeDate)} ·{' '}
                    {describePositionTransactionType(event.type)} ·{' '}
                    {formatCurrency(event.amount, event.currency)}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
            Nenhum rendimento registrado para esta posição no histórico.
          </p>
        )}
      </div>

      {/* Recent activity */}
      <div style={{ marginTop: 8 }} data-testid="position-intelligence-activity">
        <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
          Atividade recente
        </h4>
        {data.recentActivity.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {data.recentActivity.map((row) => (
              <li
                key={row.transactionId}
                style={{ fontSize: '0.8125rem' }}
                data-testid={`position-activity-${row.transactionId}`}
              >
                {formatDatePtBr(row.tradeDate)} · {describePositionTransactionType(row.type)}
                {row.quantity ? ` · ${formatQuantity(row.quantity)}` : ''}
                {row.unitPrice ? ` @ ${formatCurrency(row.unitPrice, row.currency)}` : ''}
                {row.amount ? ` · ${formatCurrency(row.amount, row.currency)}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
            Nenhuma movimentação encontrada para esta posição.
          </p>
        )}
      </div>

      {/* Data quality + limitations */}
      <div style={{ marginTop: 8 }} data-testid="position-intelligence-limitations">
        <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
          Dados e limitações
        </h4>
        <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 4px' }}>
          Estado da avaliação: {valuationStatusLabel(data.valuation.status)} · Quantidade:{' '}
          {formatQuantity(data.position.quantity)} · Custo:{' '}
          {data.position.costBasisStatus === 'KNOWN' ? 'conhecido' : 'desconhecido'}.
        </p>
        {data.limitations.map((limitation) => (
          <p
            key={limitation}
            style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 4px' }}
            data-testid={`position-limitation-${limitation}`}
          >
            {describePositionLimitation(limitation)}
          </p>
        ))}
        <div style={{ marginTop: 8 }}>
          <Badge variant={data.position.costBasisStatus === 'KNOWN' ? 'success' : 'warning'}>
            {data.position.costBasisStatus === 'KNOWN' ? 'Custo conhecido' : 'Custo desconhecido'}
          </Badge>
        </div>
      </div>
    </div>
  );
}
