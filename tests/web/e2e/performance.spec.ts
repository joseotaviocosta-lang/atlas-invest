import { test, expect, type Page } from '@playwright/test';

const PORTFOLIOS = [{ id: 'port-1', name: 'Carteira E2E' }];

function performancePayload(url: string) {
  const params = new URL(url).searchParams;
  const benchmark = params.get('benchmark');
  const startDate = params.get('startDate') ?? '';
  const period = {
    startDate: startDate || '2025-09-21',
    endDate: params.get('endDate') ?? '2026-09-21',
  };

  const base = {
    portfolioId: 'port-1',
    period,
    status: 'COMPLETE',
    dataAvailability: 'AVAILABLE',
  };

  if (!benchmark) {
    return {
      data: {
        ...base,
        currencies: {
          BRL: {
            currency: 'BRL',
            twr: '12',
            xirr: '11.5',
            twrStatus: 'COMPLETE',
            xirrStatus: 'CONVERGED',
            status: 'COMPLETE',
            dataAvailability: 'AVAILABLE',
          },
        },
      },
    };
  }

  const isCdi = benchmark === 'CDI';
  const unavailable = startDate === '2026-09-19';
  const partial = startDate === '2026-03-01';

  const benchmarkBlock = unavailable
    ? {
        id: benchmark,
        name: isCdi ? 'CDI' : 'Ibovespa',
        currency: 'BRL',
        type: isCdi ? 'RATE_SERIES' : 'PRICE_INDEX',
        return: null,
        status: 'UNAVAILABLE',
        dataAvailability: 'UNAVAILABLE',
      }
    : {
        id: benchmark,
        name: isCdi ? 'CDI' : 'Ibovespa',
        currency: 'BRL',
        type: isCdi ? 'RATE_SERIES' : 'PRICE_INDEX',
        return: isCdi ? '9.42' : '10',
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
      };

  return {
    data: {
      ...base,
      currencies: {
        BRL: {
          currency: 'BRL',
          twr: '12',
          xirr: '11.5',
          twrStatus: 'COMPLETE',
          xirrStatus: 'CONVERGED',
          status: 'COMPLETE',
          dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
          benchmark: benchmarkBlock,
          differencePercentagePoints: unavailable ? null : isCdi ? '2.58' : '2',
        },
      },
    },
  };
}

function seriesPayload(url: string) {
  const params = new URL(url).searchParams;
  const benchmark = params.get('benchmark');
  const startDate = params.get('startDate') ?? '2025-09-21';
  const unavailable = startDate === '2026-09-19';
  const partial = startDate === '2026-03-01';

  if (unavailable) {
    return {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate: params.get('endDate') ?? '2026-09-21' },
        requestedGranularity: 'AUTO',
        currencies: {
          BRL: {
            currency: 'BRL',
            granularity: 'DAILY',
            status: 'INSUFFICIENT_DATA',
            dataAvailability: 'UNAVAILABLE',
            benchmark: null,
            points: [],
          },
        },
        status: 'INSUFFICIENT_DATA',
        dataAvailability: 'UNAVAILABLE',
      },
    };
  }

  const benchMeta = !benchmark
    ? null
    : {
        id: benchmark,
        name: benchmark === 'CDI' ? 'CDI' : 'Ibovespa',
        currency: 'BRL',
        type: benchmark === 'CDI' ? 'RATE_SERIES' : 'PRICE_INDEX',
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
      };
  const benchAt = (v: string | null): string | null => (benchmark ? v : null);

  return {
    data: {
      portfolioId: 'port-1',
      period: { startDate, endDate: params.get('endDate') ?? '2026-09-21' },
      requestedGranularity: 'AUTO',
      currencies: {
        BRL: {
          currency: 'BRL',
          granularity: 'DAILY',
          status: partial ? 'PARTIAL' : 'COMPLETE',
          dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
          benchmark: benchMeta,
          points: [
            {
              date: startDate,
              portfolioReturn: '0',
              benchmarkReturn: benchAt('0'),
              status: 'COMPLETE',
            },
            {
              date: '2026-06-15',
              portfolioReturn: '6.10',
              benchmarkReturn: benchAt('4.80'),
              status: partial ? 'PARTIAL' : 'COMPLETE',
            },
            {
              date: params.get('endDate') ?? '2026-09-21',
              portfolioReturn: '12',
              benchmarkReturn: benchAt(benchmark === 'CDI' ? '9.42' : '10'),
              status: partial ? 'PARTIAL' : 'COMPLETE',
            },
          ],
        },
      },
      status: partial ? 'PARTIAL' : 'COMPLETE',
      dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
    },
  };
}

function riskPayload(url: string): { status: number; body: unknown } {
  const params = new URL(url).searchParams;
  const startDate = params.get('startDate') ?? '2025-09-21';
  const endDate = params.get('endDate') ?? '2026-09-21';
  const unavailable = startDate === '2026-09-19';
  const partial = startDate === '2026-03-01';
  const failed = startDate === '2026-08-01';

  if (failed) {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }
  if (unavailable) {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          period: { startDate, endDate },
          currencies: {
            BRL: {
              currency: 'BRL',
              frequency: 'DAILY',
              status: 'INSUFFICIENT_DATA',
              dataAvailability: 'UNAVAILABLE',
              volatility: {
                frequency: 'DAILY',
                observationCount: 0,
                samplePercentage: null,
                annualizedPercentage: null,
                annualizationFactor: '252',
                status: 'UNAVAILABLE',
              },
              drawdown: {
                maximumPercentage: null,
                peakDate: null,
                troughDate: null,
                recoveryDate: null,
                currentPercentage: null,
                status: 'UNAVAILABLE',
              },
            },
          },
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
        },
      },
    };
  }
  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate },
        currencies: {
          BRL: {
            currency: 'BRL',
            frequency: 'DAILY',
            status: partial ? 'PARTIAL' : 'AVAILABLE',
            dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
            volatility: {
              frequency: 'DAILY',
              observationCount: 178,
              samplePercentage: '0.84',
              annualizedPercentage: '13.34',
              annualizationFactor: '252',
              status: partial ? 'PARTIAL' : 'AVAILABLE',
            },
            drawdown: {
              maximumPercentage: '-12.48',
              peakDate: '2026-03-10',
              troughDate: '2026-05-20',
              recoveryDate: partial ? null : '2026-07-02',
              currentPercentage: partial ? '-12.48' : '-2.11',
              status: partial ? 'PARTIAL' : 'AVAILABLE',
            },
          },
        },
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
      },
    },
  };
}

