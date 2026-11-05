import { colors, spacing, borderRadius } from '@atlas/ui';
import { Card, Skeleton, EmptyState, ErrorState } from '../../../components/ui';
import type { AnnualPositionReportViewModel } from '../types';

interface AnnualPositionsSectionProps {
  viewModel: AnnualPositionReportViewModel | null | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  onRetry?: () => void;
  calendarYear: number;
  onYearChange: (year: number) => void;
}

export function AnnualPositionsSection({
  viewModel,
  isLoading,
  isError,
  error,
  onRetry,
  calendarYear,
  onYearChange,
}: AnnualPositionsSectionProps) {
  return (
    <div style={{ marginTop: `${spacing.lg}px` }} data-testid="annual-positions-section">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.md}px`,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: '0 0 4px 0',
            }}
          >
            Bens e Direitos em 31/12 (Custo Histórico)
          </h3>
          <p
            style={{
              fontSize: '0.8125rem',
              color: colors.textSecondary,
              margin: 0,
            }}
          >
            Posições patrimoniais apuradas estritamente pelo custo de aquisição via replay do ledger.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <label
            htmlFor="annual-pos-year-select"
            style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textSecondary }}
          >
            Ano-calendário:
          </label>
          <select
            id="annual-pos-year-select"
            value={calendarYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${borderRadius.sm}px`,
              border: `1px solid ${colors.border}`,
              background: colors.surface,
              color: colors.textPrimary,
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
            data-testid="annual-year-select"
          >
            {[2023, 2024, 2025, 2026, 2027].map((yr) => (
              <option key={yr} value={yr}>
                {yr} (Exercício {yr + 1})
              </option>
            ))}
          </select>

          {viewModel && (
            <span
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: `${borderRadius.sm}px`,
                fontSize: '0.75rem',
                fontWeight: 700,
                color: viewModel.summary.completenessBadge.color,
                backgroundColor: viewModel.summary.completenessBadge.bg,
                border: `1px solid ${viewModel.summary.completenessBadge.color}`,
              }}
              data-testid="annual-completeness-badge"
            >
              {viewModel.summary.completenessBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* Regra da Receita Federal */}
      <div
        style={{
          padding: `${spacing.sm}px ${spacing.md}px`,
          borderRadius: `${borderRadius.sm}px`,
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          marginBottom: `${spacing.md}px`,
          fontSize: '0.8125rem',
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: colors.textPrimary }}>
          Regra da Receita Federal (Bens e Direitos):
        </strong>{' '}
        Os valores declarados correspondem estritamente ao{' '}
        <strong>custo histórico de aquisição</strong> dos ativos em 31/12, e <strong>nunca</strong>{' '}
        à cotação ou valor de mercado atual.
      </div>

      {isLoading && (
        <Card>
          <Skeleton height={180} />
        </Card>
      )}

      {isError && (
        <ErrorState
          title="Erro ao carregar Bens e Direitos"
          message={error?.message || 'Falha na comunicação com a API.'}
          onRetry={onRetry}
        />
      )}

      {!isLoading && !isError && viewModel && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: `${spacing.md}px`,
              marginBottom: `${spacing.md}px`,
            }}
          >
            <Card>
              <div
                style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '4px' }}
              >
                Custo Histórico Total em 31/12
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: viewModel.summary.totalHistoricalCostKnown
                    ? colors.textPrimary
                    : colors.textSecondary,
                }}
                data-testid="annual-total-cost"
              >
                {viewModel.summary.formattedTotalHistoricalCost}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.summary.totalHistoricalCostKnown
                  ? 'Total apurado com sucesso'
                  : 'Custo histórico incompleto / bloqueado'}
              </div>
            </Card>

            <Card>
              <div
                style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '4px' }}
              >
                Ativos em Custódia
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary }}>
                {viewModel.summary.totalAssetsCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.summary.completePositionsCount} completos |{' '}
                {viewModel.summary.blockedPositionsCount} bloqueados
              </div>
            </Card>
          </div>

          {/* Positions Table */}
          {viewModel.positions.length === 0 ? (
            <EmptyState
              title={`Nenhum ativo em custódia em 31/12/${calendarYear}`}
              description="A carteira não possuía posições abertas na data de corte anual."
            />
          ) : (
            <Card>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.875rem',
                    textAlign: 'left',
                  }}
                  data-testid="annual-positions-table"
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: `1px solid ${colors.border}`,
                        color: colors.textSecondary,
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      <th style={{ padding: `${spacing.sm}px` }}>Ativo / Ticker</th>
                      <th style={{ padding: `${spacing.sm}px` }}>Categoria</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>Qtd em 31/12</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>
                        Custo Histórico Total
                      </th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>Custo Médio</th>
                      <th style={{ padding: `${spacing.sm}px` }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.positions.map((pos) => {
                      const posBadge =
                        pos.completenessBadge ??
                        (pos as unknown as { statusBadge?: { label: string; color: string; bg: string } })
                          .statusBadge ?? {
                          label: 'Completo',
                          color: colors.positive,
                          bg: 'rgba(34, 197, 94, 0.1)',
                        };

                      const avgCost =
                        pos.formattedAverageHistoricalCost ??
                        (pos as unknown as { formattedAverageUnitCost?: string })
                          .formattedAverageUnitCost ??
                        '—';

                      return (
                        <tr
                          key={pos.assetId}
                          style={{ borderBottom: `1px solid ${colors.border}` }}
                          data-testid={`annual-position-row-${pos.ticker}`}
                        >
                          <td
                            style={{
                              padding: `${spacing.sm}px`,
                              fontWeight: 600,
                              color: colors.textPrimary,
                            }}
                          >
                            {pos.ticker}
                            {pos.openingPositionApplied && (
                              <span
                                style={{
                                  marginLeft: '6px',
                                  fontSize: '0.6875rem',
                                  color: colors.accent,
                                  fontWeight: 500,
                                }}
                              >
                                (Abertura)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: `${spacing.sm}px`, color: colors.textSecondary }}>
                            {pos.categoryLabel}
                          </td>
                          <td
                            style={{
                              padding: `${spacing.sm}px`,
                              textAlign: 'right',
                              fontWeight: 600,
                              color: colors.textPrimary,
                            }}
                          >
                            {pos.quantity}
                          </td>
                          <td
                            style={{
                              padding: `${spacing.sm}px`,
                              textAlign: 'right',
                              fontWeight: 600,
                              color: pos.totalHistoricalCost
                                ? colors.textPrimary
                                : colors.textSecondary,
                            }}
                          >
                            {pos.formattedTotalHistoricalCost}
                          </td>
                          <td
                            style={{
                              padding: `${spacing.sm}px`,
                              textAlign: 'right',
                              color: colors.textSecondary,
                            }}
                          >
                            {avgCost}
                          </td>
                          <td style={{ padding: `${spacing.sm}px` }}>
                            <span
                              style={{
                                padding: `2px ${spacing.xs}px`,
                                borderRadius: `${borderRadius.sm}px`,
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                color: posBadge.color,
                                backgroundColor: posBadge.bg,
                              }}
                            >
                              {posBadge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
