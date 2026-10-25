import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-J (mobile) — user-defined contribution goals stay read-only.
 * The native card shows the current goal and factual progress; create and
 * edit remain web-only with an explicit note. No dead actions, no
 * execution, no advice.
 */
describe('Phase 5Q-J (mobile): contribution goals read-only', () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileStrategySection.tsx'),
    'utf8',
  );

  it('shows the current goal with a web-only edit note', () => {
    expect(card).toContain('testID="contribution-goal"');
    expect(card).toContain('Meta de aporte mensal');
    expect(card).toContain('testID="contribution-goal-current"');
    expect(card).toContain('Meta definida por você');
    expect(card).toContain('por mês');
    expect(card).toContain('Definir e alterar metas está disponível na versão web');
  });

  it('keeps the empty state factual without suggesting a value', () => {
    expect(card).toContain('Você ainda não definiu uma meta de aporte');
    expect(card).not.toContain('Definir meta');
  });

  it('integrates goal progress into the insights timeline textually', () => {
    expect(card).toContain('testID="insights-goal"');
    expect(card).toContain('meta acumulada');
    expect(card).toContain('meta ${');
  });

  it('renders limitations and neutral facts without advice or dead CTAs', () => {
    expect(card).toContain('describeInsightsLimitation');
    expect(card).not.toContain('onPress={() => {}}');
    expect(card).not.toMatch(
      /você deveria|deve (investir|aportar)|recomendamos|ideal|ótimo|invista/i,
    );
  });

  it('offers no goal form, no amounts to edit and no execution path', () => {
    expect(card).not.toContain('Salvar meta');
    expect(card).not.toContain('Aplicar a partir de');
    expect(card).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
  });
});