function riskAdjustedPayload(url: string): { status: number; body: unknown } {
  const params = new URL(url).searchParams;
  const startDate = params.get('startDate') ?? '2025-09-21';
  const endDate = params.get('endDate') ?? '2026-09-21';
  const unavailable = startDate === '2026-09-19';
  const partial = startDate === '2026-03-01';
  const failed = startDate === '2026-08-05';

  if (failed) {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }
  if (unavailable) {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          period: { startDate, endDate },
          currencies: {
            BRL: {
              currency: 'BRL',
              frequency: 'DAILY',
              status: 'INSUFFICIENT_DATA',
              dataAvailability: 'UNAVAILABLE',
              riskFreeProxy: 'CDI',
              sharpe: null,
              sortino: null,
            },
          },
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
        },
      },
    };
  }
  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate },
        currencies: {
          BRL: {
            currency: 'BRL',
            frequency: 'DAILY',
            status: partial ? 'PARTIAL' : 'AVAILABLE',
            dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
            riskFreeProxy: 'CDI',
            sharpe: {
              observationCount: 178,
              meanDailyExcessPercentage: '0.05',
              daily: '0.078',
              annualized: '1.24',
              annualizationFactor: '252',
              status: partial ? 'PARTIAL' : 'AVAILABLE',
            },
            sortino: {
              observationCount: 178,
              downsideObservationCount: 71,
              downsideDeviationPercentage: '0.42',
              daily: '0.118',
              annualized: '1.87',
              annualizationFactor: '252',
              status: partial ? 'PARTIAL' : 'AVAILABLE',
            },
          },
        },
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
      },
    },
  };
}

function relativeRiskPayload(url: string): { status: number; body: unknown } {
  const params = new URL(url).searchParams;
  const startDate = params.get('startDate') ?? '2025-09-21';
  const endDate = params.get('endDate') ?? '2026-09-21';
  const unavailable = startDate === '2026-09-19';
  const partial = startDate === '2026-03-01';
  const failed = startDate === '2026-08-07';

  if (failed) {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }
  if (unavailable) {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          period: { startDate, endDate },
          benchmark: { id: 'IBOV', name: 'Ibovespa', currency: 'BRL' },
          currencies: {
            BRL: {
              currency: 'BRL',
              status: 'UNAVAILABLE',
              alignment: null,
              beta: null,
              correlation: null,
              trackingError: null,
            },
          },
          status: 'INSUFFICIENT_DATA',
          dataAvailability: 'UNAVAILABLE',
        },
      },
    };
  }
  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate },
        benchmark: { id: 'IBOV', name: 'Ibovespa', currency: 'BRL' },
        currencies: {
          BRL: {
            currency: 'BRL',
            status: partial ? 'PARTIAL' : 'AVAILABLE',
            alignment: {
              portfolioIntervalCount: 170,
              benchmarkIntervalCount: 174,
              pairedObservationCount: 168,
              droppedPortfolioIntervalCount: 2,
              droppedBenchmarkIntervalCount: 6,
            },
            beta: '0.87',
            correlation: '0.74',
            trackingError: {
              frequency: 'DAILY',
              observationCount: 168,
              samplePercentage: '0.76',
              annualizedPercentage: '12.06',
              annualizationFactor: '252',
              status: partial ? 'PARTIAL' : 'AVAILABLE',
            },
          },
        },
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
      },
    },
  };
}

function activePerformancePayload(url: string): { status: number; body: unknown } {
  const params = new URL(url).searchParams;
  const startDate = params.get('startDate') ?? '2025-09-21';
  const endDate = params.get('endDate') ?? '2026-09-21';
  const unavailable = startDate === '2026-09-19';
  const partial = startDate === '2026-03-01';
  const failed = startDate === '2026-08-09';

  if (failed) {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }
  if (unavailable) {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          period: { startDate, endDate },
          marketBenchmark: 'IBOV',
          riskFreeProxy: 'CDI',
          currencies: {
            BRL: {
              currency: 'BRL',
              status: 'UNAVAILABLE',
              alpha: null,
              informationRatio: null,
              treynor: null,
            },
          },
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
        },
      },
    };
  }
  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate },
        marketBenchmark: 'IBOV',
        riskFreeProxy: 'CDI',
        currencies: {
          BRL: {
            currency: 'BRL',
            status: partial ? 'PARTIAL' : 'AVAILABLE',
            alpha: { periodPercentage: '2.35' },
            informationRatio: { observationCount: 170, daily: '0.08', annualized: '1.27' },
            treynor: { periodPercentagePerBeta: '7.42' },
          },
        },
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'AVAILABLE',
      },
    },
  };
}

