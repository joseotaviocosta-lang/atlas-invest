import { colors, spacing } from '@atlas/ui';
import { Card, Badge, Skeleton, ErrorState } from '../../../components/ui';
import type { MonthlyTaxLiabilityViewModel, FiscalMonthlyViewModel } from '../types';

export interface MonthlyAssessmentSectionProps {
  liability?: MonthlyTaxLiabilityViewModel | null;
  monthlyLiability?: MonthlyTaxLiabilityViewModel | null;
  fiscalMonthly?: FiscalMonthlyViewModel | null;
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  isBlocked?: boolean;
}

export const MonthlyAssessmentSection: React.FC<MonthlyAssessmentSectionProps> = ({
  liability,
  monthlyLiability,
  fiscalMonthly,
  isLoading = false,
  isError = false,
  error,
  onRetry,
}) => {
  const effectiveLiability = liability ?? monthlyLiability ?? null;

  if (isLoading) {
    return (
      <Card style={{ padding: `${spacing.lg}px` }}>
        <Skeleton height={200} />
      </Card>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Erro ao carregar apuração mensal"
        message={error?.message || 'Falha na comunicação com a API.'}
        onRetry={onRetry}
      />
    );
  }

  const effectiveBlocked = Boolean(
    effectiveLiability?.isBlocked ||
    effectiveLiability?.status === 'BLOCKED' ||
    effectiveLiability?.categories?.some((c) => c.status === 'BLOCKED')
  );

  const categories = effectiveLiability?.categories ?? [];
  const isExempt =
    !effectiveBlocked &&
    ((fiscalMonthly as unknown as { isExempt?: boolean })?.isExempt ||
      (fiscalMonthly as unknown as { isEquityExempt?: boolean })?.isEquityExempt ||
      categories.some((c) => (c as unknown as { isExempt?: boolean }).isExempt));

  const salesTotalFormatted =
    (fiscalMonthly as unknown as { salesTotal?: string })?.salesTotal ??
    (fiscalMonthly as unknown as { totalSalesFormatted?: string })?.totalSalesFormatted ??
    '—';

  return (
    <Card
      data-testid="monthly-assessment-section"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div
        style={{
          padding: `${spacing.md}px ${spacing.lg}px`,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
        }}
      >
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
            Demonstrativo de Apuração por Regime
          </h3>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '2px' }}>
            Segregação de regimes, compensação de perdas e retenções na fonte.
          </div>
        </div>

        {effectiveBlocked ? (
          <Badge variant="negative">
            Apuração Bloqueada (Fail-Closed)
          </Badge>
        ) : isExempt ? (
          <Badge variant="positive">
            Isenção de R$ 20.000 Aplicada (Vendas: {salesTotalFormatted})
          </Badge>
        ) : null}
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
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Regime / Categoria</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Alíquota</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Ganho Líquido</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Prejuízo Usado</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>IRRF Retido</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Imposto Devido</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: `${spacing.lg}px`, textAlign: 'center', color: colors.textSecondary }}>
                  {effectiveBlocked
                    ? 'Apuração bloqueada por ausência de custo de aquisição comprovado (Fail-Closed).'
                    : 'Nenhuma alienação com apuração tributária nesta competência.'}
                </td>
              </tr>
            ) : (
              categories.map((c) => {
                const cat = c as unknown as {
                  category?: string;
                  categoryLabel?: string;
                  status?: string;
                  taxRateLabel?: string;
                  rateFormatted?: string;
                  grossGain?: string;
                  taxableBaseBeforeLossesFormatted?: string;
                  compensatedLoss?: string;
                  lossAppliedFormatted?: string;
                  withheldTax?: string;
                  withholdingAppliedFormatted?: string;
                  netTaxDue?: string;
                  taxDueFormatted?: string;
                };

                const catBlocked = effectiveBlocked || cat.status === 'BLOCKED';
                const catLabel = cat.categoryLabel || cat.category || 'Geral';
                const rate = cat.taxRateLabel || cat.rateFormatted || '15%';
                const gain = catBlocked
                  ? '— (Bloqueado)'
                  : cat.grossGain || cat.taxableBaseBeforeLossesFormatted || 'R$ 0,00';
                const lossComp = catBlocked
                  ? '—'
                  : cat.compensatedLoss || cat.lossAppliedFormatted || 'R$ 0,00';
                const irrf = cat.withheldTax || cat.withholdingAppliedFormatted || 'R$ 0,00';
                const tax = catBlocked
                  ? '— (Não determinado)'
                  : cat.netTaxDue || cat.taxDueFormatted || 'R$ 0,00';

                return (
                  <tr key={catLabel} style={{ borderBottom: `1px solid ${colors.border}40` }}>
                    <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                      {catLabel}
                      {catBlocked && (
                        <span style={{ marginLeft: '6px', fontSize: '0.6875rem', color: colors.negative }}>
                          (Bloqueado)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', color: colors.textSecondary }}>
                      {rate}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', color: catBlocked ? colors.textSecondary : colors.positive }}>
                      {gain}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', color: colors.textSecondary }}>
                      {lossComp}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', color: colors.negative }}>
                      {irrf}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', fontWeight: 700, color: catBlocked ? colors.negative : colors.textPrimary }}>
                      {tax}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
