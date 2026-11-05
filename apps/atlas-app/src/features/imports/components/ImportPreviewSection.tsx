import React from 'react';
import {
  colors,
  borderRadius,
  spacing,
  formatCurrency,
  formatQuantity,
  formatCivilDateDisplay,
} from '@atlas/ui';
import { Card, Badge, StatCard } from '../../../components/ui';
import { getEffectiveRowState } from '../helpers';
import type { PreviewResponse, PreviewCandidate } from '../types';
import type { RowDecisionState } from '../helpers';

export interface ImportPreviewSectionProps {
  preview: PreviewResponse;
  decisions: Record<number, RowDecisionState>;
  onToggleSkip: (rowNumber: number) => void;
  onToggleForce: (rowNumber: number) => void;
}

export const ImportPreviewSection: React.FC<ImportPreviewSectionProps> = ({
  preview,
  decisions,
  onToggleSkip,
  onToggleForce,
}) => {
  const getCandidateBadgeVariant = (candidate: PreviewCandidate, effectiveState: string) => {
    if (effectiveState === 'skipped' || effectiveState === 'auto_skipped') return 'neutral';
    if (effectiveState === 'blocked') return 'negative';
    if (candidate.status === 'READY') return 'positive';
    if (candidate.status === 'DUPLICATE') return 'neutral';
    if (candidate.status === 'NEEDS_REVIEW') return 'warning';
    if (candidate.status === 'INVALID' || candidate.status === 'UNSUPPORTED') return 'negative';
    return 'neutral';
  };

  const getCandidateStatusText = (candidate: PreviewCandidate, effectiveState: string) => {
    if (effectiveState === 'skipped') return 'Ignorada';
    if (effectiveState === 'auto_skipped') return 'Auto-ignorada';
    if (effectiveState === 'blocked') return 'Bloqueada';
    switch (candidate.status) {
      case 'READY':
        return 'Pronta';
      case 'DUPLICATE':
        return 'Duplicada';
      case 'NEEDS_REVIEW':
        return 'Precisa de Revisão';
      case 'INVALID':
        return 'Inválida';
      case 'UNSUPPORTED':
        return 'Não Suportada';
      case 'AMBIGUOUS_ASSET':
        return 'Ativo Ambíguo';
      default:
        return candidate.status;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
      {/* Counters Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: `${spacing.md}px`,
        }}
      >
        <StatCard
          label="Total de Linhas"
          value={String(preview.summary.totalRows)}
          subValue={preview.detectedName ?? preview.fileName}
        />
        <StatCard
          label="Prontas para Importar"
          value={String(preview.summary.ready)}
          changeType="positive"
        />
        <StatCard
          label="Duplicadas"
          value={String(preview.summary.duplicates)}
          subValue="Ignoradas automaticamente"
        />
        <StatCard
          label="Precisam de Revisão"
          value={String(preview.summary.needsReview)}
          changeType={preview.summary.needsReview > 0 ? 'negative' : 'neutral'}
        />
        <StatCard
          label="Inválidas / Erros"
          value={String(preview.summary.invalid + preview.summary.unsupported)}
          changeType={preview.summary.invalid + preview.summary.unsupported > 0 ? 'negative' : 'neutral'}
        />
      </div>

      {/* Candidates Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: `${spacing.md}px ${spacing.lg}px`,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '1rem', color: colors.textPrimary }}>
            Operações Encontradas ({preview.candidates.length})
          </div>
          <Badge variant="info">
            {preview.sourceType === 'GENERIC_CSV' ? 'CSV' : 'B3 Excel'}
          </Badge>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8125rem',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: `${colors.border}20`, borderBottom: `1px solid ${colors.border}` }}>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>#</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Data</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Ticker</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Operação</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Qtd</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Preço Unit.</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Alertas / Motivo</th>
                <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'center' }}>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {preview.candidates.map((candidate) => {
                const decision = decisions[candidate.rowNumber];
                const effective = getEffectiveRowState(candidate, decision);
                const badgeVariant = getCandidateBadgeVariant(candidate, effective.state);
                const statusLabel = getCandidateStatusText(candidate, effective.state);

                return (
                  <tr
                    key={candidate.rowNumber}
                    style={{
                      borderBottom: `1px solid ${colors.border}40`,
                      backgroundColor:
                        effective.state === 'skipped' || effective.state === 'auto_skipped'
                          ? `${colors.border}10`
                          : effective.state === 'blocked'
                          ? `${colors.negative}0A`
                          : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.625rem 0.875rem', color: colors.textSecondary }}>
                      {candidate.rowNumber}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', whiteSpace: 'nowrap' }}>
                      {formatCivilDateDisplay(candidate.tradeDate)}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>
                      {candidate.ticker}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem' }}>
                      <Badge
                        variant={
                          candidate.operation === 'BUY'
                            ? 'positive'
                            : candidate.operation === 'SELL'
                            ? 'negative'
                            : 'neutral'
                        }
                      >
                        {candidate.rawOperation || candidate.operation}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right' }}>
                      {formatQuantity(candidate.quantity)}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right' }}>
                      {formatCurrency(candidate.unitPrice, candidate.currency || 'BRL')}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem' }}>
                      <Badge variant={badgeVariant}>{statusLabel}</Badge>
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', color: colors.textSecondary, maxWidth: '240px' }}>
                      {effective.reason ? (
                        <span>{effective.reason}</span>
                      ) : candidate.issues.length > 0 ? (
                        candidate.issues.map((issue) => issue.message).join('; ')
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        {candidate.duplicate === 'PROBABLE_DUPLICATE' && (
                          <button
                            type="button"
                            onClick={() => onToggleForce(candidate.rowNumber)}
                            style={{
                              padding: '2px 8px',
                              fontSize: '0.6875rem',
                              borderRadius: `${borderRadius.sm}px`,
                              border: `1px solid ${decision?.forceImport ? colors.accent : colors.border}`,
                              backgroundColor: decision?.forceImport ? `${colors.accent}20` : 'transparent',
                              color: decision?.forceImport ? colors.accent : colors.textSecondary,
                              cursor: 'pointer',
                            }}
                          >
                            {decision?.forceImport ? '✓ Forçado' : 'Forçar'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onToggleSkip(candidate.rowNumber)}
                          style={{
                            padding: '2px 8px',
                            fontSize: '0.6875rem',
                            borderRadius: `${borderRadius.sm}px`,
                            border: `1px solid ${decision?.skipped ? colors.negative : colors.border}`,
                            backgroundColor: decision?.skipped ? `${colors.negative}20` : 'transparent',
                            color: decision?.skipped ? colors.negative : colors.textSecondary,
                            cursor: 'pointer',
                          }}
                        >
                          {decision?.skipped ? 'Desfazer' : 'Ignorar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