function rollingPayload(url: string): { status: number; body: unknown } {
  const params = new URL(url).searchParams;
  const startDate = params.get('startDate') ?? '2025-09-21';
  const endDate = params.get('endDate') ?? '2026-09-21';
  const windowValue = Number(params.get('window') ?? '20');
  const failed = startDate === '2026-08-11';
  const unavailable = startDate === '2026-09-19' || windowValue === 120;
  const partial = startDate === '2026-03-01';

  if (failed) {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }

  const emptySeries = (kind: 'vol' | 'ratio') => ({
    window: windowValue,
    status: 'UNAVAILABLE',
    points: [],
    ...(kind === 'vol' ? { frequency: 'DAILY' } : { frequency: 'DAILY' }),
  });

  if (unavailable) {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          period: { startDate, endDate },
          window: windowValue,
          currencies: {
            BRL: {
              currency: 'BRL',
              rollingVolatility: emptySeries('vol'),
              rollingSharpe: emptySeries('ratio'),
              rollingBeta: { window: windowValue, status: 'UNAVAILABLE', points: [] },
            },
          },
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
        },
      },
    };
  }

  const volPoints = [
    {
      windowStartDate: '2025-09-21',
      endDate: '2025-10-20',
      observationCount: windowValue,
      annualizedPercentage: '18.42',
      status: 'AVAILABLE',
    },
    {
      windowStartDate: '2025-10-20',
      endDate: '2025-11-20',
      observationCount: windowValue,
      annualizedPercentage: null,
      status: 'UNAVAILABLE',
    },
    {
      windowStartDate: '2025-11-20',
      endDate: '2026-09-21',
      observationCount: windowValue,
      annualizedPercentage: '16.10',
      status: 'AVAILABLE',
    },
  ];
  const ratioPoints = [
    {
      windowStartDate: '2025-09-21',
      endDate: '2025-10-20',
      observationCount: windowValue,
      annualized: '1.37',
      status: 'AVAILABLE',
    },
    {
      windowStartDate: '2025-10-20',
      endDate: '2026-09-21',
      observationCount: windowValue,
      annualized: '1.10',
      status: 'AVAILABLE',
    },
  ];
  const betaPoints = [
    {
      windowStartDate: '2025-09-21',
      endDate: '2025-10-20',
      observationCount: windowValue,
      beta: '0.87',
      status: 'AVAILABLE',
    },
    {
      windowStartDate: '2025-10-20',
      endDate: '2026-09-21',
      observationCount: windowValue,
      beta: '0.92',
      status: 'AVAILABLE',
    },
  ];

  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate },
        window: windowValue,
        currencies: {
          BRL: {
            currency: 'BRL',
            rollingVolatility: {
              window: windowValue,
              frequency: 'DAILY',
              status: partial ? 'PARTIAL' : 'AVAILABLE',
              points: volPoints,
            },
            rollingSharpe: {
              window: windowValue,
              frequency: 'DAILY',
              status: partial ? 'PARTIAL' : 'AVAILABLE',
              points: ratioPoints,
            },
            rollingBeta: {
              window: windowValue,
              status: partial ? 'PARTIAL' : 'AVAILABLE',
              points: betaPoints,
            },
          },
        },
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'COMPLETE',
      },
    },
  };
}

function tailRiskPayload(url: string): { status: number; body: unknown } {
  const params = new URL(url).searchParams;
  const startDate = params.get('startDate') ?? '2025-09-21';
  const endDate = params.get('endDate') ?? '2026-09-21';
  const confidenceLevel = params.get('confidenceLevel') ?? '95';
  const failed = startDate === '2026-08-13';
  const unavailable = startDate === '2026-09-19';
  const insufficientVar = confidenceLevel === '99';

  if (failed) {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }

  const block = (status: string, withVar: boolean) => ({
    currency: 'BRL',
    status,
    observationCount: 180,
    downsideDeviation: {
      frequency: 'DAILY',
      dailyPercentage: '1.12',
      annualizedPercentage: '17.78',
      negativeObservationCount: 82,
    },
    semideviation: { frequency: 'DAILY', dailyPercentage: '0.98', annualizedPercentage: '15.56' },
    historicalVar: {
      confidenceLevel,
      quantileReturnPercentage: withVar ? '-2.35' : null,
      lossPercentage: withVar ? '2.35' : null,
      tailObservationCount: withVar ? 9 : 0,
    },
    historicalCvar: {
      confidenceLevel,
      meanTailReturnPercentage: withVar ? '-3.10' : null,
      lossPercentage: withVar ? '3.10' : null,
      tailObservationCount: withVar ? 9 : 0,
    },
  });

  if (unavailable) {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          period: { startDate, endDate },
          confidenceLevel,
          currencies: {
            BRL: {
              currency: 'BRL',
              status: 'UNAVAILABLE',
              observationCount: 3,
              downsideDeviation: {
                frequency: 'DAILY',
                dailyPercentage: null,
                annualizedPercentage: null,
                negativeObservationCount: 0,
              },
              semideviation: {
                frequency: 'DAILY',
                dailyPercentage: null,
                annualizedPercentage: null,
              },
              historicalVar: {
                confidenceLevel,
                quantileReturnPercentage: null,
                lossPercentage: null,
                tailObservationCount: 0,
              },
              historicalCvar: {
                confidenceLevel,
                meanTailReturnPercentage: null,
                lossPercentage: null,
                tailObservationCount: 0,
              },
            },
          },
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
        },
      },
    };
  }

  const withVar = !insufficientVar;
  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate },
        confidenceLevel,
        currencies: { BRL: block(insufficientVar ? 'PARTIAL' : 'AVAILABLE', withVar) },
        status: insufficientVar ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: insufficientVar ? 'PARTIAL' : 'COMPLETE',
      },
    },
  };
}

