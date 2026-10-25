import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-D (mobile) — scenario simulation stays web-only in v1.
 * The native card is read-only and points to the web version; no dead
 * CTA, no form, no execution path on mobile. Documented, not a gap.
 */
describe('Phase 5Q-D (mobile): scenario stays web-only', () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileStrategySection.tsx'),
    'utf8',
  );

  it('tells the user simulations live on web without a dead CTA', () => {
    expect(card).toContain('Simulações');
    expect(card).toContain('versão web');
    expect(card).not.toContain('onPress={() => {}}');
  });

  it('offers no simulate form, no amounts and no execution path', () => {
    expect(card).not.toContain('Simular aporte');
    expect(card).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
  });
});

/**
 * Phase 5Q-E (mobile) — saved scenarios list + read-only live detail.
 * Create/edit stay web-only; opening shows the live recomputation.
 * No dead actions, no execution, no advice.
 */
describe('Phase 5Q-E (mobile): saved scenarios read-only', () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileStrategySection.tsx'),
    'utf8',
  );

  it('lists saved scenarios and opens a live read-only result', () => {
    expect(card).toContain('Cenários salvos');
    expect(card).toContain('/allocation-scenarios`');
    expect(card).toContain('Abrir');
    expect(card).toContain('saved-scenario-detail');
    expect(card).toContain('recalculado');
    expect(card).toContain('metas atuais');
  });

  it('keeps create/edit web-only with an explicit note', () => {
    expect(card).toContain('Criar e editar cenários estão disponíveis na versão web');
    expect(card).not.toContain('Salvar cenário');
  });

  it('renders limitations and neutral facts without advice or dead CTAs', () => {
    expect(card).toContain('describeScenarioLimitation');
    expect(card).toContain('fora da meta');
    expect(card).not.toContain('onPress={() => {}}');
    // 'não faz recomendações' is the established neutral disclaimer, not advice.
    expect(card).not.toMatch(/melhor cenário|vencedor|Comprar|Vender\b/);
    expect(card).not.toMatch(/você deveria|deve (comprar|vender|aportar)/i);
  });
});

/**
 * Phase 5Q-F (mobile) — contribution plans list + detail with
 * complete/cancel. Create/edit stay web-only. Status flips only.
 */
describe('Phase 5Q-F (mobile): contribution plans', () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileStrategySection.tsx'),
    'utf8',
  );

  it('lists upcoming and history with a read-only live detail', () => {
    expect(card).toContain('Planejamento de aportes');
    expect(card).toContain('Próximos aportes');
    expect(card).toContain('Histórico');
    expect(card).toContain('/contribution-plans`');
    expect(card).toContain('contribution-plan-detail');
  });

  it('marks complete and cancels without transactions or dead CTAs', () => {
    expect(card).toContain('/contribution-plans');
    expect(card).toContain("kind: 'complete'");
    expect(card).toContain("kind: 'cancel'");
    expect(card).toContain('Marcar');
    expect(card).toContain('como realizado');
    expect(card).not.toContain('onPress={() => {}}');
  });

  it('keeps create/edit web-only with an explicit note', () => {
    expect(card).toContain('Criar e editar planos estão disponíveis na versão web');
    expect(card).not.toContain('Salvar plano');
  });

  it('shows tracking summaries and read-only suggestions with explanations', () => {
    expect(card).toContain('contribution-plan-detail');
    expect(card).toContain('fora da meta');
    expect(card).toContain('Nenhuma operação é criada');
    expect(card).toContain('Sugestões de correspondência (somente leitura)');
    expect(card).toContain('describeMatchTiming');
    expect(card).toContain('describeMatchReason');
    expect(card).toContain('Para vincular operações individuais a este plano, use a versão web.');
    expect(card).not.toMatch(/melhor cenário|vencedor|Comprar|Vender\b|Executar/);
  });

  it('shows pair groups with explicit group confirmation', () => {
    expect(card).toContain('Pares que somam o plano');
    expect(card).toContain('Soma exata');
    expect(card).toContain('Vincular estas 2 operações');
    expect(card).toContain('/tracking/confirm-group');
    expect(card).not.toContain('onPress={() => {}}');
  });

  it('discloses status-only semantics without advice or execution', () => {
    expect(card).toContain('Nenhuma operação é criada');
    expect(card).not.toMatch(/melhor cenário|vencedor|Comprar|Vender\b|Executar/);
  });
});

/**
 * Phase 5Q-I (mobile) — contribution insights read-only.
 * Summary, counts, textual timeline and recent plans with navigation.
 * No chart, no scores, no forecasts, no gamification.
 */
describe('Phase 5Q-I (mobile): contribution insights', () => {
  const card = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileStrategySection.tsx'),
    'utf8',
  );

  it('shows summary, timeline text and recent plans', () => {
    expect(card).toContain('Histórico e acompanhamento');
    expect(card).toContain('/contribution-insights');
    expect(card).toContain('Planejado:');
    expect(card).toContain('Realizados:');
    expect(card).toContain('Cancelados');
    expect(card).toContain('Ver plano');
    expect(card).not.toContain('onPress={() => {}}');
  });

  it('shows limitations and no gamification language', () => {
    expect(card).toContain('describeInsightsLimitation');
    expect(card).not.toMatch(/streak|score|disciplina|forecast|previs[aã]o/i);
    // 'não faz recomendações' is the established neutral disclaimer, not advice.
    expect(card).not.toMatch(/você deveria|deve (comprar|vender|aportar)/i);
  });
});
