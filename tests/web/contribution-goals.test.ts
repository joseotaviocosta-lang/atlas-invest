import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-J (web) — user-defined monthly contribution goals.
 *
 * The user declares amount + effective month; the Atlas only compares
 * plans and confirmed actuals. No suggested amounts, no auto-tuning,
 * no scores, no streaks, no forecasts, no recommendations, no
 * execution. Neutral copy only.
 */
describe('Phase 5Q-J: contribution goals web surface', () => {
  const goal = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioContributionGoal.tsx'),
    'utf8',
  );
  const insights = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioContributionInsights.tsx'),
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

  it('goal section lives inside the plans workspace with an entry point', () => {
    expect(plans).toContain('PortfolioContributionGoalSection');
    expect(goal).toContain('id="contribution-goal"');
    expect(goal).toContain('Meta de aporte mensal');
  });

  it('covers empty, create, edit, effective month, history and end flows', () => {
    expect(goal).toContain('Você ainda não definiu uma meta mensal de aporte');
    expect(goal).toContain('Definir meta');
    expect(goal).toContain('Valor mensal');
    expect(goal).toContain('Aplicar a partir de');
    expect(goal).toContain('não reescreve os meses anteriores');
    expect(goal).toContain('Histórico de metas');
    expect(goal).toContain('Encerrar');
    expect(goal).toContain('Confirmar encerramento');
    expect(goal).toContain('A meta passa a valer no mês atual ou em um mês futuro');
  });

  it('discloses that the goal is user-defined with a neutral placeholder', () => {
    expect(goal).toContain('O Atlas salvará apenas o valor que você informar');
    expect(goal).toContain('placeholder="R$ 0,00"');
    expect(goal).not.toMatch(/Sugestão|Recomendamos|Com base na sua carteira/);
  });

  it('insights hero shows goal vs planned vs confirmed with neutral difference copy', () => {
    expect(insights).toContain('data-testid="insights-goal"');
    expect(insights).toContain('Meta definida por você');
    expect(insights).toContain('por mês');
    expect(insights).toContain('meta acumulada');
    expect(insights).toContain('para alcançar o valor que você definiu');
    expect(insights).toContain('Meta');
    expect(insights).toContain('mês atual');
  });

  it('today shows a compact factual goal card with a planning CTA', () => {
    expect(today).toContain('data-testid="today-contribution-goal"');
    expect(today).toContain('Meta de aporte deste mês');
    expect(today).toContain('definidos por você');
    expect(today).toContain('identificados até agora');
    expect(today).toContain('Ver planejamento');
  });

  it('carries no recommendation, judgment, score, streak or forecast language', () => {
    for (const [name, content] of [
      ['goal', goal],
      ['insights', insights],
      ['today', today],
    ] as const) {
      expect(content, name).not.toMatch(
        /você deveria|deve (investir|aportar|aumentar)|recomendamos|ideal|ótimo|melhor valor|invista|disciplina|streak|sequência|score|meta batida|Parabéns|forecast|previs|mantendo (a|este)|projeção|Faltam apenas|Corra para|Ainda dá tempo|Você ficou devendo|Você falhou|fracasso|sucesso|perfeito/i,
      );
    }
  });

  it('is responsive and accessible', () => {
    expect(goal).toContain('minHeight: 44');
    expect(goal).toContain('aria-label=');
    expect(goal).toContain('aria-live="polite"');
    expect(goal).toContain('role="alert"');
    expect(insights).toContain('data-testid="insights-goal"');
  });
});
