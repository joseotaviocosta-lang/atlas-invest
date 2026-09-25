import { describe, it, expect } from 'vitest';
import {
  CLAIM_SCHEMA_VERSION,
  CLAIM_POLICY_VERSION,
  GROUNDED_CLAIM_TYPES,
  CLAIM_CATEGORY_COMPATIBILITY,
  PORTFOLIO_AI_CLAIM_POLICY_V1,
  formatFactValueForDisplay,
  formatFactLabelForDisplay,
  validateGroundedClaims,
  renderValidatedClaims,
  GroundedClaimInput,
  GroundedFinancialFact,
  MinimalEvidenceSnapshotFact,
} from '@atlas/ai-engine';

describe('AI Engine: Grounded Claim Validation & Citation Integrity (Phase 3T)', () => {
  describe('Constants and Policy Contract', () => {
    it('declares frozen schema and policy versions', () => {
      expect(CLAIM_SCHEMA_VERSION).toBe('1');
      expect(CLAIM_POLICY_VERSION).toBe('1');
    });

    it('defines exactly the 7 canonical GroundedClaimTypes', () => {
      expect(GROUNDED_CLAIM_TYPES).toEqual([
        'FACTUAL_METRIC',
        'BENCHMARK_COMPARISON',
        'RISK_EXPLANATION',
        'SCENARIO_EXPLANATION',
        'DATA_QUALITY',
        'LIMITATION',
        'CONTEXTUAL_EXPLANATION',
      ]);
    });

    it('enforces strict category compatibility mapping', () => {
      expect(CLAIM_CATEGORY_COMPATIBILITY.SCENARIO_EXPLANATION).toEqual(['SCENARIO']);
      expect(CLAIM_CATEGORY_COMPATIBILITY.DATA_QUALITY).toEqual(['OVERVIEW']);
      expect(CLAIM_CATEGORY_COMPATIBILITY.BENCHMARK_COMPARISON).toContain('BENCHMARK');
      expect(CLAIM_CATEGORY_COMPATIBILITY.BENCHMARK_COMPARISON).toContain('RELATIVE_RISK');
      expect(CLAIM_CATEGORY_COMPATIBILITY.RISK_EXPLANATION).toContain('RISK');
      expect(CLAIM_CATEGORY_COMPATIBILITY.RISK_EXPLANATION).toContain('TAIL_RISK');
    });

    it('contains strict policy directives in PORTFOLIO_AI_CLAIM_POLICY_V1', () => {
      expect(PORTFOLIO_AI_CLAIM_POLICY_V1).toContain('VALIDAÇÃO ESTRUTURAL DE CLAIMS');
      expect(PORTFOLIO_AI_CLAIM_POLICY_V1).toContain('VALOR CANÔNICO VEM DO SERVIDOR');
      expect(PORTFOLIO_AI_CLAIM_POLICY_V1).toContain('FACT_VALUE');
      expect(PORTFOLIO_AI_CLAIM_POLICY_V1).toContain('ZERO RECOMENDAÇÃO');
      expect(PORTFOLIO_AI_CLAIM_POLICY_V1).toContain('ZERO PREVISÃO');
      expect(PORTFOLIO_AI_CLAIM_POLICY_V1).toContain('ZERO RECÁLCULO');
      expect(PORTFOLIO_AI_CLAIM_POLICY_V1).toContain('ISOLAMENTO CAMBIAL');
    });
  });

  describe('Fact Value Display Formatting (formatFactValueForDisplay)', () => {
    it('formats MONEY with currency prefix and exact pt-BR decimal strings', () => {
      const fact: GroundedFinancialFact = {
        factId: 'BRL.OVERVIEW.MARKET_VALUE',
        category: 'OVERVIEW',
        scope: 'BRL',
        metric: 'CURRENT_MARKET_VALUE',
        value: '1234567.89',
        unit: 'MONEY',
        currency: 'BRL',
        nature: 'POINT_IN_TIME',
        status: 'AVAILABLE',
        source: {
          contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
          path: 'overview.currentMarketValue',
        },
      };

      expect(formatFactValueForDisplay(fact)).toBe('BRL 1.234.567,89');
    });

    it('formats negative MONEY correctly', () => {
      const fact: MinimalEvidenceSnapshotFact = {
        factId: 'BRL.OVERVIEW.TOTAL_PROFIT_LOSS',
        category: 'OVERVIEW',
        scope: 'BRL',
        metric: 'TOTAL_PROFIT_LOSS',
        value: '-1250.50',
        unit: 'MONEY',
        nature: 'POINT_IN_TIME',
        status: 'AVAILABLE',
      };

      expect(formatFactValueForDisplay(fact)).toBe('BRL -1.250,50');
    });

    it('formats PERCENTAGE with % sign and pt-BR comma', () => {
      const fact: GroundedFinancialFact = {
        factId: 'BRL.PERFORMANCE.TWR',
        category: 'PERFORMANCE',
        scope: 'BRL',
        metric: 'TWR',
        value: '14.25',
        unit: 'PERCENTAGE',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'performance.twr' },
      };

      expect(formatFactValueForDisplay(fact)).toBe('14,25%');
    });

    it('formats PERCENTAGE_POINTS with p.p. suffix and never %', () => {
      const factPositive: GroundedFinancialFact = {
        factId: 'BRL.BENCHMARK.RELATIVE_RETURN_IBOV',
        category: 'RELATIVE_RISK',
        scope: 'BRL',
        metric: 'RELATIVE_RETURN',
        value: '4.20',
        unit: 'PERCENTAGE_POINTS',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'relative.diff' },
      };
      expect(formatFactValueForDisplay(factPositive)).toBe('+4,20 p.p.');
      expect(formatFactValueForDisplay(factPositive)).not.toContain('%');

      const factNegative: GroundedFinancialFact = {
        factId: 'BRL.BENCHMARK.RELATIVE_RETURN_CDI',
        category: 'RELATIVE_RISK',
        scope: 'BRL',
        metric: 'RELATIVE_RETURN',
        value: '-1.85',
        unit: 'PERCENTAGE_POINTS',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'relative.diff' },
      };
      expect(formatFactValueForDisplay(factNegative)).toBe('-1,85 p.p.');
      expect(formatFactValueForDisplay(factNegative)).not.toContain('%');
    });

    it('formats RATIO as unitless decimal and NEVER %', () => {
      const factSharpe: GroundedFinancialFact = {
        factId: 'BRL.RISK_ADJUSTED.SHARPE',
        category: 'RISK_ADJUSTED',
        scope: 'BRL',
        metric: 'SHARPE_RATIO',
        value: '1.45',
        unit: 'RATIO',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'riskAdjusted.sharpe' },
      };
      expect(formatFactValueForDisplay(factSharpe)).toBe('1,45');
      expect(formatFactValueForDisplay(factSharpe)).not.toContain('%');

      const factBeta: GroundedFinancialFact = {
        factId: 'BRL.RELATIVE_RISK.BETA_IBOV',
        category: 'RELATIVE_RISK',
        scope: 'BRL',
        metric: 'BETA',
        value: '-0.12',
        unit: 'RATIO',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'relativeRisk.beta' },
      };
      expect(formatFactValueForDisplay(factBeta)).toBe('-0,12');
      expect(formatFactValueForDisplay(factBeta)).not.toContain('%');
    });

    it('formats COUNT as integer string', () => {
      const fact: GroundedFinancialFact = {
        factId: 'BRL.OVERVIEW.POSITION_COUNT',
        category: 'OVERVIEW',
        scope: 'BRL',
        metric: 'POSITION_COUNT',
        value: '12',
        unit: 'COUNT',
        nature: 'POINT_IN_TIME',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'overview.count' },
      };
      expect(formatFactValueForDisplay(fact)).toBe('12');
    });

    it('renders em-dash (—) for null value or UNAVAILABLE status', () => {
      const factNull: GroundedFinancialFact = {
        factId: 'BRL.RISK.VOLATILITY',
        category: 'RISK',
        scope: 'BRL',
        metric: 'VOLATILITY',
        value: null,
        unit: 'PERCENTAGE',
        nature: 'PERIOD',
        status: 'PARTIAL',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'risk.vol' },
      };
      expect(formatFactValueForDisplay(factNull)).toBe('—');

      const factUnavailable: GroundedFinancialFact = {
        factId: 'BRL.RISK.VAR_95',
        category: 'TAIL_RISK',
        scope: 'BRL',
        metric: 'VAR_95',
        value: '10.5',
        unit: 'PERCENTAGE',
        nature: 'HISTORICAL',
        status: 'UNAVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'tailRisk.var' },
      };
      expect(formatFactValueForDisplay(factUnavailable)).toBe('—');
    });
  });

  describe('Fact Label Display Formatting (formatFactLabelForDisplay)', () => {
    it('translates canonical metric keys to clean pt-BR titles', () => {
      const f1: MinimalEvidenceSnapshotFact = {
        factId: 'BRL.PERFORMANCE.TWR',
        category: 'PERFORMANCE',
        metric: 'TWR',
        scope: 'BRL',
        value: '10',
        unit: 'PERCENTAGE',
        nature: 'PERIOD',
        status: 'AVAILABLE',
      };
      expect(formatFactLabelForDisplay(f1)).toBe('Rentabilidade (TWR)');

      const f2: MinimalEvidenceSnapshotFact = {
        factId: 'BRL.RISK_ADJUSTED.SHARPE',
        category: 'RISK_ADJUSTED',
        metric: 'SHARPE_RATIO',
        scope: 'BRL',
        value: '1.2',
        unit: 'RATIO',
        nature: 'PERIOD',
        status: 'AVAILABLE',
      };
      expect(formatFactLabelForDisplay(f2)).toBe('Índice de Sharpe');
    });
  });

  describe('Deterministic Claim Validation (validateGroundedClaims)', () => {
    const mockFacts: GroundedFinancialFact[] = [
      {
        factId: 'BRL.OVERVIEW.MARKET_VALUE',
        category: 'OVERVIEW',
        scope: 'BRL',
        metric: 'CURRENT_MARKET_VALUE',
        value: '100000.00',
        unit: 'MONEY',
        currency: 'BRL',
        nature: 'POINT_IN_TIME',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'overview.mv' },
      },
      {
        factId: 'BRL.PERFORMANCE.TWR',
        category: 'PERFORMANCE',
        scope: 'BRL',
        metric: 'TWR',
        value: '12.50',
        unit: 'PERCENTAGE',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'perf.twr' },
      },
      {
        factId: 'IBOV.BENCHMARK.RETURN',
        category: 'BENCHMARK',
        scope: 'BRL',
        metric: 'RETURN',
        value: '8.25',
        unit: 'PERCENTAGE',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'bench.ibov' },
      },
      {
        factId: 'BRL.BENCHMARK.RELATIVE_RETURN_IBOV',
        category: 'RELATIVE_RISK',
        scope: 'BRL',
        metric: 'RELATIVE_RETURN',
        value: '4.25',
        unit: 'PERCENTAGE_POINTS',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'relative.diff' },
      },
      {
        factId: 'BRL.RISK.VOLATILITY',
        category: 'RISK',
        scope: 'BRL',
        metric: 'VOLATILITY',
        value: '18.10',
        unit: 'PERCENTAGE',
        nature: 'HISTORICAL',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'risk.vol' },
      },
      {
        factId: 'BRL.SCENARIO.COVID_CRASH',
        category: 'SCENARIO',
        scope: 'BRL',
        metric: 'ESTIMATED_IMPACT',
        value: '-22.40',
        unit: 'PERCENTAGE',
        nature: 'HYPOTHETICAL',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'scenario.covid' },
      },
      {
        factId: 'USD.OVERVIEW.MARKET_VALUE',
        category: 'OVERVIEW',
        scope: 'USD',
        metric: 'CURRENT_MARKET_VALUE',
        value: '5000.00',
        unit: 'MONEY',
        currency: 'USD',
        nature: 'POINT_IN_TIME',
        status: 'AVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'overview.mv' },
      },
      {
        factId: 'BRL.TAIL_RISK.VAR_95',
        category: 'TAIL_RISK',
        scope: 'BRL',
        metric: 'VAR_95',
        value: null,
        unit: 'PERCENTAGE',
        nature: 'HISTORICAL',
        status: 'UNAVAILABLE',
        source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: 'tail.var' },
      },
    ];

    const context = { facts: mockFacts };

    it('successfully validates and renders valid structured claims', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'claim-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [
            { type: 'TEXT', text: 'A rentabilidade da carteira no período foi de ' },
            { type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' },
            { type: 'TEXT', text: '.' },
          ],
        },
        {
          claimId: 'claim-2',
          type: 'BENCHMARK_COMPARISON',
          factIds: ['IBOV.BENCHMARK.RETURN', 'BRL.BENCHMARK.RELATIVE_RETURN_IBOV'],
          segments: [
            { type: 'TEXT', text: 'O IBOV rendeu ' },
            { type: 'FACT_VALUE', factId: 'IBOV.BENCHMARK.RETURN', role: 'BENCHMARK' },
            { type: 'TEXT', text: ', com retorno relativo de ' },
            { type: 'FACT_VALUE', factId: 'BRL.BENCHMARK.RELATIVE_RETURN_IBOV' },
            { type: 'TEXT', text: '.' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(true);
      expect(res.invalidReasons).toHaveLength(0);
      expect(res.validatedClaims).toHaveLength(2);
      expect(res.validatedClaims[0]!.renderedText).toBe(
        'A rentabilidade da carteira no período foi de 12,50%.',
      );
      expect(res.validatedClaims[1]!.renderedText).toBe(
        'O IBOV rendeu 8,25%, com retorno relativo de +4,25 p.p..',
      );

      const renderedAnswer = renderValidatedClaims(res.validatedClaims);
      expect(renderedAnswer).toBe(
        'A rentabilidade da carteira no período foi de 12,50%. O IBOV rendeu 8,25%, com retorno relativo de +4,25 p.p..',
      );
    });

    it('fails closed when input claims list is empty', () => {
      const res = validateGroundedClaims([], context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('MISSING_CLAIMS');
    });

    it('fails closed when claims exceed maximum limit (25)', () => {
      const excessiveClaims: GroundedClaimInput[] = Array.from({ length: 26 }, (_, i) => ({
        claimId: `claim-${i + 1}`,
        type: 'FACTUAL_METRIC',
        factIds: ['BRL.PERFORMANCE.TWR'],
        segments: [{ type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' }],
      }));

      const res = validateGroundedClaims(excessiveClaims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('EXCESSIVE_CLAIMS');
    });

    it('fails closed when duplicate claimId is provided', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'same-id',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [{ type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' }],
        },
        {
          claimId: 'same-id',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [{ type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' }],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons.some((r) => r.includes('DUPLICATE_CLAIM_ID'))).toBe(true);
    });

    it('fails closed when text segment contains prohibited recommendation language', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'rec-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [
            {
              type: 'TEXT',
              text: 'Recomendo que você compre mais ativos pois a rentabilidade foi de ',
            },
            { type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('PROHIBITED_ADVICE');
    });

    it('fails closed when text segment contains prohibited prediction language', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'pred-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [
            { type: 'TEXT', text: 'A projeção de retorno futuro é positiva, com taxa de ' },
            { type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('PROHIBITED_PREDICTION');
    });

    it('fails closed when model types raw percentage literals into TEXT segments (injection prevention)', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'literal-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [
            { type: 'TEXT', text: 'A carteira rendeu 18.5% no período analisado.' },
            { type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('EMBEDDED_FINANCIAL_LITERAL');
    });

    it('fails closed when model types raw monetary literals into TEXT segments', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'money-literal-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.OVERVIEW.MARKET_VALUE'],
          segments: [
            { type: 'TEXT', text: 'O investidor possui R$ 500000 alocados: ' },
            { type: 'FACT_VALUE', factId: 'BRL.OVERVIEW.MARKET_VALUE' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('EMBEDDED_MONEY_LITERAL');
    });

    it('fails closed when cited factId does not exist in grounding context', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'unknown-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.UNKNOWN_METRIC'],
          segments: [
            { type: 'TEXT', text: 'Resultado: ' },
            { type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.UNKNOWN_METRIC' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('UNKNOWN_FACT_ID');
    });

    it('fails closed when FACT_VALUE references UNAVAILABLE or null fact', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'unavail-1',
          type: 'RISK_EXPLANATION',
          factIds: ['BRL.TAIL_RISK.VAR_95'],
          segments: [
            { type: 'TEXT', text: 'O VaR 95% calculado foi de ' },
            { type: 'FACT_VALUE', factId: 'BRL.TAIL_RISK.VAR_95' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('UNAVAILABLE_FACT_VALUE');
    });

    it('fails closed when fact category is incompatible with claim type', () => {
      // SCENARIO_EXPLANATION can only cite SCENARIO category facts
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'incompat-1',
          type: 'SCENARIO_EXPLANATION',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [
            { type: 'TEXT', text: 'No cenário de estresse o retorno foi ' },
            { type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('INCOMPATIBLE_FACT_CATEGORY');
    });

    it('fails closed when scenario explanation cites non-hypothetical facts', () => {
      // BRL.RISK.VOLATILITY is HISTORICAL, not HYPOTHETICAL
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'nature-1',
          type: 'SCENARIO_EXPLANATION',
          factIds: ['BRL.RISK.VOLATILITY'],
          segments: [
            { type: 'TEXT', text: 'Impacto hipotético: ' },
            { type: 'FACT_VALUE', factId: 'BRL.RISK.VOLATILITY' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('INCOMPATIBLE_FACT_CATEGORY');
    });

    it('fails closed when a single claim mixes multiple currencies (zero implicit FX)', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'fx-mix-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.OVERVIEW.MARKET_VALUE', 'USD.OVERVIEW.MARKET_VALUE'],
          segments: [
            { type: 'TEXT', text: 'Patrimônio BRL é ' },
            { type: 'FACT_VALUE', factId: 'BRL.OVERVIEW.MARKET_VALUE' },
            { type: 'TEXT', text: ' e USD é ' },
            { type: 'FACT_VALUE', factId: 'USD.OVERVIEW.MARKET_VALUE' },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('CROSS_CURRENCY_CLAIM_PROHIBITED');
    });

    it('fails closed when factual claim lacks at least one FACT_VALUE segment', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'no-fact-val',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [{ type: 'TEXT', text: 'A carteira teve boa rentabilidade geral.' }],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(false);
      expect(res.invalidReasons[0]).toContain('MISSING_FACT_VALUE');
    });

    it('validates contextual and limitation claims without requiring FACT_VALUE segments', () => {
      const claims: GroundedClaimInput[] = [
        {
          claimId: 'limit-1',
          type: 'LIMITATION',
          segments: [
            {
              type: 'TEXT',
              text: 'A métrica de VaR 95% não pôde ser calculada devido a histórico insuficiente.',
            },
          ],
        },
        {
          claimId: 'ctx-1',
          type: 'CONTEXTUAL_EXPLANATION',
          segments: [
            {
              type: 'TEXT',
              text: 'Os cálculos consideram as operações registradas no livro de ordens.',
            },
          ],
        },
      ];

      const res = validateGroundedClaims(claims, context);
      expect(res.valid).toBe(true);
      expect(res.invalidReasons).toHaveLength(0);
      expect(res.validatedClaims).toHaveLength(2);
      expect(res.validatedClaims[0]!.status).toBe('VALID');
      expect(res.validatedClaims[1]!.status).toBe('VALID');
    });
  });
});
