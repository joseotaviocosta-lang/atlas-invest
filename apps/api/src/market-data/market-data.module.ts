import { Module, Global } from '@nestjs/common';
import {
  InMemoryHistoricalMarketDataProvider,
  StooqHistoricalMarketDataProvider,
  HistoricalMarketDataProvider,
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
  HISTORICAL_MARKET_DATA_PROVIDER,
  BENCHMARK_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from './tokens';

function createHistoricalProvider(): HistoricalMarketDataProvider {
  const providerName = (
    process.env.HISTORICAL_MARKET_DATA_PROVIDER ??
    process.env.MARKET_DATA_PROVIDER ??
    'IN_MEMORY'
  )
    .trim()
    .toUpperCase();
  const timeoutMs = parseInt(
    process.env.HISTORICAL_MARKET_DATA_TIMEOUT_MS ?? process.env.MARKET_DATA_TIMEOUT_MS ?? '15000',
    10,
  );
  const maxLookback = parseInt(process.env.HISTORICAL_MARKET_DATA_MAX_LOOKBACK_DAYS ?? '7', 10);

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
  exports: [HISTORICAL_MARKET_DATA_PROVIDER, BENCHMARK_DATA_PROVIDER, RATE_BENCHMARK_DATA_PROVIDER],
})
export class HistoricalMarketDataModule {}
