'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import { Skeleton, ErrorState, EmptyState, SectionHeader } from '@/components/ui';
import { colors, spacing } from '@atlas/ui';
import {
  describeDataQualityStatus,
  describeOperationsAttention,
  describeOperationsAttentionDetail,
  describeOperationsDomain,
  describeOperationsStatus,
} from '@atlas/ui';

interface OperationsAttentionView {
  code: string;
  domain: string;
  severity: string;
  count: number | null;
  facts: { source: string | null; assetId: string | null; at: string | null };
  actions: Array<{ type: string }>;
}

interface OperationsIntegrationView {
  source: string;
  provider: string;
  environment: string;
  availability: string;
  connectionState: string;
  schedule: { cadence: string; enabled: boolean } | null;
  lastRun: { status: string; at: string } | null;
  lastSuccessfulAt: string | null;
  status: string;
  structuralNote: boolean;
}

interface PortfolioOperationsData {
  portfolioId: string;
  generatedAt: string;
  status: string;
  attention: { total: number; preview: OperationsAttentionView[] };
  integrations: OperationsIntegrationView[];
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
    pendingReviews: number;
    truncated: boolean;
  };
  dataQuality: {
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
  };
  reviewWorkflow: {
    pendingPairs: number;
    decidedPairs: number;
    totalPairs: number;
  };
  maintenance: {
    actionable: number;
    navigable: number;
    unsupported: number;
    structural: number;
  };
  reviewPreview: Array<{
    source: string;
    status: string;
    severity: string;
    reasonCodes: string[];
    at: string;
  }>;
  recentActivity: Array<{
    source: string;
    status: string;
    trigger: string | null;
    at: string;
    newRecords: number;
    confirmed: number;
  }>;
  availableActions: Array<{ type: string }>;
  limitations: string[];
}

function actionHref(portfolioId: string, action: string): string | null {
  if (action === 'VIEW_REVIEWS') return `/reviews?portfolioId=${portfolioId}`;
  if (action === 'VIEW_DATA_QUALITY') return '/portfolio?tab=overview';
  if (
    action === 'VIEW_INTEGRATION_SETTINGS' ||
    action === 'VIEW_RUN_HISTORY' ||
    action === 'VIEW_IMPORT'
  ) {
    return `/portfolio/import?portfolioId=${portfolioId}`;
  }
  return null;
}

function actionLabel(action: string): string {
  if (action === 'VIEW_REVIEWS') return 'Ver revisões';
  if (action === 'VIEW_DATA_QUALITY') return 'Ver qualidade dos dados';
  if (action === 'VIEW_INTEGRATION_SETTINGS') return 'Ver integrações';
  if (action === 'VIEW_RUN_HISTORY') return 'Ver histórico de execuções';
  return 'Ver importações';
}

/**
 * Phase 5S-A — portfolio operations center section (lazy, read-only).
 * One operational view: status, attention items, integrations, runs,
 * reconciliation and data-quality summaries with navigation actions.
 * Derived facts only — nothing here repairs, syncs or decides.
 */
