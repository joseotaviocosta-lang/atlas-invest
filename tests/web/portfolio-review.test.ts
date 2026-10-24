import { describe, expect, it } from 'vitest';
import { describeReviewSignal, buildReviewSignalTitle, buildReviewSignalLines } from '@atlas/ui';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Phase 5Q-A — review presentation contract (pure view-model + web surface).
 *
 * Every signal code maps to human pt-BR copy with tone; titles and lines
 * are built from evidence only. Severity is text-labeled, never color-only.
 * No advice, no predictions, no guarantees anywhere in the surface.
 */
describe('Phase 5Q-A: review presentation', () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/page.tsx'),
    'utf8',
  );
  const today = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/today/page.tsx'),
    'utf8',
  );
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioReviewSection.tsx'),
    'utf8',
  );

  it('maps every signal code to human copy with tone', () => {
    const codes = [
      'DATA_VALUATION_COVERAGE',
      'DATA_RECONCILIATION_DIVERGENCE',
      'INTEGRATION_PENDING_REVIEW',
      'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
      'PERFORMANCE_BENCHMARK_GAP',
      'PERFORMANCE_BENCHMARK_UNAVAILABLE',
      'INCOME_RECEIVED',
    ];
    for (const code of codes) {
      const presentation = describeReviewSignal(code);
      expect(presentation.label.trim().length).toBeGreaterThan(0);
      expect(presentation.description.trim().length).toBeGreaterThan(0);
      expect(['neutral', 'info', 'success', 'warning', 'danger']).toContain(presentation.tone);
    }
    expect(describeReviewSignal('ALLOCATION_SINGLE_ASSET_CONCENTRATION')).toMatchObject({
      label: 'Concentração elevada',
      tone: 'warning',
    });
    expect(describeReviewSignal('NOPE').label).toBe('Ponto de atenção');
  });

  it('builds titles from evidence without advice or predictions', () => {
    expect(
      buildReviewSignalTitle({
        code: 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
        severity: 'REVIEW',
        evidence: { ticker: 'PETR4', weightPercent: '31.42' },
      }),
    ).toBe('PETR4 representa 31,42% do valor conhecido da carteira');
    expect(
      buildReviewSignalTitle({
        code: 'INTEGRATION_PENDING_REVIEW',
        severity: 'REVIEW',
        evidence: { pendingReviewCount: 1 },
      }),
    ).toBe('1 importação aguarda revisão');
    expect(
      buildReviewSignalTitle({
        code: 'DATA_VALUATION_COVERAGE',
        severity: 'INFO',
        evidence: { valuedPositions: 3, totalPositions: 4, coveragePercent: '87.40' },
      }),
    ).toBe('3 de 4 posições com cotação atualizada (87,40% da carteira)');
    expect(
      buildReviewSignalTitle({
        code: 'PERFORMANCE_BENCHMARK_GAP',
        severity: 'REVIEW',
        evidence: { worstBenchmark: 'IBOV', worstGapPercentagePoints: '-4.20' },
      }),
    ).toBe('-4,20 p.p. abaixo de IBOV no período');
    expect(
      buildReviewSignalTitle({
        code: 'NOPE',
        severity: 'INFO',
        evidence: {},
      }),
    ).toBe('Um ponto da carteira merece revisão');
  });

  it('builds evidence lines with counts and qualifiers, never prose conclusions', () => {
    const lines = buildReviewSignalLines({
      code: 'DATA_RECONCILIATION_DIVERGENCE',
      severity: 'WARNING',
      evidence: { divergent: 2, missingLocal: 0, missingSource: 1, unresolved: 0 },
    });
    expect(lines.map((line) => line.text)).toEqual([
      '2 com quantidade diferente',
      '1 na fonte e fora da carteira',
    ]);
    const concentration = buildReviewSignalLines({
      code: 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
      severity: 'REVIEW',
      evidence: { thresholdPercent: '25', coveragePercent: '87.40', concentratedPositions: 2 },
    });
    expect(concentration.map((line) => line.text)).toEqual([
      'Limite de atenção: 25,00% por ativo.',
      'Cálculo sobre 87,40% com preço disponível.',
      '2 ativos acima do limite de atenção. Mostrando o maior.',
    ]);
  });

  it('renders the review section inside portfolio overview, not as a new tab', () => {
    expect(page).toContain('PortfolioReviewSection');
    expect(page).not.toMatch(/tab\s*=\s*['"]review['"]/);
    const engine = fs.readFileSync(
      path.join(process.cwd(), 'packages/portfolio-review/src/derive-review.ts'),
      'utf8',
    );
    expect(engine).toContain('/portfolio?tab=allocation&portfolioId=');
    expect(engine).toContain('/portfolio/performance?portfolioId=');
    expect(engine).toContain('/portfolio/income?portfolioId=');
    expect(engine).toContain('/reviews?portfolioId=');
    expect(engine).toContain("'Ver alocação'");
    expect(engine).toContain("'Ver performance'");
    expect(engine).toContain("'Ver proventos'");
    expect(engine).toContain("'Revisar importações'");
    expect(section).toContain('Revisão da carteira');
    // Header CTA is the only hardcoded link (reviews hub); card CTAs render from server data.
    expect(section).toContain('Ver pendências');
    expect(section).toContain('/reviews?portfolioId=');
    expect(section).toContain('signal.action.href');
    expect(section).toContain('signal.action.label');
  });

  it('covers empty, partial and error states with honest copy', () => {
    expect(section).toContain('Nenhum ponto relevante identificado');
    expect(section).toContain('Adicionar operação');
    expect(section).toContain('consideram apenas o valor com preço disponível');
    expect(section).toContain('Não foi possível carregar a revisão');
    expect(section).toContain('onRetry');
  });

  it('today shows a compact summary only when attention exists', () => {
    expect(today).toContain('Revisão da carteira');
    expect(today).toContain('Ver revisão');
    expect(today).toContain('reviewAttentionCount > 0');
    expect(today).toContain('/portfolio?portfolioId=');
  });

  it('keeps controls accessible with touch targets', () => {
    expect(section).toContain('minHeight: 44');
    expect(section).toContain('aria-label');
    expect(today).toContain('aria-label="Ver revisão da carteira"');
  });

  it('contains no advice, predictions or guarantees in UI copy', () => {
    for (const content of [page, today, section]) {
      expect(content).not.toMatch(
        /você deve (comprar|vender)|recomendamos (comprar|vender)|melhor investimento|rentabilidade garantida|vai subir|vai cair|carteira saudável|tudo perfeito/i,
      );
    }
  });

  it('never mixes floats into presentation math', () => {
    expect(section).not.toMatch(/parseFloat|Math\.pow|Math\.sqrt/);
  });
});
