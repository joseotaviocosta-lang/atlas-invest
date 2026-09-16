'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { PageHeader, SectionHeader, StatCard, EmptyState, Card, Button } from '@/components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { apiClient } from '@/api/client';

export default function TodayPage() {
  const user = useAuthStore((state) => state.user);

  const { data: portfolios = [], isLoading: isLoadingPortfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Array<{ id: string }> }>('/api/v1/portfolios');
      return res.data || [];
    },
    staleTime: 60 * 1000,
  });

  const firstName = user?.name ? user.name.split(' ')[0] : 'Investidor';
  const hasNoPortfolios = !isLoadingPortfolios && portfolios.length === 0;

  return (
    <div>
      <PageHeader
        title="Hoje"
        subtitle={`Olá, ${firstName}. Aqui está o panorama do seu patrimônio e do mercado.`}
        action={
          <Link href="/portfolio">
            <Button variant="secondary" size="sm">
              Ver Carteiras →
            </Button>
          </Link>
        }
      />

      {/* Onboarding callout banner if user has no portfolios yet */}
      {hasNoPortfolios && (
        <div
          style={{
            padding: `${spacing.base}px ${spacing.xl}px`,
            borderRadius: `${borderRadius.lg}px`,
            backgroundColor: colors.accentSubtle,
            border: `1px solid ${colors.accent}`,
            marginBottom: `${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: `${spacing.base}px`,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.9375rem', marginBottom: '2px' }}>
              Configure sua primeira carteira
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              Crie uma carteira para começar a registrar contas, aportes e operações financeiras.
            </div>
          </div>
          <Link href="/onboarding">
            <Button size="sm">Iniciar Onboarding</Button>
          </Link>
        </div>
      )}

      {/* Financial Overview StatCards (Strict Honest Placeholders: No Fake Data) */}
      <div style={{ marginBottom: `${spacing.xl}px` }}>
        <SectionHeader
          title="Resumo Patrimonial"
          description="Indicadores consolidados da sua conta (aguardando Portfolio Engine)"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: `${spacing.base}px`,
          }}
        >
          <StatCard
            label="Patrimônio Total"
            value="—"
            subValue="Disponível com Portfolio Engine"
            isPlaceholder
          />
          <StatCard
            label="Variação Hoje"
            value="—"
            subValue="Sem dados de cotação"
            isPlaceholder
          />
          <StatCard
            label="Resultado Acumulado"
            value="—"
            subValue="Aguardando cálculo de rentabilidade"
            isPlaceholder
          />
          <StatCard
            label="Proventos no Mês"
            value="—"
            subValue="Nenhum evento registrado"
            isPlaceholder
          />
        </div>
      </div>

      {/* Personalized Content Sections */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: `${spacing.xl}px`,
          marginBottom: `${spacing.xl}px`,
        }}
      >
        {/* Section 1: Portfolio Daily Changes */}
        <Card style={{ padding: `${spacing.base}px` }}>
          <SectionHeader
            title="O que mudou na sua carteira"
            description="Movimentações e rebalanceamentos do dia"
          />
          <EmptyState
            title="Sem movimentações hoje"
            description="Suas operações e lançamentos de livro-razão aparecerão aqui."
            actionLabel="Acessar Carteira"
            onAction={() => {
              window.location.href = '/portfolio';
            }}
          />
        </Card>

        {/* Section 2: Upcoming Corporate Events / Dividends */}
        <Card style={{ padding: `${spacing.base}px` }}>
          <SectionHeader
            title="Próximos eventos e proventos"
            description="Datas-com e pagamentos anunciados"
          />
          <EmptyState
            title="Nenhum provento agendado"
            description="Dividendos, JCP e eventos de custódia serão exibidos automaticamente."
          />
        </Card>
      </div>

      {/* Section 3: News & Macro Radar Placeholder */}
      <Card style={{ padding: `${spacing.base}px` }}>
        <SectionHeader
          title="Radar de Notícias e Mercado"
          description="Fatos relevantes e comunicados de companhias abertas"
        />
        <EmptyState
          title="Radar de notícias em estruturação"
          description="A integração com feeds B3 e notícias financeiras estará disponível no módulo de Market Data."
        />
      </Card>
    </div>
  );
}
