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
