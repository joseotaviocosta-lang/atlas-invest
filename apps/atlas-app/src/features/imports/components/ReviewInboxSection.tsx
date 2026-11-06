import React, { useState } from 'react';
import {
  colors,
  borderRadius,
  spacing,
  describeReviewReason,
  describeImportRunSource,
} from '@atlas/ui';
import { Card, Badge, Button, EmptyState, Skeleton } from '../../../components/ui';
import { formatDateTime } from '../helpers';
import { ReconciliationDecisionModal } from './ReconciliationDecisionModal';
import type { ReviewItem } from '../types';

export interface ReviewInboxSectionProps {
  reviews: ReviewItem[];
  isLoading: boolean;
  selectedSeverity: string;
  onSelectSeverity: (severity: string) => void;
}

export const ReviewInboxSection: React.FC<ReviewInboxSectionProps> = ({
  reviews,
  isLoading,
  selectedSeverity,
  onSelectSeverity,
}) => {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const filterOptions = [
    { value: 'ALL', label: 'Todas as Gravidades' },
    { value: 'REVIEW', label: 'Revisão' },
    { value: 'WARNING', label: 'Aviso' },
    { value: 'ERROR', label: 'Erro' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
        {filterOptions.map((opt) => {
          const isActive = selectedSeverity === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectSeverity(opt.value)}
              style={{
                padding: '0.375rem 0.875rem',
                borderRadius: `${borderRadius.md}px`,
                fontSize: '0.8125rem',
                fontWeight: isActive ? 600 : 500,
                border: `1px solid ${isActive ? colors.accent : colors.border}`,
                backgroundColor: isActive ? `${colors.accent}15` : colors.surface,
                color: isActive ? colors.accent : colors.textSecondary,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Card style={{ padding: `${spacing.lg}px` }}>
          <Skeleton width="100%" height="56px" style={{ marginBottom: `${spacing.md}px` }} />
          <Skeleton width="100%" height="56px" style={{ marginBottom: `${spacing.md}px` }} />
          <Skeleton width="100%" height="56px" />
        </Card>
      ) : reviews.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma pendência de conciliação"
            description="Não existem execuções aguardando revisão ou pendências de conciliação no momento."
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {reviews.map((item) => {
            const sourceDesc = describeImportRunSource(item.source, null);
            const severityVariant =
              item.severity === 'ERROR'
                ? 'negative'
                : item.severity === 'WARNING'
                ? 'warning'
                : 'info';

            const pairLabel =
              item.pairReview.status === 'RESOLVED'
                ? 'Revisado'
                : item.pairReview.totalPairs > 0
                ? `${item.pairReview.decidedPairs} de ${item.pairReview.totalPairs} pares decididos`
                : null;

            const hasActionableItems = item.metrics.newRecords > 0 || item.metrics.conflicts > 0;

            return (
              <Card
                key={item.id}
                style={{
                  padding: `${spacing.lg}px`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: `${spacing.md}px`,
                }}
              >
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginBottom: '6px' }}>
                    <Badge variant={severityVariant}>{item.severity}</Badge>
                    <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.9375rem' }}>
                      {sourceDesc} · {item.portfolioName ?? 'Carteira'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                      (Execução {item.runId.slice(0, 8)}) • {formatDateTime(item.createdAt)}
                    </span>
                  </div>

                  {/* Quantitative Metrics Breakdown */}
                  <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap', marginTop: '6px', marginBottom: '8px' }}>
                    {item.metrics.newRecords > 0 && (
                      <Badge variant="positive">✨ {item.metrics.newRecords} novas operações</Badge>
                    )}
                    {item.metrics.unsupported > 0 && (
                      <Badge variant="neutral">ℹ️ {item.metrics.unsupported} registros não suportados</Badge>
                    )}
                    {item.metrics.probableDuplicates > 0 && (
                      <Badge variant="warning">⚠️ {item.metrics.probableDuplicates} duplicatas prováveis</Badge>
                    )}
                    {item.metrics.conflicts > 0 && (
                      <Badge variant="negative">🚨 {item.metrics.conflicts} conflitos</Badge>
                    )}
                  </div>

                  {/* Context and Impact Explanation */}
                  <div style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '6px', lineHeight: 1.4 }}>
                    {hasActionableItems
                      ? 'Operações identificadas aguardam confirmação do investidor para integração definitiva no ledger de transações.'
                      : item.metrics.unsupported > 0
                      ? 'Registros em formato não mapeado pela B3 foram ignorados na apuração sem alterar o saldo das posições ativas.'
                      : 'Execução finalizada com identificação de duplicidades já existentes no histórico da carteira.'}
                  </div>

                  <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap', marginTop: '4px' }}>
                    {item.reasonCodes.map((code) => (
                      <span
                        key={code}
                        style={{
                          fontSize: '0.75rem',
                          color: colors.textSecondary,
                          backgroundColor: `${colors.border}20`,
                          padding: '2px 6px',
                          borderRadius: `${borderRadius.sm}px`,
                        }}
                      >
                        {describeReviewReason(code)}
                      </span>
                    ))}
                  </div>

                  {pairLabel && (
                    <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '6px' }}>
                      ⚖️ Conciliação: <strong style={{ color: colors.textPrimary }}>{pairLabel}</strong>
                    </div>
                  )}
                </div>

                <div>
                  <Button
                    variant={hasActionableItems ? 'primary' : 'outline'}
                    onClick={() => setSelectedRunId(item.runId)}
                    style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}
                  >
                    Revisar & Conciliar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Decision Modal */}
      <ReconciliationDecisionModal
        runId={selectedRunId}
        isOpen={Boolean(selectedRunId)}
        onClose={() => setSelectedRunId(null)}
      />
    </div>
  );
};
