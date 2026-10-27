'use client';

import React, { useState } from 'react';
import { SectionHeader, Tabs, Card, EmptyState } from '@/components/ui';
import { spacing } from '@atlas/ui';
import { PortfolioContributionGoalSection } from './PortfolioContributionGoal';
import { PortfolioContributionCalendar } from './PortfolioContributionCalendar';
import { PortfolioContributionPlans } from './PortfolioContributionPlans';
import { PortfolioContributionInsights } from './PortfolioContributionInsights';
import { PortfolioScenarioSimulator } from './PortfolioScenarioSimulator';
import { PortfolioSavedScenarios } from './PortfolioSavedScenarios';

export const PLANNING_SUBTABS = [
  { id: 'goals', label: 'Meta Mensal' },
  { id: 'plans', label: 'Planos de Aporte' },
  { id: 'calendar', label: 'Calendário de Aportes' },
  { id: 'insights', label: 'Aderência & Insights' },
  { id: 'scenarios', label: 'Simulação de Cenários' },
];

export interface PortfolioPlanningSectionProps {
  portfolioId: string | null;
  initialSubTab?: string;
}

export function PortfolioPlanningSection({
  portfolioId,
  initialSubTab = 'goals',
}: PortfolioPlanningSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab);

  if (!portfolioId) {
    return (
      <Card style={{ padding: `${spacing.xl}px` }}>
        <EmptyState
          title="Planejamento de Aportes"
          description="Selecione uma carteira ativa para visualizar e gerenciar metas, planos e calendário de aportes."
        />
      </Card>
    );
  }

  const handleOpenPlan = (_planId: string) => {
    setActiveSubTab('plans');
  };

  return (
    <div data-testid="portfolio-planning-section">
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <SectionHeader
          title="Planejamento & Aportes"
          description="Defina sua meta mensal, elabore planos de aporte direcionados por categoria, acompanhe o calendário e audite a aderência dos aportes realizados."
        />
        <div style={{ marginTop: `${spacing.md}px` }}>
          <Tabs
            tabs={PLANNING_SUBTABS}
            activeTab={activeSubTab}
            onTabChange={(tabId: string) => setActiveSubTab(tabId)}
          />
        </div>
      </div>

      <div style={{ marginTop: `${spacing.base}px` }}>
        {activeSubTab === 'goals' && (
          <PortfolioContributionGoalSection portfolioId={portfolioId} />
        )}
        {activeSubTab === 'plans' && (
          <PortfolioContributionPlans portfolioId={portfolioId} />
        )}
        {activeSubTab === 'calendar' && (
          <PortfolioContributionCalendar
            portfolioId={portfolioId}
            onOpenPlan={handleOpenPlan}
          />
        )}
        {activeSubTab === 'insights' && (
          <PortfolioContributionInsights
            portfolioId={portfolioId}
            onOpenPlan={handleOpenPlan}
          />
        )}
        {activeSubTab === 'scenarios' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xl}px` }}>
            <PortfolioScenarioSimulator portfolioId={portfolioId} />
            <PortfolioSavedScenarios portfolioId={portfolioId} />
          </div>
        )}
      </div>
    </div>
  );
}
