import { colors, borderRadius, spacing } from '@atlas/ui';
import { Card } from '../../../components/ui';
import type { TaxInputReadinessViewModel } from '../types';

export interface CostEvidenceBannerProps {
  inputReadiness?: TaxInputReadinessViewModel | null;
  isBlocked?: boolean;
  missingCount?: number;
}

export const CostEvidenceBanner: React.FC<CostEvidenceBannerProps> = ({
  inputReadiness,
  isBlocked = false,
  missingCount,
}) => {
  const isReadinessIncomplete =
    inputReadiness &&
    (inputReadiness.liabilityStatus === 'BLOCKED' ||
      (inputReadiness as unknown as { isComplete?: boolean }).isComplete === false);

  const isIncomplete = isBlocked || isReadinessIncomplete;

  if (!isIncomplete) {
    return null;
  }

  const count =
    missingCount ??
    (inputReadiness as unknown as { incompleteAssetsCount?: number })?.incompleteAssetsCount ??
    (inputReadiness?.issues?.length || 1);

  return (
    <Card
      data-testid="cost-evidence-banner"
      style={{
        padding: `${spacing.lg}px`,
        backgroundColor: `${colors.negative}12`,
        border: `1px solid ${colors.negative}50`,
        borderRadius: `${borderRadius.md}px`,
        marginBottom: `${spacing.lg}px`,
      }}
    >
      <div style={{ display: 'flex', gap: `${spacing.md}px`, alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 700,
              color: colors.negative,
              margin: '0 0 6px 0',
            }}
          >
            Base de Custo Incompleta — Apuração Bloqueada (Fail-Closed)
          </h3>
          <p
            style={{
              fontSize: '0.8125rem',
              color: colors.textPrimary,
              margin: '0 0 8px 0',
              lineHeight: 1.5,
            }}
          >
            {`Existem ${count} ativos sem comprovação documental do custo histórico de aquisição no livro-razão. Em obediência estrita às normas da Receita Federal e ao princípio da segurança patrimonial, `}
            <strong>o Atlas nunca assume custo zero</strong>
            {` e `}
            <strong>bloqueia a apuração definitiva de tributos</strong>.
          </p>
          <div
            style={{
              fontSize: '0.75rem',
              color: colors.textSecondary,
              display: 'flex',
              gap: `${spacing.md}px`,
              alignItems: 'center',
            }}
          >
            <span>💡 <strong>Ação recomendada:</strong> Forneça notas de corretagem ou informe a custódia inicial na aba <em>Base de Custo &amp; Evidências</em>.</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
