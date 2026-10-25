import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-K (mobile) — contribution planning calendar stays read-only.
 * Vertical monthly timeline with expandable goal/plan/actual rows; plan
 * creation remains web-only with an explicit note. No dead actions,
 * no execution, no advice.
 */
describe('Phase 5Q-K (mobile): contribution planning calendar read-only', () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileStrategySection.tsx'),
    'utf8',
  );

  it('renders a vertical monthly timeline from the same endpoint', () => {
    expect(card).toContain('testID="contribution-calendar"');
    expect(card).toContain('Visão mensal');
    expect(card).toContain('/contribution-calendar');
    expect(card).toContain('formatPlanMonthLong');
    expect(card).toContain('Mês atual');
  });

  it('expands months with goal, plan and actual rows', () => {
    expect(card).toContain('accessibilityState={{ expanded: isOpen }}');
    expect(card).toContain('calendar-month-');
    expect(card).toContain('Meta definida:');
    expect(card).toContain('Meta passa a');
    expect(card).toContain('Vinculado ao plano');
    expect(card).toContain('Ver plano');
    expect(card).toContain('onOpenPlan(plan.id)');
  });

  it('shows the mixed-currency limitation and web-only notes', () => {
    expect(card).toContain('describeInsightsLimitation');
    expect(card).toContain('A definição de metas está disponível na versão web');
    expect(card).toContain('Criação de planos disponível na versão web');
  });

  it('navigates years without dead controls', () => {
    expect(card).toContain('calendar-year');
    expect(card).toContain('Ver ano anterior');
    expect(card).toContain('Ver próximo ano');
    expect(card).not.toContain('onPress={() => {}}');
  });

  it('offers no create form, no amounts to edit and no execution path', () => {
    expect(card).not.toContain('Criar plano');
    expect(card).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
    expect(card).not.toMatch(
      /você deveria|deve (investir|aportar)|recomendamos|ideal|ótimo|invista/i,
    );
  });
});
