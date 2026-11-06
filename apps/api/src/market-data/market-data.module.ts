import { Module, Global } from '@nestjs/common';
import {
  InMemoryHistoricalMarketDataProvider,
  StooqHistoricalMarketDataProvider,
  BrapiHistoricalMarketDataProvider,
  HistoricalMarketDataProvider,
  InMemoryMarketDataProvider,
  BrapiProviderAdapter,
  MarketDataProvider,
} from '@atlas/market-data';
import {
  InMemoryBenchmarkDataProvider,
  StooqBenchmarkDataProvider,
  YahooBenchmarkDataProvider,
  BcbRateBenchmarkDataProvider,
  InMemoryRateBenchmarkDataProvider,
  BenchmarkDataProvider,
  RateBenchmarkDataProvider,
} from '@atlas/benchmark-engine';
import {
  MARKET_DATA_PROVIDER,
  HISTORICAL_MARKET_DATA_PROVIDER,
  HISTORICAL_MARKET_DATA_INGESTION_PROVIDER,
  BENCHMARK_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from './tokens';
import { BENCHMARK_OBSERVATION_REPOSITORY, MARKET_QUOTE_REPOSITORY } from '../database/tokens';
import { IBenchmarkObservationRepository, IMarketQuoteRepository } from '@atlas/database';
import { PersistedHistoricalMarketDataProvider } from './persisted-historical-market-data.provider';
import { PersistedBenchmarkDataProvider } from './persisted-benchmark-data.provider';
import { MarketDataConfigService } from './market-data-config.service';

let sharedMarketDataProvider: MarketDataProvider | null = null;
let sharedHistoricalProvider: HistoricalMarketDataProvider | null = null;
let sharedIngestionProvider: HistoricalMarketDataProvider | null = null;

function createMarketDataProvider(): MarketDataProvider {
  if (sharedMarketDataProvider) return sharedMarketDataProvider;
  const defaultProvider = process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : 'BRAPI';
  const providerName = (process.env.MARKET_DATA_PROVIDER ?? defaultProvider).trim().toUpperCase();
  const token = process.env.MARKET_DATA_API_TOKEN ?? process.env.BRAPI_API_KEY;
  const timeoutMs = parseInt(process.env.MARKET_DATA_TIMEOUT_MS ?? '10000', 10);

  if (providerName === 'BRAPI') {
    sharedMarketDataProvider = new BrapiProviderAdapter({ token, timeoutMs });
    return sharedMarketDataProvider;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Security invariant violated: Market data provider '${providerName}' is invalid. Fallback to InMemoryMarketDataProvider is strictly prohibited in production.`,
    );
  }
  sharedMarketDataProvider = new InMemoryMarketDataProvider();
  return sharedMarketDataProvider;
}

function createHistoricalProvider(
  quoteRepo?: IMarketQuoteRepository,
): HistoricalMarketDataProvider {
  if (sharedHistoricalProvider) return sharedHistoricalProvider;
  const providerName = (
    process.env.HISTORICAL_MARKET_DATA_PROVIDER ??
    process.env.MARKET_DATA_PROVIDER ??
    (process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : 'PERSISTED')
  )
    .trim()
    .toUpperCase();
  const token = process.env.MARKET_DATA_API_TOKEN ?? process.env.BRAPI_API_KEY;
  const timeoutMs = parseInt(
    process.env.HISTORICAL_MARKET_DATA_TIMEOUT_MS ?? process.env.MARKET_DATA_TIMEOUT_MS ?? '15000',
    10,
  );
  const maxLookback = parseInt(process.env.HISTORICAL_MARKET_DATA_MAX_LOOKBACK_DAYS ?? '7', 10);

  if (providerName === 'PERSISTED' && quoteRepo) {
    sharedHistoricalProvider = new PersistedHistoricalMarketDataProvider(quoteRepo);
    return sharedHistoricalProvider;
  }
  if (providerName === 'BRAPI') {
    sharedHistoricalProvider = new BrapiHistoricalMarketDataProvider({ token, timeoutMs });
    return sharedHistoricalProvider;
  }
  if (providerName === 'STOOQ') {
    sharedHistoricalProvider = new StooqHistoricalMarketDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
    return sharedHistoricalProvider;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Security invariant violated: Historical market data provider '${providerName}' is invalid. Fallback to InMemoryHistoricalMarketDataProvider is strictly prohibited in production.`,
    );
  }
  sharedHistoricalProvider = new InMemoryHistoricalMarketDataProvider({ maxLookbackDays: maxLookback });
  return sharedHistoricalProvider;
}

