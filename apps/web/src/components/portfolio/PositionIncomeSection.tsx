'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, EmptyState, SectionHeader, Button } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describeIncomeLimitation,
  describePositionTransactionType,
  formatPlanMonthLong,
  formatScenarioBp,
  formatScenarioMoney,
} from '@atlas/ui';

interface IncomeCurrencyTotalView {
  currency: string;
  dividends: string;
  jcp: string;
  fiiIncome: string;
  total: string;
  eventCount: number;
}

interface PositionIncomeData {
  portfolioId: string;
  assetId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  period: { startDate: string; endDate: string; months: string[] };
  inceptionDate: string;
  lifecycle: { inceptionDate: string; isOpenAtEnd: boolean };
  totalsByCurrency: IncomeCurrencyTotalView[];
  timeline: Array<{ month: string; totals: IncomeCurrencyTotalView[] }>;
  recentEvents: Array<{
    transactionId: string;
    tradeDate: string;
    type: string;
    amount: string;
    currency: string;
  }>;
  eventCount: number;
  portfolioShare: Array<{ currency: string; shareBp: string | null }>;
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

function shareBpLabel(shareBp: string | null): string {
  if (shareBp === null) return '—';
  const parsed = Number(shareBp);
  return formatScenarioBp(Number.isSafeInteger(parsed) ? parsed : null);
}

/**
 * Phase 5R-D — position income section (lazy, read-only).
 * Historical income for one open position over its current holding
 * lifecycle: totals by type, monthly timeline, portfolio share and
 * recent events. Facts only — nothing projected, nothing recommended.
 */
export function PositionIncomeSection({
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
  const incomeQuery = useQuery({
    queryKey: ['position-income', portfolioId, assetId, preset, range.start ?? '', range.end],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.start) params.set('startDate', range.start);
      params.set('endDate', range.end);
      const res = await apiClient.get<{ data: PositionIncomeData }>(
        `/api/v1/portfolios/${portfolioId}/positions/${assetId}/income?${params.toString()}`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId) && Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });

  const data = incomeQuery.data ?? null;
  if (data && data.inceptionDate && data.inceptionDate !== inceptionAnchor) {
    setInceptionAnchor(data.inceptionDate);
  }

  return (
    <div style={{ marginTop: `${spacing.base}px` }} data-testid="position-income">
      <SectionHeader
        title="Renda da posição"
        description="Rendimentos registrados para esta posição no ciclo atual — dividendos, JCP e rendimentos de FII. Valores históricos, sem projeção."
      />
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}
        role="group"
        aria-label="Período da renda"
      >
        {PERIOD_PRESETS.map((option) => (
          <Button
            key={option.value}
            variant={preset === option.value ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setPreset(option.value)}
            style={{ minHeight: 44 }}
            aria-label={`Ver renda de ${option.label}`}
            aria-pressed={preset === option.value}
            data-testid={`position-income-period-${option.value}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {incomeQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : incomeQuery.isError || !data ? (
        <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
          Não foi possível carregar a renda desta posição. Tente novamente.
        </p>
      ) : data.totalsByCurrency.length === 0 ? (
        <EmptyState
          title="Sem rendimentos no período"
          description="Nenhum dividendo, JCP ou rendimento de FII registrado para esta posição neste período."
        />
      ) : (
        <>
          {data.totalsByCurrency.map((row) => (
            <div key={row.currency} data-testid={`position-income-total-${row.currency}`}>
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>
                Total no período ({row.currency})
              </h4>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Tipo</th>
                    <th scope="col">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{describePositionTransactionType('DIVIDEND')}</td>
                    <td>{formatScenarioMoney(row.dividends, row.currency)}</td>
                  </tr>
                  <tr>
                    <td>{describePositionTransactionType('JCP')}</td>
                    <td>{formatScenarioMoney(row.jcp, row.currency)}</td>
                  </tr>
                  <tr>
                    <td>{describePositionTransactionType('FII_INCOME')}</td>
                    <td>{formatScenarioMoney(row.fiiIncome, row.currency)}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td>
                      <strong>{formatScenarioMoney(row.total, row.currency)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
              {data.portfolioShare
                .filter((share) => share.currency === row.currency)
                .map((share) => (
                  <p
                    key={share.currency}
                    data-testid={`position-income-share-${share.currency}`}
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                  >
                    Esta posição representou {shareBpLabel(share.shareBp)} da renda conhecida da
                    carteira em {share.currency} no período.
                  </p>
                ))}
            </div>
          ))}

          <h4 style={{ fontSize: '0.875rem', margin: '16px 0 4px' }}>Renda por mês</h4>
          <table data-testid="position-income-timeline">
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col">Dividendos</th>
                <th scope="col">JCP</th>
                <th scope="col">FII</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.timeline.map((bucket) => (
                <tr key={bucket.month}>
                  <td>{formatPlanMonthLong(bucket.month)}</td>
                  {bucket.totals.length === 0 ? (
                    <td colSpan={4}>—</td>
                  ) : (
                    bucket.totals.map((row) => (
                      <React.Fragment key={row.currency}>
                        <td>{formatScenarioMoney(row.dividends, row.currency)}</td>
                        <td>{formatScenarioMoney(row.jcp, row.currency)}</td>
                        <td>{formatScenarioMoney(row.fiiIncome, row.currency)}</td>
                        <td>{formatScenarioMoney(row.total, row.currency)}</td>
                      </React.Fragment>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {data.recentEvents.length > 0 && (
            <>
              <h4 style={{ fontSize: '0.875rem', margin: '16px 0 4px' }}>Eventos recentes</h4>
              <table data-testid="position-income-recent">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.map((event) => (
                    <tr key={event.transactionId}>
                      <td>{event.tradeDate}</td>
                      <td>{describePositionTransactionType(event.type)}</td>
                      <td>{formatScenarioMoney(event.amount, event.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {data.limitations.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
              {data.limitations.map((code) => (
                <li
                  key={code}
                  data-testid={`position-income-limitation-${code}`}
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                >
                  {describeIncomeLimitation(code)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
