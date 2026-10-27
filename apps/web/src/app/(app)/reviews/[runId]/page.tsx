'use client';

import React, { Suspense, useState } from 'react';
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
import { Card, Skeleton, ErrorState, PageHeader, Button } from '@/components/ui';

interface LinkedTransactionView {
  transactionId: string;
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  ticker: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
  decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH' | null;
  decidedAt: string | null;
  rectified: boolean;
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
  pairReview: { status: string; totalPairs: number; decidedPairs: number };
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
  const [pendingDecision, setPendingDecision] = useState<{
    transactionId: string;
    decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH';
  } | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

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

  async function submitDecision() {
    if (!pendingDecision) return;
    setDeciding(true);
    setDecisionError(null);
    try {
      await apiClient.post(`/api/v1/integration-reviews/${runId}/decisions`, pendingDecision);
      setPendingDecision(null);
      await detailQuery.refetch();
    } catch {
      setDecisionError(
        'Não foi possível registrar a decisão. Tente novamente; confirmar duas vezes não cria duplicatas.',
      );
    } finally {
      setDeciding(false);
    }
  }

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
            <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '0 0 4px' }}>
              Reconciliação detectada:{' '}
              {(
                [
                  ['DIVERGENT', item?.metrics.divergent ?? 0],
                  ['MISSING_LOCAL', item?.metrics.missingLocal ?? 0],
                  ['MISSING_SOURCE', item?.metrics.missingSource ?? 0],
                  ['UNRESOLVED', item?.metrics.unresolved ?? 0],
                ] as Array<[string, number]>
              )
                .filter(([, count]) => count > 0)
                .map(([state]) => describeReconciliationState(state))
                .join('; ') || 'sem divergências'}
              {' · '}Revisão:{' '}
              {data.pairReview.status === 'RESOLVED'
                ? 'Concluída'
                : data.pairReview.status === 'PARTIALLY_RESOLVED'
                  ? `Parcial (${data.pairReview.decidedPairs} de ${data.pairReview.totalPairs} pares revisados)`
                  : data.pairReview.status === 'PENDING'
                    ? `Pendente (${data.pairReview.totalPairs} ${data.pairReview.totalPairs === 1 ? 'par' : 'pares'} para revisar)`
                    : 'Não acionável para este item'}
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
                      <th scope="col">Decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.linkedTransactions.map((row) => (
                      <tr
                        key={row.transactionId}
                        data-testid={`review-linked-${row.transactionId}`}
                      >
                        <td>{row.tradeDate ?? '—'}</td>
                        <td>{row.type ?? '—'}</td>
                        <td>{row.ticker ?? row.assetId ?? '—'}</td>
                        <td>{moneyLabel(row)}</td>
                        <td>
                          {row.decision === 'CONFIRM_MATCH' ? (
                            <span>Correspondência confirmada</span>
                          ) : row.decision === 'NOT_A_MATCH' ? (
                            <span>Não correspondem</span>
                          ) : (
                            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <Button
                                variant="outline"
                                size="sm"
                                style={{ minHeight: 44 }}
                                aria-label={`Confirmar correspondência de ${row.ticker ?? row.transactionId}`}
                                onClick={() =>
                                  setPendingDecision({
                                    transactionId: row.transactionId,
                                    decision: 'CONFIRM_MATCH',
                                  })
                                }
                                data-testid={`decision-confirm-${row.transactionId}`}
                              >
                                Confirmar correspondência
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                style={{ minHeight: 44 }}
                                aria-label={`Marcar que não correspondem: ${row.ticker ?? row.transactionId}`}
                                onClick={() =>
                                  setPendingDecision({
                                    transactionId: row.transactionId,
                                    decision: 'NOT_A_MATCH',
                                  })
                                }
                                data-testid={`decision-reject-${row.transactionId}`}
                              >
                                Não correspondem
                              </Button>
                            </span>
                          )}
                          {row.rectified ? (
                            <span style={{ display: 'block', fontSize: '0.75rem' }}>
                              Posteriormente retificada
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pendingDecision && (
                <div data-testid="decision-confirmation" style={{ marginTop: 12 }}>
                  <p style={{ fontSize: '0.8125rem', margin: '0 0 4px' }}>
                    {pendingDecision.decision === 'CONFIRM_MATCH'
                      ? 'Esta ação registra apenas que os dois registros correspondem. Nenhuma operação do ledger será criada, editada ou excluída.'
                      : 'Esta ação registra que estes dois registros não correspondem. Nenhuma operação será removida.'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      style={{ minHeight: 44 }}
                      disabled={deciding}
                      onClick={submitDecision}
                      aria-label="Confirmar decisão de reconciliação"
                      data-testid="decision-submit"
                    >
                      Confirmar decisão
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      style={{ minHeight: 44 }}
                      disabled={deciding}
                      onClick={() => setPendingDecision(null)}
                      aria-label="Cancelar decisão"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {decisionError && (
                <p
                  role="alert"
                  style={{ fontSize: '0.8125rem', color: colors.negative, margin: '8px 0 0' }}
                >
                  {decisionError}
                </p>
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
