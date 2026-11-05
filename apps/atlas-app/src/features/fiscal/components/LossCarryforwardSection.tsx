import { colors, spacing } from '@atlas/ui';
import { Card } from '../../../components/ui';
import type { TaxLossBalanceVM, MonthlyTaxLiabilityViewModel } from '../types';

export interface LossCarryforwardSectionProps {
  lossBalances?: TaxLossBalanceVM[];
  liability?: MonthlyTaxLiabilityViewModel | null;
  monthlyLiability?: MonthlyTaxLiabilityViewModel | null;
}

export const LossCarryforwardSection: React.FC<LossCarryforwardSectionProps> = ({
  lossBalances,
  liability,
  monthlyLiability,
}) => {
  const effectiveLiability = liability ?? monthlyLiability;
  const balances: TaxLossBalanceVM[] =
    lossBalances ??
    (effectiveLiability as unknown as { lossBalances?: TaxLossBalanceVM[] })?.lossBalances ??
    effectiveLiability?.closingLosses ??
    [];

  return (
    <Card data-testid="loss-carryforward-section" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: `${spacing.md}px ${spacing.lg}px`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
          Controle de Prejuízos Acumulados a Compensar
        </h3>
        <p style={{ fontSize: '0.75rem', color: colors.textSecondary, margin: '2px 0 0 0' }}>
          Prejuízos passados de mesma categoria compensam lucros futuros indefinidamente até sua completa absorção.
        </p>
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
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600 }}>Regime Tributário</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Saldo Anterior</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Novo Prejuízo no Mês</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Compensado no Mês</th>
              <th style={{ padding: '0.625rem 0.875rem', fontWeight: 600, textAlign: 'right' }}>Saldo a Transportar</th>
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: `${spacing.lg}px`, textAlign: 'center', color: colors.textSecondary }}>
                  Nenhum saldo de prejuízo acumulado para esta competência.
                </td>
              </tr>
            ) : (
              balances.map((loss, idx) => {
                const item = loss as unknown as {
                  category?: string;
                  categoryLabel?: string;
                  startingBalance?: string;
                  openingLossFormatted?: string;
                  lossesIncurred?: string;
                  lossGeneratedFormatted?: string;
                  lossesUsed?: string;
                  lossAppliedFormatted?: string;
                  endingBalance?: string;
                  closingLossFormatted?: string;
                  amountFormatted?: string;
                };

                const catLabel = item.categoryLabel || item.category || `Regime ${idx + 1}`;
                const start = item.startingBalance || item.openingLossFormatted || 'R$ 0,00';
                const incurred = item.lossesIncurred || item.lossGeneratedFormatted || 'R$ 0,00';
                const used = item.lossesUsed || item.lossAppliedFormatted || 'R$ 0,00';
                const ending = item.endingBalance || item.closingLossFormatted || item.amountFormatted || 'R$ 0,00';

                return (
                  <tr key={catLabel} style={{ borderBottom: `1px solid ${colors.border}40` }}>
                    <td style={{ padding: '0.625rem 0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                      {catLabel}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', color: colors.textSecondary }}>
                      {start}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', color: colors.negative }}>
                      {incurred}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', color: colors.positive }}>
                      {used}
                    </td>
                    <td style={{ padding: '0.625rem 0.875rem', textAlign: 'right', fontWeight: 700, color: colors.textPrimary }}>
                      {ending}
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
