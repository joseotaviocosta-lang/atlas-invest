import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  describeScenarioLimitation,
  describeScenarioState,
  formatScenarioBp,
  formatScenarioDeviationTransition,
  formatScenarioMoney,
  scenarioCategoryLabel,
} from '@atlas/ui';

/**
 * Phase 5Q-D — web scenario simulator contract (static surface + view-model).
 *
 * Hypothetical-only: entry 'Simular aporte', CTA 'Simular', reset
 * 'Limpar simulação', disclosure that nothing is executed. No trade,
 * order or rebalance vocabulary; no execution CTA; weights come from
 * the server.
 */
describe('Phase 5Q-D: scenario simulator web surface', () => {
  const simulator = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioScenarioSimulator.tsx'),
    'utf8',
  );
  const strategy = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioStrategySection.tsx'),
    'utf8',
  );

  it('exposes the simulator inside Minha estratégia without rebalance language', () => {
    expect(strategy).toContain('PortfolioScenarioSimulator');
    expect(simulator).toContain('Simular aporte');
    expect(simulator).toContain('Simular');
    expect(simulator).toContain('Limpar simulação');
    expect(simulator).not.toMatch(/Rebalancear/);
    expect(simulator).not.toMatch(/Aplicar|Confirmar|Executar/);
  });

  it('discloses hypothetical-only state and shows before/after neutrally', () => {
    expect(simulator).toContain('Esta simulação não altera sua carteira e não executa operações.');
    expect(simulator).toContain('Resultado da simulação');
    expect(simulator).toContain('Antes:');
    expect(simulator).toContain('Após a hipótese:');
    expect(simulator).toContain('Aporte hipotético total');
    expect(simulator).toContain('Desvio projetado');
    expect(simulator).toContain('Aporte simulado');
  });

  it('offers no execution CTA and no recommendation vocabulary', () => {
    expect(simulator).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
    expect(simulator).not.toMatch(
      /melhor cenário|recomend|ótimo|ideal|deve (comprar|vender|aportar)|ficaria melhor/i,
    );
    expect(simulator).toContain('calcula a alocação projetada');
  });

  it('keeps money and weight math exact (no floats in the surface)', () => {
    expect(simulator).toContain('parseMoneyToCents');
    expect(simulator).not.toMatch(/parseFloat/);
    expect(simulator).toContain('BigInt');
  });

  it('announces state, labels inputs and keeps touch targets', () => {
    expect(simulator).toContain('aria-live="polite"');
    expect(simulator).toContain('aria-label');
    expect(simulator).toContain('minHeight: 44');
    expect(simulator).toContain('scope="col"');
    expect(simulator).toContain('scenario-input-');
  });

  it('formats scenario view-model in pt-BR without floats', () => {
    expect(scenarioCategoryLabel('FIXED_INCOME')).toBe('Renda Fixa');
    expect(formatScenarioMoney('10000.5')).toBe('R$ 10.000,50');
    expect(formatScenarioMoney('10000')).toBe('R$ 10.000,00');
    expect(formatScenarioBp(6000)).toBe('60,00%');
    expect(formatScenarioBp(null)).toBe('—');
    expect(formatScenarioDeviationTransition(-500, -180)).toBe('−5,00 p.p. → −1,80 p.p.');
    expect(describeScenarioState('BELOW_TARGET')).toBe('Abaixo da meta');
    expect(describeScenarioLimitation('PARTIAL_COVERAGE')).toContain('valor conhecido');
  });
});
