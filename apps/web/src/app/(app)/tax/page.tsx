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
            label="Resumo Fiscal"
            value="—"
            subValue="Disponível após ativação do motor fiscal"
            isPlaceholder
          />
          <StatCard
            label="Apuração do Mês"
            value="—"
            subValue="Disponível após ativação do motor fiscal"
            isPlaceholder
          />
          <StatCard
            label="Prejuízos a Compensar"
            value="—"
            subValue="Disponível após ativação do motor fiscal"
            isPlaceholder
          />
          <StatCard
            label="Retenções na Fonte"
            value="—"
            subValue="Disponível após ativação do motor fiscal"
            isPlaceholder
          />
        </div>
      </div>

      <Tabs tabs={TAX_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'summary' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Resumo fiscal em preparação"
            description="O resumo fiscal consolidado estará disponível após a ativação do motor fiscal."
          />
        </Card>
      )}

      {activeTab === 'month' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Apuração do mês atual em preparação"
            description="Os cálculos de apuração mensal estarão disponíveis após a ativação do motor fiscal."
          />
        </Card>
      )}

      {activeTab === 'darf' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Emissão de DARF em preparação"
            description="A apuração e emissão de guias de recolhimento estarão disponíveis após a ativação do motor fiscal."
          />
        </Card>
      )}

      {activeTab === 'losses' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Compensação de prejuízos em preparação"
            description="O controle e histórico de prejuízos a compensar estarão disponíveis após a ativação do motor fiscal."
          />
        </Card>
      )}

      {activeTab === 'irpf' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Declaração Anual IRPF em preparação"
            description="Os relatórios para a Declaração de Ajuste Anual estarão disponíveis após a ativação do motor fiscal."
          />
        </Card>
      )}
    </div>
  );
}
