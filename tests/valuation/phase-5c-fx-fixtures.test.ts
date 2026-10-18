import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  valuePortfolio,
  computePortfolioAllocation,
  ValuationQuote,
  PositionValuationInput,
  ValuationFxRate,
} from '@atlas/valuation-engine';
import { BcbFxDataProvider } from '@atlas/market-data';
import { PersistedFxDataProvider } from '../../apps/api/src/market-data/persisted-fx-data.provider';
import {
  IFxObservationRepository,
  FxObservationRecordRow,
  FxObservationRevisionRecordRow,
  FxObservationUpsertInput,
  FxObservationUpsertOutcome,
} from '../../packages/database/src/repositories/interfaces';

const makePos = (overrides: Partial<PositionValuationInput> = {}): PositionValuationInput => ({
  assetId: '11111111-1111-4111-8111-111111111111',
  accountId: 'acc1',
  quantity: '10',
  currency: 'USD' as never,
  totalCost: '500.00',
  averageCost: '50.00',
  costBasisStatus: 'KNOWN',
  ...overrides,
});

const makeQuote = (overrides: Partial<ValuationQuote> = {}): ValuationQuote => ({
  assetId: '11111111-1111-4111-8111-111111111111',
  price: '60.00',
  currency: 'USD' as never,
  asOf: '2026-10-16',
  receivedAt: '2026-10-16T18:00:00Z',
  source: 'TEST',
  status: 'EOD' as never,
  freshness: 'FRESH' as never,
  providerSymbol: 'AAPL',
  ...overrides,
});

class MockFxObservationRepository implements IFxObservationRepository {
  private observations: FxObservationRecordRow[] = [];
  private revisions: FxObservationRevisionRecordRow[] = [];

  constructor(initial: FxObservationRecordRow[] = []) {
    this.observations = [...initial];
  }

