'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  borderRadius,
  formatCivilDateDisplay,
  REVIEW_FILTERS,
  REVIEW_SEVERITY_PRESENTATION,
  buildReviewItemSummaryLines,
  buildReviewItemTitle,
  describeImportRunSource,
  describeIntegrationRunTrigger,
  reviewActionFor,
  reviewActionHref,
  type ReviewSeverity,
  type ReviewReasonCode,
} from '@atlas/ui';
import { Card, Skeleton, ErrorState, EmptyState, PageHeader, Button, Badge } from '@/components/ui';

interface ReviewMetrics {
  newRecords: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
  partial: boolean;
}

interface ReviewItem {
  id: string;
  runId: string;
  portfolioId: string;
  portfolioName: string | null;
  source: string;
  trigger: string | null;
  status: string;
  severity: ReviewSeverity;
  reasonCodes: string[];
  metrics: ReviewMetrics;
  createdAt: string;
  action: { kind: 'REVIEW_RUN' | 'VIEW_RUN'; runId: string; portfolioId: string };
}

interface PortfolioOption {
  id: string;
  name: string;
}

function ReviewsContent() {
  const searchParams = useSearchParams();
  const authReady = useAuthReady();
  const [severity, setSeverity] = useState<string>(searchParams.get('severity') ?? 'ALL');
  const [portfolioId, setPortfolioId] = useState<string>(searchParams.get('portfolioId') ?? '');
  const [source, setSource] = useState<string>(searchParams.get('source') ?? 'ALL');

  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioOption[] }>('/api/v1/portfolios');
      return res.data || [];
    },
    enabled: authReady,
    staleTime: 60 * 1000,
  });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (severity !== 'ALL') params.set('severity', severity);
    if (portfolioId !== '') params.set('portfolioId', portfolioId);
    if (source !== 'ALL') params.set('source', source);
    return params.toString();
  }, [severity, portfolioId, source]);

  const reviewsQuery = useQuery({
    queryKey: ['integration-reviews', severity, portfolioId, source],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ReviewItem[] }>(
        `/api/v1/integration-reviews?${queryParams}`,
      );
      return res.data;
    },
    enabled: authReady,
    staleTime: 30_000,
  });
  const items = useMemo(() => reviewsQuery.data ?? [], [reviewsQuery.data]);

  return (
    <div>
      <PageHeader
        title="Pendências"
        subtitle="Revisões e avisos das suas importações e sincronizações. Nada é importado sem a sua confirmação."
        breadcrumb="Carteira / Pendências"
      />

      <Card style={{ padding: `${spacing.base}px`, marginBottom: `${spacing.base}px` }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
            marginBottom: `${spacing.sm}px`,
          }}
          role="group"
          aria-label="Filtrar pendências"
        >
          {REVIEW_FILTERS.map((filter) => (
            <Button
              key={filter.id}
              variant={severity === filter.id ? 'primary' : 'outline'}
              onClick={() => setSeverity(filter.id)}
              aria-pressed={severity === filter.id}
              style={{ minHeight: 44 }}
            >
              {filter.label}
            </Button>
          ))}
          {portfolios.length > 1 ? (
            <select
              value={portfolioId}
              onChange={(event) => setPortfolioId(event.target.value)}
              aria-label="Filtrar por carteira"
              style={{ minHeight: 44 }}
            >
              <option value="">Todas as carteiras</option>
              {portfolios.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            aria-label="Filtrar por origem"
            style={{ minHeight: 44 }}
          >
            <option value="ALL">Todas as origens</option>
            <option value="B3">B3</option>
            <option value="CSV">CSV</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        {reviewsQuery.isLoading ? (
          <Skeleton width="100%" height="120px" />
        ) : reviewsQuery.isError ? (
          <ErrorState
            title="Não foi possível carregar as pendências"
            message="Tente novamente. Se o problema persistir, verifique sua conexão."
            onRetry={() => reviewsQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma pendência no momento"
            description="Quando uma importação ou sincronização precisar da sua atenção, ela aparece aqui."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            {items.map((item) => {
              const presentation = REVIEW_SEVERITY_PRESENTATION[item.severity];
              const origin = describeIntegrationRunTrigger(item.trigger);
              const action = reviewActionFor(item.action);
              const reasonCodes = item.reasonCodes as ReviewReasonCode[];
              const titleInput = {
                source: item.source,
                trigger: item.trigger,
                severity: item.severity,
                reasonCodes,
                metrics: item.metrics,
              };
              return (
                <article
                  key={item.id}
                  aria-label={buildReviewItemTitle(titleInput)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: `${spacing.base}px`,
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
                    <strong style={{ fontSize: '0.875rem' }}>
                      {item.portfolioName ?? 'Carteira'} ·{' '}
                      {describeImportRunSource(item.source, null)}
                    </strong>
                    <Badge variant={presentation.tone}>{presentation.label}</Badge>
                    <Badge variant={origin.tone}>{origin.label}</Badge>
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {buildReviewItemTitle(titleInput)}
                  </span>
                  {buildReviewItemSummaryLines(titleInput).map((line) => (
                    <span
                      key={line.text}
                      style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                    >
                      {line.text}
                    </span>
                  ))}
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    {formatCivilDateDisplay(item.createdAt.slice(0, 10))}
                  </span>
                  <span style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
                    <Link
                      href={reviewActionHref(item.action)}
                      aria-label={`${action.label} a pendência de ${item.portfolioName ?? 'carteira'}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: 44,
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: colors.accent,
                      }}
                    >
                      {action.label} →
                    </Link>
                    <Link
                      href={`/reviews/${item.runId}`}
                      aria-label={`Ver detalhes da pendência de ${item.portfolioName ?? 'carteira'}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: 44,
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: colors.accent,
                      }}
                    >
                      Ver detalhes →
                    </Link>
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<Skeleton width="100%" height="200px" />}>
      <ReviewsContent />
    </Suspense>
  );
}