export function PortfolioOperationsSection({ portfolioId }: { portfolioId: string | null }) {
  const authReady = useAuthReady();
  const operationsQuery = useQuery({
    queryKey: ['portfolio-operations', portfolioId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PortfolioOperationsData }>(
        `/api/v1/portfolios/${portfolioId}/operations-center`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(portfolioId),
    staleTime: 30_000,
    retry: false,
  });

  if (!portfolioId) {
    return <EmptyState title="Central de operações" description="Selecione uma carteira." />;
  }

  const data = operationsQuery.data ?? null;

  return (
    <div style={{ marginTop: `${spacing.base}px` }} data-testid="portfolio-operations">
      <SectionHeader
        title="Central de operações"
        description="Estado operacional da carteira — atenção necessária, integrações, execuções e qualidade dos dados. Somente leitura."
      />
      {operationsQuery.isLoading ? (
        <Skeleton width="100%" height="160px" />
      ) : operationsQuery.isError || !data ? (
        <ErrorState
          title="Operações indisponíveis"
          message="Não foi possível carregar a central de operações. Tente novamente."
        />
      ) : (
        <>
          <p data-testid="operations-status" style={{ fontSize: '0.875rem' }}>
            Situação: <strong>{describeOperationsStatus(data.status)}</strong>
          </p>
          {data.attention.total === 0 ? (
            <p data-testid="operations-clear" style={{ fontSize: '0.8125rem' }}>
              Nenhuma pendência operacional identificada.
            </p>
          ) : (
            <p data-testid="operations-attention-count" style={{ fontSize: '0.8125rem' }}>
              {data.attention.total}{' '}
              {data.attention.total === 1 ? 'item precisa' : 'itens precisam'} da sua atenção.
            </p>
          )}

          {data.attention.preview.length > 0 && (
            <div data-testid="operations-attention">
              {data.attention.preview.map((item) => (
                <div key={`${item.domain}-${item.code}`} style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: '0.8125rem', margin: 0 }}>
                    <strong>{describeOperationsAttention(item.code)}</strong>
                    {item.count !== null ? ` (${item.count})` : ''} ·{' '}
                    {describeOperationsDomain(item.domain)}
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
                    {describeOperationsAttentionDetail(item.code)}{' '}
                    {item.actions.map((action) => {
                      const href = actionHref(portfolioId, action.type);
                      return href ? (
                        <Link key={action.type} href={href}>
                          {actionLabel(action.type)}
                        </Link>
                      ) : null;
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div data-testid="operations-integrations">
            <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Integrações</h4>
            {data.integrations.map((row) => (
              <div key={row.source} style={{ marginBottom: 8 }}>
                <p style={{ fontSize: '0.8125rem', margin: 0 }}>
                  <strong>{row.source}</strong> · {row.connectionState} ·{' '}
                  {row.schedule ? row.schedule.cadence : 'sem agendamento'}
                </p>
                <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
                  Ambiente: {row.environment}
                  {row.lastRun ? ` · Última execução: ${row.lastRun.status}` : ' · Sem execuções'}
                  {row.structuralNote ? ' · Integração em preparação' : ''}
                </p>
              </div>
            ))}
          </div>

          <div data-testid="operations-reconciliation">
            <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Reconciliação</h4>
            <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
              Conferidos: {data.reconciliation.matched} · Divergentes:{' '}
              {data.reconciliation.divergent} · Revisões pendentes:{' '}
              {data.reconciliation.pendingReviews}
              {data.reconciliation.truncated ? ' · Janela limitada às execuções recentes' : ''}
            </p>
            <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '4px 0 0' }}>
              Pares revisados: {data.reviewWorkflow.decidedPairs} de{' '}
              {data.reviewWorkflow.totalPairs}
              {data.reviewWorkflow.pendingPairs > 0
                ? ` · ${data.reviewWorkflow.pendingPairs} aguardando decisão`
                : ' · nada pendente'}
            </p>
            <Link href={`/reviews?portfolioId=${portfolioId}`} aria-label="Ver revisões">
              Ver revisões
            </Link>
          </div>

          <div data-testid="operations-data-quality">
            <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Qualidade dos dados</h4>
            <p style={{ fontSize: '0.8125rem', margin: 0 }}>
              Situação: <strong>{describeDataQualityStatus(data.dataQuality.status)}</strong>
            </p>
            <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
              {data.dataQuality.summary.positionsTotal} posições ·{' '}
              {data.dataQuality.summary.positionsWithoutIssues} sem pendências ·{' '}
              {data.dataQuality.summary.positionsBlocked} com dados insuficientes
            </p>
            <Link href="/portfolio?tab=overview" aria-label="Ver qualidade dos dados">
              Ver qualidade dos dados
            </Link>
          </div>

          {(data.maintenance.actionable > 0 || data.maintenance.navigable > 0) && (
            <div data-testid="operations-maintenance">
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Manutenção de dados</h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
                {data.maintenance.actionable > 0 &&
                  `${data.maintenance.actionable} podem ser corrigidas no Atlas. `}
                {data.maintenance.navigable > 0 &&
                  `${data.maintenance.navigable} requerem revisão.`}
              </p>
              <Link
                href={`/portfolio/maintenance?portfolioId=${portfolioId}`}
                aria-label="Revisar manutenção"
              >
                Revisar manutenção
              </Link>
            </div>
          )}

          {data.recentActivity.length > 0 && (
            <div data-testid="operations-recent-runs">
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Execuções recentes</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.recentActivity.map((run, index) => (
                  <li key={index} style={{ fontSize: '0.8125rem', marginBottom: 4 }}>
                    {run.source} · {run.status} · {run.newRecords} novos · {run.confirmed}{' '}
                    confirmados
                  </li>
                ))}
              </ul>
              <Link
                href={`/portfolio/import?portfolioId=${portfolioId}`}
                aria-label="Ver histórico de execuções"
              >
                Ver histórico de execuções
              </Link>
            </div>
          )}

          {data.reviewPreview.length > 0 && (
            <div data-testid="operations-review-preview">
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Revisões</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.reviewPreview.map((item, index) => (
                  <li key={index} style={{ fontSize: '0.8125rem', marginBottom: 4 }}>
                    {item.source} · {item.status} · {item.reasonCodes.join(', ')}
                  </li>
                ))}
              </ul>
              <Link href={`/reviews?portfolioId=${portfolioId}`} aria-label="Ver todas as revisões">
                Ver todas as revisões
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
