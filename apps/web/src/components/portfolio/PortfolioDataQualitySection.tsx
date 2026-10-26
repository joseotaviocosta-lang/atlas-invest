'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describeAffectedCapability,
  describeCompositionLimitation,
  describeDataQualityIssueDetail,
  describeDataQualityDomain,
  describeDataQualityIssue,
  describeDataQualityStatus,
} from '@atlas/ui';

interface QualityIssueView {
  code: string;
  domain: string;
  severity: string;
  affectedCapabilities: string[];
  facts: {
    assetId: string | null;
    ticker: string | null;
    asOf: string | null;
    count: number | null;
  };
  actions: Array<{ type: string; assetId: string | null }>;
}

interface QualityPositionView {
  assetId: string;
  ticker: string | null;
  currency: string;
  status: string;
  issueCount: number;
  blockingCount: number;
  reviewCount: number;
  issues: QualityIssueView[];
  affectedCapabilities: string[];
}

interface PortfolioDataQualityData {
  portfolioId: string;
  generatedAt: string;
  marketDataAsOf: string | null;
  status: string;
  summary: {
    positionsTotal: number;
    positionsWithoutIssues: number;
    positionsReviewRequired: number;
    positionsBlocked: number;
    issuesTotal: number;
    coveragePercent: string;
    unvaluedCount: number;
    knownCurrencies: string[];
  };
  issuesByDomain: Array<{ domain: string; count: number }>;
  positions: QualityPositionView[];
  portfolioIssues: QualityIssueView[];
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
    pendingReviews: number;
    truncated: boolean;
  };
  structuralLimitations: string[];
  limitations: string[];
}

function actionHref(
  portfolioId: string,
  action: { type: string; assetId: string | null },
): string | null {
  if (action.type === 'VIEW_POSITION' && action.assetId) {
    return `/portfolio/assets/${action.assetId}?portfolioId=${portfolioId}`;
  }
  if (action.type === 'VIEW_REVIEWS') {
    return `/reviews?portfolioId=${portfolioId}`;
  }
  return null;
}

/**
 * Phase 5R-E — portfolio data quality section (lazy, read-only).
 * Operational diagnostics: overall status, counts, issues grouped by
 * domain with affected capabilities and safe navigation. Facts only.
 * no repairs, no advice.
 */
export function PortfolioDataQualitySection({ portfolioId }: { portfolioId: string | null }) {
  const authReady = useAuthReady();
  const qualityQuery = useQuery({
    queryKey: ['portfolio-data-quality', portfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioDataQualityData }>(
        `/api/v1/portfolios/${portfolioId}/data-quality`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  if (!portfolioId) {
    return <EmptyState title="Qualidade dos dados" description="Selecione uma carteira." />;
  }

  const data = qualityQuery.data ?? null;

  return (
    <div style={{ marginTop: `${spacing.base}px` }} data-testid="portfolio-data-quality">
      <SectionHeader
        title="Qualidade dos dados"
        description="Pendências de dados por posição e reconciliação — o que falta, o que é afetado e onde conferir."
      />
      {qualityQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : qualityQuery.isError || !data ? (
        <ErrorState
          title="Qualidade indisponível"
          message="Não foi possível carregar o diagnóstico de dados. Tente novamente."
        />
      ) : (
        <>
          <p data-testid="data-quality-status" style={{ fontSize: '0.875rem' }}>
            Situação: <strong>{describeDataQualityStatus(data.status)}</strong>
          </p>
          <p
            data-testid="data-quality-counts"
            style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
          >
            {data.summary.positionsTotal} posições · {data.summary.positionsWithoutIssues} sem
            pendências · {data.summary.positionsReviewRequired} para revisar ·{' '}
            {data.summary.positionsBlocked} com dados insuficientes
          </p>

          {data.issuesByDomain.length > 0 && (
            <div data-testid="data-quality-by-domain">
              {data.issuesByDomain.map((entry) => (
                <p key={entry.domain} style={{ fontSize: '0.8125rem' }}>
                  {describeDataQualityDomain(entry.domain)}: {entry.count}{' '}
                  {entry.count === 1 ? 'pendência' : 'pendências'}
                </p>
              ))}
            </div>
          )}

          {data.positions
            .filter((row) => row.issueCount > 0)
            .map((row) => (
              <div key={row.assetId} data-testid={`data-quality-position-${row.assetId}`}>
                <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>
                  <Link href={`/portfolio/assets/${row.assetId}?portfolioId=${portfolioId}`}>
                    {row.ticker ?? row.assetId}
                  </Link>{' '}
                  — {describeDataQualityStatus(row.status)}
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {row.issues.map((issue) => (
                    <li key={issue.code} style={{ fontSize: '0.8125rem', marginBottom: 4 }}>
                      <strong>{describeDataQualityIssue(issue.code)}</strong>
                      {': '}
                      {describeDataQualityIssueDetail(issue.code)}
                      {issue.affectedCapabilities.length > 0 && (
                        <span>
                          {' '}
                          Afeta:{' '}
                          {issue.affectedCapabilities.map(describeAffectedCapability).join(', ')}.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {data.portfolioIssues.length > 0 && (
            <div data-testid="data-quality-portfolio-issues">
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Pendências da carteira</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.portfolioIssues.map((issue) => (
                  <li key={issue.code} style={{ fontSize: '0.8125rem', marginBottom: 4 }}>
                    <strong>{describeDataQualityIssue(issue.code)}</strong>
                    {issue.facts.count !== null ? ` (${issue.facts.count})` : ''}
                    {': '}
                    {describeDataQualityIssueDetail(issue.code)}
                    {issue.actions.map((action, index) => {
                      const href = actionHref(portfolioId, action);
                      return href ? (
                        <span key={index}>
                          {' '}
                          <Link href={href}>Ver revisões</Link>
                        </span>
                      ) : null;
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div data-testid="data-quality-reconciliation">
            <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Reconciliação</h4>
            <p style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Conferidos: {data.reconciliation.matched} · Divergentes:{' '}
              {data.reconciliation.divergent} · Faltando na carteira:{' '}
              {data.reconciliation.missingLocal} · Faltando na origem:{' '}
              {data.reconciliation.missingSource} · Não resolvidos: {data.reconciliation.unresolved}{' '}
              · Revisões pendentes: {data.reconciliation.pendingReviews}
            </p>
          </div>

          {data.structuralLimitations.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
              {data.structuralLimitations.map((code) => (
                <li
                  key={code}
                  data-testid={`data-quality-structural-${code}`}
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                >
                  {describeCompositionLimitation(code)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