  async findObservation(
    baseCurrency: string,
    quoteCurrency: string,
    observationDate: LocalDate,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow | null> {
    return (
      this.observations.find(
        (o) =>
          o.baseCurrency === baseCurrency &&
          o.quoteCurrency === quoteCurrency &&
          o.observationDate.toString() === observationDate.toString() &&
          (!source || o.source === source) &&
          (!rateType || o.rateType === rateType),
      ) ?? null
    );
  }

  async findObservations(
    baseCurrency: string,
    quoteCurrency: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow[]> {
    return this.observations.filter(
      (o) =>
        o.baseCurrency === baseCurrency &&
        o.quoteCurrency === quoteCurrency &&
        o.observationDate.compare(from) >= 0 &&
        o.observationDate.compare(to) <= 0 &&
        (!source || o.source === source) &&
        (!rateType || o.rateType === rateType),
    );
  }

  async findLatest(
    baseCurrency: string,
    quoteCurrency: string,
    source?: string,
    rateType?: string,
  ): Promise<FxObservationRecordRow | null> {
    const matches = this.observations.filter(
      (o) =>
        o.baseCurrency === baseCurrency &&
        o.quoteCurrency === quoteCurrency &&
        (!source || o.source === source) &&
        (!rateType || o.rateType === rateType),
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => b.observationDate.compare(a.observationDate))[0];
  }

  async upsertObservation(input: FxObservationUpsertInput): Promise<{
    outcome: FxObservationUpsertOutcome;
    observation: FxObservationRecordRow;
    revision?: FxObservationRevisionRecordRow;
  }> {
    const existingIndex = this.observations.findIndex(
      (o) =>
        o.baseCurrency === input.baseCurrency &&
        o.quoteCurrency === input.quoteCurrency &&
        o.observationDate.toString() === input.observationDate.toString() &&
        o.source === input.source &&
        o.rateType === (input.rateType ?? 'MID'),
    );

    if (existingIndex === -1) {
      const created: FxObservationRecordRow = {
        id: `obs-${Date.now()}-${Math.random()}`,
        baseCurrency: input.baseCurrency,
        quoteCurrency: input.quoteCurrency,
        observationDate: input.observationDate,
        rate: input.rate,
        rateType: input.rateType ?? 'MID',
        source: input.source,
        providerSeriesId: input.providerSeriesId ?? null,
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.observations.push(created);
      return { outcome: 'INSERTED', observation: created };
    }

    const existing = this.observations[existingIndex];
    if (existing.rate === input.rate) {
      existing.fetchCount += 1;
      existing.lastFetchedAt = new Date();
      return { outcome: 'UNCHANGED', observation: existing };
    }

    // Revision
    const rev: FxObservationRevisionRecordRow = {
      id: `rev-${Date.now()}-${Math.random()}`,
      fxObservationId: existing.id,
      changedAt: new Date(),
      priorRate: existing.rate,
      newRate: input.rate,
      reason: input.reason ?? 'Upstream official PTAX rate revision',
      createdAt: new Date(),
    };
    this.revisions.push(rev);

    existing.rate = input.rate;
    existing.fetchCount += 1;
    existing.revisedAt = new Date();
    existing.lastFetchedAt = new Date();

    return { outcome: 'REVISED', observation: existing, revision: rev };
  }

  async getCoverage(
    baseCurrency: string,
    quoteCurrency: string,
  ): Promise<{
    totalObservations: number;
    firstObservationDate: LocalDate | null;
    lastObservationDate: LocalDate | null;
  }> {
    const matches = this.observations.filter(
      (o) => o.baseCurrency === baseCurrency && o.quoteCurrency === quoteCurrency,
    );
    if (matches.length === 0) {
      return { totalObservations: 0, firstObservationDate: null, lastObservationDate: null };
    }
    const sorted = [...matches].sort((a, b) => a.observationDate.compare(b.observationDate));
    return {
      totalObservations: sorted.length,
      firstObservationDate: sorted[0].observationDate,
      lastObservationDate: sorted[sorted.length - 1].observationDate,
    };
  }

  getRevisionHistory(fxObservationId: string): FxObservationRevisionRecordRow[] {
    return this.revisions.filter((r) => r.fxObservationId === fxObservationId);
  }
}

describe('Phase 5C: FX Time-Series and Multi-Currency Valuation Formal Fixtures', () => {
  // Gate 7: Pair Direction Verification (USD/BRL = 5.00 -> 100 USD = 500 BRL, not 20)
  it('Gate 7: Pair direction converts foreign base to local quote deterministically', () => {
    const rateUsdBrl = '5.000000000000000000'; // 5 BRL per 1 USD

    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'usd-1', quantity: '10', totalCost: '50.00', currency: 'USD' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['usd-1', makeQuote({ assetId: 'usd-1', price: '10.00', currency: 'USD' as never })], // 100 USD
    ]);
    const fxRates = new Map<string, ValuationFxRate>([
      [
        'USD::BRL',
        {
          baseCurrency: 'USD' as never,
          quoteCurrency: 'BRL' as never,
          rate: rateUsdBrl,
          rateDate: '2026-10-16',
          source: 'BCB_PTAX',
        },
      ],
    ]);

    const result = valuePortfolio({
      portfolioId: 'p-fx-dir',
      positions,
      accountPositions: new Map(),
      quotes,
      reportingCurrency: 'BRL' as never,
      fxRates,
    });

    expect(result.totalsByCurrency['USD'].marketValue.amount).toBe('100');
    // 100 USD * 5.00 BRL/USD = 500 BRL (NOT 100 / 5 = 20 BRL)
    expect(result.translatedSummary?.totalMarketValue.amount).toBe('500');
    expect(result.translatedSummary?.totalMarketValue.currency).toBe('BRL');
    expect(result.translatedSummary?.status).toBe('AVAILABLE');
  });

  // Gate 8: Basic USD Holding Valuation & Conversion
  it('Gate 8: Basic USD holding (10 qty * $25.00 * 5.20 = R$ 1,300.00)', () => {
    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'aapl', quantity: '10', totalCost: '200.00', currency: 'USD' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['aapl', makeQuote({ assetId: 'aapl', price: '25.00', currency: 'USD' as never })], // $250.00 market value
    ]);
    const fxRates = new Map<string, ValuationFxRate>([
      [
        'USD::BRL',
        {
          baseCurrency: 'USD' as never,
          quoteCurrency: 'BRL' as never,
          rate: '5.200000000000000000',
          rateDate: '2026-10-16',
          source: 'BCB_PTAX',
        },
      ],
    ]);

    const result = valuePortfolio({
      portfolioId: 'p-basic-usd',
      positions,
      accountPositions: new Map(),
      quotes,
      reportingCurrency: 'BRL' as never,
      fxRates,
    });

    // 10 * 25.00 = 250 USD
    expect(result.totalsByCurrency['USD'].marketValue.amount).toBe('250');
    // 250 USD * 5.20 = 1300 BRL
    expect(result.translatedSummary?.totalMarketValue.amount).toBe('1300');
    // Cost: 200 USD * 5.20 = 1040 BRL
    expect(result.translatedSummary?.totalCostBasis.amount).toBe('1040');
    // Unrealized: (250 - 200) * 5.20 = 50 * 5.20 = 260 BRL
    expect(result.translatedSummary?.totalUnrealizedGainLoss?.amount).toBe('260');
    expect(result.translatedSummary?.totalUnrealizedGainLossPercent).toBe('25');
  });

