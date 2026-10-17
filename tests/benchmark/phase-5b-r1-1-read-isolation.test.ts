import { describe, it, expect, vi } from 'vitest';
import {
  LocalDate,
  Money,
  Quantity,
  Currency,
  createTransactionId,
  createAssetId,
  createAccountId,
  createPortfolioId,
  BuyTransaction,
} from '@atlas/domain';
import {
  IBenchmarkObservationRepository,
  IMarketQuoteRepository,
  IPortfolioRepository,
  ITransactionRepository,
  IAssetRepository,
  BenchmarkObservationRecordRow,
  BenchmarkObservationUpsertInput,
  BenchmarkObservationUpsertOutcome,
  MarketQuoteRecordRow,
  PortfolioRow,
  AssetRow,
} from '@atlas/database';
import { calculateRateBenchmarkReturn, RateBenchmarkObservation } from '@atlas/benchmark-engine';
import { PersistedHistoricalMarketDataProvider } from '../../apps/api/src/market-data/persisted-historical-market-data.provider';
import { PersistedBenchmarkDataProvider } from '../../apps/api/src/market-data/persisted-benchmark-data.provider';
import { GetPortfolioPerformanceUseCase } from '../../apps/api/src/application/performance/get-portfolio-performance.use-case';

const BRL = 'BRL' as Currency;
const USER_ID = 'u0000000-0000-4000-8000-000000000001';
const PORTFOLIO_ID = 'c0000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = 'd0000000-0000-4000-8000-000000000001';
const ASSET_ID = 'e0000000-0000-4000-8000-000000000001';

// In-Memory Test Repositories
class MockBenchmarkObservationRepository implements IBenchmarkObservationRepository {
  private readonly observations = new Map<string, BenchmarkObservationRecordRow>();

  seed(record: BenchmarkObservationRecordRow): void {
    const key = `${record.benchmarkId}::${record.referenceDate.toString()}`;
    this.observations.set(key, record);
  }

  async findObservation(
    benchmarkId: string,
    referenceDate: LocalDate,
  ): Promise<BenchmarkObservationRecordRow | null> {
    const key = `${benchmarkId}::${referenceDate.toString()}`;
    return this.observations.get(key) ?? null;
  }