function scenarioResponse(body: { asOf?: string; scenario?: Record<string, string | undefined> }): {
  status: number;
  body: unknown;
} {
  const scenario = body.scenario ?? {};
  const asOf = body.asOf ?? '2026-09-22';

  const currencyBlock = (params: {
    status: string;
    base: string | null;
    stressed: string | null;
    impact: string | null;
    pct: string | null;
    unvalued: number;
    valued: number;
    total: number;
    componentType: string;
    componentStatus: string;
    reason: string | null;
  }) => ({
    currency: 'BRL',
    status: params.status,
    baseValue: params.base,
    stressedValue: params.stressed,
    absoluteImpact: params.impact,
    percentageImpact: params.pct,
    positionCount: params.total,
    valuedPositionCount: params.valued,
    unvaluedPositionCount: params.unvalued,
    components: [
      {
        componentType: params.componentType,
        status: params.componentStatus,
        baseValue: params.base,
        stressedValue: params.stressed,
        absoluteImpact: params.impact,
        percentageImpact: params.pct,
        reason: params.reason,
      },
    ],
  });

  if (scenario.shockPercentage === '-13') {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }

  if (scenario.type === 'RATE_SHOCK') {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          asOf,
          scenario,
          currencies: {
            BRL: currencyBlock({
              status: 'UNAVAILABLE',
              base: null,
              stressed: null,
              impact: null,
              pct: null,
              unvalued: 0,
              valued: 1,
              total: 1,
              componentType: 'RATE_SHOCK',
              componentStatus: 'UNAVAILABLE',
              reason: 'SCENARIO.UNSUPPORTED_RATE_SHOCK',
            }),
          },
          status: 'UNAVAILABLE',
          dataAvailability: 'UNAVAILABLE',
        },
      },
    };
  }

  if (scenario.type === 'BENCHMARK_SHOCK') {
    return {
      status: 200,
      body: {
        data: {
          portfolioId: 'port-1',
          asOf,
          scenario,
          currencies: {
            BRL: currencyBlock({
              status: 'AVAILABLE',
              base: '100000',
              stressed: '92000',
              impact: '-8000',
              pct: '-8',
              unvalued: 0,
              valued: 1,
              total: 1,
              componentType: 'BENCHMARK_SHOCK',
              componentStatus: 'AVAILABLE',
              reason: null,
            }),
          },
          status: 'AVAILABLE',
          dataAvailability: 'COMPLETE',
        },
      },
    };
  }

  const partial = scenario.shockPercentage === '-20';
  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        asOf,
        scenario,
        currencies: {
          BRL: currencyBlock({
            status: partial ? 'PARTIAL' : 'AVAILABLE',
            base: '100000',
            stressed: partial ? '80000' : '90000',
            impact: partial ? '-20000' : '-10000',
            pct: partial ? '-20' : '-10',
            unvalued: partial ? 1 : 0,
            valued: partial ? 1 : 2,
            total: 2,
            componentType: 'EQUITY_PRICE_SHOCK',
            componentStatus: partial ? 'PARTIAL' : 'AVAILABLE',
            reason: null,
          }),
        },
        status: partial ? 'PARTIAL' : 'AVAILABLE',
        dataAvailability: partial ? 'PARTIAL' : 'COMPLETE',
      },
    },
  };
}

function intelligencePayload(url: string): { status: number; body: unknown } {
  const params = new URL(url).searchParams;
  const startDate = params.get('startDate') ?? '2025-09-22';
  const endDate = params.get('endDate') ?? '2026-09-22';
  if (startDate === '2026-08-15') {
    return { status: 500, body: { statusCode: 500, error: 'Server Error' } };
  }
  const block = (currency: string, available: boolean) => ({
    currency,
    status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    dataAvailability: available ? 'COMPLETE' : 'UNAVAILABLE',
    overview: {
      currentMarketValue: available ? '100000' : null,
      positionCount: 2,
      valuedPositionCount: available ? 2 : 0,
      unvaluedPositionCount: 0,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    performance: {
      twr: available ? '12' : null,
      xirr: available ? '11.5' : null,
      observationCount: 200,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    benchmarks: available
      ? [
          { id: 'IBOV', return: '8', differencePercentagePoints: '4', status: 'AVAILABLE' },
          { id: 'CDI', return: '9', differencePercentagePoints: '3', status: 'AVAILABLE' },
        ]
      : [
          { id: 'IBOV', return: null, differencePercentagePoints: null, status: 'UNAVAILABLE' },
          { id: 'CDI', return: null, differencePercentagePoints: null, status: 'UNAVAILABLE' },
        ],
    risk: {
      realizedVolatilityAnnualized: available ? '18' : null,
      maximumDrawdown: available ? '-12' : null,
      currentDrawdown: available ? '-5' : null,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    riskAdjusted: {
      sharpe: null,
      sortino: null,
      riskFreeProxy: currency === 'BRL' ? 'CDI' : null,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    relativeRisk: {
      benchmark: currency === 'BRL' ? 'IBOV' : null,
      beta: null,
      correlation: null,
      trackingErrorAnnualized: null,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    activePerformance: {
      alpha: null,
      informationRatio: null,
      treynor: null,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    tailRisk: {
      confidenceLevel: '95',
      downsideDeviationAnnualized: available ? '12' : null,
      semideviationAnnualized: available ? '10' : null,
      var95: available ? '2.5' : null,
      cvar95: available ? '3.5' : null,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    scenario: {
      preset: 'EQUITY_DOWN_10',
      type: 'EQUITY_PRICE_SHOCK',
      baseValue: available ? '100000' : null,
      stressedValue: available ? '90000' : null,
      absoluteImpact: available ? '-10000' : null,
      percentageImpact: available ? '-10' : null,
      hypothetical: true,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    },
    dataQuality: {
      valuationCompleteness: { status: 'AVAILABLE', reason: null },
      benchmarkAvailability: {
        status: available ? 'AVAILABLE' : 'UNAVAILABLE',
        reason: available ? null : currency === 'BRL' ? null : 'UNSUPPORTED',
      },
    },
  });
  const observations = [
    {
      code: 'PERFORMANCE_VS_IBOV',
      scope: 'BRL',
      status: 'AVAILABLE',
      source: 'PERFORMANCE',
      values: { portfolioReturn: '12', benchmarkReturn: '8', differencePercentagePoints: '4' },
    },
    {
      code: 'MULTI_CURRENCY_PRESENT',
      scope: 'PORTFOLIO',
      status: 'AVAILABLE',
      source: 'PORTFOLIO',
      values: { currencies: ['BRL', 'USD'] },
    },
  ];
  return {
    status: 200,
    body: {
      data: {
        portfolioId: 'port-1',
        period: { startDate, endDate },
        asOf: endDate,
        currencies: { BRL: block('BRL', true), USD: block('USD', false) },
        observations,
        status: 'PARTIAL',
        dataAvailability: 'PARTIAL',
      },
    },
  };
}

async function mockAuth(page: Page) {
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { accessToken: 'mock-access-token', expiresIn: 900 } }),
    });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: 'usr-e2e-1',
          name: 'Investidor E2E',
          email: 'e2e@atlas.dev',
          locale: 'pt-BR',
          timezone: 'America/Sao_Paulo',
          baseCurrency: 'BRL',
        },
      }),
    });
  });
}

