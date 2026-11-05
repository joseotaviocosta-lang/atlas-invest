import { colors, borderRadius, spacing } from '@atlas/ui';
import { Card, Badge } from '../../../components/ui';
import type { MonthlyTaxLiabilityViewModel, TaxInputReadinessViewModel } from '../types';

export interface DarfGuidanceCardProps {
  competence?: string;
  liability?: MonthlyTaxLiabilityViewModel | null;
  monthlyLiability?: MonthlyTaxLiabilityViewModel | null;
  inputReadiness?: TaxInputReadinessViewModel | null;
  isBlocked?: boolean;
}

export const DarfGuidanceCard: React.FC<DarfGuidanceCardProps> = ({
  liability,
  monthlyLiability,
  inputReadiness,
  isBlocked = false,
}) => {
  const effectiveLiability = liability ?? monthlyLiability ?? null;
  const isCostIncomplete =
    inputReadiness &&
    (inputReadiness.liabilityStatus === 'BLOCKED' ||
      (inputReadiness as unknown as { isComplete?: boolean }).isComplete === false);

  const effectiveBlocked = isBlocked || effectiveLiability?.isBlocked || isCostIncomplete;

  const isAccumulated =
    !effectiveBlocked &&
    Boolean((effectiveLiability as unknown as { isAccumulated?: boolean })?.isAccumulated);

  const isPayable =
    !effectiveBlocked &&
    !isAccumulated &&
    (effectiveLiability?.hasTaxDue ||
      Boolean((effectiveLiability as unknown as { isTaxPayable?: boolean })?.isTaxPayable));

  const taxDueFormatted =
    (effectiveLiability as unknown as { totalNetTaxPayable?: string })?.totalNetTaxPayable ??
    effectiveLiability?.taxDueFormatted ??
    'R$ 0,00';

  const dueDateFormatted =
    (effectiveLiability as unknown as { formattedDueDate?: string })?.formattedDueDate ??
    (effectiveLiability as unknown as { dueDate?: string })?.dueDate ??
    'Último dia útil do mês subsequente';

  const darfCode =
    (effectiveLiability as unknown as { darfCode?: string })?.darfCode ?? '6015';

  const blockingReason =
    (effectiveLiability as unknown as { blockingReason?: string })?.blockingReason ??
    'Custo de aquisição não comprovado.';

  return (
    <Card
      data-testid="darf-guidance-card"
      style={{
        padding: `${spacing.lg}px`,
        border: `1px solid ${isPayable ? `${colors.accent}60` : colors.border}`,
        backgroundColor: colors.surface,
      }}
    >
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
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
              {effectiveBlocked
                ? 'Cálculo de DARF Bloqueado'
                : isAccumulated
                  ? 'DARF Acumulado (< R$ 10,00)'
                  : isPayable
                    ? `DARF ${darfCode} Gerado`
                    : 'Sem DARF a Recolher'}
            </h3>
            <Badge variant="info">{`Código ${darfCode}`}</Badge>
          </div>
          <p style={{ fontSize: '0.8125rem', color: colors.textSecondary, margin: '4px 0 0 0' }}>
            Operações em bolsa de valores, mercadorias e futuros (Pessoa Física).
          </p>
        </div>

        <div>
          {effectiveBlocked ? (
            <Badge variant="negative">Bloqueado (Fail-Closed)</Badge>
          ) : isPayable ? (
            <Badge variant="negative">A Recolher</Badge>
          ) : isAccumulated ? (
            <Badge variant="warning">Acumulado (&lt; R$ 10)</Badge>
          ) : (
            <Badge variant="positive">Sem DARF Devido</Badge>
          )}
        </div>
      </div>

      {effectiveBlocked ? (
        <div
          style={{
            padding: `${spacing.md}px`,
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${colors.negative}40`,
            borderRadius: `${borderRadius.sm}px`,
            fontSize: '0.8125rem',
            color: colors.textPrimary,
            lineHeight: 1.5,
          }}
        >
          <strong>Atenção:</strong> {blockingReason} O cálculo do valor devido e a guia de recolhimento estão temporariamente bloqueados para resguardar o investidor.
        </div>
      ) : isAccumulated ? (
        <div
          style={{
            padding: `${spacing.md}px`,
            backgroundColor: 'rgba(234, 179, 8, 0.08)',
            border: `1px solid ${colors.warning}40`,
            borderRadius: `${borderRadius.sm}px`,
            fontSize: '0.8125rem',
            color: colors.textPrimary,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: colors.warning }}>Regra de Valor Mínimo:</strong> O valor apurado ({taxDueFormatted}) é inferior a R$ 10,00 e foi acumulado para a próxima competência em que o total somado atinja o valor mínimo de emissão exigido pela Receita Federal.
        </div>
      ) : isPayable ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: `${spacing.md}px`,
            padding: `${spacing.md}px`,
            backgroundColor: colors.surfaceElevated,
            borderRadius: `${borderRadius.sm}px`,
            marginBottom: `${spacing.md}px`,
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Valor a Pagar</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.negative }}>
              {taxDueFormatted}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Vencimento</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>
              {dueDateFormatted}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Código de Receita</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.textPrimary }}>
              {darfCode}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: `${spacing.md}px`,
            backgroundColor: colors.surfaceElevated,
            borderRadius: `${borderRadius.sm}px`,
            fontSize: '0.8125rem',
            color: colors.textSecondary,
          }}
        >
          Não foram apurados lucros tributáveis no mês ou os ganhos foram integralmente compensados por prejuízos anteriores acumulados.
        </div>
      )}

      {/* Sicalc Guidance */}
      <div
        style={{
          marginTop: `${spacing.md}px`,
          padding: `${spacing.sm}px ${spacing.md}px`,
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderRadius: `${borderRadius.sm}px`,
          fontSize: '0.75rem',
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}
      >
        💡 <strong>Orientações de Pagamento (Sicalc / Receita Federal):</strong> O recolhimento de impostos sobre renda variável deve ser efetuado até o último dia útil do mês subsequente via <strong>Sicalc Web</strong> com o código de receita <strong>6015</strong>.
      </div>
    </Card>
  );
};
