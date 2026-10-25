import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  describePlanStatus,
  describeScenarioLimitation,
  formatAggregatePp,
  formatCentsBr,
  formatPlanDate,
  parseScenarioMoneyToCents,
} from '@atlas/ui';

/**
 * Phase 5Q-F — contribution planning workspace web surface.
 *
 * Intent only: plans never execute, never recommend, never write the
 * ledger. Live impact recomputes; terminal history stays immutable.
 */
describe('Phase 5Q-F: contribution plans web surface', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioContributionPlans.tsx'),
    'utf8',
  );
  const strategy = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioStrategySection.tsx'),
    'utf8',
  );
  const simulator = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioScenarioSimulator.tsx'),
    'utf8',
  );
  const saved = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioSavedScenarios.tsx'),
    'utf8',
  );
  const today = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/today/page.tsx'),
    'utf8',
  );

  it('lives inside Minha estratégia as Planejamento de aportes', () => {
    expect(strategy).toContain('PortfolioContributionPlans');
    expect(section).toContain('Planejamento de aportes');
    expect(section).toContain('Próximos aportes');
    expect(section).toContain('Histórico de planos');
  });

  it('covers empty, create, open, edit, complete, cancel and delete flows', () => {
    expect(section).toContain('Nenhum aporte planejado');
    expect(section).toContain('Criar plano');
    expect(section).toContain('Novo plano');
    expect(section).toContain('Editar');
    expect(section).toContain('Salvar alterações');
    expect(section).toContain('Marcar como realizado');
    expect(section).toContain('Cancelar plano');
    expect(section).toContain('Excluir');
    expect(section).toContain('Confirmar cancelamento');
    expect(section).toContain('Confirmar exclusão');
    expect(section).toContain('Data planejada já passou');
  });

  it('confirms terminal actions without execution language', () => {
    expect(section).toContain(
      'Marcar este plano como realizado? Isso apenas atualiza o status do planejamento.',
    );
    expect(section).toContain('Nenhuma operação será criada ou executada no Atlas.');
    expect(section).toContain('Cancelar este plano?');
    expect(section).not.toMatch(/Executar aporte|Enviar ordem|Comprar agora|Gerar ordem/i);
  });

  it('discloses intent-only persistence and live recompute', () => {
    expect(section).toContain('O Atlas salvará apenas a sua intenção.');
    expect(section).toContain('Nada será comprado, executado ou recomendado.');
    expect(section).toContain('O impacto abaixo é recalculado com a carteira e as metas atuais.');
    expect(section).toContain('Ele pode ser');
    expect(section).toContain('quando criou o plano.');
  });

  it('enters from saved scenarios and ephemeral simulations without auto-distribution', () => {
    expect(saved).toContain('Criar plano');
    expect(saved).toContain('dispatchCreatePlan');
    expect(simulator).toContain('Criar plano');
    expect(simulator).toContain('dispatchCreatePlan');
    expect(section).toContain('atlas:create-plan');
    expect(section).toContain('Escolha a data planejada e salve');
    expect(section).not.toMatch(/Distribuir para atingir|preencher automaticamente|auto-distribu/i);
  });

  it('keeps money exact and UI free of weight math', () => {
    expect(section).toContain('parseScenarioMoneyToCents');
    expect(section).not.toMatch(/parseFloat/);
    expect(section).not.toMatch(/projectedBp\s*=/);
    expect(section).toContain('/contribution-plans');
    expect(section).toContain('plannedDate');
  });

  it('uses date-only inputs with pt-BR display', () => {
    expect(section).toContain('type="date"');
    expect(section).toContain('formatPlanDate');
    expect(formatPlanDate('2026-11-10')).toBe('10/11/2026');
  });

  it('stays accessible with labels, live regions and touch targets', () => {
    expect(section).toContain('aria-live="polite"');
    expect(section).toContain('aria-label');
    expect(section).toContain('minHeight: 44');
    // Detail tables reuse the shared LiveResultTable (header scope verified at its home).
    expect(saved).toContain('scope="col"');
    expect(section).toContain('role="alert"');
  });

  it('formats plan view-model values in pt-BR without floats', () => {
    expect(describePlanStatus('PLANNED')).toBe('Planejado');
    expect(describePlanStatus('COMPLETED')).toBe('Realizado');
    expect(describePlanStatus('CANCELLED')).toBe('Cancelado');
    expect(describeScenarioLimitation('CURRENCY_MISMATCH')).toContain('divergem');
    expect(describeScenarioLimitation('NO_STRATEGY')).toContain('Defina metas');
    expect(formatCentsBr(parseScenarioMoneyToCents('5000.5') ?? BigInt(0))).toBe('R$ 5.000,50');
    expect(formatAggregatePp(520)).toBe('5,20 p.p.');
  });

  it('shows the next plan on Today without executing anything', () => {
    expect(today).toContain('today-next-plan');
    expect(today).toContain('/contribution-plans/next');
    expect(today).toContain('Próximo aporte planejado');
    expect(today).toContain('Plano de aporte pendente desde');
    expect(today).toContain('Ver plano');
    expect(today).not.toMatch(/Executar|Comprar agora|Enviar ordem/i);
  });

  it('contains no recommendation, optimization or execution vocabulary', () => {
    for (const content of [section, saved, simulator, today]) {
      expect(content).not.toMatch(
        /você deveria|deve (comprar|vender|aportar)|recomendamos|melhor investimento|ideal|ótimo|Markowitz|risk parity|optimizer|solver|tax optimization/i,
      );
    }
  });
});
