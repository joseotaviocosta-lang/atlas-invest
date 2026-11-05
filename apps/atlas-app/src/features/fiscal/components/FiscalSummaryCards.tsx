import { spacing } from '@atlas/ui';
import { StatCard } from '../../../components/ui';
import type { MonthlyTaxLiabilityViewModel, FiscalMonthlyViewModel, TaxInputReadinessViewModel } from '../types';

export interface FiscalSummaryCardsProps {
  liability?: MonthlyTaxLiabilityViewModel | null;
  monthlyLiability?: MonthlyTaxLiabilityViewModel | null;
  fiscalMonthly?: FiscalMonthlyViewModel | null;
  inputReadiness?: TaxInputReadinessViewModel | null;
  isLoading?: boolean;
}

export const FiscalSummaryCards: React.FC<FiscalSummaryCardsProps> = ({
  liability,
  monthlyLiability,
  fiscalMonthly,
  inputReadiness,
  isLoading = false,
}) => {
  const effectiveLiability = liability ?? monthlyLiability ?? null;

  if (isLoading || (!effectiveLiability && !fiscalMonthly && !inputReadiness)) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: `${spacing.md}px`,
        }}
      >
        <StatCard label="Imposto Devido / DARF" isPlaceholder />
        <StatCard label="Ganhos Líquidos do Mês" isPlaceholder />
        <StatCard label="Prejuízos a Compensar" isPlaceholder />
        <StatCard label="Integridade da Base de Custo" isPlaceholder />
      </div>
    );
  }

  const isCostIncomplete =
    inputReadiness &&
    (inputReadiness.liabilityStatus === 'BLOCKED' ||
      (inputReadiness as unknown as { isComplete?: boolean }).isComplete === false);

  const isBlocked = effectiveLiability?.isBlocked || isCostIncomplete;

  // Tax due
  const taxDueFormatted = effectiveLiability?.taxDueFormatted ?? 'R$ 0,00';
  const hasTaxDue = effectiveLiability?.hasTaxDue ?? false;

  // Net gain (from categories or taxableBaseBeforeLossesFormatted)
  const cat = effectiveLiability?.categories?.[0] as unknown as {
    taxableBaseBeforeLossesFormatted?: string;
    netGainFormatted?: string;
  };
  const netGainFormatted =
    cat?.taxableBaseBeforeLossesFormatted ??
    cat?.netGainFormatted ??
    'R$ 0,00';

  // Accumulated loss
  const lossFormatted =
    effectiveLiability?.closingLosses?.[0]?.amountFormatted ??
    effectiveLiability?.closingLosses?.[1]?.amountFormatted ??
    'R$ 0,00';

  const incompleteCount =
    (inputReadiness as unknown as { incompleteAssetsCount?: number })?.incompleteAssetsCount ??
    (inputReadiness?.issues?.length || 1);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: `${spacing.md}px`,
      }}
    >
      <StatCard
        label="Imposto Devido / DARF"
        value={isBlocked ? 'Bloqueado' : taxDueFormatted}
        subValue={
          isBlocked
            ? 'Custo incompleto (Fail-Closed)'
            : hasTaxDue
              ? 'DARF a recolher'
              : 'Sem imposto a recolher'
        }
        changeType={isBlocked ? 'negative' : hasTaxDue ? 'negative' : 'neutral'}
      />

      <StatCard
        label="Ganhos Líquidos do Mês"
        value={isBlocked ? '—' : netGainFormatted}
        subValue="Competência selecionada"
        changeType="positive"
      />

      <StatCard
        label="Prejuízos a Compensar"
        value={lossFormatted}
        subValue="Saldo acumulado para meses seguintes"
        changeType="neutral"
      />

      <StatCard
        label="Integridade da Base de Custo"
        value={isCostIncomplete ? 'Incompleta' : '100% Auditada'}
        subValue={
          isCostIncomplete
            ? `${incompleteCount} ativo(s) pendente(s)`
            : 'Replay determinístico verificado'
        }
        changeType={isCostIncomplete ? 'negative' : 'positive'}
      />
    </div>
  );
};
