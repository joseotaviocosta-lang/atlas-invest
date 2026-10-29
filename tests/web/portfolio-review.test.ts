import { describe, expect, it } from 'vitest';
import { describeReviewSignal, buildReviewSignalTitle, buildReviewSignalLines } from '@atlas/ui';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  summaryText,
  unwrapReview,
  portfolioReviewQueryKey,
  type PortfolioReviewDto,
} from '@/components/portfolio/PortfolioReviewSection';

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
      'STRATEGY_ALLOCATION_DEVIATION',
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
    expect(describeReviewSignal('STRATEGY_ALLOCATION_DEVIATION')).toMatchObject({
      label: 'Fora das metas definidas',
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

  it('builds titles for every signal family without advice', () => {
    expect(
      buildReviewSignalTitle({
        code: 'STRATEGY_ALLOCATION_DEVIATION',
        severity: 'REVIEW',
        evidence: { categoriesOutsideTarget: 3, worstDeviationBp: -800, worstCategory: 'CASH' },
      }),
    ).toBe('3 categorias fora das metas definidas');
    expect(
      buildReviewSignalTitle({
        code: 'STRATEGY_ALLOCATION_DEVIATION',
        severity: 'REVIEW',
        evidence: { categoriesOutsideTarget: 1, worstDeviationBp: 500, worstCategory: 'STOCK' },
      }),
    ).toBe('1 categoria fora das metas definidas');
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

  it('renders the strategy section inside the allocation tab', () => {
    expect(page).toContain('PortfolioStrategySection');
    expect(page).toContain("activeTab === 'allocation'");
    expect(page).not.toMatch(/tab\s*=\s*['"]strategy['"]/);
  });

  it('shows a compact strategy summary on Today only when off-target', () => {
    expect(today).toContain('Metas de alocação');
    expect(today).toContain('fora das metas definidas');
    expect(today).toContain('/portfolio?tab=allocation');
    expect(today).toContain('strategyOutsideCount > 0');
  });

  it('renders the strategy section with table, qualifier banner and no trade CTAs', () => {
    const section = fs.readFileSync(
      path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioStrategySection.tsx'),
      'utf8',
    );
    const labels = [
      'Ações',
      'Fundos Imobiliários (FIIs)',
      'ETFs',
      'BDRs',
      'Renda Fixa',
      'Tesouro Direto',
      'Fundos',
      'Caixa',
      'Outros',
    ];
    for (const label of labels) {
      expect(section).toContain(label);
    }
    expect(section).toContain('Definir metas');
    expect(section).toContain('As metas precisam totalizar 100%');
    expect(section).toContain('Remover metas');
    expect(section).toContain('Editar metas');
    expect(section).toContain('Salvar metas');
    expect(section).toContain('Desvios de até ±1 p.p. são considerados dentro da meta');
    expect(section).toContain('não realiza recomendações automáticas de investimento');
    expect(section).not.toMatch(/Rebalancear agora|Gerar ordens|Comprar|Vender/i);
    expect(section).toContain('parseLocalePercent');
    expect(section).not.toMatch(/parseFloat/);
  });

  it('links every signal card to a stable drill-down URL', () => {
    expect(section).toContain('/portfolio/review?portfolioId=');
    expect(section).toContain('signal=${signal.id}');
    expect(section).toContain('Ver detalhes');
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

describe('Hotfix: Empty portfolio & defensive review state handling', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PortfolioReviewSection.tsx'),
    'utf8',
  );
  const today = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/today/page.tsx'),
    'utf8',
  );
  const portfolioPage = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/page.tsx'),
    'utf8',
  );

  const mockBaseReview: PortfolioReviewDto = {
    portfolioId: 'port-123',
    asOf: { generatedAt: '2026-10-29T10:00:00.000Z', marketDataAsOf: null },
    summary: { attentionCount: 0, dataNote: null },
    dataQuality: {
      valuationCoveragePercent: '0',
      totalPositions: 0,
      valuedPositions: 0,
      unvaluedPositions: 0,
      stalePositions: 0,
      missingPrices: 0,
      reconciliation: { divergent: 0, missingLocal: 0, missingSource: 0, unresolved: 0 },
      partialRuns: 0,
      pendingReviews: 0,
    },
    signals: [],
    isEmpty: true,
  };

  describe('summaryText', () => {
    it('handles review undefined without runtime exception', () => {
      expect(summaryText(undefined)).toBe(
        'Sua carteira ainda não possui dados suficientes para gerar uma revisão.',
      );
    });

    it('handles review null without runtime exception', () => {
      expect(summaryText(null)).toBe(
        'Sua carteira ainda não possui dados suficientes para gerar uma revisão.',
      );
    });

    it('handles review with summary missing or null without exception', () => {
      const corruptReview = { ...mockBaseReview, summary: undefined } as unknown as PortfolioReviewDto;
      expect(summaryText(corruptReview)).toBe(
        'Sua carteira ainda não possui dados suficientes para gerar uma revisão.',
      );

      const nullSummaryReview = { ...mockBaseReview, summary: null } as unknown as PortfolioReviewDto;
      expect(summaryText(nullSummaryReview)).toBe(
        'Sua carteira ainda não possui dados suficientes para gerar uma revisão.',
      );
    });

    it('handles empty portfolio (isEmpty: true) by returning insufficient data copy', () => {
      const emptyReview: PortfolioReviewDto = {
        ...mockBaseReview,
        isEmpty: true,
        summary: { attentionCount: 0, dataNote: '0' },
      };
      expect(summaryText(emptyReview)).toBe(
        'Sua carteira ainda não possui dados suficientes para gerar uma revisão.',
      );
    });

    it('handles populated portfolio with attentionCount = 0 as no relevant items', () => {
      const populatedZeroReview: PortfolioReviewDto = {
        ...mockBaseReview,
        isEmpty: false,
        summary: { attentionCount: 0, dataNote: '100.00' },
      };
      expect(summaryText(populatedZeroReview)).toBe(
        'Nenhum ponto relevante identificado com os dados disponíveis.',
      );
    });

    it('handles populated portfolio with attentionCount = 1', () => {
      const populatedOneReview: PortfolioReviewDto = {
        ...mockBaseReview,
        isEmpty: false,
        summary: { attentionCount: 1, dataNote: '100.00' },
      };
      expect(summaryText(populatedOneReview)).toBe('1 ponto merece revisão.');
    });

    it('handles populated portfolio with attentionCount > 1', () => {
      const populatedManyReview: PortfolioReviewDto = {
        ...mockBaseReview,
        isEmpty: false,
        summary: { attentionCount: 4, dataNote: '85.00' },
      };
      expect(summaryText(populatedManyReview)).toBe('4 pontos merecem revisão.');
    });
  });

  describe('unwrapReview', () => {
    it('unwraps direct PortfolioReviewDto object', () => {
      const result = unwrapReview(mockBaseReview);
      expect(result).toBe(mockBaseReview);
    });

    it('unwraps nested { data: PortfolioReviewDto } envelope from cache or Axios response', () => {
      const wrapped = { data: mockBaseReview };
      const result = unwrapReview(wrapped);
      expect(result).toEqual(mockBaseReview);
    });

    it('returns null on null or undefined input', () => {
      expect(unwrapReview(null)).toBeNull();
      expect(unwrapReview(undefined)).toBeNull();
    });

    it('returns null on non-review objects without summary', () => {
      expect(unwrapReview({ foo: 'bar' })).toBeNull();
      expect(unwrapReview({ data: { foo: 'bar' } })).toBeNull();
    });
  });

  describe('query key and cache contract harmonization', () => {
    it('produces identical query keys between portfolio review section and today page', () => {
      expect(portfolioReviewQueryKey('port-abc')).toEqual(['portfolio-review', 'port-abc']);
      expect(today).toContain('portfolioReviewQueryKey');
      expect(today).toContain('unwrapReview');
      expect(section).toContain('unwrapReview');
    });
  });

  describe('semantic empty state classification and actionable CTAs', () => {
    it('distinguishes NO_REVIEW_DATA / empty portfolio from zero attention in the review section', () => {
      // Empty / no review state
      expect(section).toContain('Nenhuma revisão disponível');
      expect(section).toContain(
        'Sua carteira ainda não possui dados suficientes para gerar uma revisão. Adicione ou importe investimentos para começar.',
      );
      // Actionable CTAs
      expect(section).toContain('Importar investimentos');
      expect(section).toContain('/portfolio/import?portfolioId=');
      expect(section).toContain('Adicionar operação');
      expect(section).toContain('/portfolio?tab=operations&portfolioId=');

      // Populated with 0 attention
      expect(section).toContain('Nenhum ponto relevante identificado');
      expect(section).toContain('Com os dados disponíveis, não há itens que precisem da sua atenção.');
    });

    it('renders PortfolioReviewSection cleanly on the portfolio page', () => {
      expect(portfolioPage).toContain('<PortfolioReviewSection portfolioId={activePortfolio.id} />');
    });
  });
});