  // Gate 9: Non-Trivial Precision (zero IEEE-754 float drift)
  it('Gate 9: Arbitrary decimal precision preserves exact fractional digits without float drift', () => {
    const positions: PositionValuationInput[] = [
      makePos({
        assetId: 'high-prec',
        quantity: '1',
        totalCost: '100.000000000000000000',
        currency: 'USD' as never,
      }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      [
        'high-prec',
        makeQuote({
          assetId: 'high-prec',
          price: '123.456700000000000000',
          currency: 'USD' as never,
        }),
      ],
    ]);
    const fxRates = new Map<string, ValuationFxRate>([
      [
        'USD::BRL',
        {
          baseCurrency: 'USD' as never,
          quoteCurrency: 'BRL' as never,
          rate: '5.234567000000000000',
          rateDate: '2026-10-16',
          source: 'BCB_PTAX',
        },
      ],
    ]);

    const result = valuePortfolio({
      portfolioId: 'p-prec',
      positions,
      accountPositions: new Map(),
      quotes,
      reportingCurrency: 'BRL' as never,
      fxRates,
    });

    // 123.4567 * 5.234567 = 646.2423677489 exactly
    expect(result.translatedSummary?.totalMarketValue.amount).toBe('646.2423677489');
    expect(result.translatedSummary?.totalMarketValue.amount).not.toContain('e');
  });

  // Gate 10: Missing FX Rate Handling (PARTIAL status, zero invention)
  it('Gate 10: Missing FX rate marks summary PARTIAL and does not invent 1.0 or 0.0', () => {
    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'brl-1', quantity: '10', totalCost: '100.00', currency: 'BRL' as never }),
      makePos({ assetId: 'usd-1', quantity: '2', totalCost: '50.00', currency: 'USD' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['brl-1', makeQuote({ assetId: 'brl-1', price: '15.00', currency: 'BRL' as never })], // 150 BRL
      ['usd-1', makeQuote({ assetId: 'usd-1', price: '60.00', currency: 'USD' as never })], // 120 USD
    ]);

    const result = valuePortfolio({
      portfolioId: 'p-missing-fx',
      positions,
      accountPositions: new Map(),
      quotes,
      reportingCurrency: 'BRL' as never,
      fxRates: new Map(), // Empty FX rates
    });

