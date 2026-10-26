import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-B (mobile) — position performance stays read-only and lazy.
 * Same facts as web (return, components, contribution, limitations),
 * table only, no chart. No dead actions, no execution, no advice.
 */
describe('Phase 5R-B (mobile): position performance read-only', () => {
  const section = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePositionPerformanceSection.tsx',
    ),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/[assetId].tsx'),
    'utf8',
  );
  const api = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/src/api/portfolios.ts'),
    'utf8',
  );

  it('fetches the lazy performance endpoint and renders on the asset page', () => {
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/positions/${assetId}/performance');
    expect(section).toContain('portfoliosApi.getPositionPerformance(');
    expect(section).toContain('queryKey: [');
    expect(page).toContain('MobilePositionPerformanceSection');
    expect(section).toContain('testID="position-performance"');
  });

  it('shows return, components, contribution and limitations', () => {
    expect(section).toContain('DESEMPENHO DA POSIÇÃO');
    expect(section).toContain('testID="performance-return"');
    expect(section).toContain('testID="performance-pnl"');
    expect(section).toContain('testID="performance-contribution"');
    expect(section).toContain(
      'Quanto esta posição contribuiu para a variação da carteira no período.',
    );
    expect(section).toContain('describePositionLimitation');
    expect(section).toContain(
      'O resultado detalhado por posição ainda não está disponível para este período.',
    );
  });

  it('offers a period selector without dead controls', () => {
    for (const preset of ['1M', '3M', '6M', 'No ano', '1 ano', 'Desde o início']) {
      expect(section).toContain(preset);
    }
    expect(section).toContain('accessibilityState={{ selected: preset === option.value }}');
    expect(section).not.toContain('onPress={() => {}}');
  });

  it('uses explicit signs and text, never color-only gains', () => {
    expect(section).toContain("'-' : '+'");
    expect(section).not.toMatch(/gainColor|isPositive|isNegative/);
  });

  it('exposes no execution paths and no advice language', () => {
    expect(section).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
    expect(section).not.toMatch(
      /melhor ativo|pior ativo|top performer|recomendamos|ideal|ótimo|score|rating|buy now|sell now|forecast|previsão/i,
    );
  });
});