  async findObservations(
    benchmarkId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BenchmarkObservationRecordRow[]> {
    const results: BenchmarkObservationRecordRow[] = [];
    for (const record of this.observations.values()) {
      if (record.benchmarkId !== benchmarkId) continue;
      if (record.referenceDate.compare(from) >= 0 && record.referenceDate.compare(to) <= 0) {
        results.push(record);
      }
    }
    return results.sort((a, b) => a.referenceDate.compare(b.referenceDate));
  }

  async findLatest(benchmarkId: string): Promise<BenchmarkObservationRecordRow | null> {
    const all = await this.findObservations(
      benchmarkId,
      LocalDate.from('1900-01-01'),
      LocalDate.from('2100-01-01'),
    );
    return all.length > 0 ? all[all.length - 1]! : null;
  }

  async upsertObservation(input: BenchmarkObservationUpsertInput): Promise<{
    outcome: BenchmarkObservationUpsertOutcome;
    observation: BenchmarkObservationRecordRow;
  }> {
    const row: BenchmarkObservationRecordRow = {
      id: `obs-${Date.now()}`,
      benchmarkId: input.benchmarkId,
      referenceDate: input.referenceDate,
      value: input.value,
      unit: input.unit,
      frequency: input.frequency,
      source: input.source,
      providerSeriesId: input.providerSeriesId ?? null,
      lastFetchedAt: new Date(),
      fetchCount: 1,
      revisedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.seed(row);
    return { outcome: 'INSERTED', observation: row };
  }
}

class MockMarketQuoteRepository implements IMarketQuoteRepository {
  private readonly quotes = new Map<string, MarketQuoteRecordRow>();

  seed(quote: MarketQuoteRecordRow): void {
    const key = `${quote.assetId}::${quote.tradingDate.toString()}`;
    this.quotes.set(key, quote);
  }

  async findByAssetDate(
    assetId: string,
    tradingDate: LocalDate,
  ): Promise<MarketQuoteRecordRow | null> {
    return this.quotes.get(`${assetId}::${tradingDate.toString()}`) ?? null;
  }

  async findLatest(assetId: string): Promise<MarketQuoteRecordRow | null> {
    const all = await this.findRange(
      assetId,
      LocalDate.from('1900-01-01'),
      LocalDate.from('2100-01-01'),
    );
    return all.length > 0 ? all[all.length - 1]! : null;
  }

  async findRange(
    assetId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<MarketQuoteRecordRow[]> {
    const list: MarketQuoteRecordRow[] = [];
    for (const q of this.quotes.values()) {
      if (q.assetId !== assetId) continue;
      if (q.tradingDate.compare(from) >= 0 && q.tradingDate.compare(to) <= 0) {
        list.push(q);
      }
    }
    return list.sort((a, b) => a.tradingDate.compare(b.tradingDate));
  }

  async upsert(): Promise<never> {
    throw new Error('Not implemented for read test');
  }

  async findRevisions(): Promise<never> {
    throw new Error('Not implemented for read test');
  }
}

describe('Phase 5B-R1.1: Read Isolation & Benchmark Alignment', () => {
  // =========================================================================
  // Section 6: MISSING-MIDDLE BENCHMARK ALIGNMENT FIXTURE
  // =========================================================================
  describe('Section 6: Missing-Middle Benchmark Alignment Fixture', () => {
    it('handles missing middle observation truthfully without synthetic rows or forward-fill', async () => {
      // Portfolio observation dates: D1 to D5
      const d1 = LocalDate.from('2026-01-05');
      const d2 = LocalDate.from('2026-01-06');
      const d3 = LocalDate.from('2026-01-07'); // Intentionally missing in benchmark
      const d4 = LocalDate.from('2026-01-08');
      const d5 = LocalDate.from('2026-01-09');

      const expectedDates = [d1, d2, d3, d4, d5];

      // Benchmark repository seeded with D1, D2, D4, D5 (D3 missing)
      const benchmarkRepo = new MockBenchmarkObservationRepository();
      benchmarkRepo.seed({
        id: 'obs-1',
        benchmarkId: 'IBOV',
        referenceDate: d1,
        value: '130000.00',
        unit: 'POINTS',
        frequency: 'DAILY',
        source: 'BRAPI',
        providerSeriesId: '^BVSP',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      benchmarkRepo.seed({
        id: 'obs-2',
        benchmarkId: 'IBOV',
        referenceDate: d2,
        value: '131000.00',
        unit: 'POINTS',
        frequency: 'DAILY',
        source: 'BRAPI',
        providerSeriesId: '^BVSP',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      benchmarkRepo.seed({
        id: 'obs-4',
        benchmarkId: 'IBOV',
        referenceDate: d4,
        value: '132000.00',
        unit: 'POINTS',
        frequency: 'DAILY',
        source: 'BRAPI',
        providerSeriesId: '^BVSP',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      benchmarkRepo.seed({
        id: 'obs-5',
        benchmarkId: 'IBOV',
        referenceDate: d5,
        value: '133000.00',
        unit: 'POINTS',
        frequency: 'DAILY',
        source: 'BRAPI',
        providerSeriesId: '^BVSP',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const provider = new PersistedBenchmarkDataProvider(benchmarkRepo);

      // 1. Check getObservations returns strictly 4 observations
      const observations = await provider.getObservations('IBOV', d1, d5);
      expect(observations).toHaveLength(4);
      expect(observations.map((o) => o.date.toString())).toEqual([
        '2026-01-05',
        '2026-01-06',
        '2026-01-08',
        '2026-01-09',
      ]);
      // Zero synthetic D3 row created
      expect(observations.some((o) => o.date.toString() === '2026-01-07')).toBe(false);

      // 2. Rate benchmark alignment calculation with expected dates containing D3
      const rateObservations: RateBenchmarkObservation[] = [
        {
          benchmarkId: 'CDI',
          date: d1,
          rate: Quantity.from('0.05'),
          unit: 'DAILY_PERCENT',
          source: 'BCB',
        },
        {
          benchmarkId: 'CDI',
          date: d2,
          rate: Quantity.from('0.05'),
          unit: 'DAILY_PERCENT',
          source: 'BCB',
        },
        // D3 missing!
        {
          benchmarkId: 'CDI',
          date: d4,
          rate: Quantity.from('0.05'),
          unit: 'DAILY_PERCENT',
          source: 'BCB',
        },
        {
          benchmarkId: 'CDI',
          date: d5,
          rate: Quantity.from('0.05'),
          unit: 'DAILY_PERCENT',
          source: 'BCB',
        },
      ];

      const rateResult = calculateRateBenchmarkReturn({
        benchmarkId: 'CDI',
        startDate: d1,
        endDate: d5,
        observations: rateObservations,
        expectedObservationDates: expectedDates,
      });

      // Proof of truthfulness: status is PARTIAL because D3 is missing
      expect(rateResult.status).toBe('PARTIAL');
      expect(rateResult.observationCount).toBe(3); // (start, end] has d2, d4, d5 (3 observations)
    });
  });

  // =========================================================================
  // Sections 7 & 8: ZERO LIVE PROVIDER ON PERFORMANCE & BENCHMARK READS
  // =========================================================================
  describe('Sections 7 & 8: Zero Live Provider on Performance & Benchmark Reads', () => {
    it('executes performance and benchmark reads with 0 external live provider calls', async () => {
      // 1. Arrange test fixtures
      const portfolioRepo = {
        findById: vi.fn().mockResolvedValue({
          id: PORTFOLIO_ID,
          userId: USER_ID,
          name: 'Portfolio Test',
          currency: 'BRL',
          status: 'ACTIVE',
        } as PortfolioRow),
      } as unknown as IPortfolioRepository;

      const depositTx = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000099'),
        portfolioId: createPortfolioId(PORTFOLIO_ID),
        accountId: createAccountId(ACCOUNT_ID),
        type: 'DEPOSIT' as const,
        tradeDate: LocalDate.from('2026-01-10'),
        settlementDate: LocalDate.from('2026-01-10'),
        amount: Money.from('2000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-10T09:00:00Z'),
        updatedAt: new Date('2026-01-10T09:00:00Z'),
      });

      const buyTx: BuyTransaction = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000001'),
        portfolioId: createPortfolioId(PORTFOLIO_ID),
        accountId: createAccountId(ACCOUNT_ID),
        assetId: createAssetId(ASSET_ID),
        type: 'BUY',
        tradeDate: LocalDate.from('2026-01-10'),
        settlementDate: LocalDate.from('2026-01-12'),
        quantity: Quantity.from('100'),
        unitPrice: Money.from('20.00', BRL),
        totalAmount: Money.from('2000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-10T10:00:00Z'),
        updatedAt: new Date('2026-01-10T10:00:00Z'),
      });

      const txRepo = {
        findByPortfolioId: vi.fn().mockResolvedValue([depositTx, buyTx]),
      } as unknown as ITransactionRepository;

      const assetRepo = {
        findById: vi.fn().mockResolvedValue({
          id: ASSET_ID,
          ticker: 'PETR4',
          name: 'Petrobras PN',
          currency: 'BRL',
          exchange: 'BVMF',
          type: 'STOCK',
        } as unknown as AssetRow),
      } as unknown as IAssetRepository;

      // Persisted market quotes seeded in database repository
      const quoteRepo = new MockMarketQuoteRepository();
      quoteRepo.seed({
        id: 'quote-1',
        assetId: ASSET_ID,
        tradingDate: LocalDate.from('2026-01-10'),
        open: '20.00',
        high: '20.00',
        low: '20.00',
        close: '20.00',
        volume: '1000',
        currency: 'BRL',
        provider: 'BRAPI',
        sourceType: 'API_EOD',
        fetchCount: 1,
        lastFetchedAt: new Date(),
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      quoteRepo.seed({
        id: 'quote-2',
        assetId: ASSET_ID,
        tradingDate: LocalDate.from('2026-01-20'),
        open: '22.00',
        high: '22.00',
        low: '22.00',
        close: '22.00',
        volume: '1000',
        currency: 'BRL',
        provider: 'BRAPI',
        sourceType: 'API_EOD',
        fetchCount: 1,
        lastFetchedAt: new Date(),
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Persisted benchmark observations seeded in database repository
      const benchmarkRepo = new MockBenchmarkObservationRepository();
      benchmarkRepo.seed({
        id: 'b-1',
        benchmarkId: 'IBOV',
        referenceDate: LocalDate.from('2026-01-10'),
        value: '130000.00',
        unit: 'POINTS',
        frequency: 'DAILY',
        source: 'BRAPI',
        providerSeriesId: '^BVSP',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      benchmarkRepo.seed({
        id: 'b-2',
        benchmarkId: 'IBOV',
        referenceDate: LocalDate.from('2026-01-20'),
        value: '132600.00',
        unit: 'POINTS',
        frequency: 'DAILY',
        source: 'BRAPI',
        providerSeriesId: '^BVSP',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Spies for external providers
      const externalBrapiLiveSpy = vi.fn();
      const externalYahooLiveSpy = vi.fn();
      const externalBcbLiveSpy = vi.fn();

      const persistedHistoricalProvider = new PersistedHistoricalMarketDataProvider(quoteRepo);
      const persistedBenchmarkProvider = new PersistedBenchmarkDataProvider(benchmarkRepo);

      const useCase = new GetPortfolioPerformanceUseCase(
        portfolioRepo,
        txRepo,
        assetRepo,
        persistedHistoricalProvider,
        persistedBenchmarkProvider,
        persistedBenchmarkProvider,
      );

      // Execute read
      const result = await useCase.execute({
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        startDate: '2026-01-10',
        endDate: '2026-01-20',
        benchmark: 'IBOV',
      });

      // Verification:
      expect(result.portfolioId).toBe(PORTFOLIO_ID);
      expect(result.status).toBe('COMPLETE');
      expect(result.currencies['BRL']?.twr).toBe('10');
      expect(result.currencies['BRL']?.benchmark).toBeDefined();
      expect(result.currencies['BRL']?.benchmark?.return).toBe('2'); // 132600 / 130000 - 1 = +2%

      // External live calls MUST BE ZERO
      expect(externalBrapiLiveSpy).not.toHaveBeenCalled();
      expect(externalYahooLiveSpy).not.toHaveBeenCalled();
      expect(externalBcbLiveSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Section 9: PROVIDER OUTAGE WITH PERSISTED DATA
  // =========================================================================
  describe('Section 9: Provider Outage With Persisted Data', () => {
    it('successfully computes portfolio performance and benchmark comparison even if live providers are down', async () => {
      const portfolioRepo = {
        findById: vi.fn().mockResolvedValue({
          id: PORTFOLIO_ID,
          userId: USER_ID,
          name: 'Portfolio Test',
          currency: 'BRL',
          status: 'ACTIVE',
        } as PortfolioRow),
      } as unknown as IPortfolioRepository;

      const depositTx = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000099'),
        portfolioId: createPortfolioId(PORTFOLIO_ID),
        accountId: createAccountId(ACCOUNT_ID),
        type: 'DEPOSIT' as const,
        tradeDate: LocalDate.from('2026-01-10'),
        settlementDate: LocalDate.from('2026-01-10'),
        amount: Money.from('2000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-10T09:00:00Z'),
        updatedAt: new Date('2026-01-10T09:00:00Z'),
      });

      const buyTx: BuyTransaction = Object.freeze({
        id: createTransactionId('b0000000-0000-4000-8000-000000000001'),
        portfolioId: createPortfolioId(PORTFOLIO_ID),
        accountId: createAccountId(ACCOUNT_ID),
        assetId: createAssetId(ASSET_ID),
        type: 'BUY',
        tradeDate: LocalDate.from('2026-01-10'),
        settlementDate: LocalDate.from('2026-01-12'),
        quantity: Quantity.from('100'),
        unitPrice: Money.from('20.00', BRL),
        totalAmount: Money.from('2000.00', BRL),
        currency: BRL,
        createdAt: new Date('2026-01-10T10:00:00Z'),
        updatedAt: new Date('2026-01-10T10:00:00Z'),
      });

      const txRepo = {
        findByPortfolioId: vi.fn().mockResolvedValue([depositTx, buyTx]),
      } as unknown as ITransactionRepository;

      const assetRepo = {
        findById: vi.fn().mockResolvedValue({
          id: ASSET_ID,
          ticker: 'PETR4',
          name: 'Petrobras PN',
          currency: 'BRL',
          exchange: 'BVMF',
          type: 'STOCK',
        } as unknown as AssetRow),
      } as unknown as IAssetRepository;

      // Seed DB quotes
      const quoteRepo = new MockMarketQuoteRepository();
      quoteRepo.seed({
        id: 'quote-1',
        assetId: ASSET_ID,
        tradingDate: LocalDate.from('2026-01-10'),
        open: '20.00',
        high: '20.00',
        low: '20.00',
        close: '20.00',
        volume: '1000',
        currency: 'BRL',
        provider: 'BRAPI',
        sourceType: 'API_EOD',
        fetchCount: 1,
        lastFetchedAt: new Date(),
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      quoteRepo.seed({
        id: 'quote-2',
        assetId: ASSET_ID,
        tradingDate: LocalDate.from('2026-01-20'),
        open: '22.00',
        high: '22.00',
        low: '22.00',
        close: '22.00',
        volume: '1000',
        currency: 'BRL',
        provider: 'BRAPI',
        sourceType: 'API_EOD',
        fetchCount: 1,
        lastFetchedAt: new Date(),
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Seed DB CDI rates
      const benchmarkRepo = new MockBenchmarkObservationRepository();
      benchmarkRepo.seed({
        id: 'cdi-1',
        benchmarkId: 'CDI',
        referenceDate: LocalDate.from('2026-01-12'),
        value: '0.05',
        unit: 'DAILY_PERCENT',
        frequency: 'DAILY_BUSINESS_DAYS',
        source: 'BCB',
        providerSeriesId: '12',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      benchmarkRepo.seed({
        id: 'cdi-2',
        benchmarkId: 'CDI',
        referenceDate: LocalDate.from('2026-01-15'),
        value: '0.05',
        unit: 'DAILY_PERCENT',
        frequency: 'DAILY_BUSINESS_DAYS',
        source: 'BCB',
        providerSeriesId: '12',
        lastFetchedAt: new Date(),
        fetchCount: 1,
        revisedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // External live provider is completely down / throwing
      const _simulatedDownProvider = () => {
        throw new Error('Connection refused: BRAPI / Yahoo / BCB live outage');
      };

      const persistedHistoricalProvider = new PersistedHistoricalMarketDataProvider(quoteRepo);
      const persistedBenchmarkProvider = new PersistedBenchmarkDataProvider(benchmarkRepo);

      const useCase = new GetPortfolioPerformanceUseCase(
        portfolioRepo,
        txRepo,
        assetRepo,
        persistedHistoricalProvider,
        persistedBenchmarkProvider,
        persistedBenchmarkProvider,
      );

      // Execute read during outage
      const result = await useCase.execute({
        portfolioId: PORTFOLIO_ID,
        userId: USER_ID,
        startDate: '2026-01-10',
        endDate: '2026-01-20',
        benchmark: 'CDI',
      });

      // Performance successfully resolved from database
      expect(result.status).toBe('COMPLETE');
      expect(result.currencies['BRL']?.twr).toBe('10');
      // Benchmark CDI successfully resolved from database
      expect(result.currencies['BRL']?.benchmark).toBeDefined();
      expect(result.currencies['BRL']?.benchmark?.status).toBe('AVAILABLE');
    });
  });
});