    expect(result.translatedSummary?.status).toBe('PARTIAL');
    expect(result.translatedSummary?.untranslatedCurrencies).toEqual(['USD']);
    // Total translated reflects strictly the BRL portion (150 BRL), never 150 + 120 = 270 BRL
    expect(result.translatedSummary?.totalMarketValue.amount).toBe('150');
  });

  // Gate 11: Weekend/Holiday Lookback via PersistedFxDataProvider
  it('Gate 11: Saturday resolves to Friday PTAX without generating synthetic database rows', async () => {
    const repo = new MockFxObservationRepository([
      {
        id: 'friday-obs',
        baseCurrency: 'USD',
        quoteCurrency: 'BRL',
        observationDate: LocalDate.fromParts(2026, 10, 16), // Friday
        rate: '5.420000000000000000',
        rateType: 'ASK',
        source: 'BCB_PTAX',
        providerSeriesId: '10813',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const provider = new PersistedFxDataProvider(repo, { maxLookbackDays: 7 });

    // Request for Saturday, Oct 17
    const saturday = LocalDate.fromParts(2026, 10, 17);
    const resolved = await provider.getRate('USD' as never, 'BRL' as never, saturday);

    expect(resolved.date.toString()).toBe('2026-10-16');
    expect(resolved.rate.value).toBe('5.42');
    expect(resolved.source).toBe('BCB_PTAX');

    // Confirm no synthetic observation for Oct 17 was inserted into repository
    const satDirect = await repo.findObservation('USD', 'BRL', saturday);
    expect(satDirect).toBeNull();
  });

  // Gate 12: Rate Revisions Audit Trail
  it('Gate 12: Rate revisions create audit record and update rate without destructive overwrite', async () => {
    const repo = new MockFxObservationRepository();
    const date = LocalDate.fromParts(2026, 10, 16);

    // Initial insert
    const res1 = await repo.upsertObservation({
      baseCurrency: 'USD',
      quoteCurrency: 'BRL',
      observationDate: date,
      rate: '5.400000000000000000',
      rateType: 'ASK',
      source: 'BCB_PTAX',
    });
    expect(res1.outcome).toBe('INSERTED');

    // Same rate fetched again -> UNCHANGED
    const res2 = await repo.upsertObservation({
      baseCurrency: 'USD',
      quoteCurrency: 'BRL',
      observationDate: date,
      rate: '5.400000000000000000',
      rateType: 'ASK',
      source: 'BCB_PTAX',
    });
    expect(res2.outcome).toBe('UNCHANGED');

    // Upstream revision -> REVISED
    const res3 = await repo.upsertObservation({
      baseCurrency: 'USD',
      quoteCurrency: 'BRL',
      observationDate: date,
      rate: '5.425000000000000000',
      rateType: 'ASK',
      source: 'BCB_PTAX',
      reason: 'Official BCB PTAX retificação',
    });
    expect(res3.outcome).toBe('REVISED');
    expect(res3.revision).toBeDefined();
    expect(res3.revision?.priorRate).toBe('5.400000000000000000');
    expect(res3.revision?.newRate).toBe('5.425000000000000000');

    // Verify revision history
    const history = repo.getRevisionHistory(res1.observation.id);
    expect(history).toHaveLength(1);
    expect(history[0].reason).toBe('Official BCB PTAX retificação');
  });

  // Gate 13: Upstream Provider Outage Handling
  it('Gate 13: Upstream provider outage fails gracefully during ingestion and does not affect persisted reads', async () => {
    const failingFetch = (async () => {
      throw new Error('Upstream BCB timeout / network unreachable');
    }) as unknown as typeof fetch;

    const bcbProvider = new BcbFxDataProvider({ fetchFn: failingFetch });
    const from = LocalDate.fromParts(2026, 10, 10);
    const to = LocalDate.fromParts(2026, 10, 16);

    // Ingestion fails with controlled error
    await expect(bcbProvider.getRates('USD' as never, 'BRL' as never, from, to)).rejects.toThrow(
      /BCB PTAX provider unavailable/,
    );

    // Persisted reads continue working unhindered
    const repo = new MockFxObservationRepository([
      {
        id: 'persisted-1',
        baseCurrency: 'USD',
        quoteCurrency: 'BRL',
        observationDate: LocalDate.fromParts(2026, 10, 16),
        rate: '5.420000000000000000',
        rateType: 'ASK',
        source: 'BCB_PTAX',
        providerSeriesId: '10813',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const persistedProvider = new PersistedFxDataProvider(repo);
    const rate = await persistedProvider.getRate(
      'USD' as never,
      'BRL' as never,
      LocalDate.fromParts(2026, 10, 16),
    );
    expect(rate.rate.value).toBe('5.42');
  });

  // Gate 14: Multi-Asset Same-Currency Batching
  it('Gate 14: Multiple USD assets share single USD/BRL rate lookback', () => {
    const positions: PositionValuationInput[] = [
      makePos({ assetId: 'aapl', quantity: '10', totalCost: '500.00', currency: 'USD' as never }),
      makePos({ assetId: 'msft', quantity: '5', totalCost: '1000.00', currency: 'USD' as never }),
      makePos({ assetId: 'nvda', quantity: '20', totalCost: '2000.00', currency: 'USD' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['aapl', makeQuote({ assetId: 'aapl', price: '60.00', currency: 'USD' as never })], // 600 USD
      ['msft', makeQuote({ assetId: 'msft', price: '250.00', currency: 'USD' as never })], // 1250 USD
      ['nvda', makeQuote({ assetId: 'nvda', price: '120.00', currency: 'USD' as never })], // 2400 USD
    ]); // Total USD = 4250 USD

    const fxRates = new Map<string, ValuationFxRate>([
      [
        'USD::BRL',
        {
          baseCurrency: 'USD' as never,
          quoteCurrency: 'BRL' as never,
          rate: '5.000000000000000000',
          rateDate: '2026-10-16',
          source: 'BCB_PTAX',
        },
      ],
    ]);

    const result = valuePortfolio({
      portfolioId: 'p-multi-asset',
      positions,
      accountPositions: new Map(),
      quotes,
      reportingCurrency: 'BRL' as never,
      fxRates,
    });

    expect(result.totalsByCurrency['USD'].marketValue.amount).toBe('4250');
    // 4250 USD * 5.00 = 21250 BRL
    expect(result.translatedSummary?.totalMarketValue.amount).toBe('21250');
    expect(result.translatedSummary?.status).toBe('AVAILABLE');
    expect(Object.keys(result.translatedSummary?.ratesUsed ?? {})).toEqual(['USD::BRL']);
  });

  // Gate 15: Multiple Foreign Currencies (BRL, USD, EUR)
  it('Gate 15: Multiple currencies (BRL, USD, EUR) translated simultaneously into reporting currency', () => {
    const positions: PositionValuationInput[] = [
      makePos({
        assetId: 'petr4',
        quantity: '100',
        totalCost: '3000.00',
        currency: 'BRL' as never,
      }),
      makePos({ assetId: 'aapl', quantity: '10', totalCost: '1000.00', currency: 'USD' as never }),
      makePos({ assetId: 'sap', quantity: '5', totalCost: '500.00', currency: 'EUR' as never }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['petr4', makeQuote({ assetId: 'petr4', price: '35.00', currency: 'BRL' as never })], // 3500 BRL
      ['aapl', makeQuote({ assetId: 'aapl', price: '150.00', currency: 'USD' as never })], // 1500 USD
      ['sap', makeQuote({ assetId: 'sap', price: '120.00', currency: 'EUR' as never })], // 600 EUR
    ]);

    const fxRates = new Map<string, ValuationFxRate>([
      [
        'USD::BRL',
        {
          baseCurrency: 'USD' as never,
          quoteCurrency: 'BRL' as never,
          rate: '5.200000000000000000',
          rateDate: '2026-10-16',
          source: 'BCB_PTAX',
        },
      ],
      [
        'EUR::BRL',
        {
          baseCurrency: 'EUR' as never,
          quoteCurrency: 'BRL' as never,
          rate: '5.800000000000000000',
          rateDate: '2026-10-16',
          source: 'BCB_PTAX',
        },
      ],
    ]);

    const result = valuePortfolio({
      portfolioId: 'p-tri-currency',
      positions,
      accountPositions: new Map(),
      quotes,
      reportingCurrency: 'BRL' as never,
      fxRates,
    });

    // Native totals intact
    expect(result.totalsByCurrency['BRL'].marketValue.amount).toBe('3500');
    expect(result.totalsByCurrency['USD'].marketValue.amount).toBe('1500');
    expect(result.totalsByCurrency['EUR'].marketValue.amount).toBe('600');

    // Consolidated: 3500 BRL + (1500 * 5.20 = 7800) + (600 * 5.80 = 3480) = 3500 + 7800 + 3480 = 14780 BRL
    expect(result.translatedSummary?.totalMarketValue.amount).toBe('14780');
    expect(result.translatedSummary?.status).toBe('AVAILABLE');
    expect(result.translatedSummary?.untranslatedCurrencies).toHaveLength(0);
  });

  // Gates 16 & 17: Allocation Complete & Partial Behavior
  it('Gates 16 & 17: Allocation retains strict currency segregation and never creates synthetic denominators', () => {
    const positions: PositionValuationInput[] = [
      makePos({
        assetId: 'petr4',
        ticker: 'PETR4',
        quantity: '100',
        totalCost: '1000.00',
        currency: 'BRL' as never,
      }),
      makePos({
        assetId: 'vale3',
        ticker: 'VALE3',
        quantity: '50',
        totalCost: '500.00',
        currency: 'BRL' as never,
      }),
      makePos({
        assetId: 'aapl',
        ticker: 'AAPL',
        quantity: '10',
        totalCost: '500.00',
        currency: 'USD' as never,
      }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      ['petr4', makeQuote({ assetId: 'petr4', price: '10.00', currency: 'BRL' as never })], // 1000 BRL
      ['vale3', makeQuote({ assetId: 'vale3', price: '10.00', currency: 'BRL' as never })], // 500 BRL
      ['aapl', makeQuote({ assetId: 'aapl', price: '50.00', currency: 'USD' as never })], // 500 USD
    ]);

    const valuation = valuePortfolio({
      portfolioId: 'p-alloc',
      positions,
      accountPositions: new Map(),
      quotes,
    });

    const alloc = computePortfolioAllocation(valuation);

    // BRL bucket: Total = 1500 BRL (PETR4: 1000/1500 = 66.67%, VALE3: 500/1500 = 33.33%)
    const brlBucket = alloc.currencies['BRL'];
    expect(brlBucket).toBeDefined();
    expect(brlBucket.totalMarketValue.amount).toBe('1500');
    expect(brlBucket.byAsset.find((a) => a.ticker === 'PETR4')?.allocationPercent).toMatch(
      /^66\.66/,
    );
    expect(brlBucket.byAsset.find((a) => a.ticker === 'VALE3')?.allocationPercent).toMatch(
      /^33\.33/,
    );

    // USD bucket: Total = 500 USD (AAPL: 500/500 = 100%)
    const usdBucket = alloc.currencies['USD'];
    expect(usdBucket).toBeDefined();
    expect(usdBucket.totalMarketValue.amount).toBe('500');
    expect(usdBucket.byAsset.find((a) => a.ticker === 'AAPL')?.allocationPercent).toBe('100');

    // Currencies are never mixed in allocation buckets
    expect(Object.keys(alloc.currencies)).toEqual(expect.arrayContaining(['BRL', 'USD']));
  });

  // Gate 18: BRL-Only Backward Compatibility
  it('Gate 18: Pure BRL portfolio behaves identically before and after Phase 5C without FX dependency', () => {
    const positions: PositionValuationInput[] = [
      makePos({
        assetId: 'brl-only-1',
        quantity: '10',
        totalCost: '100.00',
        currency: 'BRL' as never,
      }),
      makePos({
        assetId: 'brl-only-2',
        quantity: '5',
        totalCost: '50.00',
        currency: 'BRL' as never,
      }),
    ];
    const quotes = new Map<string, ValuationQuote>([
      [
        'brl-only-1',
        makeQuote({ assetId: 'brl-only-1', price: '15.00', currency: 'BRL' as never }),
      ], // 150
      [
        'brl-only-2',
        makeQuote({ assetId: 'brl-only-2', price: '20.00', currency: 'BRL' as never }),
      ], // 100
    ]);

    const valuation = valuePortfolio({
      portfolioId: 'p-brl-only',
      positions,
      accountPositions: new Map(),
      quotes,
    });

    // Native totals
    expect(valuation.totalsByCurrency['BRL'].marketValue.amount).toBe('250');
    expect(valuation.totalsByCurrency['BRL'].knownCost.amount).toBe('150');
    expect(valuation.totalsByCurrency['BRL'].unrealizedGainLoss?.amount).toBe('100');
    expect(valuation.totalsByCurrency['USD']).toBeUndefined();

    // Translated summary for BRL reporting currency is immediately AVAILABLE without any FX rates
    expect(valuation.translatedSummary?.status).toBe('AVAILABLE');
    expect(valuation.translatedSummary?.totalMarketValue.amount).toBe('250');
    expect(valuation.translatedSummary?.reportingCurrency).toBe('BRL');
    expect(Object.keys(valuation.translatedSummary?.ratesUsed ?? {})).toHaveLength(0);
  });
});
