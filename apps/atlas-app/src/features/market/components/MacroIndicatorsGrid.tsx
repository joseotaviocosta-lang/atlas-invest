import React from 'react';
import { useMacroContext } from '../hooks';
import { StatCard } from '../../../components/ui';
import { spacing } from '@atlas/ui';

export const MacroIndicatorsGrid: React.FC = () => {
  const { data: macroData, isLoading } = useMacroContext();

  const selicTarget = macroData?.data?.selicTarget;
  const selicEffective = macroData?.data?.selicEffective;
  const ipca = macroData?.data?.ipcaMonthly;

  const cards = [
    {
      id: 'IBOVESPA',
      label: 'IBOVESPA',
      value: '—',
      subValue: 'Integração ainda não disponível',
      isPlaceholder: isLoading,
    },
    {
      id: 'SELIC_META',
      label: 'SELIC META',
      value: selicTarget?.rate ? `${selicTarget.rate}%` : 'Ainda não atualizado',
      subValue: selicTarget
        ? `Meta Copom (${selicTarget.effectiveDate})`
        : 'Aguardando sincronização do Bacen',
      isPlaceholder: isLoading,
    },
    {
      id: 'SELIC_EFETIVA',
      label: 'SELIC EFETIVA',
      value: selicEffective?.rate ? `${selicEffective.rate}%` : 'Ainda não atualizado',
      subValue: selicEffective
        ? `Taxa anualizada (${selicEffective.effectiveDate})`
        : 'Aguardando sincronização do Bacen',
      isPlaceholder: isLoading,
    },
    {
      id: 'IPCA',
      label: 'IPCA (MENSAL)',
      value: ipca?.value ? `${ipca.value}%` : 'Ainda não atualizado',
      subValue: ipca
        ? `Variação mensal (${ipca.referenceMonth})`
        : 'Aguardando sincronização do IBGE',
      isPlaceholder: isLoading,
    },
    {
      id: 'PTAX',
      label: 'DÓLAR (PTAX)',
      value: 'Ainda não atualizado',
      subValue: 'Aguardando sincronização do Bacen',
      isPlaceholder: isLoading,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: `${spacing.base}px`,
        marginBottom: '24px',
      }}
    >
      {cards.map((card) => (
        <StatCard
          key={card.id}
          label={card.label}
          value={card.value}
          subValue={card.subValue}
          isPlaceholder={card.isPlaceholder}
        />
      ))}
    </div>
  );
};
