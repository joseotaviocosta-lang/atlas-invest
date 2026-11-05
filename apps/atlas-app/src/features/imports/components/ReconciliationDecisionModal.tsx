import React, { useState } from 'react';
import {
  colors,
  borderRadius,
  spacing,
  describeReviewReason,
  describeWorkspaceLimitation,
} from '@atlas/ui';
import { Modal, Badge, Button, Skeleton } from '../../../components/ui';
import {
  useIntegrationReviewDetail,
  useRecordReconciliationDecision,
} from '../hooks';
import { formatDateTime } from '../helpers';
import type { LinkedTransactionView } from '../types';

export interface ReconciliationDecisionModalProps {
  runId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReconciliationDecisionModal: React.FC<ReconciliationDecisionModalProps> = ({
  runId,
  isOpen,
  onClose,
}) => {
  const { data: detail, isLoading, error } = useIntegrationReviewDetail(runId);
  const recordDecisionMutation = useRecordReconciliationDecision(runId);
  const [actingTransactionId, setActingTransactionId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const handleDecision = async (transactionId: string, decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH') => {
    setActingTransactionId(transactionId);
    setFeedbackMessage(null);
    try {
      await recordDecisionMutation.mutateAsync({
        transactionId,
        decision,
      });
      setFeedbackMessage(
        decision === 'CONFIRM_MATCH'
          ? 'Correspondência confirmada com sucesso!'
          : 'Marcado como não correspondente.'
      );
    } catch {
      setFeedbackMessage('Falha ao registrar decisão de conciliação.');
    } finally {
      setActingTransactionId(null);
    }
  };

  const moneyLabel = (row: LinkedTransactionView): string => {
    if (row.amount !== null) return `${row.amount} ${row.currency ?? 'BRL'}`.trim();
    if (row.quantity !== null) return `${row.quantity} × ${row.ticker ?? row.assetId ?? ''}`;
    return '—';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reconciliação e Decisão de Correspondência" maxWidth="760px">
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          <Skeleton width="100%" height="40px" />
          <Skeleton width="100%" height="120px" />
        </div>
      ) : error || !detail ? (
        <div style={{ color: colors.negative, padding: `${spacing.md}px` }}>
          Não foi possível carregar os detalhes da pendência de conciliação.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          {/* Header Info */}
          <div
            style={{
              padding: `${spacing.md}px`,
              backgroundColor: `${colors.border}15`,
              borderRadius: `${borderRadius.md}px`,
              fontSize: '0.875rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                Carteira: {detail.portfolioName ?? 'Carteira Principal'}
              </span>
              <span style={{ color: colors.textSecondary }}>
                Criado em: {formatDateTime(detail.item?.createdAt)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap', marginTop: '6px' }}>
              {detail.item?.reasonCodes.map((code) => (
                <Badge key={code} variant="warning">
                  {describeReviewReason(code)}
                </Badge>
              ))}
            </div>
          </div>

          {/* Pair Review Progress */}
          {detail.pairReview && detail.pairReview.totalPairs > 0 && (
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Progresso da revisão:{' '}
              <strong style={{ color: colors.textPrimary }}>
                {detail.pairReview.decidedPairs} de {detail.pairReview.totalPairs} pares decididos
              </strong>
            </div>
          )}

          {/* Limitations Notice */}
          {detail.limitations && detail.limitations.length > 0 && (
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                backgroundColor: `${colors.warning}15`,
                border: `1px solid ${colors.warning}40`,
                borderRadius: `${borderRadius.md}px`,
                fontSize: '0.8125rem',
                color: colors.textPrimary,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px', color: colors.warning }}>
                Avisos operacionais:
              </div>
              {detail.limitations.map((lim) => (
                <div key={lim}>{describeWorkspaceLimitation(lim)}</div>
              ))}
            </div>
          )}

          {/* Feedback message */}
          {feedbackMessage && (
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                backgroundColor: `${colors.accent}15`,
                borderRadius: `${borderRadius.sm}px`,
                fontSize: '0.8125rem',
                color: colors.accent,
                fontWeight: 500,
              }}
            >
              {feedbackMessage}
            </div>
          )}

          {/* Linked Transactions Table */}
          <div>
            <h4
              style={{
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: colors.textPrimary,
                margin: '0 0 8px 0',
              }}
            >
              Transações Locais Correspondentes ({detail.linkedTransactions.length})
            </h4>

            {detail.linkedTransactions.length === 0 ? (
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Nenhuma transação local vinculada diretamente para conciliação neste item.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: `${borderRadius.md}px` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: `${colors.border}20`, borderBottom: `1px solid ${colors.border}` }}>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Data</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Ticker</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Tipo</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Valor / Qtd</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Decisão Atual</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Ação Humana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.linkedTransactions.map((tx) => {
                      const isActing = actingTransactionId === tx.transactionId;
                      return (
                        <tr key={tx.transactionId} style={{ borderBottom: `1px solid ${colors.border}40` }}>
                          <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                            {tx.tradeDate ?? '—'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                            {tx.ticker ?? '—'}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{tx.type ?? '—'}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                            {moneyLabel(tx)}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                            {tx.decision === 'CONFIRM_MATCH' ? (
                              <Badge variant="positive">Correspondente</Badge>
                            ) : tx.decision === 'NOT_A_MATCH' ? (
                              <Badge variant="neutral">Não corresponde</Badge>
                            ) : (
                              <Badge variant="warning">Pendente</Badge>
                            )}
                          </td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <Button
                                variant="primary"
                                onClick={() => handleDecision(tx.transactionId, 'CONFIRM_MATCH')}
                                disabled={isActing || tx.decision === 'CONFIRM_MATCH'}
                                style={{ padding: '2px 8px', fontSize: '0.6875rem' }}
                              >
                                {tx.decision === 'CONFIRM_MATCH' ? '✓ Confirmado' : 'Confirmar'}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => handleDecision(tx.transactionId, 'NOT_A_MATCH')}
                                disabled={isActing || tx.decision === 'NOT_A_MATCH'}
                                style={{ padding: '2px 8px', fontSize: '0.6875rem' }}
                              >
                                {tx.decision === 'NOT_A_MATCH' ? '✓ Rejeitado' : 'Rejeitar'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: `${spacing.md}px` }}>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
