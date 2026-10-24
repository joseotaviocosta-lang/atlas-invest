import { describe, expect, it } from 'vitest';
import { describeReviewSignal, buildReviewSignalTitle } from '@atlas/ui';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-A (mobile) — review contract stays compatible with the
 * read-only native app. The mobile card renders the summary plus up to
 * three signal titles; CTAs only route to screens that exist natively.
 * No unsupported actions, no dead buttons.
 */
describe('Phase 5Q-A (mobile): review contract compatibility', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileReviewSection.tsx'),
    'utf8',
  );

  it('status, copy and titles resolve natively', () => {
    expect(describeReviewSignal('ALLOCATION_SINGLE_ASSET_CONCENTRATION').label).toBe(
      'Concentração elevada',
    );
    expect(
      buildReviewSignalTitle({
        code: 'INTEGRATION_PENDING_REVIEW',
        severity: 'REVIEW',
        evidence: { pendingReviewCount: 2 },
      }),
    ).toBe('2 importações aguardam revisão');
  });

  it('renders a compact read-only card with existing-route CTAs only', () => {
    expect(section).toContain('Revisão da carteira');
    expect(section).toContain('slice(0, 3)');
    // Only natively existing destinations may be linked.
    expect(section).toContain('/(app)/reviews');
    expect(section).toContain('/(app)/portfolio/performance?portfolioId=');
    expect(section).toContain('/(app)/portfolio/income?portfolioId=');
    expect(section).not.toMatch(/tab=allocation|tab=operations/);
  });

  it('never renders a dead CTA: actions without a native target show text only', () => {
    // target null → text-only branch (no Button rendered).
    expect(section).toContain('target !== null');
    expect(section).not.toContain('onPress={() => {}}');
  });

  it('opens a read-only detail with period selector, history fallback and limitations', () => {
    const detail = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/review-detail.tsx'),
      'utf8',
    );
    expect(detail).toContain('Por que estou vendo isso?');
    expect(detail).toContain('Como evoluiu');
    expect(detail).toContain('Dados usados');
    expect(detail).toContain('Limitações');
    expect(detail).toContain('Histórico indisponível para este indicador');
    expect(detail).toContain('TABLE_COMPARISON');
    expect(detail).toContain('Comparação com o snapshot atual');
    for (const preset of ['1M', '3M', '6M', 'YTD', '1A', 'INCEPTION']) {
      expect(detail).toContain(`id: '${preset}'`);
    }
    const section = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileReviewSection.tsx'),
      'utf8',
    );
    expect(section).toContain('Ver detalhes');
    expect(section).toContain('/(app)/portfolio/review-detail?');
  });

  it('renders a read-only strategy card without dead CTAs or advice', () => {
    const card = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/src/components/portfolio/MobileStrategySection.tsx'),
      'utf8',
    );
    expect(card).toContain('Metas de alocação');
    expect(card).toContain('versão web');
    expect(card).not.toMatch(/Rebalancear|Comprar|Vender|Gerar ordens/i);
    expect(card).not.toContain('onPress={() => {}}');
  });
});
