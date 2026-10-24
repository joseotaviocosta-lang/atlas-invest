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
