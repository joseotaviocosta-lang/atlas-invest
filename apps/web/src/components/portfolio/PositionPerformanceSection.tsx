'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, SectionHeader, Button } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describePositionLimitation,
  formatCurrency,
  formatDatePtBr,
  formatPercentage,
  formatPlanMonthLong,
} from '@atlas/ui';

interface PositionPerformanceMonthPoint {
  month: string;
  positionReturn: string | null;
  weightStart: string | null;
  contributionPp: string | null;
  valued: boolean;
}

interface PositionPerformanceData {
  portfolioId: string;
  assetId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  period: { startDate: string; endDate: string; months: string[] };
  inceptionDate: string;
  positionCurrency: string;
  return: {
    twr: string | null;
    status: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'NOT_AVAILABLE';
    dataAvailability: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
    actualStartDate: string | null;
    actualEndDate: string | null;
  };
  realized: {
    byCurrency: Array<{
      currency: string;
      gainLoss: string | null;
      status: 'KNOWN' | 'INCOMPLETE';
      disposalCount: number;
    }>;
  };
  unrealized: { amount: string; currency: string; percent: string | null } | null;
  income: {
    totalsByCurrency: Array<{
      currency: string;
      dividends: string;
      jcp: string;
      fiiIncome: string;
      total: string;
    }>;
  };
  economicPnl: {
    totalsByCurrency: Array<{
      currency: string;
      realized: string | null;
      unrealized: string | null;
      income: string | null;
      total: string | null;
    }>;
  } | null;
  contribution: {
    totalPp: string | null;
    portfolioReturnOnGrid: string;
    monthsValued: number;
    monthsTotal: number;
    monthlyPoints: PositionPerformanceMonthPoint[];
  } | null;
  limitations: string[];
}

const PERIOD_PRESETS = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: 'YTD', label: 'No ano' },
  { value: '1A', label: '1 ano' },
  { value: 'INCEPTION', label: 'Desde o início' },
] as const;

type PeriodPreset = (typeof PERIOD_PRESETS)[number]['value'];

