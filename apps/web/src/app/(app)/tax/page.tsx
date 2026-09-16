'use client';

import React, { useState } from 'react';
import { PageHeader, SectionHeader, StatCard, EmptyState, Card, Tabs } from '@/components/ui';
import { spacing } from '@atlas/ui';

const TAX_TABS = [
  { id: 'summary', label: 'Resumo Fiscal' },
  { id: 'month', label: 'Mês Atual' },
  { id: 'darf', label: 'DARF' },
  { id: 'losses', label: 'Prejuízos Acumulados' },
  { id: 'irpf', label: 'Declaração Anual IRPF' },
];

export default function TaxPage() {
  const [activeTab, setActiveTab] = useState('summary');

  return (
    <div>
      <PageHeader
        title="Fiscal"
        subtitle="Apuração mensal de tributos, emissão de DARF e informes de IRPF"
      />

      {/* Tax Indicators (Strict Honest Placeholders) */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Apuração do Período"
          description="Aguardando ativação do motor tributário (Tax Engine)"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: `${spacing.base}px`,
          }}
        >
          <StatCard
            label="DARF Estimado"
            value="—"
            subValue="Aguardando primeiras operações"
            isPlaceholder
          />
          <StatCard
            label="Vendas no Mês (Ações)"
            value="—"
            subValue="Limite de isenção: R$ 20.000"
            isPlaceholder
          />
          <StatCard
            label="Prejuízos a Compensar"
            value="—"
            subValue="Histórico de compensação"
            isPlaceholder
          />
          <StatCard
            label="Imposto Retido na Fonte"
            value="—"
            subValue="Dedo-duro B3"
            isPlaceholder
          />
        </div>
      </div>

      <Tabs tabs={TAX_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'summary' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="O resumo fiscal aparecerá após suas primeiras operações"
            description="O motor fiscal calculará automaticamente seus lucros tributáveis, deduções, compensação de prejuízos e emissão de guias de recolhimento."
          />
        </Card>
      )}

      {activeTab === 'month' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Apuração do mês atual em preparação"
            description="Acompanhe vendas comuns (15%), Day Trade (20%) e FIIs (20%) com controle em tempo real dos limites legais."
          />
        </Card>
      )}

      {activeTab === 'darf' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Nenhum DARF a recolher"
            description="Quando houver operações com ganho líquido tributável acima da isenção, a guia de pagamento com código de barras será gerada aqui."
          />
        </Card>
      )}

      {activeTab === 'losses' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Sem prejuízos cadastrados para compensação"
            description="Prejuízos passados de Swing Trade, Day Trade e Fundos Imobiliários poderão ser abatidos de lucros futuros na mesma modalidade."
          />
        </Card>
      )}

      {activeTab === 'irpf' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Informe de Rendimentos e Bens e Direitos"
            description="Relatório estruturado pronto para preenchimento do programa da Receita Federal (IRPF) será disponibilizado no encerramento do exercício."
          />
        </Card>
      )}
    </div>
  );
}
