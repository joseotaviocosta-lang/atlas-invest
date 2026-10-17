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

function createMarketDataProvider(): MarketDataProvider {
  const defaultProvider = process.env.NODE_ENV === 'test' ? 'IN_MEMORY' : 'BRAPI';
  const providerName = (process.env.MARKET_DATA_PROVIDER ?? defaultProvider).trim().toUpperCase();
  const token = process.env.MARKET_DATA_API_TOKEN ?? process.env.BRAPI_API_KEY;
  const timeoutMs = parseInt(process.env.MARKET_DATA_TIMEOUT_MS ?? '10000', 10);

  if (providerName === 'BRAPI') {
    return new BrapiProviderAdapter({ token, timeoutMs });
  }
  return new InMemoryMarketDataProvider();
}

function createHistoricalProvider(
  quoteRepo?: IMarketQuoteRepository,
): HistoricalMarketDataProvider {
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
    return new PersistedHistoricalMarketDataProvider(quoteRepo);
  }
  if (providerName === 'BRAPI') {
    return new BrapiHistoricalMarketDataProvider({ token, timeoutMs });
  }
  if (providerName === 'STOOQ') {
    return new StooqHistoricalMarketDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
  }
  return new InMemoryHistoricalMarketDataProvider({ maxLookbackDays: maxLookback });
}

function createHistoricalIngestionProvider(): HistoricalMarketDataProvider {
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
    return new BrapiHistoricalMarketDataProvider({ token, timeoutMs });
  }
  if (providerName === 'STOOQ') {
    return new StooqHistoricalMarketDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
  }
  return new InMemoryHistoricalMarketDataProvider({ maxLookbackDays: maxLookback });
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
  return new InMemoryRateBenchmarkDataProvider();
}

@Global()
@Module({
  providers: [
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
    MARKET_DATA_PROVIDER,
    HISTORICAL_MARKET_DATA_PROVIDER,
    HISTORICAL_MARKET_DATA_INGESTION_PROVIDER,
    BENCHMARK_DATA_PROVIDER,
    RATE_BENCHMARK_DATA_PROVIDER,
  ],
})
export class HistoricalMarketDataModule {}