function addMonthsIso(date: string, months: number): string {
  const [yearRaw = '0', monthRaw = '1', dayRaw = '1'] = date.split('-');
  const total = Number(yearRaw) * 12 + (Number(monthRaw) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const dim = new Date(year, month, 0).getDate();
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(Math.min(Number(dayRaw), dim))}`;
}

function periodRange(
  preset: PeriodPreset,
  today: string,
  inception: string | null,
): { start?: string; end: string } {
  if (preset === 'YTD') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  if (preset === 'INCEPTION') {
    return inception ? { start: inception, end: today } : { end: today };
  }
  const months = preset === '1M' ? 1 : preset === '3M' ? 3 : preset === '6M' ? 6 : 12;
  return { start: addMonthsIso(today, -months), end: today };
}

function formatSignedMoney(value: string | null, currency: string): string {
  if (value === null) return '—';
  const negative = value.trim().startsWith('-');
  const abs = negative ? value.trim().slice(1) : value.trim();
  return `${negative ? '-' : '+'}${formatCurrency(abs, currency)}`;
}

function formatSignedPp(value: string | null): string {
  if (value === null) return '—';
  const negative = value.trim().startsWith('-');
  const abs = negative ? value.trim().slice(1) : value.trim();
  return `${negative ? '-' : '+'}${formatPercentage(abs)}`;
}

/**
 * Phase 5R-B — position performance section (lazy, read-only).
 * Separate endpoint from the 5R-A intelligence payload: TWR, realized /
 * unrealized / income components, economic P&L and monthly contribution
 * against the portfolio's own returns. Facts only, with explicit signs.
 */
export function PositionPerformanceSection({
  portfolioId,
  assetId,
}: {
  portfolioId: string;
  assetId: string;
}) {
  const authReady = useAuthReady();
  const today = useMemo(() => {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);
  const [preset, setPreset] = useState<PeriodPreset>('1A');
  const [inceptionAnchor, setInceptionAnchor] = useState<string | null>(null);

  const range = periodRange(preset, today, inceptionAnchor);
  const performanceQuery = useQuery({
    queryKey: ['position-performance', portfolioId, assetId, preset, range.start ?? '', range.end],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.start) params.set('startDate', range.start);
      params.set('endDate', range.end);
      const res = await apiClient.get<{ data: PositionPerformanceData }>(
        `/api/v1/portfolios/${portfolioId}/positions/${assetId}/performance?${params.toString()}`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  const data = performanceQuery.data ?? null;
  if (data && data.inceptionDate && data.inceptionDate !== inceptionAnchor) {
    setInceptionAnchor(data.inceptionDate);
  }

  return (
    <div style={{ marginTop: `${spacing.base}px` }} data-testid="position-performance">
      <SectionHeader
        title="Desempenho da posição"
        description="Retorno, componentes do resultado e contribuição para a carteira — calculados a partir de operações e cotações."
      />
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}
        role="group"
        aria-label="Período do desempenho"
      >
        {PERIOD_PRESETS.map((option) => (
          <Button
            key={option.value}
            variant={preset === option.value ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setPreset(option.value)}
            style={{ minHeight: 44 }}
            aria-label={`Ver desempenho de ${option.label}`}
            aria-pressed={preset === option.value}
            data-testid={`performance-period-${option.value}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {performanceQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : performanceQuery.isError || !data ? (
        <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Não foi possível carregar o desempenho desta posição. Tente novamente.
        </p>
      ) : (
        <>
          {data.return.twr !== null ? (
            <p style={{ fontSize: '0.9375rem', margin: '8px 0' }} data-testid="performance-return">
              Retorno no período:{' '}
              <strong>{formatPercentage(data.return.twr, { showSign: true })}</strong>
              {data.return.actualStartDate && data.return.actualEndDate ? (
                <>
                  {' '}
                  ({formatDatePtBr(data.return.actualStartDate)} até{' '}
                  {formatDatePtBr(data.return.actualEndDate)}).
                </>
              ) : null}
            </p>
          ) : (
            <p
              style={{ fontSize: '0.9375rem', margin: '8px 0' }}
              data-testid="performance-unavailable"
            >
              O resultado detalhado por posição ainda não está disponível para este período.
            </p>
          )}

          {data.economicPnl && data.economicPnl.totalsByCurrency.length > 0 ? (
            <div style={{ marginTop: 8 }} data-testid="performance-pnl">
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
                Componentes do resultado
              </h4>
              {data.economicPnl.totalsByCurrency.map((row) => (
                <p key={row.currency} style={{ fontSize: '0.8125rem', margin: '0 0 4px' }}>
                  {row.currency}: realizado {formatSignedMoney(row.realized, row.currency)} · não
                  realizado {formatSignedMoney(row.unrealized, row.currency)} · renda{' '}
                  {formatSignedMoney(row.income, row.currency)}
                  {row.total !== null ? (
                    <>
                      {' '}
                      · total <strong>{formatSignedMoney(row.total, row.currency)}</strong>
                    </>
                  ) : null}
                  .
                </p>
              ))}
            </div>
          ) : null}

          {data.contribution && data.contribution.totalPp !== null ? (
            <div style={{ marginTop: 8 }} data-testid="performance-contribution">
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '8px 0 4px' }}>
                Contribuição para a carteira
              </h4>
              <p style={{ fontSize: '0.9375rem', margin: '0 0 4px' }}>
                <strong>{formatSignedPp(data.contribution.totalPp)}</strong>{' '}
                <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  pontos percentuais do resultado da carteira no período.
                </span>
              </p>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 8px' }}>
                Quanto esta posição contribuiu para a variação da carteira no período. No período, a
                carteira (nesta moeda) variou{' '}
                {formatPercentage(data.contribution.portfolioReturnOnGrid, { showSign: true })}.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: colors.textSecondary }}>
                      <th scope="col" style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>
                        Mês
                      </th>
                      <th
                        scope="col"
                        style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                      >
                        Retorno
                      </th>
                      <th
                        scope="col"
                        style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}
                      >
                        Peso no início
                      </th>
                      <th
                        scope="col"
                        style={{ padding: '6px 0 6px 8px', fontWeight: 600, textAlign: 'right' }}
                      >
                        Contribuição
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.contribution.monthlyPoints.map((row) => (
                      <tr key={row.month} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td style={{ padding: '8px 8px 8px 0' }}>
                          {formatPlanMonthLong(row.month)}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          {row.positionReturn !== null
                            ? formatPercentage(row.positionReturn, { showSign: true })
                            : '—'}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          {row.weightStart !== null ? formatPercentage(row.weightStart) : '—'}
                        </td>
                        <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                          {row.contributionPp !== null
                            ? `${formatSignedPp(row.contributionPp)} p.p.`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {data.marketDataAsOf ? (
            <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '8px 0 0' }}>
              Dados de mercado até {formatDatePtBr(data.marketDataAsOf)}.
            </p>
          ) : null}
          {data.limitations.map((limitation) => (
            <p
              key={limitation}
              style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '4px 0 0' }}
              data-testid={`performance-limitation-${limitation}`}
            >
              {describePositionLimitation(limitation)}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
