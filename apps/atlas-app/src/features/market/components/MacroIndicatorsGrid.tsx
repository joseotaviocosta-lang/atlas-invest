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
      subValue: 'Integração oficial B3',
      isPlaceholder: true,
    },
    {
      id: 'SELIC_META',
      label: 'SELIC META',
      value: selicTarget?.rate ?? '—',
      subValue: selicTarget
        ? `Meta Copom (${selicTarget.effectiveDate})`
        : 'Meta Copom — aguardando dados',
      isPlaceholder: isLoading || !selicTarget,
    },
    {
      id: 'SELIC_EFETIVA',
      label: 'SELIC EFETIVA',
      value: selicEffective?.rate ?? '—',
      subValue: selicEffective
        ? `Taxa anualizada (${selicEffective.effectiveDate})`
        : 'Taxa anualizada — aguardando dados',
      isPlaceholder: isLoading || !selicEffective,
    },
    {
      id: 'IPCA',
      label: 'IPCA (MENSAL)',
      value: ipca?.value ?? '—',
      subValue: ipca
        ? `Variação mensal (${ipca.referenceMonth})`
        : 'Inflação oficial IBGE/Bacen',
      isPlaceholder: isLoading || !ipca,
    },
    {
      id: 'PTAX',
      label: 'DÓLAR (PTAX)',
      value: '—',
      subValue: 'Cotação Bacen oficial',
      isPlaceholder: true,
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
