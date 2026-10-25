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

  it('tracks planned vs actual with explicit confirmation only', () => {
    expect(section).toContain('Planejado x realizado');
    expect(section).toContain('plan-tracking-summary');
    expect(section).toContain('plan-tracking');
    expect(section).toContain('Operações vinculadas');
    expect(section).toContain('Operações que podem estar relacionadas');
    expect(section).toContain('Estas operações são apenas sugestões de correspondência.');
    expect(section).toContain('depois que você confirma o vínculo');
    expect(section).toContain('Vincular');
    expect(section).toContain('Não é deste plano');
    expect(section).toContain('Desvincular');
    expect(section).toContain('abaixo do valor planejado');
    expect(section).toContain('valor planejado foi identificado');
    expect(section).toContain('Nenhuma operação foi vinculada a este plano.');
    expect(section).toContain('Plano marcado como realizado, mas nenhuma operação foi vinculada.');
    expect(section).toContain('/tracking/confirm');
    expect(section).toContain('/tracking/reject');
    expect(section).toContain('/tracking/');
  });

  it('shows candidate explanations without confidence language', () => {
    expect(section).toContain('Por que apareceu');
    expect(section).toContain('tracking-reasons-');
    expect(section).toContain('Valor exato');
    expect(section).toContain('ordenadas por proximidade de data e valor');
    expect(section).toContain('Nenhuma sugestão no momento');
    expect(section).not.toMatch(/confiança|confidence|probabilidade|score|% de chance/i);
  });

  it('groups pairs with explicit atomic confirmation', () => {
    expect(section).toContain('Combinações de 2 operações');
    expect(section).toContain('Soma exata');
    expect(section).toContain('Vincular estas 2 operações');
    expect(section).toContain('Vincular estas operações');
    expect(section).toContain('lançamento será criado ou executado');
    expect(section).toContain('ou nenhuma, nunca pela metade');
    expect(section).toContain('/tracking/confirm-group');
    expect(section).toContain('Manter sem vincular');
  });

  it('offers bounded manual search without dumping the ledger', () => {
    expect(section).toContain('Procurar outra operação');
    expect(section).toContain('tracking-search-open');
    expect(section).toContain('tracking-search-from');
    expect(section).toContain('tracking-search-to');
    expect(section).toContain('/tracking/search');
    expect(section).toContain('Nenhuma operação encontrada neste período');
  });

  it('keeps cancelled plans read-only in tracking', () => {
    expect(section).toContain("planStatus === 'CANCELLED'");
    expect(section).toContain('!readOnly');
  });
});

describe('Phase 5Q-I: contribution insights web surface', () => {
  const insights = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioContributionInsights.tsx'),
    'utf8',
  );
  const plans = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioContributionPlans.tsx'),
    'utf8',
  );

  it('lives inside planning with an explicit entry point', () => {
    expect(plans).toContain('PortfolioContributionInsights');
    expect(insights).toContain('Histórico e acompanhamento');
    expect(insights).toContain('contribution-insights');
    expect(insights).toContain('/contribution-insights?period=');
  });

  it('offers fixed presets with 1A default and rejects the rest server-side', () => {
    expect(insights).toContain('insights-period-');
    for (const label of ['3M', '6M', 'No ano', '1 ano', 'Desde o início']) {
      expect(insights).toContain(label);
    }
    expect(insights).toContain("useState<string>('1A')");
  });

  it('renders the hero with neutral difference copy', () => {
    expect(insights).toContain('insights-hero');
    expect(insights).toContain('No período:');
    expect(insights).toContain('Identificado em operações confirmadas');
    expect(insights).toContain('Diferença:');
    expect(insights).toContain('foram identificados em operações confirmadas');
  });

  it('shows status counts, timeline chart plus table, and category table', () => {
    expect(insights).toContain('insights-status');
    expect(insights).toContain('Planejados');
    expect(insights).toContain('Realizados');
    expect(insights).toContain('Cancelados');
    expect(insights).toContain('timeline-chart');
    expect(insights).toContain('insights-by-category');
    expect(insights).toContain('scope="col"');
  });

  it('lists recent plans with navigation and empty states', () => {
    expect(insights).toContain('insights-recent-plans');
    expect(insights).toContain('Ver plano');
    expect(insights).toContain('Nenhum plano neste período');
    expect(insights).toContain('Aguardar vínculo');
    expect(insights).toContain('Revisar plano');
  });

  it('shows limitations without inventing category equivalence', () => {
    expect(insights).toContain('describeInsightsLimitation');
    expect(insights).toContain('insights-limitation-');
  });

  it('contains no score, forecast, gamification or advice language', () => {
    expect(insights).not.toMatch(/score|streak|disciplina|forecast|previs[aã]o/i);
    expect(insights).not.toMatch(
      /você deveria|deve (investir|aportar)|recomendamos|ideal|ótimo|meta mensal/i,
    );
    expect(insights).not.toMatch(/Comprar agora|Executar|Gerar ordem/i);
  });

  it('keeps numbers server-computed with string-only chart geometry', () => {
    expect(insights).not.toMatch(/parseFloat/);
    expect(insights).toContain('decimalToMicroUnits');
  });
});
