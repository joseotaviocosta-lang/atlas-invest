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
  const [categoryTab, setCategoryTab] = useState<'ACTIONABLE' | 'INFORMATIVE' | 'HISTORICAL' | 'ALL'>('ACTIONABLE');

  const actionableCount = reviews.filter((r) => r.isActionable !== false && r.isHistorical !== true).length;
  const informativeCount = reviews.filter((r) => r.isInformative === true).length;
  const historicalCount = reviews.filter((r) => r.isHistorical === true).length;

  const categoryTabs = [
    { id: 'ACTIONABLE' as const, label: 'Ação Necessária', count: actionableCount, badgeVariant: 'warning' as const },
    { id: 'INFORMATIVE' as const, label: 'Informativo', count: informativeCount, badgeVariant: 'neutral' as const },
    { id: 'HISTORICAL' as const, label: 'Histórico', count: historicalCount, badgeVariant: 'neutral' as const },
    { id: 'ALL' as const, label: 'Todas', count: reviews.length, badgeVariant: 'neutral' as const },
  ];

  const filterOptions = [
    { value: 'ALL', label: 'Todas as Gravidades' },
    { value: 'REVIEW', label: 'Revisão' },
    { value: 'WARNING', label: 'Aviso' },
    { value: 'ERROR', label: 'Erro' },
  ];

  const categoryFiltered = reviews.filter((item) => {
    if (categoryTab === 'ACTIONABLE') {
      return item.isActionable !== false && item.isHistorical !== true;
    }
    if (categoryTab === 'INFORMATIVE') {
      return item.isInformative === true;
    }
    if (categoryTab === 'HISTORICAL') {
      return item.isHistorical === true;
    }
    return true;
  });

  const displayedReviews = categoryFiltered.filter((item) => {
    if (selectedSeverity === 'ALL') return true;
    return item.severity === selectedSeverity;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
      {/* Category Tabs: Actionable vs Informative vs Historical vs All */}
      <div
        style={{
          display: 'flex',
          gap: `${spacing.sm}px`,
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: `${spacing.xs}px`,
        }}
      >
        {categoryTabs.map((tab) => {
          const isActive = categoryTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.5rem 1rem',
                border: 'none',
                borderBottom: isActive ? `2px solid ${colors.accent}` : '2px solid transparent',
                backgroundColor: 'transparent',
                color: isActive ? colors.accent : colors.textSecondary,
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <Badge variant={isActive ? tab.badgeVariant : 'neutral'} style={{ fontSize: '0.6875rem' }}>
                  {tab.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Severity Filter Tabs */}
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
      ) : displayedReviews.length === 0 ? (
        <Card>
          <EmptyState
            title={
              categoryTab === 'ACTIONABLE'
                ? 'Nenhuma ação necessária no momento'
                : categoryTab === 'INFORMATIVE'
                ? 'Nenhum aviso informativo'
                : categoryTab === 'HISTORICAL'
                ? 'Nenhum histórico arquivado'
                : 'Nenhuma pendência encontrada'
            }
            description={
              categoryTab === 'ACTIONABLE'
                ? 'Todas as conciliações e integrações estão em dia. Execuções antigas ou já substituídas foram arquivadas.'
                : 'Não existem registros correspondentes ao filtro selecionado.'
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {displayedReviews.map((item) => {
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
