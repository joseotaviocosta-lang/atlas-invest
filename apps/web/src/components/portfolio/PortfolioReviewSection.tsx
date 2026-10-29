'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import {
  Card,
  Skeleton,
  Badge,
  ErrorState,
  EmptyState,
  SectionHeader,
  Button,
} from '@/components/ui';
import {
  colors,
  spacing,
  borderRadius,
  formatPercentage,
  describeReviewSignal,
  buildReviewSignalTitle,
  buildReviewSignalLines,
  type ReviewSignalTone,
} from '@atlas/ui';

export interface PortfolioReviewSignalDto {
  id: string;
  code: string;
  category: string;
  severity: string;
  evidence: Record<string, string | number | boolean | null>;
  action: { kind: 'ROUTE' | 'NONE'; href?: string; label?: string };
}

export interface PortfolioReviewDto {
  portfolioId: string;
  asOf: { generatedAt: string; marketDataAsOf: string | null };
  summary: { attentionCount: number; dataNote: string | null };
  dataQuality: {
    valuationCoveragePercent: string | null;
    totalPositions: number;
    valuedPositions: number;
    unvaluedPositions: number;
    stalePositions: number;
    missingPrices: number;
    reconciliation: {
      divergent: number;
      missingLocal: number;
      missingSource: number;
      unresolved: number;
    };
    partialRuns: number;
    pendingReviews: number;
  };
  signals: PortfolioReviewSignalDto[];
  isEmpty: boolean;
}

export function portfolioReviewQueryKey(portfolioId: string) {
  return ['portfolio-review', portfolioId];
}

export function unwrapReview(payload: unknown): PortfolioReviewDto | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('summary' in payload && typeof (payload as { summary: unknown }).summary === 'object') {
    return payload as PortfolioReviewDto;
  }
  if (
    'data' in payload &&
    payload.data &&
    typeof payload.data === 'object' &&
    'summary' in (payload.data as object)
  ) {
    return payload.data as PortfolioReviewDto;
  }
  return null;
}

function severityVariant(severity: string): 'info' | 'warning' | 'neutral' {
  if (severity === 'WARNING' || severity === 'REVIEW') return 'warning';
  if (severity === 'INFO') return 'info';
  return 'neutral';
}

function toneColor(tone: ReviewSignalTone): string {
  if (tone === 'warning') return colors.warning;
  if (tone === 'info') return colors.info;
  if (tone === 'danger') return colors.negative;
  if (tone === 'success') return colors.positive;
  return colors.textSecondary;
}

export function summaryText(review?: PortfolioReviewDto | null): string {
  if (!review || !review.summary || review.isEmpty) {
    return 'Sua carteira ainda não possui dados suficientes para gerar uma revisão.';
  }
  const attention = review.summary.attentionCount;
  if (attention === undefined || attention === null) {
    return 'Sua carteira ainda não possui dados suficientes para gerar uma revisão.';
  }
  if (attention === 0) {
    return 'Nenhum ponto relevante identificado com os dados disponíveis.';
  }
  if (attention === 1) {
    return '1 ponto merece revisão.';
  }
  return `${attention} pontos merecem revisão.`;
}

/**
 * Phase 5Q-A — consolidated decision support section.
 *
 * Derived signals only: data quality first, then allocation, performance,
 * income and integration attention. Every card pairs severity text with its
 * badge (never color-only), carries server evidence, and routes to an
 * existing feature — no new pages, no advice.
 */
