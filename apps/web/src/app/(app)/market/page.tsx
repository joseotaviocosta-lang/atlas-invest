'use client';

import React, { useState } from 'react';
import { PageHeader, SectionHeader, StatCard, EmptyState, Card, Tabs } from '@/components/ui';
import { spacing } from '@atlas/ui';

const MARKET_TABS = [
  { id: 'radar', label: 'Radar' },
  { id: 'watchlist', label: 'Ativos Acompanhados' },
  { id: 'calendar', label: 'Calendário Econômico' },
  { id: 'news', label: 'Notícias' },
];

export default function MarketPage() {
  const [activeTab, setActiveTab] = useState('radar');

  return (
    <div>
      <PageHeader
        title="Mercado"
        subtitle="Acompanhamento de cotações B3, índices macroeconômicos e calendário"
      />

      {/* Market Indicators (Strict Honest Placeholders) */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Índices e Indicadores"
          description="Aguardando conexão com o módulo de Market Data"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: `${spacing.base}px`,
          }}
        >
          <StatCard label="IBOVESPA" value="—" subValue="Sem dados de mercado" isPlaceholder />
          <StatCard label="TAXA SELIC" value="—" subValue="Indicador oficial Bacen" isPlaceholder />
          <StatCard label="IPCA (12M)" value="—" subValue="Índice de inflação IBGE" isPlaceholder />
          <StatCard label="DÓLAR (PTAX)" value="—" subValue="Cotação oficial Bacen" isPlaceholder />
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={MARKET_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'radar' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Seu radar ainda está vazio"
            description="Explore cotações, maiores altas, baixas e múltiplos de mercado assim que a integração com o Market Data for ativada."
          />
        </Card>
      )}

      {activeTab === 'watchlist' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Nenhum ativo na lista de acompanhamento"
            description="Adicione ações, FIIs, BDRs e títulos públicos para monitorar preços e variações em tempo real."
          />
        </Card>
      )}

      {activeTab === 'calendar' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Calendário econômico e corporativo"
            description="Divulgações de balanços trimestrais, reuniões do Copom e datas de proventos serão exibidas aqui."
          />
        </Card>
      )}

      {activeTab === 'news' && (
        <Card style={{ padding: `${spacing.xl}px` }}>
          <EmptyState
            title="Notícias e comunicados da B3"
            description="Fatos relevantes das companhias e notícias financeiras selecionadas estarão disponíveis no módulo de notícias."
          />
        </Card>
      )}
    </div>
  );
}
