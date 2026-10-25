import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-K (web) — contribution planning calendar.
 *
 * Monthly timeline composing user-defined goals, plans and CONFIRMED
 * actuals. Organizes existing facts only: the create-plan action only
 * pre-fills the date, never amounts; no suggestions, no reminders, no
 * forecasts, no automation.
 */
describe('Phase 5Q-K: contribution planning calendar web surface', () => {
  const calendar = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioContributionCalendar.tsx'),
    'utf8',
  );
  const plans = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioContributionPlans.tsx'),
    'utf8',
  );
  const today = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/today/page.tsx'),
    'utf8',
  );

  it('calendar lives inside the plans workspace with a monthly timeline', () => {
    expect(plans).toContain('PortfolioContributionCalendar');
    expect(calendar).toContain('id="contribution-calendar"');
    expect(calendar).toContain('Visão mensal');
    expect(calendar).toContain('/contribution-calendar?from=');
  });

  it('navigates by year with today shortcut', () => {
    expect(calendar).toContain('calendar-year-prev');
    expect(calendar).toContain('calendar-year-next');
    expect(calendar).toContain('calendar-year-today');
    expect(calendar).toContain('Ver ano anterior');
    expect(calendar).toContain('Ver próximo ano');
    expect(calendar).toContain('Voltar ao ano atual');
  });

  it('renders month cards with goal, planned and confirmed facts', () => {
    expect(calendar).toContain('formatPlanMonthLong');
    expect(calendar).toContain('Mês atual');
    expect(calendar).toContain('Planejamento');
    expect(calendar).toContain('Histórico');
    expect(calendar).toContain('Meta definida:');
    expect(calendar).toContain('Sem meta definida');
    expect(calendar).toContain('nenhuma operação confirmada ainda');
    expect(calendar).toContain('Confirmado no');
  });

  it('marks goal changes factually without judgment', () => {
    expect(calendar).toContain('calendar-goal-change-');
    expect(calendar).toContain('/mês neste mês.');
    expect(calendar).not.toMatch(/meta perdida|atrasado|Você ficou devendo|Você falhou/i);
  });

  it('expands months with accessible plan and actual rows', () => {
    expect(calendar).toContain('aria-expanded');
    expect(calendar).toContain('aria-controls');
    expect(calendar).toContain('calendar-plan-');
    expect(calendar).toContain('calendar-actual-');
    expect(calendar).toContain('Vinculado ao plano');
    expect(calendar).toContain('Data planejada já passou');
  });

  it('navigates to plans and to the goal section', () => {
    expect(calendar).toContain('Ver plano');
    expect(calendar).toContain('onOpenPlan(plan.id)');
    expect(calendar).toContain('calendar-define-goal-');
    expect(calendar).toContain("getElementById('contribution-goal')");
  });

  it('create-plan pre-fills only the date, never amounts', () => {
    expect(calendar).toContain('dispatchCreatePlan');
    expect(calendar).toContain('Criar plano');
    expect(calendar).toContain('calendar-create-plan-');
    const call = calendar.slice(calendar.indexOf('dispatchCreatePlan({'));
    expect(call).toContain('plannedDate');
    expect(call.slice(0, 400)).not.toMatch(/items|amount|name/);
    expect(plans).toContain('plannedDate?: string');
    expect(plans).toContain('Data planejada preenchida com o mês selecionado');
  });

  it('today links to the calendar without duplicating it', () => {
    expect(today).toContain('Ver calendário');
    expect(today).toContain('#contribution-calendar');
    expect(today).toContain('aria-label="Ver calendário de aportes"');
  });

  it('is responsive and accessible', () => {
    expect(calendar).toContain('minHeight: 44');
    expect(calendar).toContain('aria-label=');
    expect(calendar).toContain('<article');
    expect(calendar).toContain('role="group"');
  });

  it('carries no advice, reminder, forecast or automation language', () => {
    for (const [name, content] of [
      ['calendar', calendar],
      ['today', today],
    ] as const) {
      expect(content, name).not.toMatch(
        /você deveria|deve (investir|aportar|aumentar)|recomendamos|ideal|ótimo|melhor valor|invista|lembrete|atrasado com a meta|meta perdida|previsão|mantendo (a|este)|projeção|Faltam apenas|Corra para|Ainda dá tempo/i,
      );
    }
  });
});
