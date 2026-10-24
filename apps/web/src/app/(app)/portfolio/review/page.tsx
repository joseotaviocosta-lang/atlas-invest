'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  Card,
  Skeleton,
  ErrorState,
  EmptyState,
  PageHeader,
  SectionHeader,
  Button,
  Badge,
} from '@/components/ui';
import { colors, spacing, formatPercentage } from '@atlas/ui';
import {
  describeReviewSignal,
  describeReviewRule,
  describeReviewLimitation,
  describeReviewTrend,
  buildReviewSignalTitle,
  buildReviewSignalLines,
} from '@atlas/ui';
import { PerformanceSeriesChart } from '@/components/portfolio/PerformanceSeriesChart';
import type { PerformanceSeriesCurrencyVM } from '@atlas/ui';

const REVIEW_PERIODS = [
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: 'YTD', label: 'No ano' },
  { id: '1A', label: '1 ano' },
  { id: 'INCEPTION', label: 'Desde o início' },
] as const;

interface GapHistoryPointDto {
  date: string;
  portfolioReturn: string | null;
  benchmarkReturn: string | null;
  gap: string | null;
  state: string;
}

interface ReviewDetailDto {
  code: string;
  state: 'ACTIVE' | 'NOT_ACTIVE';
  period: { preset: string; startDate: string; endDate: string };
  generatedAt: string;
  marketDataAsOf: string | null;
  evidence: Record<string, string | number | boolean | null> | null;
  history:
    | {
        kind: 'SERIES';
        benchmark: string;
        currency: string;
        points: GapHistoryPointDto[];
        worstGap: string | null;
        firstBelowAt: string | null;
        trend: string;
      }
    | {
        kind: 'TABLE_MONTHLY';
        months: Array<{
          month: string;
          total: string;
          currency: string;
          dividends: string;
          jcp: string;
          fiiIncome: string;
        }>;
        total: string;
        currency: string;
        trend: string;
      }
    | {
        kind: 'GROUPED';
        groups: Array<{
          kind: 'TABLE_MONTHLY';
          months: Array<{
            month: string;
            total: string;
            currency: string;
            dividends: string;
            jcp: string;
            fiiIncome: string;
          }>;
          total: string;
          currency: string;
          trend: string;
        }>;
      }
    | {
        kind: 'TABLE_RUNS';
        rows: Array<{
          runId: string;
          date: string;
          status: string;
          trigger: string | null;
          newRecords: number;
          partial: boolean;
          divergent: number;
          missingLocal: number;
          missingSource: number;
          unresolved: number;
        }>;
        firstDivergenceAt: string | null;
        trend: string;
      }
    | { kind: 'UNAVAILABLE'; reason: string };
  limitations: string[];
  action: { kind: 'ROUTE' | 'NONE'; href?: string; label?: string };
  dataUsed: Record<string, string | null>;
}