test.describe('Performance E2E — CDI rate benchmark (no network)', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([
      {
        name: 'atlas_refresh',
        value: 'mock-refresh-token',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'atlas_logged_in',
        value: 'true',
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        sameSite: 'Lax',
      },
    ]);
    await mockAuth(page);
    await page.route('**/api/v1/portfolios', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: PORTFOLIOS }),
        });
      } else {
        await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
      }
    });
    await page.route('**/api/v1/portfolios/*/intelligence/summary**', async (route) => {
      const { status, body } = intelligencePayload(route.request().url());
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    await page.route('**/api/v1/portfolios/*/performance**', async (route) => {
      const url = route.request().url();
      if (url.includes('/performance/scenarios/run')) {
        const body = (route.request().postDataJSON() ?? {}) as {
          asOf?: string;
          scenario?: Record<string, string | undefined>;
        };
        const { status, body: responseBody } = scenarioResponse(body);
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(responseBody),
        });
        return;
      }
      if (url.includes('/performance/tail-risk')) {
        const { status, body } = tailRiskPayload(url);
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      if (url.includes('/performance/rolling')) {
        const { status, body } = rollingPayload(url);
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      if (url.includes('/performance/active')) {
        const { status, body } = activePerformancePayload(url);
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      if (url.includes('/performance/relative-risk')) {
        const { status, body } = relativeRiskPayload(url);
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      if (url.includes('/performance/risk-adjusted')) {
        const { status, body } = riskAdjustedPayload(url);
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      if (url.includes('/performance/risk')) {
        const { status, body } = riskPayload(url);
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      const body = url.includes('/performance/series')
        ? seriesPayload(url)
        : performancePayload(url);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  });

  test('Carteira → Performance → CDI → IBOV → CDI → período → CDI unavailable → Sem benchmark', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance?benchmark=CDI');
    await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible();

    // Selector options are all present
    await expect(page.getByRole('button', { name: 'Sem benchmark' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Selecionar benchmark IBOV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Selecionar benchmark CDI' })).toBeVisible();

    // CDI card + difference in p.p.
    await expect(page.getByTestId('benchmark-BRL')).toContainText('9.42');
    await expect(page.getByTestId('difference-BRL')).toContainText('2.58 p.p. vs. CDI');
    // TWR stays visible and separate from XIRR
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByText('XIRR').first()).toBeVisible();
    // CDI tooltip text (rendered as the info glyph's title/aria-label)
    await expect(page.getByTitle(/O CDI é uma referência de taxas de juros/)).toBeVisible();

    // Switch to IBOV
    await page.getByRole('button', { name: 'Selecionar benchmark IBOV' }).click();
    await expect(page).toHaveURL(/benchmark=IBOV/);
    await expect(page.getByTestId('difference-BRL')).toContainText('2 p.p. vs. IBOV');

    // Back to CDI
    await page.getByRole('button', { name: 'Selecionar benchmark CDI' }).click();
    await expect(page).toHaveURL(/benchmark=CDI/);
    await expect(page.getByTestId('difference-BRL')).toContainText('vs. CDI');

    // Change period while keeping CDI selected
    await page.getByRole('button', { name: 'Selecionar período YTD' }).click();
    await expect(page).toHaveURL(/period=YTD/);
    await expect(page).toHaveURL(/benchmark=CDI/);

    // CDI unavailable scenario: TWR remains, CDI is not shown as 0%
    await page.goto(
      '/portfolio/performance?period=CUSTOM&startDate=2026-09-19&endDate=2026-09-20&benchmark=CDI',
    );
    await expect(page.getByText('CDI indisponível para este período.')).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Back to Sem benchmark: no benchmark block
    await page.goto('/portfolio/performance');
    await page.getByRole('button', { name: 'Sem benchmark' }).click();
    await expect(page).not.toHaveURL(/benchmark=CDI/);
    await expect(page.getByTestId('benchmark-BRL')).toHaveCount(0);
    await expect(page.getByText('TWR').first()).toBeVisible();
  });

  test('PARTIAL comparison is labelled and never shown as complete', async ({ page }) => {
    await page.goto(
      '/portfolio/performance?period=CUSTOM&startDate=2026-03-01&endDate=2026-03-31&benchmark=CDI',
    );
    await expect(page.getByText('Comparação parcial')).toBeVisible();
    await expect(page.getByTestId('benchmark-BRL')).toContainText('9.42');
  });

  test('Performance series chart renders portfolio + benchmark lines', async ({ page }) => {
    await page.goto('/portfolio/performance?benchmark=CDI');
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('portfolio-line').first()).toBeAttached();
    await expect(page.getByTestId('benchmark-line').first()).toBeAttached();
    await expect(page.getByText('Histórico de performance')).toBeVisible();
    await expect(
      page.getByText('Retorno acumulado normalizado para 0,00% no início do período.'),
    ).toBeVisible();

    // Switch benchmark to IBOV: chart refetches and keeps portfolio line
    await page.getByRole('button', { name: 'Selecionar benchmark IBOV' }).click();
    await expect(page).toHaveURL(/benchmark=IBOV/);
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('portfolio-line').first()).toBeAttached();

    // Change period: chart updates with same dates as summary
    await page.getByRole('button', { name: 'Selecionar período YTD' }).click();
    await expect(page).toHaveURL(/period=YTD/);
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();

    // Summary stays functional when series is unavailable
    await page.goto(
      '/portfolio/performance?period=CUSTOM&startDate=2026-09-19&endDate=2026-09-20&benchmark=CDI',
    );
    await expect(
      page.getByText('Histórico insuficiente para montar o gráfico.').first(),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Partial series shows non-alarmist badge
    await page.goto(
      '/portfolio/performance?period=CUSTOM&startDate=2026-03-01&endDate=2026-03-31&benchmark=CDI',
    );
    await expect(page.getByText('Série parcial')).toBeVisible();

    // No benchmark: portfolio line only
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('portfolio-line').first()).toBeAttached();
    await expect(page.getByTestId('benchmark-line')).toHaveCount(0);
  });

  test('Risk section: volatility, drawdowns, periods, partial/unavailable, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('risk-section')).toBeVisible();
    await expect(page.getByText('Risco histórico')).toBeVisible();
    await expect(page.getByTestId('risk-volatility-BRL')).toContainText('13,34');
    await expect(page.getByTestId('risk-max-drawdown-BRL')).toContainText('12,48');
    await expect(page.getByTestId('risk-current-drawdown-BRL')).toContainText('2,11');
    await expect(page.getByText('Pico: 10/03/2026')).toBeVisible();
    await expect(page.getByText('Fundo: 20/05/2026')).toBeVisible();
    await expect(page.getByText('Recuperação: 02/07/2026')).toBeVisible();
    // Historical language only — no qualitative labels
    await expect(page.getByTestId('risk-section')).not.toContainText(/baixo risco|alto risco/i);

    // Change period: risk refetches with the summary period
    await page.getByRole('button', { name: 'Selecionar período YTD' }).click();
    await expect(page).toHaveURL(/period=YTD/);
    await expect(page.getByTestId('risk-volatility-BRL')).toBeVisible();

    // Partial risk is non-alarmist
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-03-01&endDate=2026-03-31');
    await expect(page.getByText('Dados parciais para métricas de risco.')).toBeVisible();
    await expect(page.getByText('Não recuperado no período')).toBeVisible();

    // Unavailable risk is never 0%
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-09-19&endDate=2026-09-20');
    await expect(
      page.getByText('Histórico insuficiente para calcular métricas de risco.').first(),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Risk failure isolates: summary + chart keep working
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-08-01&endDate=2026-08-10');
    await expect(page.getByText('Não foi possível carregar as métricas de risco.')).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
  });

  test('Risk-adjusted section: Sharpe, Sortino, periods, partial/unavailable, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('risk-adjusted-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Retorno ajustado ao risco' })).toBeVisible();
    await expect(page.getByTestId('risk-adjusted-sharpe-BRL')).toContainText('1,24');
    await expect(page.getByTestId('risk-adjusted-sharpe-BRL')).not.toContainText('%');
    await expect(page.getByTestId('risk-adjusted-sortino-BRL')).toContainText('1,87');
    await expect(
      page.getByTestId('risk-adjusted-section').getByText('Referência usada: CDI'),
    ).toBeVisible();

    // Change period: risk-adjusted refetches with the summary period
    await page.getByRole('button', { name: 'Selecionar período YTD' }).click();
    await expect(page).toHaveURL(/period=YTD/);
    await expect(page.getByTestId('risk-adjusted-sharpe-BRL')).toBeVisible();

    // Partial is non-alarmist
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-03-01&endDate=2026-03-31');
    await expect(page.getByText('Dados parciais para retorno ajustado ao risco.')).toBeVisible();

    // Unavailable is never 0 or Infinity
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-09-19&endDate=2026-09-20');
    await expect(
      page.getByText('Histórico insuficiente para calcular Sharpe e Sortino.').first(),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Risk-adjusted failure isolates: summary + chart + risk keep working
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-08-05&endDate=2026-08-10');
    await expect(
      page.getByText('Não foi possível carregar o retorno ajustado ao risco.'),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-volatility-BRL')).toBeVisible();
  });

  test('Relative risk section: Beta, Correlation, Tracking Error, periods, partial/unavailable, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('relative-risk-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Relação com o mercado' })).toBeVisible();
    await expect(page.getByTestId('relative-risk-beta-BRL')).toContainText('0,87');
    await expect(page.getByTestId('relative-risk-beta-BRL')).not.toContainText('%');
    await expect(page.getByTestId('relative-risk-correlation-BRL')).toContainText('0,74');
    await expect(page.getByTestId('relative-risk-correlation-BRL')).not.toContainText('%');
    await expect(page.getByTestId('relative-risk-tracking-error-BRL')).toContainText('12,06%');
    await expect(page.getByText('Referência: Ibovespa')).toBeVisible();
    // No qualitative labels or forecasts.
    await expect(page.getByTestId('relative-risk-section')).not.toContainText(
      /beta alto|beta baixo|agressivo|defensivo/i,
    );
    await expect(page.getByTestId('relative-risk-section')).not.toContainText(
      /deve subir|deve cair/i,
    );

    // Change period: relative-risk refetches with the summary period
    await page.getByRole('button', { name: 'Selecionar período YTD' }).click();
    await expect(page).toHaveURL(/period=YTD/);
    await expect(page.getByTestId('relative-risk-beta-BRL')).toBeVisible();

    // Partial is non-alarmist
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-03-01&endDate=2026-03-31');
    await expect(page.getByText('Dados parciais para comparação com o Ibovespa.')).toBeVisible();

    // Unavailable is never 0 or Infinity
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-09-19&endDate=2026-09-20');
    await expect(
      page
        .getByText('Histórico insuficiente para calcular métricas relativas ao Ibovespa.')
        .first(),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Relative-risk failure isolates: summary + chart + risk + risk-adjusted keep working
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-08-07&endDate=2026-08-10');
    await expect(
      page.getByText('Não foi possível carregar a relação com o mercado.'),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-volatility-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-adjusted-sharpe-BRL')).toBeVisible();
  });

  test('Active performance section: Alpha, Information Ratio, Treynor, periods, partial/unavailable, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('active-performance-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Desempenho ativo' })).toBeVisible();
    await expect(page.getByTestId('active-performance-alpha-BRL')).toContainText('+2,35%');
    await expect(page.getByTestId('active-performance-ir-BRL')).toContainText('1,27');
    await expect(page.getByTestId('active-performance-ir-BRL')).not.toContainText('%');
    await expect(page.getByTestId('active-performance-treynor-BRL')).toContainText('7,42%');
    await expect(
      page.getByTestId('active-performance-section').getByText('Benchmark de mercado: Ibovespa'),
    ).toBeVisible();
    await expect(
      page.getByTestId('active-performance-section').getByText('Referência usada: CDI'),
    ).toBeVisible();
    await expect(page.getByTestId('active-performance-section')).not.toContainText(
      /alpha bom|alpha ruim|Treynor alto|pior desempenho/i,
    );
    await expect(page.getByTestId('active-performance-section')).not.toContainText(
      /deve subir|deve cair/i,
    );

    // Change period: active performance refetches with the summary period
    await page.getByRole('button', { name: 'Selecionar período YTD' }).click();
    await expect(page).toHaveURL(/period=YTD/);
    await expect(page.getByTestId('active-performance-alpha-BRL')).toBeVisible();

    // Partial is non-alarmist
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-03-01&endDate=2026-03-31');
    await expect(page.getByText('Dados parciais para métricas de desempenho ativo.')).toBeVisible();

    // Unavailable is never 0 or Infinity
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-09-19&endDate=2026-09-20');
    await expect(
      page.getByText('Histórico insuficiente para calcular métricas de desempenho ativo.').first(),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Active performance failure isolates: other sections keep working
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-08-09&endDate=2026-08-10');
    await expect(page.getByText('Não foi possível carregar o desempenho ativo.')).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-volatility-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-adjusted-sharpe-BRL')).toBeVisible();
    await expect(page.getByTestId('relative-risk-beta-BRL')).toBeVisible();
  });

  test('Rolling analytics section: windows, metrics, partial/unavailable, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('rolling-analytics-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evolução do risco' })).toBeVisible();
    await expect(page.getByTestId('rolling-window-20')).toBeVisible();
    await expect(page.getByTestId('rolling-window-60')).toBeVisible();
    await expect(page.getByTestId('rolling-window-120')).toBeVisible();
    await expect(page.getByTestId('rolling-metric-VOLATILITY')).toBeVisible();
    await expect(page.getByTestId('rolling-metric-BETA')).toBeVisible();
    await expect(page.getByTestId('rolling-metric-SHARPE')).toBeVisible();
    await expect(page.getByTestId('rolling-chart-BRL')).toBeVisible();

    // Metric selector switches the chart series
    await page.getByTestId('rolling-metric-BETA').click();
    await expect(page.getByTestId('rolling-chart-BRL')).toBeVisible();
    await page.getByTestId('rolling-metric-SHARPE').click();
    await expect(page.getByTestId('rolling-chart-BRL')).toBeVisible();

    // Window selector updates the URL and refetches
    await page.getByTestId('rolling-window-60').click();
    await expect(page).toHaveURL(/window=60/);
    await expect(page.getByTestId('rolling-chart-BRL')).toBeVisible();

    // Insufficient history for a large window
    await page.goto('/portfolio/performance?window=120');
    await expect(page.getByText('Histórico insuficiente para esta janela.').first()).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Partial is non-alarmist
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-03-01&endDate=2026-03-31');
    await expect(page.getByText('Dados parciais para análise móvel.')).toBeVisible();

    // Failure isolates: other sections keep working
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-08-11&endDate=2026-08-20');
    await expect(page.getByText('Não foi possível carregar a evolução do risco.')).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-volatility-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-adjusted-sharpe-BRL')).toBeVisible();
    await expect(page.getByTestId('relative-risk-beta-BRL')).toBeVisible();
    await expect(page.getByTestId('active-performance-alpha-BRL')).toBeVisible();
  });

  test('Tail risk section: confidence selector, four cards, partial/unavailable, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('tail-risk-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Risco de cauda' })).toBeVisible();
    await expect(page.getByTestId('tail-confidence-95')).toBeVisible();
    await expect(page.getByTestId('tail-confidence-99')).toBeVisible();
    await expect(page.getByTestId('tail-downside-BRL')).toContainText('17,78%');
    await expect(page.getByTestId('tail-semideviation-BRL')).toContainText('15,56%');
    await expect(page.getByTestId('tail-var-BRL')).toContainText('2,35%');
    await expect(page.getByTestId('tail-var-BRL')).not.toContainText('-');
    await expect(page.getByTestId('tail-cvar-BRL')).toContainText('3,10%');
    await expect(page.getByTestId('tail-cvar-BRL')).not.toContainText('-');
    // No guarantee/forecast/qualitative wording.
    await expect(page.getByTestId('tail-risk-section')).not.toContainText(
      /perda máxima|você não perderá|garantia|alto risco|baixo risco/i,
    );

    // Switch confidence: URL updates and VaR/CVaR become unavailable at 99
    await page.getByTestId('tail-confidence-99').click();
    await expect(page).toHaveURL(/confidence=99/);
    await expect(page.getByTestId('tail-var-BRL')).toContainText('—');
    await expect(page.getByTestId('tail-downside-BRL')).toBeVisible();

    // Unavailable is never shown as 0%
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-09-19&endDate=2026-09-20');
    await expect(
      page.getByText('Histórico insuficiente para calcular esta métrica.').first(),
    ).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();

    // Failure isolates: other sections keep working
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-08-13&endDate=2026-08-20');
    await expect(page.getByText('Não foi possível carregar o risco de cauda.')).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('risk-volatility-BRL')).toBeVisible();
    await expect(page.getByTestId('relative-risk-beta-BRL')).toBeVisible();
    await expect(page.getByTestId('active-performance-alpha-BRL')).toBeVisible();
    await expect(page.getByTestId('rolling-chart-BRL')).toBeVisible();
  });

  test('Scenario section: preset run, benchmark beta result, partial, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('scenario-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Simulação de cenários' })).toBeVisible();

    // Equity −10% preset
    await page.getByTestId('scenario-preset-MARKET_DOWN_10').click();
    await page.getByTestId('scenario-run').click();
    await expect(page.getByTestId('scenario-base-BRL')).toContainText('R$ 100.000,00');
    await expect(page.getByTestId('scenario-stressed-BRL')).toContainText('R$ 90.000,00');
    await expect(page.getByTestId('scenario-impact-BRL')).toContainText('-R$ 10.000,00');
    await expect(page.getByTestId('scenario-impact-pct-BRL')).toContainText('-10,00%');

    // Ibovespa −10% via historical Beta
    await page.getByTestId('scenario-preset-IBOV_DOWN_10').click();
    await page.getByTestId('scenario-run').click();
    await expect(page.getByTestId('scenario-beta-note')).toBeVisible();
    await expect(page.getByTestId('scenario-impact-pct-BRL')).toContainText('-8,00%');

    // Partial scenario
    await page.getByTestId('scenario-preset-MARKET_DOWN_20').click();
    await page.getByTestId('scenario-run').click();
    await expect(page.getByTestId('scenario-partial')).toBeVisible();
    await expect(page.getByTestId('scenario-result-BRL')).toContainText(
      '1 de 2 posições avaliadas',
    );

    // Rate presets are disabled
    await expect(page.getByTestId('scenario-preset-RATES_UP_100BPS')).toBeDisabled();
    // No forecast/guarantee language
    await expect(page.getByTestId('scenario-section')).not.toContainText(
      /perda esperada|previsão de|vai cair|garantia/i,
    );

    // Run failure isolates: other sections keep working
    await page.getByTestId('scenario-preset-CUSTOM').click();
    await page.getByTestId('scenario-input-equity').fill('-13');
    await page.getByTestId('scenario-run').click();
    await expect(page.getByTestId('scenario-error')).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
    await expect(page.getByTestId('tail-risk-section')).toBeVisible();
  });

  test('Portfolio intelligence summary: groups, multi-currency, highlights, isolation', async ({
    page,
  }) => {
    await page.goto('/portfolio/performance');
    await expect(page.getByTestId('intelligence-summary-section')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resumo da carteira' })).toBeVisible();

    // Grouped blocks for BRL
    await expect(page.getByTestId('intelligence-overview-BRL')).toBeVisible();
    await expect(page.getByTestId('intelligence-performance-BRL')).toBeVisible();
    await expect(page.getByTestId('intelligence-benchmarks-BRL')).toBeVisible();
    await expect(page.getByTestId('intelligence-risk-BRL')).toBeVisible();
    await expect(page.getByTestId('intelligence-tail-BRL')).toBeVisible();
    await expect(page.getByTestId('intelligence-scenario-BRL')).toBeVisible();
    await expect(page.getByTestId('intelligence-dataquality-BRL')).toBeVisible();

    // Objective highlights (factual, no recommendation)
    await expect(page.getByText('Destaques objetivos').first()).toBeVisible();
    await expect(
      page.getByTestId('intelligence-observation-PERFORMANCE_VS_IBOV-BRL'),
    ).toContainText('Ibovespa');
    await expect(page.getByTestId('intelligence-summary-section')).not.toContainText(
      /recomend|deveria|excelente|ruim|risco alto/i,
    );

    // Multi-currency: USD block present and separated
    await expect(page.getByTestId('intelligence-USD')).toBeVisible();

    // Failure isolation: other sections keep working
    await page.goto('/portfolio/performance?period=CUSTOM&startDate=2026-08-15&endDate=2026-08-20');
    await expect(page.getByText('Não foi possível carregar o resumo da carteira.')).toBeVisible();
    await expect(page.getByText('TWR').first()).toBeVisible();
    await expect(page.getByTestId('performance-series-chart-BRL')).toBeVisible();
  });
});
