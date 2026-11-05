import React from 'react';
import {
  colors,
  spacing,
  IMPORT_RUN_STATUS_PRESENTATION,
  describeImportRunSource,
  describeIntegrationRunTrigger,
} from '@atlas/ui';
import { Card, Badge, Button, EmptyState, Skeleton } from '../../../components/ui';
import { formatDateTime } from '../helpers';
import type { ImportRunItem } from '../types';

export interface ImportHistorySectionProps {
  runs: ImportRunItem[];
  isLoading: boolean;
  onRetryRun: (runId: string) => void;
  isRetrying?: boolean;
}

export const ImportHistorySection: React.FC<ImportHistorySectionProps> = ({
  runs,
  isLoading,
  onRetryRun,
  isRetrying = false,
}) => {
  if (isLoading) {
    return (
      <Card style={{ padding: `${spacing.lg}px` }}>
        <Skeleton width="100%" height="48px" style={{ marginBottom: `${spacing.md}px` }} />
        <Skeleton width="100%" height="48px" style={{ marginBottom: `${spacing.md}px` }} />
        <Skeleton width="100%" height="48px" />
      </Card>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nenhum histórico de importação"
          description="Você ainda não realizou importações para esta carteira. Faça o upload de um arquivo para começar."
        />
      </Card>
    );
  }

  return (
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
          Histórico de Execuções e Reconciliação ({runs.length})
        </div>
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
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Data / Hora</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Origem / Arquivo</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Disparo</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Contagens</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Reconciliação</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'center' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const statusPresentation = IMPORT_RUN_STATUS_PRESENTATION[run.status];
              const triggerDesc = run.trigger
                ? describeIntegrationRunTrigger(run.trigger as 'MANUAL' | 'SCHEDULED')
                : null;
              const sourceDesc = describeImportRunSource(run.source, run.fileName);

              const badgeVariant =
                run.status === 'COMPLETED'
                  ? 'positive'
                  : run.status === 'FAILED'
                  ? 'negative'
                  : run.status === 'PARTIAL' || run.status === 'AWAITING_REVIEW'
                  ? 'warning'
                  : 'neutral';

              const canRetry =
                run.recovery?.canRetry ?? run.status === 'FAILED';

              return (
                <tr
                  key={run.id}
                  style={{
                    borderBottom: `1px solid ${colors.border}40`,
                  }}
                >
                  <td style={{ padding: '0.625rem 0.875rem', whiteSpace: 'nowrap', color: colors.textSecondary }}>
                    {formatDateTime(run.createdAt)}
                  </td>
                  <td style={{ padding: '0.625rem 0.875rem', fontWeight: 500 }}>
                    <div>{sourceDesc}</div>
                    {run.provider && (
                      <div style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
                        Provedor: {run.provider}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.625rem 0.875rem', color: colors.textSecondary }}>
                    {triggerDesc ? triggerDesc.label : 'Manual'}
                  </td>
                  <td style={{ padding: '0.625rem 0.875rem' }}>
                    <Badge variant={badgeVariant}>
                      {statusPresentation ? statusPresentation.label : run.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.75rem', color: colors.textSecondary }}>
                    <div>Criadas: {run.counts.confirmed}</div>
                    <div>Novas: {run.counts.new} · Duplicadas: {run.counts.exactDuplicates}</div>
                  </td>
                  <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.75rem', color: colors.textSecondary }}>
                    {run.reconciliation ? (
                      <div>
                        <span style={{ color: colors.positive }}>✓ {run.reconciliation.matched} correspondentes</span>
                        {run.reconciliation.divergent > 0 && (
                          <span style={{ color: colors.warning, marginLeft: '6px' }}>
                            ⚠ {run.reconciliation.divergent} divergentes
                          </span>
                        )}
                        {run.reconciliation.unresolved > 0 && (
                          <span style={{ color: colors.negative, marginLeft: '6px' }}>
                            ✕ {run.reconciliation.unresolved} pendentes
                          </span>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '0.625rem 0.875rem', textAlign: 'center' }}>
                    {canRetry ? (
                      <Button
                        variant="secondary"
                        onClick={() => onRetryRun(run.id)}
                        disabled={isRetrying}
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                      >
                        Tentar novamente
                      </Button>
                    ) : (
                      <span style={{ color: colors.textSecondary }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
