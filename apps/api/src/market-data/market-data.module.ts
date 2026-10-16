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
  BENCHMARK_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from './tokens';

function createMarketDataProvider(): MarketDataProvider {
  const providerName = (process.env.MARKET_DATA_PROVIDER ?? 'IN_MEMORY').trim().toUpperCase();
  const token = process.env.MARKET_DATA_API_TOKEN ?? process.env.BRAPI_API_KEY;
  const timeoutMs = parseInt(process.env.MARKET_DATA_TIMEOUT_MS ?? '10000', 10);

  if (providerName === 'BRAPI') {
    return new BrapiProviderAdapter({ token, timeoutMs });
  }
  return new InMemoryMarketDataProvider();
}

function createHistoricalProvider(): HistoricalMarketDataProvider {
  const providerName = (
    process.env.HISTORICAL_MARKET_DATA_PROVIDER ??
    process.env.MARKET_DATA_PROVIDER ??
    'IN_MEMORY'
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

function createBenchmarkProvider(): BenchmarkDataProvider {
  const providerName = (process.env.BENCHMARK_DATA_PROVIDER ?? 'IN_MEMORY').trim().toUpperCase();
  const timeoutMs = parseInt(process.env.BENCHMARK_DATA_TIMEOUT_MS ?? '15000', 10);
  const maxLookback = parseInt(process.env.BENCHMARK_DATA_MAX_LOOKBACK_DAYS ?? '7', 10);
  if (providerName === 'STOOQ') {
    return new StooqBenchmarkDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
  }
  if (providerName === 'YAHOO') {
    return new YahooBenchmarkDataProvider({ timeoutMs, maxLookbackDays: maxLookback });
  }
  return new InMemoryBenchmarkDataProvider({ maxLookbackDays: maxLookback });
}

function createRateBenchmarkProvider(): RateBenchmarkDataProvider {
  const providerName = (
    process.env.RATE_BENCHMARK_DATA_PROVIDER ??
    process.env.BENCHMARK_DATA_PROVIDER ??
    'IN_MEMORY'
  )
    .trim()
    .toUpperCase();
  const timeoutMs = parseInt(
    process.env.RATE_BENCHMARK_DATA_TIMEOUT_MS ?? process.env.BENCHMARK_DATA_TIMEOUT_MS ?? '15000',
    10,
  );
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
      useFactory: () => createHistoricalProvider(),
    },
    {
      provide: BENCHMARK_DATA_PROVIDER,
      useFactory: () => createBenchmarkProvider(),
    },
    {
      provide: RATE_BENCHMARK_DATA_PROVIDER,
      useFactory: () => createRateBenchmarkProvider(),
    },
  ],
  exports: [
    MARKET_DATA_PROVIDER,
    HISTORICAL_MARKET_DATA_PROVIDER,
    BENCHMARK_DATA_PROVIDER,
    RATE_BENCHMARK_DATA_PROVIDER,
  ],
})
export class HistoricalMarketDataModule {}
