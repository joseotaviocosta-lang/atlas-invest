'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader, Button } from '@/components/ui';
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

interface IncomeMonthBucketView {
  month: string;
  totals: IncomeCurrencyTotalView[];
}

interface IncomePositionView {
  assetId: string;
  ticker: string | null;
  currency: string;
  total: string;
  eventCount: number;
  isOpen: boolean;
  hasDetail: boolean;
  rank: number;
  shareBp: string | null;
}

interface IncomeConcentrationView {
  currency: string;
  largest: {
    assetId: string;
    ticker: string | null;
    total: string;
    shareBp: string | null;
  } | null;
  top3ShareBp: string | null;
  top3: Array<{
    assetId: string;
    ticker: string | null;
    total: string;
    shareBp: string | null;
    rank: number;
  }>;
}

interface PortfolioIncomeData {
  portfolioId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  period: { startDate: string; endDate: string; months: string[] };
  inceptionDate: string | null;
  totalsByCurrency: IncomeCurrencyTotalView[];
  timeline: IncomeMonthBucketView[];
  byPosition: IncomePositionView[];
  concentration: IncomeConcentrationView[];
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
 * Phase 5R-D — portfolio income section (lazy, read-only).
 * Historical income actually recorded in the ledger: per-currency totals
 * by type, monthly timeline, factual by-position ranking and neutral
 * concentration facts. Tables first; tables carry the facts.
 */
export function PortfolioIncomeSection({ portfolioId }: { portfolioId: string | null }) {
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
    queryKey: ['portfolio-income', portfolioId, preset, range.start ?? '', range.end],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.start) params.set('startDate', range.start);
      params.set('endDate', range.end);
      const res = await apiClient.get<{ data: PortfolioIncomeData }>(
        `/api/v1/portfolios/${portfolioId}/income-intelligence?${params.toString()}`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  const data = incomeQuery.data ?? null;
  if (data && data.inceptionDate && data.inceptionDate !== inceptionAnchor) {
    setInceptionAnchor(data.inceptionDate);
  }

  if (!portfolioId) {
    return (
      <EmptyState title="Renda" description="Selecione uma carteira para ver os rendimentos." />
    );
  }

  return (
    <div style={{ marginTop: `${spacing.base}px` }} data-testid="portfolio-income">
      <SectionHeader
        title="Renda"
        description="Rendimentos registrados no período — dividendos, JCP e rendimentos de FII. Valores históricos, sem projeção."
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
            data-testid={`income-period-${option.value}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {incomeQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : incomeQuery.isError || !data ? (
        <ErrorState
          title="Renda indisponível"
          message="Não foi possível carregar a renda da carteira. Tente novamente."
        />
      ) : data.totalsByCurrency.length === 0 ? (
        <EmptyState
          title="Sem rendimentos no período"
          description="Nenhum dividendo, JCP ou rendimento de FII registrado neste período."
        />
      ) : (
        <>
          {data.totalsByCurrency.map((row) => (
            <div key={row.currency} data-testid={`income-total-${row.currency}`}>
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>
                Renda no período ({row.currency})
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
            </div>
          ))}

          <h4 style={{ fontSize: '0.875rem', margin: '16px 0 4px' }}>Renda por mês</h4>
          <div data-testid="income-timeline">
            {data.timeline.map((bucket) => (
              <div key={bucket.month} data-testid={`income-month-${bucket.month}`}>
                <h4 style={{ fontSize: '0.8125rem', margin: '8px 0 4px' }}>
                  {formatPlanMonthLong(bucket.month)}
                </h4>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Tipo</th>
                      <th scope="col">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.totals.length === 0 ? (
                      <tr>
                        <td colSpan={2}>Sem rendimentos neste mês.</td>
                      </tr>
                    ) : (
                      bucket.totals.map((row) => (
                        <React.Fragment key={row.currency}>
                          <tr>
                            <td>
                              {describePositionTransactionType('DIVIDEND')} ({row.currency})
                            </td>
                            <td>{formatScenarioMoney(row.dividends, row.currency)}</td>
                          </tr>
                          <tr>
                            <td>
                              {describePositionTransactionType('JCP')} ({row.currency})
                            </td>
                            <td>{formatScenarioMoney(row.jcp, row.currency)}</td>
                          </tr>
                          <tr>
                            <td>
                              {describePositionTransactionType('FII_INCOME')} ({row.currency})
                            </td>
                            <td>{formatScenarioMoney(row.fiiIncome, row.currency)}</td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Total ({row.currency})</strong>
                            </td>
                            <td>
                              <strong>{formatScenarioMoney(row.total, row.currency)}</strong>
                            </td>
                          </tr>
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <h4 style={{ fontSize: '0.875rem', margin: '16px 0 4px' }}>Renda por posição</h4>
          <table data-testid="income-by-position">
            <thead>
              <tr>
                <th scope="col">Posição</th>
                <th scope="col">Renda</th>
                <th scope="col">Participação</th>
              </tr>
            </thead>
            <tbody>
              {data.byPosition.map((row) => (
                <tr key={`${row.currency}-${row.assetId}`}>
                  <td>
                    {row.hasDetail ? (
                      <Link href={`/portfolio/assets/${row.assetId}`}>
                        {row.ticker ?? row.assetId}
                      </Link>
                    ) : (
                      <span>
                        {row.ticker ?? 'Posição encerrada'}
                        {!row.isOpen && row.ticker ? ' (encerrada)' : ''}
                      </span>
                    )}
                  </td>
                  <td>{formatScenarioMoney(row.total, row.currency)}</td>
                  <td>{shareBpLabel(row.shareBp)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.concentration.map((block) => (
            <div key={block.currency} data-testid={`income-concentration-${block.currency}`}>
              <h4 style={{ fontSize: '0.875rem', margin: '16px 0 4px' }}>
                Concentração da renda ({block.currency})
              </h4>
              {block.largest ? (
                <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Maior participação: {block.largest.ticker ?? block.largest.assetId} —{' '}
                  {shareBpLabel(block.largest.shareBp)}
                  {block.top3ShareBp !== null && block.top3.length > 1
                    ? `; 3 maiores posições: ${shareBpLabel(block.top3ShareBp)}`
                    : ''}
                </p>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Sem concentração a reportar.
                </p>
              )}
            </div>
          ))}

          {data.limitations.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
              {data.limitations.map((code) => (
                <li
                  key={code}
                  data-testid={`income-limitation-${code}`}
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
