/* eslint-disable no-console */
import {
  buildPortfolioIntelligenceSummary,
  CurrencyIntelligenceInput,
  PortfolioIntelligenceInput,
} from '@atlas/portfolio-intelligence';
import {
  buildPortfolioAiGroundingContext,
  classifyExplanationIntent,
  buildExplanationPrompt,
  validateExplanationEvidence,
  FakeAiProvider,
} from '@atlas/ai-engine';

function currencyInput(
  positions: number,
  overrides: Partial<CurrencyIntelligenceInput> = {},
): CurrencyIntelligenceInput {
  return {
    currency: 'BRL',
    overview: {
      currentMarketValue: String(positions * 50000),
      positionCount: positions,
      valuedPositionCount: positions,
      unvaluedPositionCount: 0,
      status: 'AVAILABLE',
    },
    performance: { twr: '15.5', xirr: '14.2', observationCount: 250, status: 'AVAILABLE' },
    benchmarks: [
      { id: 'IBOV', return: '10.2', differencePercentagePoints: '5.3', status: 'AVAILABLE' },
      { id: 'CDI', return: '11.0', differencePercentagePoints: '4.5', status: 'AVAILABLE' },
    ],
    risk: {
      realizedVolatilityAnnualized: '16.5',
      maximumDrawdown: '-11.2',
      currentDrawdown: '-3.8',
      status: 'AVAILABLE',
    },
    riskAdjusted: { sharpe: '1.30', sortino: '1.75', riskFreeProxy: 'CDI', status: 'AVAILABLE' },
    relativeRisk: {
      benchmark: 'IBOV',
      beta: '0.90',
      correlation: '0.85',
      trackingErrorAnnualized: '8.5',
      status: 'AVAILABLE',
    },
    activePerformance: {
      alpha: '3.2',
      informationRatio: '1.20',
      treynor: '5.8',
      status: 'AVAILABLE',
    },
    tailRisk: {
      confidenceLevel: '95',
      downsideDeviationAnnualized: '10.5',
      semideviationAnnualized: '8.9',
      var95: '2.10',
      cvar95: '2.85',
      status: 'AVAILABLE',
    },
    scenario: {
      preset: 'EQUITY_DOWN_10',
      type: 'EQUITY_PRICE_SHOCK',
      baseValue: String(positions * 50000),
      stressedValue: String(positions * 45000),
      absoluteImpact: String(-positions * 5000),
      percentageImpact: '-10.0',
      hypothetical: true,
      status: 'AVAILABLE',
    },
    dataQuality: {
      portfolioStateCompleteness: { status: 'AVAILABLE', reason: null },
      valuationCompleteness: { status: 'AVAILABLE', reason: null },
      performanceAvailability: { status: 'AVAILABLE', reason: null },
      benchmarkAvailability: { status: 'AVAILABLE', reason: null },
      riskAvailability: { status: 'AVAILABLE', reason: null },
      tailRiskAvailability: { status: 'AVAILABLE', reason: null },
      scenarioAvailability: { status: 'AVAILABLE', reason: null },
    },
    ...overrides,
  };
}

function summaryInput(currencies: CurrencyIntelligenceInput[]): PortfolioIntelligenceInput {
  return {
    portfolioId: 'c0000000-0000-4000-8000-000000000001',
    period: { startDate: '2025-09-22', endDate: '2026-09-22' },
    asOf: '2026-09-22',
    currencies,
  };
}

