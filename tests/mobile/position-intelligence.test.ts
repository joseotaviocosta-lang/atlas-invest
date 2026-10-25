import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5R-A (mobile) — position intelligence stays read-only.
 * Same facts as web: valuation, weight, income, realized disposals,
 * recent activity and limitations. No dead actions, no execution,
 * no advice.
 */
describe('Phase 5R-A (mobile): position intelligence read-only', () => {
  const section = fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/MobilePositionIntelligenceSection.tsx',
    ),
    'utf8',
  );
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/mobile/app/(app)/portfolio/[assetId].tsx'),
    'utf8',
  );

  it('fetches the intelligence endpoint and renders on the asset page', () => {
    const api = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/src/api/portfolios.ts'),
      'utf8',
    );
    expect(api).toContain('/api/v1/portfolios/${portfolioId}/positions/${assetId}/intelligence');
    expect(section).toContain('portfoliosApi.getPositionIntelligence(portfolioId, assetId)');
    expect(section).toContain("queryKey: ['position-intelligence', portfolioId, assetId]");
    expect(page).toContain('MobilePositionIntelligenceSection');
    expect(section).toContain('testID="position-intelligence"');
  });

  it('shows valuation, price date, weight and unrealized facts', () => {
    expect(section).toContain('VALOR E PARTICIPAÇÃO');
    expect(section).toContain('testID="position-market-value"');
    expect(section).toContain('Último preço disponível:');
    expect(section).toContain('Preço indisponível para esta posição.');
    expect(section).toContain('do valor conhecido da carteira');
    expect(section).toContain('testID="position-unrealized"');
    expect(section).toContain('Resultado não realizado:');
    expect(section).toContain('Dados de mercado até');
  });

  it('shows realized disposals, income and bounded activity', () => {
    expect(section).toContain('VENDAS REALIZADAS');
    expect(section).toContain('RENDA RECEBIDA');
    expect(section).toContain('ATIVIDADE RECENTE');
    expect(section).toContain('testID="position-intelligence"');
  });

  it('states limitations factually with neutral copy', () => {
    expect(section).toContain('DADOS E LIMITAÇÕES');
    expect(section).toContain('O resultado detalhado por posição ainda não está disponível.');
    expect(section).toContain('describePositionLimitation');
  });

  it('offers no dead actions and no execution paths', () => {
    expect(section).not.toContain('onPress={() => {}}');
    expect(section).not.toMatch(/Comprar agora|Executar aporte|Enviar ordem|Comprar|Vender\b/);
    expect(section).not.toMatch(
      /você deveria|deve (investir|comprar|vender)|recomendamos|ideal|ótimo/i,
    );
  });

  it('uses explicit signs and text instead of color-only gains', () => {
    expect(section).toContain("'-' : '+'");
    expect(section).not.toMatch(/gainColor|isPositive|isNegative/);
  });
});
