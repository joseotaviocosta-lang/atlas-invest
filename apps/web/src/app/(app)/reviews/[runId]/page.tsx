'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthReady } from '@/hooks/use-auth-ready';
import {
  colors,
  spacing,
  describeReconciliationState,
  describeReviewReason,
  describeWorkspaceLimitation,
  describeDifferenceField,
  describeImportRunSource,
  type ReviewSeverity,
  type ReviewReasonCode,
} from '@atlas/ui';
import { Card, Skeleton, ErrorState, PageHeader } from '@/components/ui';

interface LinkedTransactionView {
  transactionId: string;
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  ticker: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
}

interface ReviewDetailData {
  item: {
    id: string;
    runId: string;
    portfolioId: string;
    portfolioName: string | null;
    source: string;
    trigger: string | null;
    status: string;
    severity: ReviewSeverity;
    reasonCodes: string[];
    metrics: {
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
    };
    createdAt: string;
  } | null;
  state: 'ACTIONABLE' | 'RESOLVED';
  resolvedReason: string | null;
  portfolioName: string | null;
  linkedTransactions: LinkedTransactionView[];
  linkedTransactionsTruncated: boolean;
  limitations: string[];
}

function moneyLabel(row: LinkedTransactionView): string {
  if (row.amount !== null) return `${row.amount} ${row.currency ?? ''}`.trim();
  if (row.quantity !== null) return `${row.quantity} × ${row.ticker ?? row.assetId ?? ''}`;
  return '—';
}

function ReviewDetailContent() {
  const params = useParams();
  const authReady = useAuthReady();
  const runId = (params?.runId as string) || '';

  const detailQuery = useQuery({
    queryKey: ['integration-review', runId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ReviewDetailData }>(
        `/api/v1/integration-reviews/${runId}`,
      );
      return res.data;
    },
    enabled: authReady && Boolean(runId),
    staleTime: 30_000,
    retry: false,
  });

  const data = detailQuery.data ?? null;
  const item = data?.item ?? null;

  return (
    <div>
      <PageHeader
        title="Detalhe da revisão"
        subtitle="Comparação entre fonte e Atlas para esta execução."
        breadcrumb="Carteira / Pendências / Detalhe"
      />
      <Card style={{ padding: `${spacing.base}px` }}>
        {detailQuery.isLoading ? (
          <Skeleton width="100%" height="200px" />
        ) : detailQuery.isError || !data ? (
          <ErrorState
            title="Não foi possível carregar a revisão"
            message="Tente novamente. Se o problema persistir, verifique sua conexão."
            onRetry={() => detailQuery.refetch()}
          />
        ) : (
          <>
            <p style={{ fontSize: '0.875rem', margin: '0 0 4px' }} data-testid="review-run-context">
              <strong>{item ? describeImportRunSource(item.source, null) : 'Execução'}</strong>
              {item ? ` · ${item.status}` : ''} · Situação:{' '}
              {data.state === 'ACTIONABLE' ? 'Aguardando revisão' : 'Resolvida'}
            </p>

            {item && (
              <div data-testid="review-reasons">
                <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>
                  Por que está em revisão
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {(item.reasonCodes as ReviewReasonCode[]).map((code) => (
                    <li key={code} style={{ fontSize: '0.8125rem', marginBottom: 4 }}>
                      {describeReviewReason(code)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div data-testid="review-source-panel">
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Fonte</h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
                O detalhamento item a item da fonte não é guardado após a execução. A comparação
                mostra os totais da execução e os fatos locais confirmados.
              </p>
            </div>

            <div data-testid="review-local-panel">
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>
                Atlas — operações vinculadas ({data.linkedTransactions.length})
              </h4>
              {data.linkedTransactions.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
                  Nenhuma operação vinculada a esta execução.
                </p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Ativo</th>
                      <th scope="col">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.linkedTransactions.map((row) => (
                      <tr key={row.transactionId}>
                        <td>{row.tradeDate ?? '—'}</td>
                        <td>{row.type ?? '—'}</td>
                        <td>{row.ticker ?? row.assetId ?? '—'}</td>
                        <td>{moneyLabel(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {item && (
              <div data-testid="review-reconciliation">
                <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Reconciliação</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {(
                    [
                      ['DIVERGENT', item.metrics.divergent],
                      ['MISSING_LOCAL', item.metrics.missingLocal],
                      ['MISSING_SOURCE', item.metrics.missingSource],
                      ['UNRESOLVED', item.metrics.unresolved],
                    ] as Array<[string, number]>
                  ).map(([state, count]) => (
                    <li key={state} style={{ fontSize: '0.8125rem', marginBottom: 4 }}>
                      <strong>{state}</strong> ({count}): {describeReconciliationState(state)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div data-testid="review-differences">
              <h4 style={{ fontSize: '0.875rem', margin: '12px 0 4px' }}>Diferenças encontradas</h4>
              <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: 0 }}>
                Sem detalhamento campo a campo: os itens da fonte não ficam guardados após a
                execução. Use os totais e os fatos locais acima. Campos comparáveis quando a fonte
                está disponível:{' '}
                {['date', 'type', 'asset', 'quantity', 'amount', 'currency']
                  .map(describeDifferenceField)
                  .join(', ')}
                .
              </p>
            </div>

            {data.limitations.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0' }}>
                {data.limitations.map((code) => (
                  <li
                    key={code}
                    data-testid={`review-limitation-${code}`}
                    style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                  >
                    {describeWorkspaceLimitation(code)}
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <Link
                href="/reviews"
                aria-label="Voltar para pendências"
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
              >
                ← Pendências
              </Link>
              {item && item.status === 'AWAITING_REVIEW' && (
                <Link
                  href={`/portfolio/import?portfolioId=${item.portfolioId}&runId=${item.runId}`}
                  aria-label="Continuar revisão na central de importação"
                  style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
                >
                  Continuar revisão →
                </Link>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function ReviewDetailPage() {
  return (
    <Suspense fallback={<Skeleton width="100%" height="200px" />}>
      <ReviewDetailContent />
    </Suspense>
  );
}
