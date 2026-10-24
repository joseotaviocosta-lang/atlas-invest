import { describe, expect, it } from 'vitest';
import { describeReviewLimitation, describeReviewRule, describeReviewTrend } from '@atlas/ui';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-B (web) — drill-down surface contract.
 *
 * Each signal opens a stable deep link (?signal=CODE&period=) showing the
 * same current evidence as the overview, an explanation of the heuristic,
 * real historical evidence when the source supports it (never invented),
 * neutral trends, explicit limitations and one navigation CTA.
 */
describe('Phase 5Q-B (web): review drill-down', () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/review/page.tsx'),
    'utf8',
  );

  it('explains rules without advising, judging or predicting', () => {
    for (const code of [
      'DATA_VALUATION_COVERAGE',
      'DATA_RECONCILIATION_DIVERGENCE',
      'INTEGRATION_PENDING_REVIEW',
      'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
      'PERFORMANCE_BENCHMARK_GAP',
      'PERFORMANCE_BENCHMARK_UNAVAILABLE',
      'INCOME_RECEIVED',
    ]) {
      expect(describeReviewRule(code).length).toBeGreaterThan(0);
    }
    expect(describeReviewRule('ALLOCATION_SINGLE_ASSET_CONCENTRATION')).toContain('25%');
    expect(describeReviewRule('NOPE')).toContain('determinísticas');
    const all = [
      describeReviewRule('DATA_VALUATION_COVERAGE'),
      describeReviewRule('ALLOCATION_SINGLE_ASSET_CONCENTRATION'),
      describeReviewRule('PERFORMANCE_BENCHMARK_GAP'),
      describeReviewRule('INCOME_RECEIVED'),
    ].join(' ');
    expect(all).not.toMatch(
      /você deve|recomendamos|deveria|boa carteira|carteira ruim|vai subir|vai cair|garantid[oa]/i,
    );
  });

  it('names trends neutrally and limitations explicitly', () => {
    expect(describeReviewTrend('INCREASED')).toEqual({ label: 'Em alta', tone: 'info' });
    expect(describeReviewTrend('DECREASED')).toEqual({ label: 'Em queda', tone: 'info' });
    expect(describeReviewTrend('STABLE')).toEqual({ label: 'Estável', tone: 'neutral' });
    expect(describeReviewTrend('INSUFFICIENT_DATA')).toEqual({
      label: 'Sem dados suficientes',
      tone: 'neutral',
    });
    expect(describeReviewLimitation('NO_HISTORICAL_SOURCE')).toContain('snapshot atual');
    expect(describeReviewLimitation('WINDOW_TRUNCATED')).toContain('janela');
  });

  it('renders header, explanation, period selector, history, limitations and navigation', () => {
    expect(page).toContain('Por que estou vendo isso?');
    expect(page).toContain('Como evoluiu');
    expect(page).toContain('Dados usados');
    expect(page).toContain('Limitações');
    expect(page).toContain('Voltar para a carteira');
    expect(page).toContain('period=${period}');
    expect(page).toContain('aria-label={`Analisar período');
    expect(page).toContain('minHeight: 44');
    const section = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioReviewSection.tsx'),
      'utf8',
    );
    expect(section).toContain('signal=${signal.id}');
  });

  it('offers every supported preset and stays on 1A by default', () => {
    for (const preset of ['1M', '3M', '6M', 'YTD', '1A', 'INCEPTION']) {
      expect(page).toContain(`id: '${preset}'`);
    }
    expect(page).toContain("searchParams.get('period') ?? '1A'");
    expect(page).not.toMatch(/CUSTOM/);
  });

  it('reuses the existing chart for gap history with accessible fallback text', () => {
    expect(page).toContain('PerformanceSeriesChart');
    const chart = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PerformanceSeriesChart.tsx'),
      'utf8',
    );
    expect(chart).toContain('role="img"');
    expect(page).toContain('Histórico indisponível para este indicador');
  });

  it('renders the strategy comparison table with an explicit no-history limitation', () => {
    expect(page).toContain('TABLE_COMPARISON');
    expect(page).toContain('Categoria');
    expect(page).toContain('Desvio');
    expect(page).toContain('Comparação com o snapshot atual');
  });

  it('keeps copy advice-free on the detail surface', () => {
    const section = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioReviewSection.tsx'),
      'utf8',
    );
    for (const content of [page, section]) {
      expect(content).not.toMatch(
        /você deve (comprar|vender)|recomendamos|rebalanceie|boa carteira|carteira ruim|vai subir|vai cair|garantid[oa]|saudável|tudo perfeito|recomendação de investimento|Gerar ordens|Comprar|Vender/i,
      );
    }
  });
});