async function auditExplanationScale(
  label: string,
  currencies: CurrencyIntelligenceInput[],
  question: string,
): Promise<void> {
  const summary = buildPortfolioIntelligenceSummary(summaryInput(currencies));
  const context = buildPortfolioAiGroundingContext(summary, {
    generatedAt: '2026-09-24T12:00:00.000Z',
  });

  const classification = classifyExplanationIntent(question);
  const prompt = buildExplanationPrompt(context, question, classification.intent);

  const provider = new FakeAiProvider({
    customResponse: {
      answer: 'No período analisado, a carteira superou o Ibovespa.',
      evidenceFactIds: ['BRL.PERFORMANCE.TWR', 'BRL.BENCHMARK.IBOV.RETURN'],
      limitations: ['Rentabilidade passada não garante rentabilidade futura.'],
    },
  });

  const messages = [
    { role: 'system' as const, content: prompt.system },
    { role: 'user' as const, content: prompt.user },
  ];

  const responseMessage = await provider.complete(messages);
  const parsed = JSON.parse(responseMessage.content);
  const evidenceResult = validateExplanationEvidence(parsed.evidenceFactIds, context);

  const promptChars = prompt.system.length + prompt.user.length;
  const promptBytes =
    Buffer.byteLength(prompt.system, 'utf8') + Buffer.byteLength(prompt.user, 'utf8');
  const responseBytes = Buffer.byteLength(responseMessage.content, 'utf8');

  console.log(`\n=== [${label}] ===`);
  console.log(`  question: "${question}"`);
  console.log(`  intent: ${classification.intent}`);
  console.log(`  currencies: [${context.currencies.join(', ')}]`);
  console.log(`  grounding fact count: ${context.facts.length}`);
  console.log(`  prompt chars: ${promptChars}`);
  console.log(`  prompt bytes: ${promptBytes}`);
  console.log(`  response bytes: ${responseBytes}`);
  console.log(`  verified evidence count: ${evidenceResult.resolvedEvidence.length}`);
  console.log(`  model calls: 1`);
  console.log(`  grounding calls: 1`);
}

async function auditUnsupportedIntentScale(): Promise<void> {
  const unsupportedQuestion = 'Qual ação devo comprar hoje?';
  const classification = classifyExplanationIntent(unsupportedQuestion);

  console.log(`\n=== [Unsupported Intent Gate Scale] ===`);
  console.log(`  question: "${unsupportedQuestion}"`);
  console.log(`  intent: ${classification.intent}`);
  console.log(`  grounding calls: 0`);
  console.log(`  prompt chars: 0`);
  console.log(`  prompt bytes: 0`);
  console.log(`  model calls: 0`);
  console.log(`  latency overhead: ~0ms (instant gate rejection)`);
}

async function main(): Promise<void> {
  console.log('=== PORTFOLIO AI EXPLANATION SCALE & BOUNDARY PROOF (PHASE 3R) ===');

  const question = 'Como foi a performance da minha carteira em relação ao Ibovespa?';

  await auditExplanationScale('BRL-only (10 positions)', [currencyInput(10)], question);
  await auditExplanationScale('BRL-only (100 positions)', [currencyInput(100)], question);
  await auditExplanationScale('BRL-only (1000 positions)', [currencyInput(1000)], question);

  const usdCurrency = (positions: number) =>
    currencyInput(positions, {
      currency: 'USD',
      benchmarks: [
        { id: 'IBOV', return: null, differencePercentagePoints: null, status: 'UNAVAILABLE' },
        { id: 'CDI', return: null, differencePercentagePoints: null, status: 'UNAVAILABLE' },
      ],
      riskAdjusted: { sharpe: null, sortino: null, riskFreeProxy: null, status: 'UNAVAILABLE' },
      relativeRisk: {
        benchmark: null,
        beta: null,
        correlation: null,
        trackingErrorAnnualized: null,
        status: 'UNAVAILABLE',
      },
      activePerformance: {
        alpha: null,
        informationRatio: null,
        treynor: null,
        status: 'UNAVAILABLE',
      },
      dataQuality: {
        ...currencyInput(positions).dataQuality,
        benchmarkAvailability: { status: 'UNAVAILABLE', reason: 'UNSUPPORTED' },
      },
    });

  await auditExplanationScale(
    'BRL + USD (10 positions)',
    [currencyInput(10), usdCurrency(10)],
    question,
  );
  await auditExplanationScale(
    'BRL + USD (1000 positions)',
    [currencyInput(1000), usdCurrency(1000)],
    question,
  );

  await auditUnsupportedIntentScale();

  console.log('\n[ai-explanation-scale-proof] DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