export function PortfolioReviewSection({ portfolioId }: { portfolioId: string }) {
  const { data, isLoading, isError, refetch } = useQuery<unknown>({
    queryKey: portfolioId ? portfolioReviewQueryKey(portfolioId) : ['portfolio-review', 'none'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioReviewDto }>(
        `/api/v1/portfolios/${portfolioId}/review`,
      );
      return res.data;
    },
    enabled: portfolioId !== '',
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
        <SectionHeader title="Revisão da carteira" />
        <Skeleton width="100%" height="120px" />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
        <SectionHeader title="Revisão da carteira" />
        <ErrorState
          title="Não foi possível carregar a revisão"
          message="Tente novamente. Se o problema persistir, verifique sua conexão."
          onRetry={() => refetch()}
        />
      </Card>
    );
  }

  const review = unwrapReview(data);
  const signals = review?.signals ?? [];
  const hasReviewData = review !== null && review.summary !== null && review.summary !== undefined;
  const isPortfolioEmpty = review ? review.isEmpty : true;
  const isNoReviewData = !hasReviewData || isPortfolioEmpty;

  return (
    <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
      <SectionHeader
        title="Revisão da carteira"
        description={summaryText(review)}
        action={
          review && review.summary && review.summary.attentionCount > 0 ? (
            <Link
              href={`/reviews?portfolioId=${review.portfolioId || portfolioId}`}
              aria-label="Ver pendências"
            >
              <Button size="sm" variant="outline">
                Ver pendências
              </Button>
            </Link>
          ) : undefined
        }
      />
      {review && !isNoReviewData && review.summary?.dataNote !== null && review.summary?.dataNote !== undefined ? (
        <p
          style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: `${spacing.sm}px 0` }}
        >
          Cobertura de preços: {formatPercentage(review.summary.dataNote, { showSign: false })} — as
          análises abaixo consideram apenas o valor com preço disponível.
        </p>
      ) : null}
      {signals.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          <EmptyState
            title={isNoReviewData ? 'Nenhuma revisão disponível' : 'Nenhum ponto relevante identificado'}
            description={
              isNoReviewData
                ? 'Sua carteira ainda não possui dados suficientes para gerar uma revisão. Adicione ou importe investimentos para começar.'
                : 'Com os dados disponíveis, não há itens que precisem da sua atenção.'
            }
            actionLabel={isNoReviewData ? 'Importar investimentos' : undefined}
            onAction={
              isNoReviewData
                ? () => {
                    window.location.href = `/portfolio/import?portfolioId=${review?.portfolioId || portfolioId}`;
                  }
                : undefined
            }
          />
          {isNoReviewData ? (
            <div
              style={{
                textAlign: 'center',
                marginTop: `-${spacing.xs}px`,
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <Link
                href={`/portfolio?tab=operations&portfolioId=${review?.portfolioId || portfolioId}`}
                style={{ fontSize: '0.875rem', color: colors.accent, textDecoration: 'none' }}
              >
                Adicionar operação
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          {signals.map((signal) => {
            const presentation = describeReviewSignal(signal.code);
            return (
              <div
                key={signal.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: `${spacing.sm}px`,
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${borderRadius.lg}px`,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${spacing.sm}px`,
                    flexWrap: 'wrap',
                  }}
                >
                  <Badge variant={severityVariant(signal.severity)}>{presentation.label}</Badge>
                  <strong style={{ fontSize: '0.875rem' }}>
                    {buildReviewSignalTitle({
                      code: signal.code,
                      severity: signal.severity,
                      evidence: signal.evidence,
                    })}
                  </strong>
                </span>
                <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  {presentation.description}
                </span>
                {buildReviewSignalLines({
                  code: signal.code,
                  severity: signal.severity,
                  evidence: signal.evidence,
                }).map((line) => (
                  <span
                    key={line.text}
                    style={{ fontSize: '0.8125rem', color: toneColor(line.tone) }}
                  >
                    {line.text}
                  </span>
                ))}
                {signal.action?.kind === 'ROUTE' && signal.action.href ? (
                  <span style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
                    <Link
                      href={signal.action.href}
                      aria-label={signal.action.label ?? 'Abrir detalhes'}
                    >
                      <Button size="sm" variant="outline" style={{ minHeight: 44 }}>
                        {signal.action.label ?? 'Abrir detalhes'}
                      </Button>
                    </Link>
                    <Link
                      href={`/portfolio/review?portfolioId=${review?.portfolioId || portfolioId}&signal=${signal.id}&period=1A`}
                      aria-label={`Ver detalhes de ${describeReviewSignal(signal.code).label}`}
                    >
                      <Button size="sm" variant="outline" style={{ minHeight: 44 }}>
                        Ver detalhes
                      </Button>
                    </Link>
                  </span>
                ) : (
                  <span>
                    <Link
                      href={`/portfolio/review?portfolioId=${review?.portfolioId || portfolioId}&signal=${signal.id}&period=1A`}
                      aria-label={`Ver detalhes de ${describeReviewSignal(signal.code).label}`}
                    >
                      <Button size="sm" variant="outline" style={{ minHeight: 44 }}>
                        Ver detalhes
                      </Button>
                    </Link>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