function formatDatePtBr(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function SeverityBadge({ code }: { code: string }) {
  const presentation = describeReviewSignal(code);
  const variant =
    presentation.tone === 'warning'
      ? ('warning' as const)
      : presentation.tone === 'info'
        ? ('info' as const)
        : ('neutral' as const);
  return <Badge variant={variant}>{presentation.label}</Badge>;
}

function ReviewDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const authReady = useAuthReady();
  const portfolioId = searchParams.get('portfolioId') ?? '';
  const signalCode = searchParams.get('signal') ?? '';
  const period = searchParams.get('period') ?? '1A';

  const detailQuery = useQuery({
    queryKey: ['portfolio-review-detail', portfolioId, signalCode, period],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ReviewDetailDto }>(
        `/api/v1/portfolios/${portfolioId}/review/signals/${signalCode}?period=${period}`,
      );
      return res.data;
    },
    enabled: authReady && portfolioId !== '' && signalCode !== '',
    staleTime: 30_000,
  });
  const detail = detailQuery.data ?? null;

  const chartSeries = useMemo((): PerformanceSeriesCurrencyVM | null => {
    if (!detail || detail.history.kind !== 'SERIES' || detail.history.points.length < 2) {
      return null;
    }
    const valuedPoints = detail.history.points.filter((point) => point.portfolioReturn !== null);
    if (valuedPoints.length < 2) return null;
    return {
      currency: detail.history.currency,
      granularity: 'AUTO',
      status: 'AVAILABLE',
      dataAvailability: 'AVAILABLE',
      benchmarkId: detail.history.benchmark,
      benchmarkName: detail.history.benchmark,
      points: detail.history.points.map((point) => ({
        date: point.date,
        dateDisplay: formatDatePtBr(point.date),
        portfolioReturn: point.portfolioReturn,
        portfolioReturnFormatted:
          point.portfolioReturn === null ? '—' : formatPercentage(point.portfolioReturn),
        benchmarkReturn: point.benchmarkReturn,
        benchmarkReturnFormatted:
          point.benchmarkReturn === null ? '—' : formatPercentage(point.benchmarkReturn),
        status: 'AVAILABLE',
        isGap: point.portfolioReturn === null,
        tooltip: `${formatDatePtBr(point.date)}`,
      })),
      valuedPoints: valuedPoints.map((point) => ({
        date: point.date,
        dateDisplay: formatDatePtBr(point.date),
        portfolioReturn: point.portfolioReturn,
        portfolioReturnFormatted:
          point.portfolioReturn === null ? '—' : formatPercentage(point.portfolioReturn),
        benchmarkReturn: point.benchmarkReturn,
        benchmarkReturnFormatted:
          point.benchmarkReturn === null ? '—' : formatPercentage(point.benchmarkReturn),
        status: 'AVAILABLE',
        isGap: false,
        tooltip: `${formatDatePtBr(point.date)}`,
      })),
      hasGaps: detail.history.points.some((point) => point.portfolioReturn === null),
      isPartial: false,
      isUnavailable: false,
    };
  }, [detail]);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/portfolio/review?${params.toString()}`);
  };

  return (
    <div>
      <PageHeader
        title="Detalhe da revisão"
        subtitle="O que é, como evoluiu e onde agir."
        breadcrumb="Carteira / Revisão / Detalhe"
        action={
          <Link href={`/portfolio?tab=overview${portfolioId ? `&portfolioId=${portfolioId}` : ''}`}>
            <Button variant="outline" style={{ minHeight: 44 }}>
              Voltar para a carteira
            </Button>
          </Link>
        }
      />

      {detailQuery.isLoading ? (
        <Card style={{ padding: `${spacing.base}px` }}>
          <Skeleton width="100%" height="160px" />
        </Card>
      ) : detailQuery.isError || !detail ? (
        <Card style={{ padding: `${spacing.base}px` }}>
          <ErrorState
            title="Não foi possível carregar o detalhe"
            message="Tente novamente. Se o problema persistir, verifique sua conexão."
            onRetry={() => detailQuery.refetch()}
          />
        </Card>
      ) : (
        <>
          <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${spacing.sm}px`,
                flexWrap: 'wrap',
              }}
            >
              <SeverityBadge code={detail.code} />
              {detail.state === 'NOT_ACTIVE' ? (
                <Badge variant="neutral">Sem sinal ativo no momento</Badge>
              ) : null}
            </div>
            <h2 style={{ fontSize: '1.125rem', margin: `${spacing.sm}px 0 4px` }}>
              {detail.evidence !== null
                ? buildReviewSignalTitle({
                    code: detail.code,
                    severity: 'REVIEW',
                    evidence: detail.evidence,
                  })
                : describeReviewSignal(detail.code).label}
            </h2>
            <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
              Período analisado: {formatDatePtBr(detail.period.startDate)} a{' '}
              {formatDatePtBr(detail.period.endDate)}
              {detail.marketDataAsOf ? ` · Dados de mercado de ${detail.marketDataAsOf}` : ''}
            </p>
            {detail.evidence !== null
              ? buildReviewSignalLines({
                  code: detail.code,
                  severity: 'REVIEW',
                  evidence: detail.evidence,
                }).map((line) => (
                  <p
                    key={line.text}
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      margin: '4px 0 0',
                    }}
                  >
                    {line.text}
                  </p>
                ))
              : null}
            {detail.action.kind === 'ROUTE' && detail.action.href ? (
              <div style={{ marginTop: `${spacing.sm}px` }}>
                <Link href={detail.action.href} aria-label={detail.action.label ?? 'Abrir'}>
                  <Button variant="outline" style={{ minHeight: 44 }}>
                    {detail.action.label ?? 'Abrir'}
                  </Button>
                </Link>
              </div>
            ) : null}
          </Card>

          <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
            <SectionHeader title="Por que estou vendo isso?" />
            <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: 0 }}>
              {describeReviewRule(detail.code)}
            </p>
          </Card>

          <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
            <SectionHeader title="Como evoluiu" />
            {detail.history.kind === 'SERIES' ? (
              <>
                {chartSeries !== null ? (
                  <PerformanceSeriesChart series={chartSeries} height={260} />
                ) : null}
                <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Tendência: {describeReviewTrend(detail.history.trend).label}
                  {detail.history.firstBelowAt
                    ? ` · Abaixo do benchmark desde ${formatDatePtBr(detail.history.firstBelowAt)}`
                    : ''}
                  {detail.history.worstGap !== null
                    ? ` · Pior diferença: ${detail.history.worstGap.replace('.', ',')} p.p.`
                    : ''}
                </p>
              </>
            ) : detail.history.kind === 'TABLE_MONTHLY' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {detail.history.months.map((month) => (
                  <div
                    key={month.month}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.8125rem',
                      padding: '6px 0',
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <span>{month.month}</span>
                    <span>
                      {month.currency} {month.total}
                    </span>
                  </div>
                ))}
                <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Total no período: {detail.history.currency} {detail.history.total} · Tendência:{' '}
                  {describeReviewTrend(detail.history.trend).label}
                </p>
              </div>
            ) : detail.history.kind === 'GROUPED' ? (
              detail.history.groups.map((group) => (
                <div key={group.currency} style={{ marginBottom: `${spacing.sm}px` }}>
                  <strong style={{ fontSize: '0.8125rem' }}>{group.currency}</strong>
                  {group.months.map((month) => (
                    <div
                      key={month.month}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8125rem',
                        padding: '6px 0',
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      <span>{month.month}</span>
                      <span>
                        {month.currency} {month.total}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            ) : detail.history.kind === 'TABLE_RUNS' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {detail.history.rows.length === 0 ? (
                  <EmptyState
                    title="Sem execuções no período"
                    description="Nenhuma importação ou sincronização registrada neste intervalo."
                  />
                ) : (
                  detail.history.rows.map((row) => (
                    <div
                      key={row.runId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: `${spacing.sm}px`,
                        fontSize: '0.8125rem',
                        padding: '6px 0',
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      <span>
                        {formatDatePtBr(row.date)} ·{' '}
                        {row.trigger === 'SCHEDULED' ? 'automática' : 'manual'} · {row.status}
                      </span>
                      <span>{row.newRecords} novos</span>
                    </div>
                  ))
                )}
                {detail.history.firstDivergenceAt !== null ? (
                  <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    Divergência nesta janela desde{' '}
                    {formatDatePtBr(detail.history.firstDivergenceAt)}
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="Histórico indisponível para este indicador"
                description="A análise considera o snapshot atual. Sem histórico inventado."
              />
            )}
          </Card>

          <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
            <SectionHeader title="Período" />
            <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
              {REVIEW_PERIODS.map((option) => (
                <Button
                  key={option.id}
                  variant={period === option.id ? 'primary' : 'outline'}
                  onClick={() => setParam('period', option.id)}
                  aria-label={`Analisar período ${option.label}`}
                  aria-pressed={period === option.id}
                  style={{ minHeight: 44 }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </Card>

          <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
            <SectionHeader title="Dados usados" />
            <ul
              style={{
                fontSize: '0.8125rem',
                color: colors.textSecondary,
                margin: 0,
                paddingLeft: '1.25rem',
              }}
            >
              {detail.dataUsed.coveragePercent !== null ? (
                <li>Cobertura de preços: {detail.dataUsed.coveragePercent}% do valor conhecido</li>
              ) : null}
              {detail.dataUsed.marketDataAsOf !== null ? (
                <li>Dados de mercado de: {detail.dataUsed.marketDataAsOf}</li>
              ) : null}
              <li>
                Período: {formatDatePtBr(detail.period.startDate)} a{' '}
                {formatDatePtBr(detail.period.endDate)} ({detail.period.preset})
              </li>
              {detail.dataUsed.denominator ? (
                <li>Denominador: {detail.dataUsed.denominator}</li>
              ) : null}
              {detail.dataUsed.benchmark ? <li>Benchmark: {detail.dataUsed.benchmark}</li> : null}
            </ul>
            {detail.limitations.length > 0 ? (
              <div style={{ marginTop: `${spacing.sm}px` }}>
                <strong style={{ fontSize: '0.8125rem' }}>Limitações</strong>
                {detail.limitations.map((limitation) => (
                  <p
                    key={limitation}
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      margin: '4px 0 0',
                    }}
                  >
                    {describeReviewLimitation(limitation)}
                  </p>
                ))}
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}

export default function PortfolioReviewDetailPage() {
  return (
    <Suspense>
      <ReviewDetailContent />
    </Suspense>
  );
}
