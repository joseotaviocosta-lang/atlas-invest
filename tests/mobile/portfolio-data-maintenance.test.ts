import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 5S-D (mobile) — maintenance summary stays read-only.
 *
 * Counts plus navigation to existing routes (reviews). No mutation
 * form, no dead CTA.
 */
describe('Phase 5S-D (mobile): maintenance summary read-only', () => {
  const section = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePortfolioOperationsSection.tsx',
    ),
    'utf8',
  );

  it('shows maintenance counts with navigation to existing routes', () => {
    expect(section).toContain('testID="operations-maintenance"');
    expect(section).toContain('Manutenção de dados');
    expect(section).toContain('podem ser corrigidas no Atlas');
    expect(section).toContain('requerem revisão');
    expect(section).toContain("router.push('/(app)/reviews'");
    expect(section).toContain('testID="operations-maintenance-reviews"');
  });

  it('has no mutation form and no dead CTA', () => {
    expect(section).not.toMatch(/TextInput|mutation|useMutation/);
    expect(section).not.toMatch(/Corrigir operação|Atualizar cotações/);
  });

  it('is accessible with labels and test IDs', () => {
    expect(section).toContain('accessibilityRole="button"');
    expect(section).toContain('accessibilityLabel="Ver revisões"');
  });
});
