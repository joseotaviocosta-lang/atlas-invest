import { colors, spacing, borderRadius } from '@atlas/ui';
import { Card, Skeleton, EmptyState, ErrorState } from '../../../components/ui';
import type { AnnualInvestmentIncomeViewModel } from '../types';

interface AnnualIncomeSectionProps {
  viewModel: AnnualInvestmentIncomeViewModel | null | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  onRetry?: () => void;
  calendarYear: number;
  onYearChange: (year: number) => void;
}

export function AnnualIncomeSection({
  viewModel,
  isLoading,
  isError,
  error,
  onRetry,
  calendarYear,
  onYearChange,
}: AnnualIncomeSectionProps) {
  return (
    <div style={{ marginTop: `${spacing.lg}px` }} data-testid="annual-income-section">
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
            Rendimentos e Proventos (Ano-Calendário {calendarYear})
          </h3>
          <p
            style={{
              fontSize: '0.8125rem',
              color: colors.textSecondary,
              margin: 0,
            }}
          >
            Acompanhamento consolidado de Dividendos, JCP e Rendimentos de FII com tributação exclusiva/isenta.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          {[2023, 2024, 2025, 2026, 2027].map((yr) => (
            <button
              key={yr}
              type="button"
              data-testid={`year-selector-${yr}`}
              onClick={() => onYearChange(yr)}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: `${borderRadius.md}px`,
                border: `1px solid ${calendarYear === yr ? colors.accent : colors.border}`,
                backgroundColor: calendarYear === yr ? `${colors.accent}15` : colors.surface,
                color: calendarYear === yr ? colors.accent : colors.textPrimary,
                fontWeight: calendarYear === yr ? 600 : 400,
                cursor: 'pointer',
                fontSize: '0.8125rem',
              }}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <Card>
          <Skeleton height={180} />
        </Card>
      )}

      {isError && (
        <ErrorState
          title="Erro ao carregar rendimentos anuais"
          message={error?.message || 'Falha na comunicação com a API.'}
          onRetry={onRetry}
        />
      )}

      {!isLoading && !isError && viewModel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          {/* Status Banner */}
          {!viewModel.isComplete && (
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: `${borderRadius.md}px`,
                fontSize: '0.875rem',
                color: colors.textSecondary,
              }}
            >
              Status: <strong>{viewModel.statusLabel}</strong>. Algumas informações de proventos requerem comprovação documental.
            </div>
          )}

          {/* 3 Categories Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: `${spacing.md}px`,
            }}
          >
            {/* Dividends */}
            <Card>
              <div
                style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '4px' }}
              >
                Dividendos Isentos
              </div>
              <div
                style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.positive }}
                data-testid="annual-income-dividends"
              >
                {viewModel.dividends.formattedGrossAmount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.dividends.taxTreatmentLabel} ({viewModel.dividends.eventCount} eventos)
              </div>
            </Card>

            {/* JCP */}
            <Card>
              <div
                style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '4px' }}
              >
                Juros sobre Capital Próprio (JCP)
              </div>
              <div
                style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.textPrimary }}
                data-testid="annual-income-jcp"
              >
                {viewModel.jcp.formattedGrossAmount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                IRRF Retido: <strong>{viewModel.jcp.formattedWithheldTax}</strong> ({viewModel.jcp.taxTreatmentLabel})
              </div>
            </Card>

            {/* FII Income */}
            <Card>
              <div
                style={{ fontSize: '0.8125rem', color: colors.textSecondary, marginBottom: '4px' }}
              >
                Rendimentos de FII (Isentos PF)
              </div>
              <div
                style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.positive }}
                data-testid="annual-income-fii"
              >
                {viewModel.fiiIncome.formattedGrossAmount}
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '4px' }}>
                {viewModel.fiiIncome.taxTreatmentLabel} ({viewModel.fiiIncome.eventCount} eventos)
              </div>
            </Card>
          </div>

          {/* Payers Table */}
          {viewModel.payers.length > 0 ? (
            <Card>
              <h4
                style={{
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: colors.textPrimary,
                  margin: `0 0 ${spacing.sm}px 0`,
                }}
              >
                Discriminação por Fonte Pagadora (CNPJ / Ativo)
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.8125rem',
                    textAlign: 'left',
                  }}
                  data-testid="annual-payers-table"
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
                      <th style={{ padding: `${spacing.sm}px` }}>Fonte Pagadora</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>Dividendos</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>JCP Bruto</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>IRRF JCP</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>FII</th>
                      <th style={{ padding: `${spacing.sm}px`, textAlign: 'right', fontWeight: 700 }}>Total Bruto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.payers.map((p) => (
                      <tr key={p.payerId} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={{ padding: `${spacing.sm}px`, fontWeight: 600, color: colors.textPrimary }}>
                          {p.payerDisplayName}
                        </td>
                        <td style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>{p.formattedDividendGross}</td>
                        <td style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>{p.formattedJcpGross}</td>
                        <td style={{ padding: `${spacing.sm}px`, textAlign: 'right', color: colors.negative }}>
                          {p.formattedJcpWithheld}
                        </td>
                        <td style={{ padding: `${spacing.sm}px`, textAlign: 'right' }}>{p.formattedFiiIncomeGross}</td>
                        <td style={{ padding: `${spacing.sm}px`, textAlign: 'right', fontWeight: 700 }}>
                          {p.formattedTotalGross}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              title={`Nenhum provento recebido em ${calendarYear}`}
              description="Não foram encontrados lançamentos de dividendos, JCP ou rendimentos no período."
            />
          )}
        </div>
      )}
    </div>
  );
}