function createHistoricalIngestionProvider(): HistoricalMarketDataProvider {
  if (sharedIngestionProvider) return sharedIngestionProvider;
  const defaultProvider = process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : 'BRAPI';
  const providerName = (
    process.env.HISTORICAL_MARKET_DATA_INGESTION_PROVIDER ??
    process.env.MARKET_DATA_PROVIDER ??
    defaultProvider
  )
    .trim()
    .toUpperCase();
  const token = process.env.MARKET_DATA_API_TOKEN ?? process.env.BRAPI_API_KEY;
  const timeoutMs = parseInt(
    process.env.HISTORICAL_MARKET_DATA_TIMEOUT_MS ?? process.env.MARKET_DATA_TIMEOUT_MS ?? '15000',
    10,
  );
  const maxLookback = parseInt(process.env.HISTORICAL_MARKET_DATA_MAX_LOOKBACK_DAYS ?? '7', 10);

  if (providerName === 'BRAPI') {
    sharedIngestionProvider = new BrapiHistoricalMarketDataProvider({ token, timeoutMs });
    return sharedIngestionProvider;
  }
  if (providerName === 'STOOQ') {
    sharedIngestionProvider = new StooqHistoricalMarketDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
    return sharedIngestionProvider;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Security invariant violated: Ingestion market data provider '${providerName}' is invalid. Fallback to InMemoryHistoricalMarketDataProvider is strictly prohibited in production.`,
    );
  }
  sharedIngestionProvider = new InMemoryHistoricalMarketDataProvider({ maxLookbackDays: maxLookback });
  return sharedIngestionProvider;
}

function createBenchmarkProvider(
  benchmarkRepo?: IBenchmarkObservationRepository,
): BenchmarkDataProvider {
  const defaultProvider = process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : 'PERSISTED';
  const providerName = (process.env.BENCHMARK_DATA_PROVIDER ?? defaultProvider)
    .trim()
    .toUpperCase();
  const timeoutMs = parseInt(process.env.BENCHMARK_DATA_TIMEOUT_MS ?? '15000', 10);
  const maxLookback = parseInt(process.env.BENCHMARK_DATA_MAX_LOOKBACK_DAYS ?? '7', 10);

  if (providerName === 'PERSISTED' && benchmarkRepo) {
    return new PersistedBenchmarkDataProvider(benchmarkRepo, { maxLookbackDays: maxLookback });
  }
  if (providerName === 'STOOQ') {
    return new StooqBenchmarkDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
  }
  if (providerName === 'YAHOO') {
    return new YahooBenchmarkDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Security invariant violated: Benchmark data provider '${providerName}' is invalid. Fallback to InMemoryBenchmarkDataProvider is strictly prohibited in production.`,
    );
  }
  return new InMemoryBenchmarkDataProvider({ maxLookbackDays: maxLookback });
}

function createRateBenchmarkProvider(
  benchmarkRepo?: IBenchmarkObservationRepository,
): RateBenchmarkDataProvider {
  const defaultProvider = process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : 'PERSISTED';
  const providerName = (
    process.env.RATE_BENCHMARK_DATA_PROVIDER ??
    process.env.BENCHMARK_DATA_PROVIDER ??
    defaultProvider
  )
    .trim()
    .toUpperCase();
  const timeoutMs = parseInt(
    process.env.RATE_BENCHMARK_DATA_TIMEOUT_MS ?? process.env.BENCHMARK_DATA_TIMEOUT_MS ?? '15000',
    10,
  );
  if (providerName === 'PERSISTED' && benchmarkRepo) {
    return new PersistedBenchmarkDataProvider(benchmarkRepo);
  }
  if (providerName === 'BCB') {
    return new BcbRateBenchmarkDataProvider({ timeoutMs });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Security invariant violated: Rate benchmark data provider '${providerName}' is invalid. Fallback to InMemoryRateBenchmarkDataProvider is strictly prohibited in production.`,
    );
  }
  return new InMemoryRateBenchmarkDataProvider();
}

@Global()
@Module({
  providers: [
    MarketDataConfigService,
    {
      provide: MARKET_DATA_PROVIDER,
      useFactory: () => createMarketDataProvider(),
    },
    {
      provide: HISTORICAL_MARKET_DATA_PROVIDER,
      useFactory: (quoteRepo: IMarketQuoteRepository) => createHistoricalProvider(quoteRepo),
      inject: [MARKET_QUOTE_REPOSITORY],
    },
    {
      provide: HISTORICAL_MARKET_DATA_INGESTION_PROVIDER,
      useFactory: () => createHistoricalIngestionProvider(),
    },
    {
      provide: BENCHMARK_DATA_PROVIDER,
      useFactory: (benchmarkRepo: IBenchmarkObservationRepository) =>
        createBenchmarkProvider(benchmarkRepo),
      inject: [BENCHMARK_OBSERVATION_REPOSITORY],
    },
    {
      provide: RATE_BENCHMARK_DATA_PROVIDER,
      useFactory: (benchmarkRepo: IBenchmarkObservationRepository) =>
        createRateBenchmarkProvider(benchmarkRepo),
      inject: [BENCHMARK_OBSERVATION_REPOSITORY],
    },
  ],
  exports: [
    MarketDataConfigService,
    MARKET_DATA_PROVIDER,
    HISTORICAL_MARKET_DATA_PROVIDER,
    HISTORICAL_MARKET_DATA_INGESTION_PROVIDER,
    BENCHMARK_DATA_PROVIDER,
    RATE_BENCHMARK_DATA_PROVIDER,
  ],
})
export class HistoricalMarketDataModule {}
