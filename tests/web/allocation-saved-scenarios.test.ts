import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  describeScenarioLimitation,
  formatAggregatePp,
  formatCentsBr,
  formatScenarioBp,
  parseScenarioMoneyToCents,
} from '@atlas/ui';

/**
 * Phase 5Q-E — saved scenarios web surface (static contract + view-model).
 *
 * Hypotheses persist; results recompute live. Two-scenario comparison on
 * one shared basis; no winner, no score, no execution. Values parse/format
 * exactly (integer cents, no floats).
 */
describe('Phase 5Q-E: saved scenarios web surface', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioSavedScenarios.tsx'),
    'utf8',
  );
  const simulator = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioScenarioSimulator.tsx'),
    'utf8',
  );
  const strategy = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioStrategySection.tsx'),
    'utf8',
  );

  it('lives inside Minha estratégia next to the ephemeral simulator', () => {
    expect(strategy).toContain('PortfolioSavedScenarios');
    expect(strategy).toContain('PortfolioScenarioSimulator');
  });

  it('covers empty, list, open, edit, dirty, duplicate and delete flows', () => {
    expect(section).toContain('Você ainda não salvou nenhum cenário.');
    expect(section).toContain('Criar simulação');
    expect(section).toContain('Cenários salvos');
    expect(section).toContain('Abrir');
    expect(section).toContain('Editar');
    expect(section).toContain('Duplicar');
    expect(section).toContain('Excluir');
    expect(section).toContain('Confirmar exclusão');
    expect(section).toContain('Alterações não salvas');
    expect(section).toContain('Salvar alterações');
    expect(section).toContain('Salvar cenário');
    expect(section).toContain('Limpar comparação');
    expect(simulator).toContain('Limpar simulação');
  });

  it('discloses live recompute and never promises stored results', () => {
    expect(section).toContain('O Atlas salvará os valores hipotéticos informados.');
    expect(section).toContain('sempre que você abrir este cenário');
    expect(section).toContain('Simulação recalculada com as metas atuais da carteira.');
    expect(section).toContain('recalculado com a carteira e as metas atuais');
    expect(simulator).toContain('Salvar cenário');
    expect(simulator).toContain('Aporte de novembro');
  });

  it('compares at most two scenarios on the same basis without a winner', () => {
    expect(section).toContain('Comparar');
    expect(section).toContain('/allocation-scenarios/compare');
    expect(section).toContain('Nenhum cenário é');
    expect(section).toContain('apontado como melhor');
    expect(section).toContain('Desvio absoluto agregado');
    expect(section).toContain('não presume');
    expect(section).toContain('equivalência');
    expect(section).not.toMatch(/winner|bestScenario|melhor cenário|recomend|vencedor/i);
  });

  it('confirms deletion without touching the rest', () => {
    expect(section).toContain('Excluir este cenário salvo?');
    expect(section).toContain('operações');
    expect(section).toContain('alteradas');
  });

  it('keeps money exact and UI free of weight math', () => {
    expect(section).toContain('parseScenarioMoneyToCents');
    expect(section).not.toMatch(/parseFloat/);
    expect(section).not.toMatch(/projectedBp\s*=/);
    expect(section).toContain('/allocation-scenarios');
    expect(section).toContain("type: 'CONTRIBUTION'");
  });

  it('stays accessible with labels, live regions and touch targets', () => {
    expect(section).toContain('aria-live="polite"');
    expect(section).toContain('aria-label');
    expect(section).toContain('minHeight: 44');
    expect(section).toContain('scope="col"');
    expect(section).toContain('role="alert"');
  });

  it('formats and parses scenario money exactly', () => {
    expect(parseScenarioMoneyToCents('10.000,50')).toBe(BigInt(1000050));
    expect(parseScenarioMoneyToCents('10000.50')).toBe(BigInt(1000050));
    expect(parseScenarioMoneyToCents('10.000')).toBe(BigInt(1000000));
    expect(parseScenarioMoneyToCents('10000.5')).toBe(BigInt(1000050));
    expect(parseScenarioMoneyToCents('-5')).toBeNull();
    expect(parseScenarioMoneyToCents('10.1234')).toBeNull();
    expect(formatCentsBr(BigInt(1000050))).toBe('R$ 10.000,50');
    expect(formatAggregatePp(520)).toBe('5,20 p.p.');
    expect(formatAggregatePp(-520)).toBe('5,20 p.p.');
    expect(describeScenarioLimitation('NO_STRATEGY')).toContain('Defina metas');
    expect(describeScenarioLimitation('NEEDS_REVIEW')).toContain('não reconhece');
    expect(formatScenarioBp(6000)).toBe('60,00%');
  });

  it('contains no advice, ranking or execution vocabulary', () => {
    for (const content of [section, simulator]) {
      expect(content).not.toMatch(
        /você deveria|deve (comprar|vender|aportar)|recomendamos|melhor investimento|Comprar agora|Executar aporte|Enviar ordem|Markowitz|risk parity|optimizer|solver/i,
      );
    }
  });
});
